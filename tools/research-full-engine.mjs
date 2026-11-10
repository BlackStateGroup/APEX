/** Reproducible Ghidra baseline over APEX-owned code only. Never accepts a target path. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForProcessGroup } from './native-process-group.mjs';
import { parseEvidence } from './reverse-engineering/node_modules/rea-agents/dist/domain/evidence.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [destination, ...extra] = process.argv.slice(2);
if (!destination || extra.length || process.platform !== 'linux') throw new Error('Usage on Linux: node tools/research-full-engine.mjs NEW_OUTPUT_DIRECTORY');
const output = resolve(destination); mkdirSync(output, { mode: 0o700 });
const digest = value => createHash('sha256').update(value).digest('hex');
const files = [];
function save(name, bytes) { writeFileSync(join(output, name), bytes, { flag: 'wx', mode: 0o600 }); files.push({ file: name, sha256: digest(bytes), bytes: Buffer.byteLength(bytes) }); }
async function run(name, executable, args, { input = '', failAllowed = false, timeout = 180000 } = {}) {
  const child = spawn(executable, args, { cwd: root, detached: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, REA_GHIDRA_DECOMPILE_TIMEOUT_SECONDS: '60', LC_ALL: 'C' } });
  let stdout = '', stderr = '', bytes = 0, reason = null, hard;
  const stop = why => { reason ??= why; try { process.kill(-child.pid, 'SIGTERM'); } catch {} hard ??= setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000); };
  const timer = setTimeout(() => stop('deadline'), timeout);
  for (const [stream, key] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) stream.on('data', chunk => {
    bytes += chunk.length; if (bytes > 2 * 1024 * 1024) { stop('output-limit'); return; }
    if (key === 'stdout') stdout += chunk; else stderr += chunk;
  });
  child.stdin.on('error', () => {}); child.stdin.end(input);
  let status, signal, failure;
  try { [status, signal] = await new Promise((yes, no) => { child.on('error', no); child.on('close', (code, signal) => yes([code, signal])); }); }
  catch (error) { failure = String(error); }
  finally { clearTimeout(timer); clearTimeout(hard); }
  let cleanup = false;
  if (child.pid) { try { await waitForProcessGroup(child.pid); cleanup = true; } catch (error) { failure = String(error); } }
  save(`${name}.stdout.txt`, stdout); save(`${name}.stderr.txt`, stderr);
  save(`${name}.process.json`, JSON.stringify({ executable, args, status, signal, reason, failure, processGroupAbsent: cleanup }, null, 2));
  if (failure || reason || signal || !cleanup || (!failAllowed && status !== 0)) throw new Error(`${name} failed; partial evidence retained`);
  return { stdout, status };
}
const rea = join(root, 'tools/reverse-engineering/node_modules/rea-agents/scripts/rea.mjs');
function checked(raw, expectedHash) {
  const evidence = parseEvidence(JSON.parse(raw));
  if (evidence.provider.id !== 'ghidra' || evidence.provider.version !== '12.1.4' || evidence.operation !== 'procedure_pseudo_code' || evidence.subject?.digest.sha256 !== expectedHash || typeof evidence.normalized_result !== 'string' || !evidence.normalized_result.trim()) throw new Error('Decompilation evidence did not bind the expected engine, operation and binary');
  return evidence.normalized_result;
}
try {
  const version = await run('rea-version', process.execPath, [rea, '--version']);
  if (version.stdout.trim() !== '6.8.0') throw new Error('Expected pinned REA 6.8.0');
  // A cold shared runner can exceed REA's fixed five-second Java probe budget.
  // Initialise the selected JVM with our bounded process runner, then still
  // require REA's unchanged provider checks to pass. Retain both observations.
  if (!process.env.JAVA_HOME) throw new Error('Select a full JDK using JAVA_HOME');
  await run('java-cold-start', join(process.env.JAVA_HOME, 'bin/java'), ['-XX:-UsePerfData', '-XshowSettings:properties', '-version']);
  const doctor = JSON.parse((await run('doctor', process.execPath, [rea, 'doctor', '--provider', 'ghidra', '--json'])).stdout);
  if (doctor.healthy !== true) throw new Error('Required engine doctor failed');
  for (const [path, name] of [['firmware/core/apex.c', 'apex.c'], ['firmware/core/apex.h', 'apex.h'], ['firmware/host/main.c', 'main.c']]) save(name, readFileSync(join(root, path)));
  const source = readFileSync(join(output, 'apex.c'), 'utf8');
  if (source.split('0x1021u').length !== 2) throw new Error('Expected one CRC polynomial');
  save('apex-mutant.c', source.replace('0x1021u', '0x8005u'));
  const binaries = [];
  for (const [name, sourceName] of [['original', 'apex.c'], ['mutant', 'apex-mutant.c']]) {
    const path = join(output, `${name}.elf`);
    await run(`compile-${name}`, 'gcc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-I', output, join(output, sourceName), join(output, 'main.c'), '-o', path]);
    chmodSync(path, 0o400); const sha256 = digest(readFileSync(path)); files.push({ file: `${name}.elf`, sha256, bytes: readFileSync(path).length }); binaries.push({ name, path, sha256 });
  }
  const original = binaries[0], mutant = binaries[1], snapshot = join(output, 'crc.snapshot.json');
  const functions = ['apex_crc16', 'apex_encode', 'apex_stream_init', 'apex_stream_feed', 'apex_device_init', 'apex_device_feed'];
  const recovered = {};
  for (const name of functions) {
    const args = [rea, 'decompile', original.path, name, '--provider', 'ghidra', '--json'];
    if (name === 'apex_crc16') args.push('--snapshot', snapshot);
    const result = await run(name, process.execPath, args);
    const code = checked(result.stdout, original.sha256); save(`${name}.c`, code); recovered[name] = code;
  }
  if (!/0x1021\b|\b4129\b/i.test(recovered.apex_crc16)) throw new Error('Original CRC polynomial not retained in pseudocode');
  if (!existsSync(snapshot)) throw new Error('REA did not persist the requested snapshot');
  const snapshotBytes = readFileSync(snapshot);
  const restart = await run('restart-crc', process.execPath, [rea, 'decompile', original.path, 'apex_crc16', '--provider', 'ghidra', '--snapshot', snapshot, '--json']);
  if (checked(restart.stdout, original.sha256) !== recovered.apex_crc16) throw new Error('Fresh CLI process did not recover the identical CRC pseudocode');
  // A second immutable copy retains the snapshot as it existed before restart.
  save('crc.snapshot-before-restart.json', snapshotBytes);
  const finalSnapshot = readFileSync(snapshot); files.push({ file: 'crc.snapshot.json', sha256: digest(finalSnapshot), bytes: finalSnapshot.length });
  const tampered = JSON.parse(snapshotBytes); tampered.target.sha256 = '0'.repeat(64); save('crc.snapshot-tampered.json', JSON.stringify(tampered));
  const invalid = await run('tampered-snapshot', process.execPath, [rea, 'decompile', original.path, 'apex_crc16', '--provider', 'ghidra', '--snapshot', join(output, 'crc.snapshot-tampered.json'), '--json'], { failAllowed: true });
  if (invalid.status === 0) throw new Error('Tampered snapshot unexpectedly accepted');
  const mutantResult = await run('mutant-crc', process.execPath, [rea, 'decompile', mutant.path, 'apex_crc16', '--provider', 'ghidra', '--json']);
  const mutantCode = checked(mutantResult.stdout, mutant.sha256); save('mutant-crc.c', mutantCode);
  if (!/0x8005\b|\b32773\b/i.test(mutantCode) || mutantCode === recovered.apex_crc16) throw new Error('Controlled changed polynomial not distinguished');
  // Only the pseudocode of our fixed, owned CRC function is compiled and run.
  // This is finite-vector agreement, never a general semantic-equivalence claim.
  const aliases = '#include <stdint.h>\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\ntypedef unsigned char byte; typedef unsigned char uchar; typedef unsigned short ushort; typedef unsigned int uint; typedef unsigned long ulong; typedef unsigned long long ulonglong; typedef unsigned char undefined; typedef uint8_t undefined1; typedef uint16_t undefined2; typedef uint32_t undefined4; typedef uint64_t undefined8;\n';
  const driver = '\nint main(void) { char line[1027]; unsigned char data[512]; while(fgets(line,sizeof(line),stdin)) { size_t n=strcspn(line,"\\n"); if(n%2 || n>1024) return 2; for(size_t i=0;i<n/2;i++){char h[3]={line[2*i],line[2*i+1],0};data[i]=(unsigned char)strtoul(h,0,16);} printf("%04x\\n",(unsigned)apex_crc16(data,n/2)&65535); } return 0; }\n';
  let state = 0x12345678; const vectors = [Buffer.alloc(0), Buffer.from('123456789')];
  for (let n = 0; n < 128; n++) { const bytes = Buffer.alloc(n * 4); for (let i = 0; i < bytes.length; i++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; bytes[i] = state >>> 24; } vectors.push(bytes); }
  function reference(bytes, polynomial) { const table = Array.from({ length: 256 }, (_, i) => { let n = i << 8; for(let b=0;b<8;b++) n=((n<<1)^((n&32768)?polynomial:0))&65535; return n; }); let crc=65535; for (const byte of bytes) crc=((crc<<8)^table[((crc>>>8)^byte)&255])&65535; return crc.toString(16).padStart(4,'0'); }
  const vectorInput = vectors.map(b => b.toString('hex')).join('\n') + '\n'; save('crc-vectors.hex', vectorInput);
  const checks = [];
  for (const [name, code, polynomial] of [['original', recovered.apex_crc16, 0x1021], ['mutant', mutantCode, 0x8005]]) {
    save(`reconstructed-${name}.c`, aliases + code + driver);
    const path = join(output, `reconstructed-${name}`);
    await run(`compile-reconstructed-${name}`, 'gcc', ['-std=c11', '-O2', join(output, `reconstructed-${name}.c`), '-o', path]);
    const result = await run(`vectors-${name}`, path, [], { input: vectorInput });
    const actual = result.stdout.trimEnd().split('\n'), expected = vectors.map(v => reference(v, polynomial));
    save(`expected-${name}.json`, JSON.stringify(expected));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Reconstructed ${name} CRC disagreed with independent vectors`);
    checks.push({ variant: name, vectors: vectors.length, allAgreed: true });
  }
  if (digest(readFileSync(original.path)) !== original.sha256 || digest(readFileSync(mutant.path)) !== mutant.sha256) throw new Error('Analysis input changed');
  const manifest = { schema: 'apex.rea-full-engine.v1', rea: '6.8.0', ghidra: '12.1.4', source: 'APEX-owned portable host C', functions, binaries, checks, snapshotRestart: 'fresh CLI process, identical pseudocode', tamperedSnapshotRejected: true, originalTargetsExecuted: false, reconstructedCrcExecuted: true, hardwareTested: false, semanticEquivalenceProved: false, limitations: ['Finite vectors over two known-source CRC implementations, not blind algorithm recovery or proof over all inputs.', 'Fresh-process snapshot replay is not a persistent authenticated phone-to-worker service.', 'Process groups were observed absent after each tool; abnormal parent termination and escaped descendants are not proven.'], files };
  save('REPORT.json', JSON.stringify(manifest, null, 2)); console.log(JSON.stringify({ output, functions: functions.length, checks, snapshotRestart: true }));
} catch (error) {
  save('FAILURE.json', JSON.stringify({ success: false, message: String(error), files }, null, 2)); throw error;
}
