import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { EvidenceStore } from '../packages/core/evidence.ts';
import { prepareBleEvidenceInput } from '../packages/core/ble-evidence.ts';
import { prepareNdefEvidenceInput } from '../packages/core/ndef-evidence.ts';
import { preparePhoneNdefEvidenceInput } from '../packages/core/phone-ndef-evidence.ts';
import { prepareBlePlxSourceEvidenceInput } from '../packages/core/ble-plx-source-evidence.ts';
import { prepareHciEventEvidenceInput } from '../packages/core/hci-event-evidence.ts';
import { prepareHci, createHciLegacyEventDocument } from '../packages/core/hci-offline.ts';
const sha256 = async (s: string) => createHash('sha256').update(s).digest('hex');
const sha256Bytes = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

test('listDocuments retains exact strings for every stored kind without writes or hashing', async () => {
  const documents: string[] = [];
  const store = new EvidenceStore({ insert: async (_, d) => { documents.push(d); }, list: async () => documents }, { sha256, sha256Bytes, randomId: () => `id-${documents.length}` });
  for (const kind of ['analysis.nec', 'analysis.can', 'analysis.firmware'] as const) await store.save({ kind, source: 'offline-fixture', payload: { a: 'value' } });
  await store.save({ kind: 'nfc.metadata', source: 'native-android', payload: {} });
  await store.save(prepareBleEvidenceInput(JSON.stringify(JSON.parse(readFileSync(new URL('./fixtures/ble-observations.json', import.meta.url), 'utf8'))[0])));
  await store.save(prepareNdefEvidenceInput(readFileSync(new URL('../src/fixtures/ndef-text.json', import.meta.url), 'utf8')));
  await store.save(preparePhoneNdefEvidenceInput(readFileSync(new URL('./fixtures/phone-ndef/android.json', import.meta.url), 'utf8'), 'android'));
  await store.save(prepareBlePlxSourceEvidenceInput('android', { id: 'fixture', rawScanRecord: 'AgEG', rssi: -42 }, { origin: 'synthetic-fixture', label: 'Fixture', capturedAt: null }));
  const event = [4,62,12,2,1,0,0,1,2,3,4,5,6,0,127];
  const record = Buffer.alloc(24 + event.length); record.writeUInt32BE(event.length); record.writeUInt32BE(event.length, 4); record.writeUInt32BE(3, 8); record.set(event, 24);
  const bytes = Buffer.concat([Buffer.from('6274736e6f6f700000000001000003ea', 'hex'), record]);
  const hci = await createHciLegacyEventDocument(await prepareHci(bytes, { provenance: 'synthetic-fixture', label: 'Fixture' }, sha256Bytes), 0, sha256Bytes);
  await store.save(prepareHciEventEvidenceInput(hci));
  const exact = documents.map(d => '\n ' + JSON.stringify(JSON.parse(d), null, 2) + '\t');
  // A structurally valid wrong digest must remain listable, without a verification claim.
  exact[0] = exact[0]!.replace(JSON.parse(exact[0]!).sha256, '0'.repeat(64));
  let reads = 0;
  const reader = new EvidenceStore({ insert: async () => { assert.fail('write'); }, list: async limit => { assert.equal(limit, 50); reads++; return exact; } }, { randomId: () => { throw Error('random'); }, sha256: async () => { throw Error('hash'); } });
  const listed = await reader.listDocuments();
  assert.equal(reads, 1); assert.deepEqual(listed, exact); assert.notEqual(listed, exact);
  listed[0] = '{}'; assert.notEqual(exact[0], '{}');
});

test('listDocuments rejects invalid limits, oversized backend arrays and malformed documents', async () => {
  let value: unknown = []; let reads = 0;
  const store = new EvidenceStore({ insert: async () => assert.fail('write'), list: async () => { reads++; return value as string[]; } }, { randomId: () => 'x', sha256 });
  for (const limit of [0, -1, 501, 1.5, NaN, Infinity]) await assert.rejects(store.listDocuments(limit));
  assert.equal(reads, 0);
  for (value of [null, {}, '[]', [null], new Array(1), [' '.repeat(16385)], ['{}'], ['{"id":1,"id":2}'], Array(51).fill('{}')]) await assert.rejects(store.listDocuments());
  value = []; assert.deepEqual(await store.listDocuments(500), []);
});
