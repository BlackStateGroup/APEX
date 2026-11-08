import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareBleEvidenceInput, readBleEvidencePayload, MAX_BLE_EVIDENCE_DOCUMENT_CHARACTERS } from '../packages/core/ble-evidence.ts';
import { EvidenceStore, EVIDENCE_SCHEMA, INSERT_EVIDENCE, SELECT_EVIDENCE, parseEvidence } from '../packages/core/evidence.ts';
import { importBleObservation } from '../packages/core/ble-advertisements.ts';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/ble-observations.json', import.meta.url), 'utf8'));
const bthomeFixture = JSON.parse(readFileSync(new URL('./fixtures/bthome-observation.json', import.meta.url), 'utf8'));
const cryptography = {
  randomId: randomUUID,
  sha256: async (value: string) => createHash('sha256').update(value).digest('hex'),
};
function store(db: DatabaseSync): EvidenceStore {
  db.exec(EVIDENCE_SCHEMA);
  return new EvidenceStore({
    insert: async (id, document) => { db.prepare(INSERT_EVIDENCE).run(id, document); },
    list: async limit => db.prepare(SELECT_EVIDENCE).all(limit).map(row => String(row.document)),
  }, cryptography);
}

test('BLE evidence preserves exact offline input across SQLite reopen and reinterprets it', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-ble-evidence-'));
  const file = join(directory, 'evidence.db');
  let db = new DatabaseSync(file);
  try {
    const document = JSON.stringify(fixtures[0], null, 2) + '\n';
    const original = await store(db).save(prepareBleEvidenceInput(document));
    db.close(); db = new DatabaseSync(file);
    const journal = store(db);
    const [retained] = await journal.list();
    assert.deepEqual(retained, original);
    assert.equal((retained!.payload as { document: string }).document, document);
    assert.equal(await journal.verify(retained!), true);
    const observation = readBleEvidencePayload(retained!.payload);
    assert.deepEqual(observation, importBleObservation(document));
    assert.equal(observation.physicalReceptionVerified, false);
    assert.equal(observation.authenticatedIdentity, false);
    assert.equal(retained!.source, 'offline-fixture');
  } finally { db.close(); rmSync(directory, { recursive: true }); }
});

test('iOS normalized input stays normalized after journal round-trip', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    const record = await journal.save(prepareBleEvidenceInput(JSON.stringify(fixtures[1])));
    const observation = readBleEvidencePayload(record.payload);
    assert.equal(observation.inputKind, 'ios-advertisement-fields');
    assert.equal(observation.rawAdvertising, null);
    assert.equal(observation.captureCompleteness, 'not-exposed');
    assert.equal(await journal.verify(record), true);
  } finally { db.close(); }
});

test('BTHome official-example bytes retain their meaning without a sensor-truth claim', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    const record = await journal.save(prepareBleEvidenceInput(JSON.stringify(bthomeFixture)));
    const reading = readBleEvidencePayload((await journal.list())[0]!.payload).serviceReadings[0]!.reading;
    assert.ok('format' in reading && reading.format === 'BTHome-v2');
    assert.deepEqual(reading.objects.map(object => object.value), [25, 50.55]);
    assert.equal(reading.sensorTruthVerified, false);
    assert.equal(reading.authenticated, false);
    assert.equal(await journal.verify(record), true);
  } finally { db.close(); }
});

test('retained encrypted BTHome stays opaque rather than acquiring decoded or authenticated claims', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const input = { ...fixtures[1], fields: { ...fixtures[1].fields, serviceUuids: ['fcd2'],
      serviceData: [{ uuid: 'fcd2', payloadHex: '41e445f3c9962b332211006c7c4519' }] } };
    const journal = store(db);
    const record = await journal.save(prepareBleEvidenceInput(JSON.stringify(input)));
    const reading = readBleEvidencePayload(record.payload).serviceReadings[0]!.reading;
    assert.ok('format' in reading && reading.format === 'BTHome-v2');
    assert.equal(reading.status, 'opaque');
    assert.equal(reading.authenticated, false);
    assert.deepEqual(reading.objects, []);
    assert.equal(reading.unparsedHex, input.fields.serviceData[0].payloadHex);
    assert.equal(await journal.verify(record), true);
  } finally { db.close(); }
});

test('recorded import retains capture time separately from journal save time', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const document = JSON.stringify({ ...fixtures[0], provenance: {
      origin: 'recorded-import', label: 'Envelope test only, not a real capture', capturedAt: '2026-11-07T01:02:03.000Z',
    } });
    const record = await store(db).save({ ...prepareBleEvidenceInput(document), observedAt: '2026-11-07T04:05:06.000Z' });
    assert.equal(record.source, 'offline-import');
    assert.equal(record.observedAt, '2026-11-07T04:05:06.000Z');
    assert.equal(readBleEvidencePayload(record.payload).provenance.capturedAt, '2026-11-07T01:02:03.000Z');
  } finally { db.close(); }
});

test('BLE source mismatch and native source claims fail before storage', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    const input = prepareBleEvidenceInput(JSON.stringify(fixtures[0]));
    await assert.rejects(journal.save({ ...input, source: 'offline-import' }), /source does not match/);
    await assert.rejects(journal.save({ ...input, source: 'native-ios' }), /offline source/);
    assert.equal((await journal.list()).length, 0);
    assert.throws(() => prepareBleEvidenceInput(JSON.stringify({ ...fixtures[0], physicalReceptionVerified: true })), /schema/);
  } finally { db.close(); }
});

test('stored decoded-result claims and extra payload fields are never trusted', async () => {
  const input = prepareBleEvidenceInput(JSON.stringify(fixtures[0]));
  for (const payload of [
    { ...input.payload, decoded: { authenticated: true } },
    { ...input.payload, format: 'native-BLE-capture' },
    { ...input.payload, schemaVersion: 2 },
    { ...input.payload, document: null },
  ]) assert.throws(() => readBleEvidencePayload(payload), /bounded exact/);
});

test('a valid retained-byte change breaks the journal digest', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    const input = prepareBleEvidenceInput(JSON.stringify(fixtures[0]));
    const record = await journal.save(input);
    const changed = { ...record, payload: { ...input.payload, document: input.payload.document + '\n' } };
    assert.equal(await journal.verify(changed), false);
    assert.throws(() => parseEvidence(JSON.stringify({ ...record, source: 'offline-import' })), /source does not match/);
  } finally { db.close(); }
});

test('string-like arrays cannot bypass BLE envelope validation', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const record = await store(db).save(prepareBleEvidenceInput(JSON.stringify(fixtures[0])));
    for (const fields of [
      { kind: ['analysis.ble'] },
      { source: ['offline-fixture'] },
      { kind: ['analysis.ble'], source: ['offline-fixture'], payload: { notABleDocument: true } },
    ]) assert.throws(() => parseEvidence(JSON.stringify({ ...record, ...fields })), /Invalid evidence envelope/);
  } finally { db.close(); }
});

test('journal size boundary retains the complete source or rejects it without truncation', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    const text = JSON.stringify(fixtures[0]);
    const exactly = text.padEnd(MAX_BLE_EVIDENCE_DOCUMENT_CHARACTERS, ' ');
    const record = await journal.save(prepareBleEvidenceInput(exactly));
    assert.equal((record.payload as { document: string }).document.length, MAX_BLE_EVIDENCE_DOCUMENT_CHARACTERS);
    assert.throws(() => prepareBleEvidenceInput(exactly + ' '), /bounded exact/);
    assert.equal((await journal.list()).length, 1);
  } finally { db.close(); }
});

test('BLE additions preserve old journal kinds and do not require a database migration', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    const old = await journal.save({ kind: 'analysis.can', source: 'offline-fixture', payload: { frames: 2 } });
    const ble = await journal.save(prepareBleEvidenceInput(JSON.stringify(fixtures[0])));
    assert.deepEqual(await journal.list(), [ble, old]);
    assert.equal(await journal.verify(old), true);
  } finally { db.close(); }
});

test('a failed BLE insert cannot replace existing evidence or report success', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    const original = await journal.save(prepareBleEvidenceInput(JSON.stringify(fixtures[0])));
    const conflicting = new EvidenceStore({
      insert: async (id, document) => { db.prepare(INSERT_EVIDENCE).run(id, document); }, list: async () => [],
    }, { ...cryptography, randomId: () => original.id });
    await assert.rejects(conflicting.save(prepareBleEvidenceInput(JSON.stringify(fixtures[1]))), /UNIQUE/);
    assert.deepEqual(await journal.list(), [original]);
  } finally { db.close(); }
});

test('UID, URL and reserved encodings retain exact evidence across SQLite reopen without identity or navigation claims', async () => {
  const eddystoneFixtures = JSON.parse(readFileSync(new URL('./fixtures/eddystone-observations.json', import.meta.url), 'utf8'));
  const directory = mkdtempSync(join(tmpdir(), 'apex-eddystone-evidence-'));
  const file = join(directory, 'evidence.db');
  let db = new DatabaseSync(file);
  try {
    const opaque = { ...eddystoneFixtures[3], fields: { ...eddystoneFixtures[3].fields,
      serviceData: [{ uuid: 'feaa', payloadHex: '100003610e' }] } };
    const recorded = { ...eddystoneFixtures[0], provenance: { origin: 'recorded-import',
      label: 'Constructed recorded envelope, no radio reception', capturedAt: '2026-11-07T01:02:03.000Z' } };
    const documents = [...eddystoneFixtures, opaque, recorded].map(row => JSON.stringify(row, null, 2) + '\n');
    const journal = store(db);
    const originals = await Promise.all(documents.map(document => journal.save(prepareBleEvidenceInput(document))));
    db.close(); db = new DatabaseSync(file);
    const reopened = store(db);
    const retained = await reopened.list();
    for (let i = 0; i < originals.length; i++) {
      const record = retained.find(row => row.id === originals[i]!.id)!;
      assert.deepEqual(record, originals[i]);
      assert.equal((record.payload as { document: string }).document, documents[i]);
      assert.equal(await reopened.verify(record), true);
      const observation = readBleEvidencePayload(record.payload);
      assert.deepEqual(observation, importBleObservation(documents[i]!));
      assert.equal(observation.physicalReceptionVerified, false);
      assert.equal(observation.authenticatedIdentity, false);
      if (i === 4) { assert.equal(observation.serviceReadings[0]!.reading.status, 'opaque'); }
      if (i === 5) { assert.equal(record.source, 'offline-import'); assert.deepEqual(observation.provenance, recorded.provenance); }
    }
    const record = originals[0]!;
    assert.equal(await reopened.verify({ ...record, payload: { ...(record.payload as object), document: documents[0]!.replace('aafe', 'abfe') } }), false);
  } finally { db.close(); rmSync(directory, { recursive: true }); }
});
