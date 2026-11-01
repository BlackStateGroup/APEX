import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceStore, EVIDENCE_SCHEMA, INSERT_EVIDENCE, SELECT_EVIDENCE, parseEvidence } from '../packages/core/evidence.ts';
const crypto = { randomId: randomUUID, sha256: async (value: string) => createHash('sha256').update(value).digest('hex') };
function store(db: DatabaseSync) {
  db.exec(EVIDENCE_SCHEMA);
  return new EvidenceStore({ insert: async (id, document) => { db.prepare(INSERT_EVIDENCE).run(id, document); }, list: async limit => db.prepare(SELECT_EVIDENCE).all(limit).map(row => String(row.document)) }, crypto);
}
test('SQLite evidence survives reopen, verifies and detects changed payloads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-evidence-')); const file = join(directory, 'evidence.db');
  let db = new DatabaseSync(file);
  try {
    const original = await store(db).save({ kind: 'analysis.can', source: 'offline-fixture', payload: { identifiers: ['123'], frames: 2 } });
    db.close(); db = new DatabaseSync(file); const reopened = store(db); const [record] = await reopened.list();
    assert.deepEqual(record, original); assert.equal(await reopened.verify(record!), true);
    assert.equal(await reopened.verify({ ...record!, payload: { frames: 3 } }), false);
    await assert.rejects(reopened.list(501), /limit/);
  } finally { db.close(); rmSync(directory, { recursive: true }); }
});
test('evidence rejects source confusion, unbounded data and malformed envelopes', async () => {
  const db = new DatabaseSync(':memory:'); const journal = store(db);
  try {
    await assert.rejects(journal.save({ kind: 'nfc.metadata', source: 'offline-fixture', payload: {} }), /native source/);
    await assert.rejects(journal.save({ kind: 'analysis.nec', source: 'offline-import', payload: { invalid: NaN } }), /bounded JSON/);
    await assert.rejects(journal.save({ kind: 'analysis.nec', source: 'offline-import', payload: 'a'.repeat(4097) }), /bounded JSON/);
    assert.throws(() => parseEvidence('{}'), /digest/); assert.equal((await journal.list()).length, 0);
  } finally { db.close(); }
});
test('failed inserts retain existing evidence and never report a successful save', async () => {
  const db = new DatabaseSync(':memory:'); const journal = store(db);
  try {
    const first = await journal.save({ kind: 'analysis.nec', source: 'offline-import', payload: { command: 52 } });
    const sameId = new EvidenceStore({ insert: async (id, document) => { db.prepare(INSERT_EVIDENCE).run(id, document); }, list: async () => [] }, { ...crypto, randomId: () => first.id });
    await assert.rejects(sameId.save({ kind: 'analysis.nec', source: 'offline-import', payload: {} }), /UNIQUE/);
    assert.deepEqual(await journal.list(), [first]);
  } finally { db.close(); }
});
