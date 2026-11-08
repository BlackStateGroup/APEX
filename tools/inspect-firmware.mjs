import { spawnSync } from 'node:child_process';
import { fstatSync, openSync, readSync, closeSync, constants, mkdirSync, mkdtempSync, rmSync, writeFileSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReaElfEvidence } from '../packages/core/rea-inspection.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [selected, destination = join(root, 'build', 'rea-inspection')] = process.argv.slice(2);
if (!selected) throw new Error('Usage: npm run research:inspect -- PATH_TO_ELF [NEW_OUTPUT_DIRECTORY]');
const target = resolve(selected), output = resolve(destination);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// O_NONBLOCK prevents a raced-in FIFO from hanging before fstat can reject it.
// Read through one descriptor and at most the accepted size plus one byte.
function boundedInput(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 16 || stat.size > 67108864) throw new Error('Select an ELF file between 16 bytes and 64 MiB');
    const buffer = Buffer.alloc(stat.size + 1);
    let count = 0, bytes;
    while (count < buffer.length && (bytes = readSync(fd, buffer, count, buffer.length - count, null)) > 0) count += bytes;
    if (count !== stat.size) throw new Error('Artifact changed size while reading; no report accepted');
    return { stat, bytes: buffer.subarray(0, count) };
  } finally { closeSync(fd); }
}
function rejectExistingOutput() {
  try { lstatSync(output); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('Output already exists; choose a new directory to preserve prior evidence');
}
rejectExistingOutput();
const original = boundedInput(target);
const before = hash(original.bytes);
const temporary = mkdtempSync(join(tmpdir(), 'apex-inspection-'));
const snapshot = join(temporary, basename(target));
let cleanupAttempted = false;
try {
  writeFileSync(snapshot, original.bytes, { flag:'wx', mode:0o400 });
  const rea = join(root, 'tools/reverse-engineering/node_modules/rea-agents/scripts/rea.mjs');
  function command(args) {
    const result = spawnSync(process.execPath, [rea, ...args], { encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', maxBuffer: 2097152, shell: false });
    if (result.error || result.status !== 0) throw new Error(`REA failed (exit ${result.status}, signal ${result.signal ?? 'none'}): ${[result.error?.message, result.stderr, result.stdout].filter(Boolean).join('\n').slice(0,4096) || 'No diagnostic output'}`);
    return result.stdout.trim();
  }
  const version = command(['--version']);
  if (version !== '6.8.0') throw new Error('Expected pinned REA 6.8.0');
  const raw = command(['inspect-elf-notes', snapshot, '--json']);
  const inspection = parseReaElfEvidence(raw);
  const binutils = [];
  for (const [name, argument] of [['headers','--file-headers'],['sections','--section-headers'],['symbols','--syms'],['crc-disassembly','--disassemble=apex_crc16']]) {
    const result = spawnSync('objdump', [argument, '--', snapshot], { encoding:'utf8', timeout:15000, killSignal:'SIGKILL', maxBuffer:2097152, shell:false });
    binutils.push({ name, argument, text:result.stdout ?? '', stderr:result.stderr ?? '', success:!result.error && result.status === 0, exitCode:result.status, error:result.error?.message ?? null, signal:result.signal ?? null });
  }
  const finalSource = boundedInput(target);
  const after = hash(finalSource.bytes);
  if (before !== after || original.stat.dev !== finalSource.stat.dev || original.stat.ino !== finalSource.stat.ino ||
      hash(boundedInput(snapshot).bytes) !== before || inspection.artifact.sha256 !== before || inspection.artifact.bytes !== original.bytes.length) {
    throw new Error('Artifact changed or REA digest disagrees; no report accepted');
  }
  // Do not publish retained:false or success until snapshot removal has succeeded.
  cleanupAttempted = true;
  try { rmSync(temporary, { recursive:true, force:true }); } catch (error) {
    throw new Error(`Temporary snapshot cleanup failed at ${temporary}; no report accepted`, { cause:error });
  }
  // Atomic reservation: never merge into an existing directory, even if it appeared during analysis.
  mkdirSync(dirname(output), { recursive:true });
  try { mkdirSync(output); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Output already exists; choose a new directory to preserve prior evidence');
    throw error;
  }
  const rawDocument = raw + '\n';
  writeFileSync(join(output, 'rea-evidence.json'), rawDocument, { flag: 'wx' });
  const supplements = binutils.map(item => {
    const file = `objdump-${item.name}.txt`;
    writeFileSync(join(output,file), item.text, { flag:'wx' });
    const diagnosticFile = `objdump-${item.name}.stderr.txt`;
    writeFileSync(join(output,diagnosticFile), item.stderr, { flag:'wx' });
    return { provider:'GNU objdump (direct; not REA subprocess integration)', file, argument:item.argument, success:item.success, exitCode:item.exitCode, error:item.error, signal:item.signal, sha256:createHash('sha256').update(item.text).digest('hex'), diagnosticFile, diagnosticSha256:createHash('sha256').update(item.stderr).digest('hex') };
  });
  const record = { schemaVersion:1, inspectedAt:new Date().toISOString(), engine:{ name:'rea-agents', version }, input:basename(target), artifactSha256:before, rawEvidenceSha256:createHash('sha256').update(rawDocument).digest('hex'), supplements, artifactObservedUnchanged:true, sourceObservation:'Source identity and bytes matched at initial and final observations; intervening changes are not excluded', analysisInput:{ kind:'bounded-local-snapshot', sourcePath:target, snapshotPath:snapshot, sha256:before, bytes:original.bytes.length, retained:false }, targetExecuted:false, inspection };
  writeFileSync(join(output, 'inspection.json'), JSON.stringify(record,null,2)+'\n', { flag:'wx' });
  console.log(JSON.stringify({ output, artifactSha256: before, format: inspection.artifact.format, architecture:inspection.artifact.architecture, noteObservations:inspection.examinedEntries, targetExecuted:false }));

} catch (error) {
  if (!cleanupAttempted) {
    try { rmSync(temporary, { recursive:true, force:true }); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `Inspection failed and temporary snapshot cleanup also failed at ${temporary}`, { cause:error });
    }
  }
  throw error;
}
