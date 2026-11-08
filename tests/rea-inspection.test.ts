import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, copyFileSync, existsSync, rmSync, writeFileSync, readdirSync, truncateSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { parseReaElfEvidence } from '../packages/core/rea-inspection.ts';
import { EvidenceStore } from '../packages/core/evidence.ts';
const sample = readFileSync(new URL('../src/fixtures/rea-elf-notes.json', import.meta.url), 'utf8');
const fixture = () => JSON.parse(sample);

test('real REA evidence imports bounded metadata, deduplicates overlapping build IDs and stays unverified', () => {
  const result = parseReaElfEvidence(sample);
  assert.equal(result.artifact.architecture, 'x86_64'); assert.equal(result.artifact.format, 'elf64');
  assert.equal(result.examinedEntries, 6); assert.equal(result.buildIds.length, 1);
  assert.match(result.provenance, /not been verified/); assert.ok(!JSON.stringify(result).includes('local_path'));
  const partial = fixture(); partial.normalized_result.coverage.status = 'partial';
  assert.equal(parseReaElfEvidence(JSON.stringify(partial)).coverage, 'partial');
});
test('REA report rejects mismatched digests, incorrect providers, invalid coverage and out-of-file ranges', () => {
  const mutations = [
    (v: any) => { v.subject.digest.sha256 = '0'.repeat(64); },
    (v: any) => { v.provider.id = 'unknown-tool'; },
    (v: any) => { v.normalized_result.entries[0].location.offset = v.normalized_result.artifact.bytes; },
    (v: any) => { v.normalized_result.coverage.examined_entries = 0; },
    (v: any) => { v.normalized_result.artifact.bytes = 67108865; },
    (v: any) => { v.normalized_result.entries[0].gnu.build_id_hex = 'odd'; },
  ];
  for (const change of mutations) { const value = fixture(); change(value); assert.throws(() => parseReaElfEvidence(JSON.stringify(value))); }
  assert.throws(() => parseReaElfEvidence('x'.repeat(262145)), /import limit/);
  const extra = fixture(); extra.execute = { shell: 'not an instruction' };
  assert.equal(Object.hasOwn(parseReaElfEvidence(JSON.stringify(extra)), 'execute'), false);
});
test('firmware report persists as offline evidence without native provenance or raw payload promotion', async () => {
  const documents: string[] = [];
  const store = new EvidenceStore({ insert: async (_id, row) => { documents.push(row); }, list: async () => documents }, { randomId: randomUUID, sha256: async value => createHash('sha256').update(value).digest('hex') });
  const record = await store.save({ kind: 'analysis.firmware', source: 'offline-import', payload: parseReaElfEvidence(sample) });
  assert.equal(await store.verify((await store.list())[0]!), true); assert.equal(record.source, 'offline-import');
  await assert.rejects(store.save({ kind: 'analysis.firmware', source: 'native-ios', payload: {} }), /offline source/);
});
test('pinned REA CLI and GNU tools inspect a real C binary, preserve inputs/outputs and hash saved evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-'));
  try {
    const target = join(directory, 'firmware with spaces;literal.elf'), output = join(directory, 'report');
    copyFileSync(resolve('build/apex-firmware'), target);
    const before = readFileSync(target);
    const run = () => spawnSync(process.execPath, ['tools/inspect-firmware.mjs', target, output], { encoding:'utf8', timeout:30000 });
    const result = run(); assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(readFileSync(join(output, 'inspection.json'), 'utf8'));
    assert.equal(record.targetExecuted, false); assert.equal(record.engine.version, '6.8.0');
    const rawEvidence = JSON.parse(readFileSync(join(output, 'rea-evidence.json'), 'utf8'));
    assert.equal(rawEvidence.subject.name, basename(target));
    assert.equal(rawEvidence.subject.local_path, record.analysisInput.snapshotPath);
    assert.equal(existsSync(record.analysisInput.snapshotPath), false);
    assert.equal(record.analysisInput.retained, false);
    assert.equal(record.artifactSha256, createHash('sha256').update(before).digest('hex'));
    assert.equal(record.rawEvidenceSha256, createHash('sha256').update(readFileSync(join(output, 'rea-evidence.json'))).digest('hex'));
    for (const supplement of record.supplements) {
      assert.equal(supplement.success, true);
      assert.equal(supplement.sha256, createHash('sha256').update(readFileSync(join(output, supplement.file))).digest('hex'));
      assert.equal(supplement.diagnosticSha256, createHash('sha256').update(readFileSync(join(output, supplement.diagnosticFile))).digest('hex'));
    }
    assert.deepEqual(readFileSync(target), before);
    assert.match(readFileSync(join(output, 'objdump-crc-disassembly.txt'), 'utf8'), /apex_crc16/);
    const second = run(); assert.notEqual(second.status, 0); assert.match(second.stderr, /preserve prior evidence/);
    assert.ok(existsSync(join(output, 'rea-evidence.json')));
  } finally { rmSync(directory, { recursive:true }); }
});

test('missing optional GNU tools preserve a successful REA inspection and explicit failure metadata', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-partial-'));
  try {
    const output = join(directory, 'report');
    const result = spawnSync(process.execPath, ['tools/inspect-firmware.mjs', resolve('build/apex-firmware'), output], { encoding:'utf8', timeout:30000, env:{ ...process.env, PATH:directory } });
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(readFileSync(join(output, 'inspection.json'), 'utf8'));
    assert.equal(record.inspection.engine, 'REA ELF note parser');
    assert.ok(record.supplements.every((item: { success: boolean; error: string }) => !item.success && item.error.includes('ENOENT')));
  } finally { rmSync(directory, { recursive:true }); }
});

// Fault injection affects only our CLI process, never the inspected program.
function faultRun(directory: string, target: string, output: string, fault: string, setup = '') {
  const hook = join(directory, 'fault.mjs');
  writeFileSync(hook, `import cp from 'node:child_process'; import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const original = cp.spawnSync; const target = ${JSON.stringify(target)}; const output = ${JSON.stringify(output)};
${setup}
cp.spawnSync = (command, args, options) => { ${fault} }; syncBuiltinESMExports();`);
  return spawnSync(process.execPath, ['--import', hook, 'tools/inspect-firmware.mjs', target, output], { encoding:'utf8', timeout:30000 });
}
test('REA stderr-only errors retain useful diagnostics', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-error-'));
  try {
    const result = faultRun(directory, resolve('build/apex-firmware'), join(directory, 'report'), `return {status:2, stdout:'', stderr:'specific parser failure'};`);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /specific parser failure/);
  } finally { rmSync(directory, {recursive:true}); }
});
test('an output directory created during analysis is preserved and rejected', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-race-'));
  try {
    const output = join(directory, 'report');
    const result = faultRun(directory, resolve('build/apex-firmware'), output, `if (!fs.existsSync(output)) { fs.mkdirSync(output); fs.writeFileSync(output + '/prior.txt', 'prior evidence'); } return original(command,args,options);`);
    assert.notEqual(result.status, 0);
    assert.deepEqual(readdirSync(output), ['prior.txt']);
  } finally { rmSync(directory, {recursive:true}); }
});
test('all analysis consumes the exact snapshot even if source bytes change and are restored', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-snapshot-'));
  try {
    const target = join(directory, 'firmware.elf'), output = join(directory, 'report');
    copyFileSync(resolve('build/apex-firmware'), target);
    const result = faultRun(directory, target, output, `
if (args.includes('inspect-elf-notes')) { const result = original(command,args,options); globalThis.saved = fs.readFileSync(target); fs.writeFileSync(target, Buffer.alloc(globalThis.saved.length)); return result; }
const result = original(command,args,options); if (args.includes('--disassemble=apex_crc16')) fs.writeFileSync(target, globalThis.saved); return result;`);
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(readFileSync(join(output, 'inspection.json'), 'utf8'));
    assert.ok(record.supplements.every((item: any) => item.success));
    assert.equal(record.analysisInput.kind, 'bounded-local-snapshot');
    assert.equal(record.analysisInput.sourcePath, target);
    assert.equal(record.analysisInput.sha256, record.artifactSha256);
    const raw = JSON.parse(readFileSync(join(output, 'rea-evidence.json'), 'utf8'));
    assert.equal(raw.subject.local_path, record.analysisInput.snapshotPath);
    assert.equal(raw.normalized_result.artifact.bytes, record.analysisInput.bytes);
    assert.equal(existsSync(record.analysisInput.snapshotPath), false);
    assert.match(record.sourceObservation, /intervening changes are not excluded/);
  } finally { rmSync(directory, {recursive:true}); }
});
test('nonregular, tiny and oversized inputs fail before any analysis', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-bounds-'));
  try {
    const tiny = join(directory, 'tiny'), large = join(directory, 'large'), fifo = join(directory, 'fifo');
    writeFileSync(tiny, 'small'); writeFileSync(large, ''); truncateSync(large, 67108865);
    assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
    for (const target of [directory, tiny, large, fifo]) {
      const output = join(directory, 'report');
      const result = faultRun(directory, target, output, `throw new Error('ANALYSIS MUST NOT RUN');`);
      assert.notEqual(result.status, 0); assert.equal(result.error, undefined);
      assert.match(result.stderr, /Select an ELF file between/); assert.equal(existsSync(output), false);
    }
  } finally { rmSync(directory, {recursive:true}); }
});
test('dangling output symlinks are preserved and rejected', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-symlink-'));
  try {
    const output = join(directory, 'report'); symlinkSync(join(directory, 'absent'), output);
    const result = faultRun(directory, resolve('build/apex-firmware'), output, `throw new Error('ANALYSIS MUST NOT RUN');`);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /preserve prior evidence/);
    assert.deepEqual(readdirSync(directory).sort(), ['fault.mjs', 'report']);
  } finally { rmSync(directory, {recursive:true}); }
});
test('source replacement with identical bytes is rejected', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-replace-'));
  try {
    const target = join(directory, 'firmware.elf'), output = join(directory, 'report'); copyFileSync(resolve('build/apex-firmware'), target);
    const result = faultRun(directory, target, output, `if (args.includes('--disassemble=apex_crc16')) { fs.renameSync(target, target + '.original'); fs.copyFileSync(target + '.original', target); } return original(command,args,options);`);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Artifact changed/); assert.equal(existsSync(output), false);
  } finally { rmSync(directory, {recursive:true}); }
});
test('REA timeout and signal failures reject reports and clean the snapshot', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-timeout-'));
  try {
    for (const error of ["Object.assign(new Error('spawn ETIMEDOUT'), {code:'ETIMEDOUT'})", 'undefined']) {
      const output = join(directory, 'report');
      const result = faultRun(directory, resolve('build/apex-firmware'), output, `
if (args.includes('inspect-elf-notes')) { fs.writeFileSync(output + '.snapshot', args[2]); return {status:null, signal:'SIGKILL', error:${error}, stdout:'', stderr:'parser interrupted'}; }
return original(command,args,options);`);
      assert.notEqual(result.status, 0); assert.match(result.stderr, /SIGKILL/); assert.match(result.stderr, /parser interrupted/);
      assert.equal(existsSync(output), false); assert.equal(existsSync(readFileSync(output + '.snapshot', 'utf8')), false);
    }
  } finally { rmSync(directory, {recursive:true}); }
});
test('GNU timeout, signal, overflow and exit failures retain diagnostics without claiming success', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-gnu-errors-'));
  try {
    const output = join(directory, 'report');
    const result = faultRun(directory, resolve('build/apex-firmware'), output, `
if (command === 'objdump') {
  const index = ['--file-headers','--section-headers','--syms','--disassemble=apex_crc16'].indexOf(args[0]);
  return {status:index === 3 ? 2 : null, signal:index < 2 ? 'SIGKILL' : null, error:index === 0 ? new Error('spawn ETIMEDOUT') : index === 2 ? new Error('spawn ENOBUFS') : undefined, stdout:'partial stdout', stderr:'specific GNU diagnostic'};
} return original(command,args,options);`);
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(readFileSync(join(output, 'inspection.json'), 'utf8'));
    for (const item of record.supplements) {
      assert.equal(item.success, false);
      assert.equal(readFileSync(join(output,item.diagnosticFile), 'utf8'), 'specific GNU diagnostic');
      assert.equal(item.sha256, createHash('sha256').update('partial stdout').digest('hex'));
    }
    assert.match(record.supplements[0].error, /ETIMEDOUT/); assert.equal(record.supplements[1].signal, 'SIGKILL');
    assert.match(record.supplements[2].error, /ENOBUFS/); assert.equal(record.supplements[3].exitCode, 2);
  } finally { rmSync(directory, {recursive:true}); }
});
test('growth or shrinkage during bounded input capture fails before analysis', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-read-race-'));
  try {
    const target = join(directory, 'firmware.elf'), output = join(directory, 'report');
    for (const mutation of ["fs.appendFileSync(target, 'extra')", 'fs.truncateSync(target, 16)']) {
      copyFileSync(resolve('build/apex-firmware'), target);
      const result = faultRun(directory, target, output, `throw new Error('ANALYSIS MUST NOT RUN');`, `
const read = fs.readSync; let changed = false;
fs.readSync = (...args) => { if (!changed && fs.fstatSync(args[0]).ino === fs.statSync(target).ino) { changed = true; ${mutation}; } return read(...args); };`);
      assert.notEqual(result.status, 0); assert.match(result.stderr, /Artifact changed size while reading/);
      assert.equal(existsSync(output), false);
    }
  } finally { rmSync(directory, {recursive:true}); }
});
test('snapshot cleanup failure prevents report publication or success output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-cleanup-'));
  const output = join(directory, 'report');
  try {
    const result = faultRun(directory, resolve('build/apex-firmware'), output, 'return original(command,args,options);', `
const remove = fs.rmSync;
fs.rmSync = (path, options) => {
  if (String(path).includes('apex-inspection-')) { fs.writeFileSync(output + '.temporary', path); throw new Error('injected cleanup failure'); }
  return remove(path, options);
};`);
    assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
    assert.match(result.stderr, /Temporary snapshot cleanup failed/); assert.match(result.stderr, /injected cleanup failure/);
    assert.equal(existsSync(output), false);
    assert.equal(existsSync(readFileSync(output + '.temporary', 'utf8')), true);
  } finally {
    if (existsSync(output + '.temporary')) rmSync(readFileSync(output + '.temporary', 'utf8'), {recursive:true});
    rmSync(directory, {recursive:true});
  }
});
test('an analysis failure remains visible when snapshot cleanup also fails', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-double-failure-'));
  const output = join(directory, 'report');
  try {
    const result = faultRun(directory, resolve('build/apex-firmware'), output,
      `return {status:2, stdout:'', stderr:'original analysis failure'};`, `
fs.rmSync = (path) => { fs.writeFileSync(output + '.temporary', path); throw new Error('secondary cleanup failure'); };`);
    assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
    assert.match(result.stderr, /original analysis failure/); assert.match(result.stderr, /secondary cleanup failure/);
    assert.match(result.stderr, /Inspection failed and temporary snapshot cleanup also failed/);
    assert.equal(existsSync(output), false);
  } finally {
    if (existsSync(output + '.temporary')) rmSync(readFileSync(output + '.temporary', 'utf8'), {recursive:true});
    rmSync(directory, {recursive:true});
  }
});
test('snapshot is removed before report writes and partial reports survive a write failure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-write-failure-'));
  const output = join(directory, 'report');
  try {
    const result = faultRun(directory, resolve('build/apex-firmware'), output, 'return original(command,args,options);', `
const write = fs.writeFileSync; const remove = fs.rmSync; let cleaned = false;
fs.rmSync = (path, options) => { const result = remove(path,options); if (String(path).includes('apex-inspection-')) cleaned = true; return result; };
fs.writeFileSync = (path, ...args) => {
  if (String(path).startsWith(output + '/')) {
    if (!cleaned) throw new Error('report written before cleanup');
    if (String(path).endsWith('/inspection.json')) throw new Error('injected report write failure');
  }
  return write(path,...args);
};`);
    assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
    assert.match(result.stderr, /injected report write failure/); assert.doesNotMatch(result.stderr, /report written before cleanup/);
    assert.equal(existsSync(join(output, 'inspection.json')), false);
    const raw = JSON.parse(readFileSync(join(output, 'rea-evidence.json'), 'utf8'));
    assert.equal(existsSync(dirname(raw.subject.local_path)), false);
    assert.equal(existsSync(join(output, 'objdump-headers.txt')), true);
  } finally { rmSync(directory, {recursive:true}); }
});
