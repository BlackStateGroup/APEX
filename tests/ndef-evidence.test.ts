import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareNdefEvidenceInput, readNdefEvidencePayload } from '../packages/core/ndef-evidence.ts';
import { EvidenceStore, EVIDENCE_SCHEMA, INSERT_EVIDENCE, SELECT_EVIDENCE, parseEvidence } from '../packages/core/evidence.ts';
import { importNdefObservation } from '../packages/core/ndef-offline.ts';
import { reopenNdefEvidence } from '../src/ndef-workbench.ts';
const fixture = readFileSync(new URL('../src/fixtures/ndef-text.json', import.meta.url), 'utf8');
const crypto = { randomId: randomUUID, sha256: async (s: string) => createHash('sha256').update(s).digest('hex') };
function store(db: DatabaseSync) {
  db.exec(EVIDENCE_SCHEMA);
  return new EvidenceStore({ insert: async (id, document) => { db.prepare(INSERT_EVIDENCE).run(id, document); },
    list: async limit => db.prepare(SELECT_EVIDENCE).all(limit).map(row => String(row.document)) }, crypto);
}
test('NDEF exact whitespace and case survive SQLite close/reopen with fresh interpretation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apex-ndef-')); const file = join(dir, 'journal.db');
  let db = new DatabaseSync(file);
  try {
    const document = '\n ' + fixture.replace('d101055402656e4869', 'D101055402656E4869') + '\t\n';
    const original = await store(db).save(prepareNdefEvidenceInput(document));
    db.close(); db = new DatabaseSync(file);
    const journal = store(db); const [record] = await journal.list(); assert.deepEqual(record, original);
    const reopened = await reopenNdefEvidence(record!, r => journal.verify(r));
    assert.deepEqual(reopened.observation, importNdefObservation(document));
    assert.equal(reopened.observation.sourceDocument, document);
    assert.equal(reopened.observation.verification.identityVerified, false);
  } finally { db.close(); rmSync(dir, { recursive: true }); }
});
test('source conflicts, native claims and extra decoded claims fail save/read/replay', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db); const input = prepareNdefEvidenceInput(fixture); const record = await journal.save(input);
    for (const source of ['offline-import', 'native-ios', 'native-android'] as const) {
      await assert.rejects(journal.save({ ...input, source }));
      assert.throws(() => parseEvidence(JSON.stringify({ ...record, source })));
      await assert.rejects(reopenNdefEvidence({ ...record, source }, async () => true));
    }
    for (const extra of [{ decoded: {} }, { physicalReceptionVerified: true }, { nativeRecords: [] }]) {
      const payload = { ...input.payload, ...extra };
      assert.throws(() => readNdefEvidencePayload(payload));
      await assert.rejects(journal.save({ ...input, payload }));
      assert.throws(() => parseEvidence(JSON.stringify({ ...record, payload })));
      await assert.rejects(reopenNdefEvidence({ ...record, payload }, async () => true));
      assert.throws(() => prepareNdefEvidenceInput(JSON.stringify({ ...JSON.parse(fixture), ...extra })));
    }
    assert.equal((await journal.list()).length, 1);
  } finally { db.close(); }
});
test('recorded provenance remains only a caller claim and URI remains inert', async () => {
  const document = JSON.parse(readFileSync(new URL('../src/fixtures/ndef-uri.json', import.meta.url), 'utf8'));
  document.provenance.origin = 'recorded-import';
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db); const record = await journal.save(prepareNdefEvidenceInput(JSON.stringify(document)));
    assert.equal(record.source, 'offline-import');
    const result = await reopenNdefEvidence(record, r => journal.verify(r));
    assert.deepEqual(result.observation.decoded.records[0]?.value, { kind: 'uri', prefixCode: 4, uri: 'https://example.com', actionable: false });
    assert.deepEqual(result.observation.verification, { physicalReceptionVerified: false, identityVerified: false, authenticated: false, originIsCallerClaim: true });
  } finally { db.close(); }
});
test('malformed, opaque and unsupported bytes retain all original records/tails through journal replay', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    for (const messageHex of ['d1', 'd101055402656e486900', 'd50001ff', 'b101015400', 'd101025400ff']) {
      const document = JSON.stringify({ ...JSON.parse(fixture), messageHex });
      const original = importNdefObservation(document);
      const record = await journal.save(prepareNdefEvidenceInput(document));
      const result = await reopenNdefEvidence(record, r => journal.verify(r));
      assert.deepEqual(result.observation, original);
      assert.equal(original.decoded.records.map(r => r.rawHex).join('') + original.decoded.unparsedHex, messageHex);
    }
  } finally { db.close(); }
});
test('tampering with exact whitespace or bytes breaks digest', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db); const input = prepareNdefEvidenceInput(fixture); const record = await journal.save(input);
    for (const document of [fixture + ' ', fixture.replace('4869', '486a')]) {
      const changed = { ...record, payload: { ...input.payload, document } };
      assert.equal(await journal.verify(changed), false);
      await assert.rejects(reopenNdefEvidence(changed, r => journal.verify(r)), /digest mismatch/);
    }
  } finally { db.close(); }
});
test('4096 character journal cap retains all or rejects all without widening old limits', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db); const exact = fixture.padEnd(4096, ' ');
    const record = await journal.save(prepareNdefEvidenceInput(exact));
    assert.equal(readNdefEvidencePayload(record.payload).sourceDocument, exact);
    const big = exact + ' '; assert.equal(importNdefObservation(big).sourceDocument, big);
    assert.throws(() => prepareNdefEvidenceInput(big));
    await assert.rejects(journal.save({ kind: 'analysis.ndef', source: 'offline-fixture', payload: { schemaVersion: 1, format: 'NDEF-offline-document', document: big } }));
    await assert.rejects(journal.save({ kind: 'analysis.can', source: 'offline-fixture', payload: { data: 'x'.repeat(4097) } }));
    assert.equal((await journal.list()).length, 1);
  } finally { db.close(); }
});
test('old canonical digest and schema are unchanged', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    const record = await journal.save({ kind: 'analysis.can', source: 'offline-fixture', observedAt: '2026-11-07T00:00:00Z', payload: { z: 2, a: 1 } });
    const canonical = { schemaVersion: 1, id: record.id, kind: 'analysis.can', source: 'offline-fixture', observedAt: record.observedAt, payload: { a: 1, z: 2 } };
    assert.equal(record.sha256, await crypto.sha256(JSON.stringify(canonical)));
    await journal.save(prepareNdefEvidenceInput(fixture));
    assert.equal(await journal.verify(record), true); assert.equal((await journal.list()).length, 2);
    assert.deepEqual(db.prepare('PRAGMA table_info(apex_evidence)').all().map(r => r.name), ['id', 'document']);
  } finally { db.close(); }
});
