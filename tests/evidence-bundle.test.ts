import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EvidenceStore, parseEvidence, verifyEvidenceDocument } from '../packages/core/evidence.ts';
import { prepareBleEvidenceInput } from '../packages/core/ble-evidence.ts';
import { prepareNdefEvidenceInput } from '../packages/core/ndef-evidence.ts';
import { createEvidenceBundle, readEvidenceBundle, MAX_BUNDLE_CHARACTERS } from '../packages/core/evidence-bundle.ts';
import { preparePhoneNdefEvidenceInput } from '../packages/core/phone-ndef-evidence.ts';
import { prepareBlePlxSourceEvidenceInput } from '../packages/core/ble-plx-source-evidence.ts';
const time = '2026-11-08T01:02:03.000Z';
const sha256 = async (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture() {
  const documents: string[] = [];
  const journal = new EvidenceStore({ insert: async (_, document) => { documents.push(document); }, list: async () => [...documents] },
    { randomId: () => `test-${documents.length}`, sha256 });
  const ble = '\n' + JSON.stringify(JSON.parse(readFileSync(new URL('./fixtures/ble-observations.json', import.meta.url), 'utf8'))[0], null, 2) + '\t';
  const ndef = '\n ' + readFileSync(new URL('../src/fixtures/ndef-text.json', import.meta.url), 'utf8') + '\t';
  await journal.save({ ...prepareBleEvidenceInput(ble), observedAt: time });
  await journal.save({ ...prepareNdefEvidenceInput(ndef), observedAt: time });
  await journal.save({ kind: 'nfc.metadata', source: 'native-ios', payload: { inert: 'https://example.invalid', note: '{"a":1,"a":2}' }, observedAt: time });
  return { documents, journal, ble, ndef };
}
test('selected bundle retains exact stored text/order, mixed source payloads and old digest parity', async () => {
  const { documents, journal, ble, ndef } = await fixture();
  documents[0] = '\n' + JSON.stringify(JSON.parse(documents[0]!), null, 2) + '\t';
  const output = await createEvidenceBundle(documents, time, sha256);
  const preview = await readEvidenceBundle(output, sha256);
  assert.deepEqual(preview.recordDocuments, documents);
  assert.equal((preview.records[0]!.payload as { document: string }).document, ble);
  assert.equal((preview.records[1]!.payload as { document: string }).document, ndef);
  for (const record of preview.records) {
    assert.equal(await journal.verify(record), true);
    const { sha256: digest, ...base } = record;
    assert.equal(await sha256(JSON.stringify(base)), digest);
  }
  // Outer formatting is not part of the canonical digest.
  assert.deepEqual(await readEvidenceBundle(JSON.stringify(JSON.parse(output), null, 2), sha256), preview);
  preview.records[0]!.id = 'changed'; preview.recordDocuments[0] = '{}';
  assert.deepEqual((await readEvidenceBundle(output, sha256)).recordDocuments, documents);
});
test('tampering, order changes, duplicate keys/IDs, unknown fields and source conflicts fail closed', async () => {
  const { documents } = await fixture();
  const output = await createEvidenceBundle(documents, time, sha256);
  for (const change of [
    (r: any) => { r.records.reverse(); },
    (r: any) => { r.exportedAt = '2026-11-08T01:02:04.000Z'; },
    (r: any) => { r.recordCount++; },
    (r: any) => { r.extra = true; },
    (r: any) => { r.records[1] = r.records[0]; },
    (r: any) => { r.records[2] = r.records[2].replace('native-ios', 'offline-import'); },
    (r: any) => { r.records[0] = r.records[0].replace('offline-fixture', 'offline-import'); },
  ]) { const row = JSON.parse(output); change(row); await assert.rejects(readEvidenceBundle(JSON.stringify(row), sha256)); }
  await assert.rejects(readEvidenceBundle(output.replace('"schemaVersion":1', '"schemaVersion":1,"schema\\u0056ersion":1'), sha256), /Duplicate/);
  await assert.rejects(createEvidenceBundle([documents[0]!, documents[0]!], time, sha256), /Duplicate/);
  const tampered = documents[2]!.replace('example.invalid', 'example.changed');
  await assert.rejects(createEvidenceBundle([tampered], time, sha256), /digest mismatch/);
  // Even recomputing the outer digest cannot conceal a bad inner content digest.
  const row = JSON.parse(output); row.records[2] = tampered;
  const { sha256: _, ...base } = row; row.sha256 = await sha256(JSON.stringify(base));
  await assert.rejects(readEvidenceBundle(JSON.stringify(row), sha256), /content digest mismatch/);
  await assert.rejects(createEvidenceBundle([documents[2]!.replace('"payload":', '"payload":null,"payload":')], time, sha256), /Duplicate/);
  await assert.rejects(createEvidenceBundle([documents[2]!.replace('"sha256":', '"unknown":1,"sha256":')], time, sha256));
});
test('bounds, canonical time and digest failures reject without partial values', async () => {
  const { documents } = await fixture();
  for (const records of [[], Array(101).fill(documents[0]), [' '.repeat(16385)], [null], new Array(1)]) {
    await assert.rejects(createEvidenceBundle(records as string[], time, sha256));
  }
  for (const bad of ['2026-11-08', '2026-11-08T01:02:03Z', 'invalid']) await assert.rejects(createEvidenceBundle(documents, bad, sha256));
  await assert.rejects(readEvidenceBundle(' '.repeat(MAX_BUNDLE_CHARACTERS + 1), sha256), /limit/);
  const large: string[] = [];
  const store = new EvidenceStore({ insert: async (_, s) => { large.push(s); }, list: async () => large }, { randomId: () => `large-${large.length}`, sha256 });
  for (let i = 0; i < 100; i++) await store.save({ kind: 'analysis.can', source: 'offline-fixture', payload: ['"'.repeat(1900), '"'.repeat(1900), '"'.repeat(1900)] });
  await assert.rejects(createEvidenceBundle(large, time, sha256), /serialized size/);
  await assert.rejects(createEvidenceBundle(documents, time, async () => 'true'), /digest implementation/);
  await assert.rejects(verifyEvidenceDocument(documents[0]!, async () => '0'.repeat(64)), /digest mismatch/);
  let calls = 0;
  await assert.rejects(createEvidenceBundle(documents, time, async s => { if (++calls === 2) throw new Error('hash failed'); return sha256(s); }), /hash failed/);
});
test('export snapshots the entire selection before the first awaited hash', async () => {
  const { documents } = await fixture(); const expected = [...documents];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const promise = createEvidenceBundle(documents, time, async s => { await gate; return sha256(s); });
  documents[1] = '{}'; documents.reverse(); documents.push('{}'); release();
  assert.deepEqual((await readEvidenceBundle(await promise, sha256)).recordDocuments, expected);
});
test('CLI only reads bounded regular UTF-8 files and emits nothing on any invalid input', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apex-bundle-')); const { documents } = await fixture();
  const run = (...args: string[]) => spawnSync(process.execPath, ['tools/evidence-bundle.ts', ...args], { encoding: 'utf8', timeout: 10000 });
  try {
    const selection = join(dir, 'selection.json'); writeFileSync(selection, JSON.stringify(documents));
    const created = run('create', selection, time); assert.equal(created.status, 0, created.stderr);
    const bundle = join(dir, 'bundle.json'); writeFileSync(bundle, created.stdout);
    const preview = run('preview', bundle); assert.equal(preview.status, 0, preview.stderr);
    assert.deepEqual(JSON.parse(preview.stdout).recordDocuments, documents);
    const link = join(dir, 'link'); symlinkSync(bundle, link);
    const badUtf8 = join(dir, 'invalid'); writeFileSync(badUtf8, Buffer.from([255]));
    const huge = join(dir, 'huge'); writeFileSync(huge, ' '.repeat(MAX_BUNDLE_CHARACTERS * 4 + 1));
    const bad = join(dir, 'bad'); writeFileSync(bad, created.stdout.replace('native-ios', 'offline-import'));
    for (const args of [['preview', dir], ['preview', link], ['preview', badUtf8], ['preview', huge], ['preview', bad], ['preview', 'https://example.invalid'], ['preview', '-'], ['create', selection], ['restore', bundle]]) {
      const result = run(...args); assert.equal(result.status, 1, result.stderr); assert.equal(result.stdout, '');
    }
    assert.deepEqual(parseEvidence(documents[0]!).id, 'test-0');
  } finally { rmSync(dir, { recursive: true }); }
});

test('normalized phone NDEF and BLE source records retain exact source/platform rules', async () => {
  const { documents, journal } = await fixture();
  const phone = '\n' + readFileSync(new URL('./fixtures/phone-ndef/android.json', import.meta.url), 'utf8') + '\t';
  await journal.save(preparePhoneNdefEvidenceInput(phone, 'android'));
  const plx = prepareBlePlxSourceEvidenceInput('android', { id: 'fixture', rawScanRecord: 'AgEG', rssi: -42 },
    { origin: 'synthetic-fixture', label: 'Bundle synthetic input', capturedAt: null });
  await journal.save(plx);
  const output = await createEvidenceBundle(documents, time, sha256);
  const preview = await readEvidenceBundle(output, sha256);
  assert.equal((preview.records[3]!.payload as { document: string }).document, phone);
  assert.equal((preview.records[4]!.payload as { document: string }).document, plx.payload.document);
  for (const index of [3, 4]) {
    const bad = JSON.parse(documents[index]!); bad.source = 'offline-import';
    await assert.rejects(createEvidenceBundle([JSON.stringify(bad)], time, sha256), /source/);
  }
  await assert.rejects(readEvidenceBundle(output, async () => 'invalid'), /digest implementation/);
  let calls = 0;
  await assert.rejects(readEvidenceBundle(output, async s => { if (++calls === 3) throw new Error('hash failed'); return sha256(s); }), /hash failed/);
});
