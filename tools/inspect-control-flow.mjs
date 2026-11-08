import { spawnSync } from 'node:child_process';
import { fstatSync, openSync, readSync, closeSync, constants, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_SYMBOLS, MAX_ARTIFACT_BYTES, digest, readElfFunctions, validateObjdumpEvidence, parseFunctionDisassembly, summarizeControlFlow } from './reverse-engineering/elf-control-flow.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = ['tools/inspect-control-flow.mjs', 'tools/reverse-engineering/elf-control-flow.mjs', 'tools/reverse-engineering/package-lock.json'];
const loadedSourceObservations = sourceFiles.map(file => ({ file, sha256: digest(readFileSync(join(root, file))) }));

export function boundedArtifact(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 64 || stat.size > MAX_ARTIFACT_BYTES) throw new Error('Select a regular ELF file from 64 bytes through 64 MiB');
    const buffer = Buffer.alloc(stat.size + 1);
    let count = 0, size;
    while (count < buffer.length && (size = readSync(fd, buffer, count, buffer.length - count, null)) > 0) count += size;
    if (count !== stat.size) throw new Error('Artifact changed size during bounded read');
    return { stat, bytes: buffer.subarray(0, count) };
  } finally { closeSync(fd); }
}
function run(executable, args, timeout = 30000) {
  const result = spawnSync(executable, args, { encoding: 'utf8', shell: false, timeout, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C', LANG: 'C' } });
  if (result.error || result.status !== 0 || result.signal || result.stderr) throw new Error(`Analyzer failed or emitted diagnostics: ${[result.error?.message, result.stderr, result.stdout].filter(Boolean).join('\n').slice(0, 2048)}`);
  return result.stdout;
}

export function inspectControlFlow(selected, destination) {
  const target = resolve(selected), output = resolve(destination);
  const original = boundedArtifact(target), artifactSha256 = digest(original.bytes);
  const functions = readElfFunctions(original.bytes); // Fail before any analyzer on unsupported input.
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(output, { mode: 0o700 }); // Exclusive reservation; never overwrite old evidence.
  let temporary, cleanupSucceeded = false;
  const saved = [];
  const save = (file, content) => { writeFileSync(join(output, file), content, { flag: 'wx', mode: 0o600 }); saved.push({ file, sha256: digest(content), bytes: Buffer.byteLength(content) }); };
  try {
    temporary = mkdtempSync(join(tmpdir(), 'apex-rea-flow-'));
    const snapshot = join(temporary, basename(target));
    writeFileSync(snapshot, original.bytes, { flag: 'wx', mode: 0o400 });
    const rea = join(root, 'tools/reverse-engineering/node_modules/rea-agents/scripts/rea.mjs');
    const version = run(process.execPath, [rea, '--version']).trim();
    if (version !== '6.8.0') throw new Error('Expected pinned REA 6.8.0');
    const objdumpVersion = run('objdump', ['--version']).split('\n')[0];
    if (!objdumpVersion.startsWith('GNU objdump ')) throw new Error('GNU objdump is required');
    const summaries = [];
    for (const fn of functions) {
      // REA owns the bounded objdump subprocess and its normal cleanup. No debug-link following.
      const raw = run(process.execPath, [rea, 'inspect-with-objdump', snapshot, 'disassemble', '--symbol', fn.name, '--command-timeout-ms', '15000', '--json'], 45000);
      const evidenceFile = `${fn.name}.rea.json`;
      save(evidenceFile, raw);
      const observation = validateObjdumpEvidence(raw, { artifactSha256, artifactPath: snapshot, symbol: fn.name });
      const instructions = parseFunctionDisassembly(observation.stdout, fn);
      summaries.push({ ...summarizeControlFlow(fn, instructions), evidenceId: observation.evidenceId, evidenceFile });
    }
    const final = boundedArtifact(target);
    if (digest(final.bytes) !== artifactSha256 || original.stat.dev !== final.stat.dev || original.stat.ino !== final.stat.ino || digest(boundedArtifact(snapshot).bytes) !== artifactSha256) throw new Error('Source identity/bytes or snapshot changed; no success report accepted');
    if (loadedSourceObservations.some(s => digest(readFileSync(join(root, s.file))) !== s.sha256)) throw new Error('Analyzer source files changed during the workflow');
    rmSync(temporary, { recursive: true, force: true }); cleanupSucceeded = true;
    const report = {
      schemaVersion: 1, kind: 'apex.rea.function-control-flow', inspectedAt: new Date().toISOString(),
      artifact: { name: basename(target), sha256: artifactSha256, bytes: original.bytes.length, format: 'ELF64', architecture: 'x86-64', byteOrder: 'little' },
      engine: { rea: version, objdump: objdumpVersion, node: process.versions.node },
      analysisInput: { kind: 'bounded-read-only-local-snapshot', sourcePath: target, snapshotPath: snapshot, retained: false, endpointIdentityAndDigestMatch: true },
      targetExecuted: false, decompilationPerformed: false, hardwareValidated: false,
      functions: summaries,
      limitations: [
        'Only the six exact AXP ELF symbol ranges are covered. Static functions, external callees and other executable bytes are outside this selection.',
        'Instruction bytes exactly match the selected ELF ranges. GNU objdump supplies decoding; it is not independently re-decoded or cryptographically attested.',
        'Blocks include padding and potentially unreachable instructions. This is a structural direct-transfer graph, not runtime reachability, data-flow analysis, algorithm recovery or a complete call graph.',
        'Indirect targets, return destinations, exceptional flow, signals, dynamic linking and self-modification are not resolved. A call fallthrough is conditional on that call returning.',
        'Compiler variants need separate reports; matching names or constants does not prove behavioral equivalence. CRC is not authentication or encryption.',
        'Endpoint source observations do not exclude intervening changes. A same-user process could tamper with the private snapshot, toolchain or output directory.',
        'Analyzer timeout or failure retains partial evidence, not success. REA normal subprocess cleanup is used; abnormal parent termination is not a verified process-tree cleanup guarantee.',
      ],
      analyzerSources: loadedSourceObservations,
      analyzerSourceObservation: 'Source files on disk matched initial/final observations; this does not independently attest loaded module or executable bytes.',
    };
    save('control-flow.json', JSON.stringify(report, null, 2) + '\n');
    save('manifest.json', JSON.stringify({ schemaVersion: 1, artifactSha256, files: [...saved] }, null, 2) + '\n');
    return { output, artifactSha256, functions: summaries.length, instructionCount: summaries.reduce((n, f) => n + f.instructionCount, 0), unresolvedTransfers: summaries.reduce((n, f) => n + f.unresolved.length, 0), targetExecuted: false };
  } catch (error) {
    let cleanupError;
    if (temporary && !cleanupSucceeded) {
      try { rmSync(temporary, { recursive: true, force: true }); cleanupSucceeded = true; } catch (failure) { cleanupError = failure; }
    }
    try { save('failure.json', JSON.stringify({ success: false, message: String(error.message).slice(0, 4096), snapshotCleanupSucceeded: cleanupSucceeded, cleanupError: cleanupError?.message ?? null, targetExecuted: false }, null, 2) + '\n'); } catch { /* Preserve original failure; no success is returned. */ }
    if (cleanupError) throw new AggregateError([error, cleanupError], 'Analysis and temporary snapshot cleanup failed');
    throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [selected, destination, ...extra] = process.argv.slice(2);
  if (!selected || !destination || extra.length) throw new Error('Usage: node tools/inspect-control-flow.mjs OWNED_ELF NEW_OUTPUT_DIRECTORY');
  console.log(JSON.stringify(inspectControlFlow(selected, destination)));
}
