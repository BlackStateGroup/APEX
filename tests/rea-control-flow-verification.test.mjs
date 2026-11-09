import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyControlFlow } from '../tools/verify-control-flow.mjs';
import { CORE_SYMBOLS, digest } from '../tools/reverse-engineering/elf-control-flow.mjs';

const root = resolve(import.meta.dirname, '..');
const recorded = join(root, 'verification/rea-flow/2026-11-08');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'apex-rea-verification-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const target = join(temp, 'renamed-artifact.elf'), directory = join(temp, 'evidence');
  cpSync(join(recorded, 'O2.elf'), target);
  cpSync(join(recorded, 'O2'), directory, { recursive: true });
  chmodSync(target, 0o600);
  return { temp, target, directory, verify: () => verifyControlFlow(target, directory) };
}
function rehash(directory, file) {
  const manifestPath = join(directory, 'manifest.json'), manifest = read(manifestPath);
  const bytes = readFileSync(join(directory, file));
  Object.assign(manifest.files.find(entry => entry.file === file), { sha256: digest(bytes), bytes: bytes.length });
  write(manifestPath, manifest);
}
function editReport(directory, edit) {
  const path = join(directory, 'control-flow.json'), report = read(path);
  edit(report); write(path, report); rehash(directory, 'control-flow.json');
}

for (const variant of ['O0', 'O2', 'Os', 'O2-poly8005']) test(`replays all six retained real REA observations for ${variant}`, () => {
  const result = verifyControlFlow(join(recorded, `${variant}.elf`), join(recorded, variant));
  assert.equal(result.kind, 'apex.rea.verified-byte-linkage');
  assert.equal(result.artifact.sha256, digest(readFileSync(join(recorded, `${variant}.elf`))));
  assert.deepEqual(result.functions.map(fn => fn.symbol), CORE_SYMBOLS);
  assert.equal(result.functions.reduce((n, fn) => n + fn.unresolvedTransferCount, 0), 1);
  for (const fn of result.functions) {
    assert.equal(fn.byteCoverage, 'exact-selected-ELF-symbol');
    assert.equal(fn.evidence.file, `${fn.symbol}.rea.json`);
    assert.equal(fn.bytesSha256, digest(readFileSync(join(recorded, `${variant}.elf`)).subarray(fn.fileOffset, fn.fileOffset + fn.byteLength)));
  }
  assert.equal(result.verificationExecutedTarget, false);
  assert.equal(result.verificationRanAnalyzer, false);
  assert.match(result.limitations.join(' '), /not authenticity/);
  assert.match(result.limitations.join(' '), /does not independently verify their decoding/);
});
test('portable linkage is deterministic, path-free, and does not need the historical snapshot', t => {
  const f = fixture(t), first = f.verify();
  assert.deepEqual(f.verify(), first);
  const text = JSON.stringify(first);
  assert(!text.includes('/workspace/')); assert(!text.includes('/tmp/'));
  assert.deepEqual(first, verifyControlFlow(join(recorded, 'O2.elf'), join(recorded, 'O2')));
});
test('CLI succeeds with Node child-process permission denied and emits only linkage JSON', () => {
  const result = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${root}`, 'tools/verify-control-flow.mjs', 'verification/rea-flow/2026-11-08/O2.elf', 'verification/rea-flow/2026-11-08/O2'], { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).verificationRanAnalyzer, false);
});
test('CLI refuses extra positional arguments', () => {
  const result = spawnSync(process.execPath, ['tools/verify-control-flow.mjs', 'one', 'two', 'three'], { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.match(result.stderr, /Usage:/);
});
for (const file of ['manifest.json', 'control-flow.json', 'apex_crc16.rea.json']) test(`rejects missing ${file}`, t => {
  const f = fixture(t); rmSync(join(f.directory, file)); assert.throws(f.verify, /Incomplete/);
});
test('rejects a failure marker even when the successful manifest remains', t => {
  const f = fixture(t); write(join(f.directory, 'failure.json'), { success: false }); assert.throws(f.verify, /failure.json/);
});
test('rejects unrelated extra entries instead of silently treating a mixed directory as accepted', t => {
  const f = fixture(t); write(join(f.directory, 'other.json'), {}); assert.throws(f.verify, /Unexpected/);
});
for (const file of ['manifest.json', 'control-flow.json', 'apex_crc16.rea.json']) test(`rejects symlinked ${file}`, t => {
  const f = fixture(t), path = join(f.directory, file), moved = join(f.temp, file);
  renameSync(path, moved); symlinkSync(moved, path); assert.throws(f.verify, /non-regular/);
});
test('rejects a symlinked evidence directory or artifact', t => {
  const f = fixture(t), alias = join(f.temp, 'alias');
  symlinkSync(f.directory, alias); assert.throws(() => verifyControlFlow(f.target, alias), /symlink/);
  rmSync(alias); symlinkSync(f.target, alias); assert.throws(() => verifyControlFlow(alias, f.directory), /non-symlink/);
});
test('rejects directories and FIFOs in place of regular evidence', t => {
  const f = fixture(t), path = join(f.directory, 'apex_crc16.rea.json'); rmSync(path); mkdirSync(path); assert.throws(f.verify, /non-regular/);
  rmSync(path, { recursive: true });
  const result = spawnSync('mkfifo', [path], { encoding: 'utf8', timeout: 15000 }); assert.equal(result.status, 0, result.stderr);
  assert.throws(f.verify, /non-regular/);
});
test('rejects a different artifact before accepting evidence', t => {
  const f = fixture(t); cpSync(join(recorded, 'O0.elf'), f.target); assert.throws(f.verify, /artifact digest/);
});
test('rejects modified and rehashed artifact bytes against independent envelope digests', t => {
  const f = fixture(t), bytes = readFileSync(f.target); bytes[8] ^= 1; writeFileSync(f.target, bytes);
  const artifactSha256 = digest(bytes), manifestPath = join(f.directory, 'manifest.json'), manifest = read(manifestPath);
  manifest.artifactSha256 = artifactSha256; write(manifestPath, manifest);
  editReport(f.directory, report => { report.artifact.sha256 = artifactSha256; });
  assert.throws(f.verify, /REA evidence identity/);
});
for (const [name, mutate] of [
  ['schema', m => m.schemaVersion = 2], ['digest', m => m.artifactSha256 = '0'.repeat(64)], ['missing entry', m => m.files.pop()],
  ['duplicate entry', m => m.files[1] = m.files[0]], ['path traversal', m => m.files[0].file = '../outside'], ['absolute path', m => m.files[0].file = '/etc/passwd'],
  ['digest syntax', m => m.files[0].sha256 = 'not-a-digest'], ['length mismatch', m => m.files[0].bytes++], ['unsafe length', m => m.files[0].bytes = Number.MAX_SAFE_INTEGER],
  ['negative length', m => m.files[0].bytes = -1], ['fractional length', m => m.files[0].bytes = 1.5],
]) test(`rejects manifest ${name}`, t => {
  const f = fixture(t), path = join(f.directory, 'manifest.json'), manifest = read(path); mutate(manifest); write(path, manifest); assert.throws(f.verify);
});
for (const file of ['manifest.json', 'control-flow.json', 'apex_crc16.rea.json']) test(`rejects oversized ${file} before parsing`, t => {
  const f = fixture(t); truncateSync(join(f.directory, file), (file === 'manifest.json' ? 16 * 1024 : 2 * 1024 * 1024) + 1); assert.throws(f.verify, /size bound/);
});
test('rejects malformed JSON, invalid UTF-8, and zero-byte evidence', t => {
  const f = fixture(t), path = join(f.directory, 'manifest.json');
  for (const bytes of [Buffer.from('{'), Buffer.from([0xff]), Buffer.alloc(0)]) { writeFileSync(path, bytes); assert.throws(f.verify); }
});
for (const file of ['manifest.json', 'control-flow.json', 'apex_crc16.rea.json']) {
  for (const escaped of [false, true]) test(`rejects duplicate ${escaped ? 'escaped ' : ''}decoded JSON keys in ${file}`, t => {
    const f = fixture(t), path = join(f.directory, file), original = readFileSync(path, 'utf8');
    const key = file === 'apex_crc16.rea.json' ? 'operation' : 'schemaVersion';
    const alias = escaped ? `\\u${key.charCodeAt(0).toString(16).padStart(4, '0')}${key.slice(1)}` : key;
    // A contradictory first value must not be silently discarded by JSON.parse.
    writeFileSync(path, original.replace('{', `{ "${alias}": "untrusted-first-value",`));
    if (file !== 'manifest.json') rehash(f.directory, file);
    assert.throws(f.verify, /Duplicate JSON/);
  });
}
test('rejects duplicate nested manifest fields and excessive JSON depth before interpretation', t => {
  const f = fixture(t), path = join(f.directory, 'manifest.json'), original = readFileSync(path, 'utf8');
  writeFileSync(path, original.replace('"file":', '"file": "../different", "file":'));
  assert.throws(f.verify, /Duplicate JSON/);
  writeFileSync(path, '['.repeat(17) + '0' + ']'.repeat(17));
  assert.throws(f.verify, /depth/);
});
for (const [name, mutate] of [
  ['schema', r => r.schemaVersion = 99], ['artifact size', r => r.artifact.bytes++], ['architecture', r => r.artifact.architecture = 'ESP32'],
  ['engine', r => r.engine.rea = 'other'], ['retained snapshot', r => r.analysisInput.retained = true], ['snapshot path', r => r.analysisInput.snapshotPath += '-changed'],
  ['target execution claim', r => r.targetExecuted = true], ['decompilation claim', r => r.decompilationPerformed = true], ['hardware claim', r => r.hardwareValidated = true],
  ['missing function', r => r.functions.pop()], ['function ordering', r => r.functions.reverse()], ['function count', r => r.functions[0].instructionCount++],
  ['function range', r => r.functions[0].fileOffset++], ['function digest', r => r.functions[0].bytesSha256 = 'a'.repeat(64)],
  ['fabricated edge', r => r.functions[0].blocks[0].successors[0].target = '0x0'], ['invented callback', r => r.functions[3].unresolved = []],
  ['evidence ID', r => r.functions[0].evidenceId = `ev_${'0'.repeat(64)}`], ['evidence file', r => r.functions[0].evidenceFile = '../outside'],
]) test(`rejects rehashed report ${name}`, t => {
  const f = fixture(t); editReport(f.directory, mutate); assert.throws(f.verify);
});
for (const [name, mutate] of [
  ['truncated observation', e => e.normalized_result.output_truncated = true], ['raw/normalized disagreement', e => e.raw_result.stdout = 'other'],
  ['different operation', e => e.operation = 'execute'], ['changed digest', e => e.normalized_result.artifact_sha256_after = '0'.repeat(64)],
  ['nonzero exit', e => e.normalized_result.exit_code = 1], ['changed subject', e => e.subject.local_path = '/other'],
  ['altered instruction bytes', e => { const previous = e.normalized_result.stdout; e.normalized_result.stdout = previous.replace(/(\n\s*[a-f0-9]+:\s+)[a-f0-9]{2}/, '$190'); assert.notEqual(e.normalized_result.stdout, previous); e.raw_result.stdout = e.normalized_result.stdout; }],
]) test(`rejects rehashed raw evidence ${name}`, t => {
  const f = fixture(t), file = 'apex_crc16.rea.json', path = join(f.directory, file), evidence = read(path);
  mutate(evidence); write(path, evidence); rehash(f.directory, file); assert.throws(f.verify);
});
test('does not propagate instruction-shaped extras or private source paths into linkage', t => {
  const f = fixture(t);
  editReport(f.directory, report => { report.command = 'DO NOT EXECUTE'; report.analysisInput.sourcePath = '/private/arbitrary'; });
  const result = JSON.stringify(f.verify()); assert(!result.includes('DO NOT EXECUTE')); assert(!result.includes('/private/'));
});
for (const scenario of ['late evidence modification', 'late artifact modification', 'late failure marker']) test(`rejects ${scenario} after initial reads`, t => {
  const f = fixture(t), originalRead = fs.readSync, triggerInode = fs.statSync(join(f.directory, 'control-flow.json')).ino;
  let injected = false;
  // Trigger after an earlier file has already been consumed, before the second
  // endpoint observation. Keep the injection inside this test process only.
  t.mock.method(fs, 'readSync', function(fd, ...args) {
    const count = originalRead(fd, ...args);
    if (!injected && count > 0 && fs.fstatSync(fd).ino === triggerInode) {
      injected = true;
      if (scenario === 'late evidence modification') fs.appendFileSync(join(f.directory, 'apex_crc16.rea.json'), ' ');
      else if (scenario === 'late artifact modification') { const bytes = readFileSync(f.target); bytes[8] ^= 1; writeFileSync(f.target, bytes); }
      else write(join(f.directory, 'failure.json'), { success: false });
    }
    return count;
  });
  syncBuiltinESMExports();
  try { assert.throws(f.verify, /changed|failure.json/); assert(injected); }
  finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});
