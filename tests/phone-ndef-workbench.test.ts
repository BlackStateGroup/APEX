import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { EvidenceStore, EVIDENCE_SCHEMA, INSERT_EVIDENCE, SELECT_EVIDENCE, parseEvidence } from '../packages/core/evidence.ts';
import { preparePhoneNdefEvidenceInput, readPhoneNdefEvidencePayload } from '../packages/core/phone-ndef-evidence.ts';
import { prepareNdefEvidenceInput } from '../packages/core/ndef-evidence.ts';
import { importPhoneNdefObservation } from '../packages/core/nfc-manager-ndef.ts';
import { initialPhoneNdefWorkbench as initial, phoneNdefWorkbenchReducer as reduce, canSavePhoneNdef, reopenPhoneNdefEvidence } from '../src/phone-ndef-workbench.ts';
const fixture = (platform: 'android' | 'ios') => readFileSync(new URL(`./fixtures/phone-ndef/${platform}.json`, import.meta.url), 'utf8');
const crypto = { randomId: randomUUID, sha256: async (s: string) => createHash('sha256').update(s).digest('hex') };
function store(db: DatabaseSync) {
  db.exec(EVIDENCE_SCHEMA);
  return new EvidenceStore({ insert: async (id, document) => { db.prepare(INSERT_EVIDENCE).run(id, document); },
    list: async limit => db.prepare(SELECT_EVIDENCE).all(limit).map(row => String(row.document)) }, crypto);
}
for (const platform of ['android', 'ios'] as const) test(`${platform}: exact selected fields survive SQLite close/reopen and verified reinterpretation`, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apex-phone-ndef-')); const file = join(dir, 'evidence.db');
  let db = new DatabaseSync(file);
  try {
    const document = '\n ' + fixture(platform) + '\t';
    const original = await store(db).save(preparePhoneNdefEvidenceInput(document, platform));
    db.close(); db = new DatabaseSync(file);
    const journal = store(db); const [record] = await journal.list(); assert.deepEqual(record, original);
    const result = await reopenPhoneNdefEvidence(record!, r => journal.verify(r));
    assert.deepEqual(result.observation, importPhoneNdefObservation(document, platform));
    assert.equal(result.observation.sourceDocument, document);
    assert.equal(result.observation.projection[1]?.value.kind, 'uri');
    assert.equal((result.observation.projection[1]?.value as {actionable: boolean}).actionable, false);
    assert.equal(result.observation.projection[2]?.value.kind, 'opaque');
    assert.equal(result.observation.verification.originalWireAvailable, false);
    assert.equal(Object.hasOwn(result.observation, 'observedAt'), false);
  } finally { db.close(); rmSync(dir, { recursive: true }); }
});
test('selected-source platform/provenance binding, unsupported claims and old wire cross-import fail', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db), input = preparePhoneNdefEvidenceInput(fixture('android'), 'android');
    const record = await journal.save(input);
    for (const source of ['offline-import', 'native-ios', 'native-android'] as const) {
      await assert.rejects(journal.save({ ...input, source }));
      assert.throws(() => parseEvidence(JSON.stringify({ ...record, source })));
    }
    for (const payload of [{ ...input.payload, expectedPlatform: 'ios' }, { ...input.payload, projection: [] }, { ...input.payload, capturedAt: '2026-11-07' }]) {
      assert.throws(() => readPhoneNdefEvidencePayload(payload));
      await assert.rejects(journal.save({ ...input, payload }));
      await assert.rejects(reopenPhoneNdefEvidence({ ...record, payload }, async () => true));
    }
    assert.throws(() => prepareNdefEvidenceInput(fixture('android')));
    assert.throws(() => preparePhoneNdefEvidenceInput(readFileSync(new URL('../src/fixtures/ndef-text.json', import.meta.url), 'utf8'), 'android'));
    const claimed = JSON.parse(fixture('android')); claimed.provenance.origin = 'recorded-import';
    assert.equal(preparePhoneNdefEvidenceInput(JSON.stringify(claimed), 'android').source, 'offline-import');
    assert.equal((await journal.list()).length, 1);
  } finally { db.close(); }
});
test('missing, null, empty and absent versus empty record IDs survive journal', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db);
    for (const [snapshot, availability] of [[{}, 'missing'], [{ ndefMessage: null }, 'null'], [{ ndefMessage: [] }, 'empty-array']] as const) {
      const document = JSON.stringify({ ...JSON.parse(fixture('android')), snapshot });
      const record = await journal.save(preparePhoneNdefEvidenceInput(document, 'android'));
      const result = await reopenPhoneNdefEvidence(record, r => journal.verify(r));
      assert.equal(result.observation.availability, availability); assert.deepEqual(result.observation.snapshot, snapshot);
    }
    const value = JSON.parse(fixture('android')); delete value.snapshot.ndefMessage[0].id;
    const record = await journal.save(preparePhoneNdefEvidenceInput(JSON.stringify(value), 'android'));
    const result = await reopenPhoneNdefEvidence(record, r => journal.verify(r));
    assert.equal(result.observation.projection[0]?.idHex, null); assert.equal(result.observation.projection[1]?.idHex, '');
  } finally { db.close(); }
});
test('exact 4096 character cap; larger imports can preview but cannot save or truncate', async () => {
  const document = fixture('android').padEnd(4096, ' '), db = new DatabaseSync(':memory:');
  try {
    const journal = store(db), input = preparePhoneNdefEvidenceInput(document, 'android');
    const record = await journal.save(input); assert.equal(readPhoneNdefEvidencePayload(record.payload).sourceDocument, document);
    const big = document + ' '; assert.equal(importPhoneNdefObservation(big, 'android').sourceDocument, big);
    assert.throws(() => preparePhoneNdefEvidenceInput(big, 'android'));
    await assert.rejects(journal.save({ ...input, payload: { ...input.payload, document: big } }));
    const state = reduce(reduce(initial, { type: 'edit', document: big }), { type: 'interpret' });
    assert.ok(state.observation); assert.equal(canSavePhoneNdef(state), false); assert.match(state.message, /not saveable/);
    await assert.rejects(journal.save({ kind: 'analysis.can', source: 'offline-fixture', payload: { x: 'x'.repeat(4097) } }));
    await assert.rejects(journal.save({ kind: 'analysis.can', source: 'offline-fixture', payload: Array(5).fill('x'.repeat(4096)) }));
    await assert.rejects(journal.save({ kind: 'analysis.can', source: 'offline-fixture', payload: [[[[[[[[[[0]]]]]]]]]] }));
    assert.equal((await journal.list()).length, 1);
  } finally { db.close(); }
});
test('digest tampering refuses reinterpretation; reopen snapshots caller data before async verification', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = store(db), input = preparePhoneNdefEvidenceInput(fixture('android'), 'android');
    const record = await journal.save(input);
    const changed = { ...record, payload: { ...input.payload, document: input.payload.document + ' ' } };
    await assert.rejects(reopenPhoneNdefEvidence(changed, r => journal.verify(r)), /digest mismatch/);
    let finish!: () => void; const wait = new Promise<void>(r => { finish = r; });
    const open = reopenPhoneNdefEvidence(record, async r => { await wait; return journal.verify(r); });
    (record.payload as {document: string}).document = '{}'; finish();
    assert.equal((await open).observation.sourceDocument, input.payload.document);
  } finally { db.close(); }
});
test('draft/platform edits invalidate findings; duplicate saves and stale completions cannot restore findings', () => {
  let state = reduce(initial, { type: 'edit', document: fixture('android') });
  assert.equal(state.observation, null); state = reduce(state, { type: 'interpret' }); assert.equal(canSavePhoneNdef(state), true);
  const revision = state.revision, document = state.document;
  state = reduce(state, { type: 'save-start' }); assert.equal(canSavePhoneNdef(state), false);
  assert.equal(reduce(state, { type: 'save-start' }), state);
  assert.equal(reduce(state, { type: 'interpret' }), state);
  state = reduce(state, { type: 'edit', document: fixture('ios'), expectedPlatform: 'ios' });
  const message = state.message;
  state = reduce(state, { type: 'save-finish', revision, document });
  assert.equal(state.message, message); assert.equal(state.observation, null); assert.equal(state.expectedPlatform, 'ios');
  assert.equal(state.pending, null); state = reduce(state, { type: 'interpret' }); assert.equal(canSavePhoneNdef(state), true);
  const current = state; state = reduce(state, { type: 'save-start' });
  state = reduce(state, { type: 'save-finish', revision: current.revision, document: current.document });
  assert.equal(canSavePhoneNdef(state), false);
  state = reduce(state, { type: 'edit', document: state.document, expectedPlatform: 'android' });
  state = reduce(state, { type: 'interpret' }); assert.equal(state.observation, null); assert.equal(state.saveInput, null);
});
test('save failure permits retry, unrelated completion is ignored, same document cannot be resaved after refresh failure', () => {
  let state = reduce(reduce(initial, { type: 'edit', document: fixture('android') }), { type: 'interpret' });
  state = reduce(state, { type: 'save-start' });
  assert.equal(reduce(state, { type: 'save-finish', revision: 1234, document: '{}' }), state);
  state = reduce(state, { type: 'save-finish', revision: state.revision, document: state.document, error: 'disk unavailable' });
  assert.equal(canSavePhoneNdef(state), true);
  state = reduce(state, { type: 'save-start' });
  state = reduce(state, { type: 'save-finish', revision: state.revision, document: state.document });
  assert.equal(canSavePhoneNdef(state), false);
  state = reduce(state, { type: 'interpret' }); assert.equal(canSavePhoneNdef(state), false);
});
