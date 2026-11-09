import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_SYMBOLS, MAX_ARTIFACT_BYTES, digest, readElfFunctions, validateObjdumpEvidence, parseFunctionDisassembly, summarizeControlFlow } from './reverse-engineering/elf-control-flow.mjs';

const RAW_LIMIT = 2 * 1024 * 1024, MANIFEST_LIMIT = 16 * 1024;
const FILES = Object.freeze([...CORE_SYMBOLS.map(name => `${name}.rea.json`), 'control-flow.json']);
const DIRECTORY_FILES = new Set([...FILES, 'manifest.json']);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = message => { throw new Error(message); };
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino;
const sameObservation = (a, b) => sameIdentity(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;

// Only explicit arguments and fixed filenames reach the filesystem. Paths in
// reports and manifests are data, never input paths or commands.
function readBounded(path, limit, minimum = 1) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) fail('Expected a regular, non-symlink evidence/artifact file');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || !sameObservation(stat, before) || stat.size < minimum || stat.size > limit) fail('Evidence/artifact file changed or exceeds its size bound');
    const buffer = Buffer.alloc(stat.size + 1);
    let count = 0, size;
    while (count < buffer.length && (size = readSync(fd, buffer, count, buffer.length - count, null)) > 0) count += size;
    if (count !== stat.size || !sameObservation(stat, fstatSync(fd)) || !sameObservation(stat, lstatSync(path))) fail('Evidence/artifact changed during bounded read');
    return { bytes: buffer.subarray(0, count), stat };
  } finally { closeSync(fd); }
}
function json(bytes) {
  // Reject replacement-character decoding rather than silently changing evidence.
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function inventory(directory) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Evidence directory must not be a symlink');
  const handle = opendirSync(directory), found = new Set();
  try {
    let entry;
    while ((entry = handle.readSync()) !== null) {
      if (entry.name === 'failure.json') fail('Failed or partially published evidence: failure.json exists');
      if (!DIRECTORY_FILES.has(entry.name) || found.has(entry.name) || !entry.isFile()) fail('Unexpected, duplicate or non-regular evidence directory entry');
      found.add(entry.name);
    }
  } finally { handle.closeSync(); }
  if (found.size !== DIRECTORY_FILES.size) fail('Incomplete evidence directory');
  if (!sameObservation(stat, lstatSync(directory))) fail('Evidence directory changed while listing');
  return stat;
}

/** Replay retained observations against exact artifact bytes; never run an analyzer or target. */
export function verifyControlFlow(selected, evidenceDirectory) {
  const target = resolve(selected), directory = resolve(evidenceDirectory);
  const directoryBefore = inventory(directory);
  const artifact = readBounded(target, MAX_ARTIFACT_BYTES, 64), artifactSha256 = digest(artifact.bytes);
  const functions = readElfFunctions(artifact.bytes);
  const manifestInput = readBounded(join(directory, 'manifest.json'), MANIFEST_LIMIT);
  const manifest = json(manifestInput.bytes);
  if (manifest?.schemaVersion !== 1 || !sha(manifest.artifactSha256) || manifest.artifactSha256 !== artifactSha256 || !Array.isArray(manifest.files) || manifest.files.length !== FILES.length) fail('Invalid manifest schema, artifact digest or file count');
  const entries = new Map();
  for (const entry of manifest.files) {
    if (!entry || !FILES.includes(entry.file) || entries.has(entry.file) || !sha(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > RAW_LIMIT) fail('Invalid, duplicate or unsafe manifest entry');
    entries.set(entry.file, entry);
  }
  const files = new Map();
  for (const file of FILES) {
    const input = readBounded(join(directory, file), RAW_LIMIT), entry = entries.get(file);
    if (input.bytes.length !== entry.bytes || digest(input.bytes) !== entry.sha256) fail(`Evidence digest/length mismatch: ${file}`);
    files.set(file, input);
  }
  const report = json(files.get('control-flow.json').bytes);
  if (report?.schemaVersion !== 1 || report.kind !== 'apex.rea.function-control-flow' || report.artifact?.sha256 !== artifactSha256 || report.artifact.bytes !== artifact.bytes.length || report.artifact.format !== 'ELF64' || report.artifact.architecture !== 'x86-64' || report.artifact.byteOrder !== 'little') fail('Control-flow report identity mismatch');
  const input = report.analysisInput;
  if (report.engine?.rea !== '6.8.0' || typeof report.engine.objdump !== 'string' || !report.engine.objdump.startsWith('GNU objdump ') || report.engine.objdump.length > 256 || input?.kind !== 'bounded-read-only-local-snapshot' || input.retained !== false || input.endpointIdentityAndDigestMatch !== true || typeof input.snapshotPath !== 'string' || !input.snapshotPath.length || input.snapshotPath.length > 4096 || /[\x00-\x1f]/.test(input.snapshotPath)) fail('Unsupported or incomplete analysis provenance');
  if (report.targetExecuted !== false || report.decompilationPerformed !== false || report.hardwareValidated !== false) fail('Unsupported execution, decompilation or hardware claim');
  if (!Array.isArray(report.functions) || report.functions.length !== CORE_SYMBOLS.length) fail('Incomplete selected-function report');
  const links = functions.map((fn, index) => {
    const evidenceFile = `${fn.name}.rea.json`;
    const observation = validateObjdumpEvidence(new TextDecoder('utf-8', { fatal: true }).decode(files.get(evidenceFile).bytes), { artifactSha256, artifactPath: input.snapshotPath, symbol: fn.name });
    const summary = summarizeControlFlow(fn, parseFunctionDisassembly(observation.stdout, fn));
    const expected = { ...summary, evidenceId: observation.evidenceId, evidenceFile };
    if (!isDeepStrictEqual(expected, report.functions[index])) fail(`Derived function summary disagrees with retained evidence: ${fn.name}`);
    return {
      symbol: fn.name, address: summary.address, fileOffset: fn.offset, byteLength: fn.size, bytesSha256: fn.sha256,
      evidence: { file: evidenceFile, sha256: entries.get(evidenceFile).sha256, bytes: entries.get(evidenceFile).bytes, evidenceId: observation.evidenceId },
      instructionCount: summary.instructionCount, blockCount: summary.blockCount, unresolvedTransferCount: summary.unresolved.length,
      byteCoverage: summary.byteCoverage, graphCoverage: summary.graphCoverage,
    };
  });
  // A second bounded byte observation catches ordinary replacements/modifications
  // after an earlier file was read. This is not a transactional filesystem view.
  for (const [file, original] of [['manifest.json', manifestInput], ...files]) {
    const final = readBounded(join(directory, file), file === 'manifest.json' ? MANIFEST_LIMIT : RAW_LIMIT);
    if (!sameObservation(original.stat, final.stat) || !original.bytes.equals(final.bytes)) fail('Evidence changed between verification observations');
  }
  const artifactAfter = readBounded(target, MAX_ARTIFACT_BYTES, 64);
  if (!sameObservation(artifact.stat, artifactAfter.stat) || !artifact.bytes.equals(artifactAfter.bytes) || !sameObservation(directoryBefore, inventory(directory))) fail('Artifact or evidence directory changed between verification observations');
  return {
    schemaVersion: 1, kind: 'apex.rea.verified-byte-linkage',
    verification: 'retained-observations-replayed-against-supplied-artifact',
    artifact: { sha256: artifactSha256, bytes: artifact.bytes.length, format: 'ELF64', architecture: 'x86-64', byteOrder: 'little' },
    manifest: { file: 'manifest.json', sha256: digest(manifestInput.bytes), bytes: manifestInput.bytes.length },
    report: { file: 'control-flow.json', sha256: entries.get('control-flow.json').sha256, bytes: entries.get('control-flow.json').bytes },
    functions: links,
    verificationExecutedTarget: false, verificationRanAnalyzer: false,
    limitations: [
      'This verifier checks retained-byte integrity and reproducible structural linkage, not authenticity, ownership or a cryptographic signature. Coordinated replacement of all inputs can pass.',
      'GNU objdump instruction text remains trusted input. Matching listed instruction bytes does not independently verify their decoding or prove behavior, runtime reachability or algorithm equivalence.',
      'Coverage is limited to six selected host ELF symbols. Indirect transfers, external callees and other executable bytes remain unresolved or outside scope.',
      'Recorded tool versions, timestamps, source observations, historical non-execution and snapshot cleanup are report assertions, not independently attested facts.',
      'Endpoint byte and file-identity observations are not an atomic snapshot and do not exclude intervening or same-user tampering.',
      'No decompilation, phone integration, ESP32 firmware compatibility, credentials or physical hardware acceptance is established.',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [selected, directory, ...extra] = process.argv.slice(2);
  if (!selected || !directory || extra.length) throw new Error('Usage: node tools/verify-control-flow.mjs OWNED_ELF EVIDENCE_DIRECTORY');
  console.log(JSON.stringify(verifyControlFlow(selected, directory), null, 2));
}
