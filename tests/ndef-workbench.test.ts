import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { ndefWorkbenchReducer as reduce, initialNdefWorkbench as initial, canSaveNdef, reopenNdefEvidence } from '../src/ndef-workbench.ts';
import { EvidenceStore } from '../packages/core/evidence.ts';

const document = readFileSync(new URL('../src/fixtures/ndef-text.json', import.meta.url), 'utf8');
const parsed = () => reduce(reduce(initial, { type: 'edit', document }), { type: 'interpret' });
function journal() {
  const rows: string[] = [];
  return new EvidenceStore({ insert: async (_id, text) => { rows.unshift(text); }, list: async limit => rows.slice(0, limit) }, {
    randomId: randomUUID, sha256: async text => createHash('sha256').update(text).digest('hex'),
  });
}
test('initial and edited documents cannot save before successful interpretation', () => {
  assert.equal(canSaveNdef(initial), false);
  const edited = reduce(initial, { type: 'edit', document });
  assert.equal(canSaveNdef(edited), false);
  assert.equal(reduce(edited, { type: 'save-start' }), edited);
  assert.equal(canSaveNdef(parsed()), true);
});
test('edits immediately invalidate both visible results and save input', () => {
  const changed = reduce(parsed(), { type: 'edit', document: document + ' ' });
  assert.equal(changed.observation, null); assert.equal(changed.saveInput, null);
  const next = reduce(changed, { type: 'interpret' });
  assert.equal(next.saveInput?.source, 'offline-fixture');
  assert.equal(next.saveInput?.payload.document, document + ' ');
});
test('import provenance is derived from envelope, not the control used to load it', () => {
  const value = JSON.parse(document);
  value.provenance = { origin: 'recorded-import', label: 'Synthetic test of recorded envelope shape' };
  const state = reduce(reduce(initial, { type: 'edit', document: JSON.stringify(value) }), { type: 'interpret' });
  assert.equal(state.saveInput?.source, 'offline-import');
  assert.equal(state.observation?.verification.physicalReceptionVerified, false);
  assert.equal(state.observation?.verification.identityVerified, false);
});
test('failed reparse never leaves a successful result saveable', () => {
  for (const document of ['', '{', '{}', 'x'.repeat(20001)]) {
    const state = reduce(reduce(parsed(), { type: 'edit', document }), { type: 'interpret' });
    assert.equal(state.observation, null); assert.equal(canSaveNdef(state), false);
    assert.match(state.message, /NDEF import error/);
  }
});
test('journal cap does not hide successful interpretation or truncate source', () => {
  const oversized = document + ' '.repeat(4097 - document.length);
  const state = reduce(reduce(initial, { type: 'edit', document: oversized }), { type: 'interpret' });
  assert.ok(state.observation); assert.equal(canSaveNdef(state), false);
  assert.equal(state.document, oversized); assert.match(state.message, /not saveable/);
});
test('double taps and repeat interpretation cannot duplicate a completed save', () => {
  const state = parsed(); const pending = reduce(state, { type: 'save-start' });
  assert.equal(canSaveNdef(pending), false);
  assert.equal(reduce(pending, { type: 'save-start' }), pending);
  assert.equal(reduce(pending, { type: 'interpret' }), pending);
  const saved = reduce(pending, { type: 'save-finish', revision: state.revision, document });
  assert.equal(canSaveNdef(saved), false);
  assert.equal(canSaveNdef(reduce(saved, { type: 'interpret' })), false);
});
test('edit while saving ignores stale completion content and blocks overlapping saves', () => {
  const state = parsed(); const pending = reduce(state, { type: 'save-start' });
  const changed = reduce(pending, { type: 'edit', document: '{}' });
  assert.equal(canSaveNdef(changed), false);
  const done = reduce(changed, { type: 'save-finish', revision: state.revision, document });
  assert.equal(done.document, '{}'); assert.equal(done.observation, null);
  assert.equal(done.message, changed.message); assert.equal(done.pending, null);
  assert.equal(reduce(done, { type: 'save-finish', revision: state.revision, document }), done);
});
test('failed save retains interpreted source for explicit retry', () => {
  const state = parsed(); const pending = reduce(state, { type: 'save-start' });
  const failed = reduce(pending, { type: 'save-finish', revision: state.revision, document, error: 'quota' });
  assert.equal(canSaveNdef(failed), true); assert.match(failed.message, /quota/);
  assert.equal(failed.saveInput?.payload.document, document);
});
test('reopen verifies exact retained input and computes fresh unauthenticated interpretation', async () => {
  const store = journal(); const record = await store.save(parsed().saveInput!);
  const result = await reopenNdefEvidence(record, value => store.verify(value));
  assert.equal(result.observation.decoded.records[0]?.value.kind, 'text');
  assert.equal(result.observation.verification.identityVerified, false);
  assert.deepEqual(result.observation, parsed().observation);
  assert.equal((result.record.payload as { document: string }).document, document);
});
test('reopen rejects digest mismatches, verifier errors, wrong source, and non-NDEF records', async () => {
  const store = journal(); const record = await store.save(parsed().saveInput!);
  await assert.rejects(reopenNdefEvidence(record, async () => false), /digest mismatch/);
  await assert.rejects(reopenNdefEvidence(record, async () => { throw new Error('verification unavailable'); }), /unavailable/);
  await assert.rejects(reopenNdefEvidence({ ...record, source: 'offline-import' }, async () => true), /source does not match/);
  await assert.rejects(reopenNdefEvidence(await store.save({ kind: 'analysis.nec', source: 'offline-fixture', payload: {} }), async () => true), /Not NDEF/);
});
test('reopen snapshots before asynchronous verification and never trusts caller mutations', async () => {
  const store = journal(); const record = await store.save(parsed().saveInput!);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const opening = reopenNdefEvidence(record, async snapshot => { await gate; return store.verify(snapshot); });
  (record.payload as { document: string }).document = '{}'; release();
  const result = await opening;
  assert.equal((result.record.payload as { document: string }).document, document);
});
