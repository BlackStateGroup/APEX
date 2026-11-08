import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareBlePlxSourceEvidenceInput, prepareBlePlxSourceEvidenceDocument, readBlePlxSourceEvidencePayload } from '../packages/core/ble-plx-source-evidence.ts';
import { prepareBlePlxObservation } from '../packages/core/ble-plx-observation.ts';
import { prepareBleEvidenceInput } from '../packages/core/ble-evidence.ts';
import { EvidenceStore, EVIDENCE_SCHEMA, INSERT_EVIDENCE, SELECT_EVIDENCE, parseEvidence } from '../packages/core/evidence.ts';
const provenance = { origin: 'synthetic-fixture' as const, label: 'Selected snapshot test only', capturedAt: null };
const source = { id: 'Case-Sensitive-Identifier', name: undefined, localName: null, rssi: -42, rawScanRecord: 'AgEG',
  manufacturerData: '', serviceData: { FCD2: 'QAAZ' }, serviceUUIDs: ['FCD2'], overflowServiceUUIDs: [], isConnectable: false };
const crypto = { randomId: randomUUID, sha256: async (text: string) => createHash('sha256').update(text).digest('hex') };
function store(db: DatabaseSync) {
  db.exec(EVIDENCE_SCHEMA);
  return new EvidenceStore({ insert: async (id, text) => { db.prepare(INSERT_EVIDENCE).run(id, text); },
    list: async limit => db.prepare(SELECT_EVIDENCE).all(limit).map(row => String(row.document)) }, crypto);
}
const input = () => prepareBlePlxSourceEvidenceInput('android', source, provenance);
function altered(change: (row: any) => void) {
  const row = JSON.parse(input().payload.document); change(row);
  return () => prepareBlePlxSourceEvidenceDocument(JSON.stringify(row));
}

test('complete selected source, spelling and exact document whitespace survive SQLite reopen and digest verification', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apex-plx-source-')); const path = join(dir, 'journal.db');
  let db = new DatabaseSync(path);
  try {
    const document = JSON.stringify(JSON.parse(input().payload.document), null, 2) + '\n';
    const saved = await store(db).save(prepareBlePlxSourceEvidenceDocument(document));
    db.close(); db = new DatabaseSync(path);
    const journal = store(db); const [record] = await journal.list();
    assert.deepEqual(record, saved);
    assert.equal((record!.payload as { document: string }).document, document);
    assert.equal(await journal.verify(record!), true);
    const replay = readBlePlxSourceEvidencePayload(record!.payload);
    assert.deepEqual(replay.snapshot, prepareBlePlxObservation('android', source, provenance).snapshot);
    assert.deepEqual(replay.observation, prepareBlePlxObservation('android', source, provenance).observation);
    assert.equal(replay.snapshot.serviceData!.FCD2, 'QAAZ');
    assert.equal(replay.snapshot.id, source.id);
    assert.equal(replay.observation!.physicalReceptionVerified, false);
    assert.equal(replay.observation!.authenticatedIdentity, false);
    const parsed = JSON.parse(document);
    assert.deepEqual(parsed.undefinedFields, ['name']);
    assert.ok(parsed.unavailableFields.includes('name'));
    assert.ok(parsed.unavailableFields.includes('txPowerLevel'));
    assert.ok(!parsed.unavailableFields.includes('localName'));
    assert.equal(replay.snapshot.localName, null);
    assert.equal(replay.snapshot.manufacturerData, '');
    assert.deepEqual(replay.snapshot.overflowServiceUUIDs, []);
    const changed = { ...record!, payload: { ...input().payload, document: document + '\n' } };
    assert.equal(await journal.verify(changed), false);
    const raw = JSON.parse(document); raw.snapshot.id = 'Changed';
    assert.equal(await journal.verify({ ...record!, payload: { ...input().payload, document: JSON.stringify(raw) } }), false);
  } finally { db.close(); rmSync(dir, { recursive: true }); }
});

test('missing and explicit-null Android raw source remain uninterpretable; empty raw is distinct', () => {
  for (const device of [{}, { rawScanRecord: undefined }, { rawScanRecord: null }]) {
    const result = readBlePlxSourceEvidencePayload(prepareBlePlxSourceEvidenceInput('android', device, provenance).payload);
    assert.equal(result.status, 'raw-scan-record-unavailable');
    assert.equal(result.observation, null); assert.equal(result.document, null);
    assert.equal(result.snapshot.rawScanRecord, null);
    assert.equal(result.unavailableFields.includes('rawScanRecord'), device.rawScanRecord !== null);
  }
  const empty = readBlePlxSourceEvidencePayload(prepareBlePlxSourceEvidenceInput('android', { rawScanRecord: '' }, provenance).payload);
  assert.equal(empty.status, 'prepared'); assert.equal(empty.snapshot.rawScanRecord, ''); assert.ok(empty.observation);
});

test('iOS raw JSON base64 remains opaque and selected normalized fields alone are reinterpreted', () => {
  const raw = Buffer.from('{"not":"AD data"}').toString('base64');
  const result = readBlePlxSourceEvidencePayload(prepareBlePlxSourceEvidenceInput('ios', { ...source, manufacturerData: null, rawScanRecord: raw }, provenance).payload);
  assert.equal(result.snapshot.rawScanRecord, raw);
  assert.equal(result.observation!.inputKind, 'ios-advertisement-fields');
  assert.equal(result.observation!.rawAdvertising, null);
  assert.equal(result.observation!.captureCompleteness, 'not-exposed');
});

test('declared recorded origin and source timestamp remain separate from journal save time', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const imported = { origin: 'recorded-import' as const, label: 'Declared source only', capturedAt: '2026-11-07T01:02:03.000Z' };
    const record = await store(db).save({ ...prepareBlePlxSourceEvidenceInput('android', source, imported), observedAt: '2026-11-07T04:05:06.000Z' });
    assert.equal(record.source, 'offline-import');
    assert.deepEqual(readBlePlxSourceEvidencePayload(record.payload).provenance, imported);
    assert.notEqual(record.observedAt, imported.capturedAt);
  } finally { db.close(); }
  assert.throws(altered(row => { row.provenance.capturedAt = '2026-11-07T01:02:03.000Z'; }));
  assert.throws(altered(row => { row.provenance.origin = 'native-verified'; }));
});

test('strict source schema rejects claims, extra or missing fields, SDK/platform changes and inconsistent availability', () => {
  for (const change of [
    (row: any) => { row.decoded = { authenticated: true }; },
    (row: any) => { row.physicalReceptionVerified = true; },
    (row: any) => { row.provenance.authenticated = true; },
    (row: any) => { row.sdk = 'react-native-ble-plx@3.6.0'; },
    (row: any) => { row.schemaVersion = 2; },
    (row: any) => { row.platform = 'web'; },
    (row: any) => { row.platform = 'ios'; },
    (row: any) => { row.representation = 'native-verified'; },
    (row: any) => { row.snapshot.extra = 1; },
    (row: any) => { delete row.snapshot.id; },
    (row: any) => { row.snapshot.rawScanRecord = 'AG=='; },
    (row: any) => { row.unavailableFields.push('id'); },
    (row: any) => { row.unavailableFields.push('unknown'); },
    (row: any) => { row.unavailableFields.push('name'); },
    (row: any) => { row.undefinedFields.push('localName'); },
    (row: any) => { row.undefinedFields.push('bogus'); },
    (row: any) => { row.undefinedFields.push('name'); },
    (row: any) => { delete row.undefinedFields; },
  ]) assert.throws(altered(change));
  for (const payload of [{ ...input().payload, decoded: {} }, { ...input().payload, format: 'BLE-offline-document' },
    { ...input().payload, schemaVersion: 2 }, { ...input().payload, document: null }]) {
    assert.throws(() => readBlePlxSourceEvidencePayload(payload));
  }
});

test('source mismatch and native provenance are rejected on save and parse', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    for (const source of ['native-ios', 'native-android', 'offline-import'] as const) {
      await assert.rejects(journal.save({ ...input(), source }));
    }
    assert.equal((await journal.list()).length, 0);
    const record = await journal.save(input());
    assert.throws(() => parseEvidence(JSON.stringify({ ...record, source: 'offline-import' })));
  } finally { db.close(); }
});

test('Device methods and arbitrary properties are neither read nor retained; selected accessors fail', () => {
  const device = { ...source, connect() { throw new Error('must not call'); } };
  Object.defineProperty(device, 'manager', { get() { throw new Error('must not read'); } });
  assert.equal(input().payload.document, prepareBlePlxSourceEvidenceInput('android', device, provenance).payload.document);
  Object.defineProperty(device, 'id', { get() { throw new Error('must not invoke'); } });
  assert.throws(() => prepareBlePlxSourceEvidenceInput('android', device, provenance), /accessors/);
});

test('4096-character source boundary is exact; oversize complete snapshots are rejected without writes', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db); const exact = input().payload.document.padEnd(4096, ' ');
    const record = await journal.save(prepareBlePlxSourceEvidenceDocument(exact));
    assert.equal((record.payload as { document: string }).document, exact);
    assert.equal(await journal.verify(record), true);
    assert.throws(() => prepareBlePlxSourceEvidenceDocument(exact + ' '));
    assert.throws(() => prepareBlePlxSourceEvidenceInput('ios', { rawScanRecord: Buffer.alloc(3000).toString('base64') }, provenance), /bounded exact/);
    assert.equal((await journal.list()).length, 1);
  } finally { db.close(); }
});

test('old records retain identical canonical digest semantics with no schema migration', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    const legacy = { schemaVersion: 1 as const, id: 'legacy', kind: 'analysis.can' as const, source: 'offline-fixture' as const,
      observedAt: '2026-11-07T00:00:00Z', payload: { a: 1, z: [false, 'exact'] } };
    const record = { ...legacy, sha256: await crypto.sha256(JSON.stringify(legacy)) };
    db.prepare(INSERT_EVIDENCE).run(record.id, JSON.stringify(record));
    assert.equal(await journal.verify((await journal.list())[0]!), true);
    const projection = prepareBlePlxObservation('android', source, provenance).document!;
    const oldBle = await journal.save(prepareBleEvidenceInput(projection));
    await journal.save(input());
    assert.equal(await journal.verify(oldBle), true);
    assert.equal((await journal.list()).length, 3);
  } finally { db.close(); }
});
