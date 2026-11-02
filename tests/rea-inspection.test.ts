import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
