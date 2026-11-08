import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { bleWorkbenchReducer as reduce, initialBleWorkbench as initial, bleReopenMessage, canSaveBle, reopenBleEvidence } from '../src/ble-workbench.ts';
import { EvidenceStore } from '../packages/core/evidence.ts';

const document = readFileSync(new URL('../src/fixtures/bthome-observation.json', import.meta.url), 'utf8');
const parsed = () => reduce(reduce(initial, { type: 'edit', document }), { type: 'interpret' });
function journal() {
  const rows: string[] = [];
  return new EvidenceStore({ insert: async (_id, text) => { rows.unshift(text); }, list: async limit => rows.slice(0, limit) }, {
    randomId: randomUUID, sha256: async text => createHash('sha256').update(text).digest('hex'),
  });
}
test('initial and edited documents cannot save before successful interpretation', () => {
  assert.equal(canSaveBle(initial), false);
  const edited = reduce(initial, { type: 'edit', document });
  assert.equal(canSaveBle(edited), false);
  assert.equal(reduce(edited, { type: 'save-start' }), edited);
  assert.equal(canSaveBle(parsed()), true);
});
test('demo fixture is identical to documented decoder test data', () => {
  assert.equal(document, readFileSync(new URL('./fixtures/bthome-observation.json', import.meta.url), 'utf8'));
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
  value.provenance = { origin: 'recorded-import', label: 'Synthetic test of recorded envelope shape', capturedAt: '2026-11-07T00:00:00.000Z' };
  const state = reduce(reduce(initial, { type: 'edit', document: JSON.stringify(value) }), { type: 'interpret' });
  assert.equal(state.saveInput?.source, 'offline-import');
  assert.equal(state.observation?.physicalReceptionVerified, false);
  assert.equal(state.observation?.authenticatedIdentity, false);
});
test('failed reparse never leaves a successful result saveable', () => {
  for (const document of ['', '{', '{}', 'x'.repeat(16385)]) {
    const state = reduce(reduce(parsed(), { type: 'edit', document }), { type: 'interpret' });
    assert.equal(state.observation, null); assert.equal(canSaveBle(state), false);
    assert.match(state.message, /BLE import error/);
  }
});
test('journal cap does not hide successful interpretation or truncate source', () => {
  const oversized = document + ' '.repeat(4097 - document.length);
  const state = reduce(reduce(initial, { type: 'edit', document: oversized }), { type: 'interpret' });
  assert.ok(state.observation); assert.equal(canSaveBle(state), false);
  assert.equal(state.document, oversized); assert.match(state.message, /not saveable/);
});
test('double taps and repeat interpretation cannot duplicate a completed save', () => {
  const state = parsed(); const pending = reduce(state, { type: 'save-start' });
  assert.equal(canSaveBle(pending), false);
  assert.equal(reduce(pending, { type: 'save-start' }), pending);
  assert.equal(reduce(pending, { type: 'interpret' }), pending);
  const saved = reduce(pending, { type: 'save-finish', revision: state.revision, document });
  assert.equal(canSaveBle(saved), false);
  assert.equal(canSaveBle(reduce(saved, { type: 'interpret' })), false);
});
test('edit while saving ignores stale completion content and blocks overlapping saves', () => {
  const state = parsed(); const pending = reduce(state, { type: 'save-start' });
  const changed = reduce(pending, { type: 'edit', document: '{}' });
  assert.equal(canSaveBle(changed), false);
  const done = reduce(changed, { type: 'save-finish', revision: state.revision, document });
  assert.equal(done.document, '{}'); assert.equal(done.observation, null);
  assert.equal(done.message, changed.message); assert.equal(done.pending, null);
  assert.equal(reduce(done, { type: 'save-finish', revision: state.revision, document }), done);
});
test('failed save retains interpreted source for explicit retry', () => {
  const state = parsed(); const pending = reduce(state, { type: 'save-start' });
  const failed = reduce(pending, { type: 'save-finish', revision: state.revision, document, error: 'quota' });
  assert.equal(canSaveBle(failed), true); assert.match(failed.message, /quota/);
  assert.equal(failed.saveInput?.payload.document, document);
});
test('reopen verifies exact retained input and computes fresh unauthenticated interpretation', async () => {
  const store = journal(); const record = await store.save(parsed().saveInput!);
  const result = await reopenBleEvidence(record, value => store.verify(value));
  assert.equal(result.observation!.serviceReadings[0]?.reading.status, 'format-match');
  assert.equal(result.observation!.authenticatedIdentity, false);
  assert.deepEqual(result.observation, parsed().observation);
  assert.equal((result.record.payload as { document: string }).document, document);
});
test('reopen rejects digest mismatches, verifier errors, wrong source, and non-BLE records', async () => {
  const store = journal(); const record = await store.save(parsed().saveInput!);
  await assert.rejects(reopenBleEvidence(record, async () => false), /digest mismatch/);
  await assert.rejects(reopenBleEvidence(record, async () => { throw new Error('verification unavailable'); }), /unavailable/);
  await assert.rejects(reopenBleEvidence({ ...record, source: 'offline-import' }, async () => true), /source does not match/);
  await assert.rejects(reopenBleEvidence(await store.save({ kind: 'analysis.nec', source: 'offline-fixture', payload: {} }), async () => true), /Not BLE/);
});
test('reopen snapshots before asynchronous verification and never trusts caller mutations', async () => {
  const store = journal(); const record = await store.save(parsed().saveInput!);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const opening = reopenBleEvidence(record, async snapshot => { await gate; return store.verify(snapshot); });
  (record.payload as { document: string }).document = '{}'; release();
  const result = await opening;
  assert.equal((result.record.payload as { document: string }).document, document);
});

test('iOS workflow retains normalized fields, and encrypted BTHome stays opaque through save/reopen', async () => {
  for (const payloadHex of ['4002c40903bf13', '4102c40903bf13']) {
    const document = JSON.stringify({
      schemaVersion: 1, inputKind: 'ios-advertisement-fields',
      provenance: { origin: 'synthetic-fixture', label: 'Synthetic iOS fields test; not received', capturedAt: null },
      rssiDbm: null, fields: { localName: null, serviceUuids: ['fcd2'], serviceData: [{ uuid: 'fcd2', payloadHex }], manufacturerDataHex: null, txPowerDbm: null, isConnectable: null },
    });
    const state = reduce(reduce(initial, { type: 'edit', document }), { type: 'interpret' });
    assert.equal(canSaveBle(state), true);
    const store = journal(); const record = await store.save(state.saveInput!);
    const reopened = await reopenBleEvidence(record, value => store.verify(value));
    assert.equal(reopened.observation!.rawAdvertising, null);
    assert.equal(reopened.observation!.captureCompleteness, 'not-exposed');
    assert.equal(reopened.observation!.serviceReadings[0]?.reading.status, payloadHex.startsWith('41') ? 'opaque' : 'format-match');
    assert.equal((reopened.record.payload as { document: string }).document, document);
  }
});

const sourceDocument = (platform: 'android' | 'ios') => readFileSync(new URL(`../src/fixtures/ble-plx-${platform}-source.json`, import.meta.url), 'utf8');
function selected(document = sourceDocument('android')) {
  return reduce(reduce(initial, { type: 'edit', mode: 'selected-source', document }), { type: 'interpret' });
}
test('selected Android and iOS sources explicitly save exact whitespace then freshly reopen', async () => {
  for (const platform of ['android', 'ios'] as const) {
    const document = sourceDocument(platform) + ' \n';
    const state = selected(document);
    assert.equal(state.saveInput?.kind, 'analysis.ble-source');
    assert.equal(state.source?.platform, platform);
    assert.equal(state.observation?.authenticatedIdentity, false);
    assert.equal(canSaveBle(state), true);
    const store = journal(); const record = await store.save(state.saveInput!);
    const result = await reopenBleEvidence(record, value => store.verify(value));
    assert.equal((result.record.payload as { document: string }).document, document);
    assert.deepEqual(result.source, state.source);
    assert.equal(result.observation?.physicalReceptionVerified, false);
    if (platform === 'ios') {
      assert.equal(result.source?.snapshot.rawScanRecord, 'e30=');
      assert.equal(result.observation?.rawAdvertising, null);
      assert.deepEqual(result.source?.snapshot.serviceUUIDs, ['FCD2']);
    }
    const tampered = { ...record, payload: { ...record.payload as object, document: document + ' ' } };
    await assert.rejects(reopenBleEvidence(tampered, value => store.verify(value)), /digest mismatch/);
  }
});
test('missing Android raw bytes remain saveable selected source without invented interpretation', async () => {
  const input = JSON.parse(sourceDocument('android'));
  input.snapshot.rawScanRecord = null;
  input.unavailableFields.push('rawScanRecord');
  const state = selected(JSON.stringify(input));
  assert.equal(state.observation, null);
  assert.equal(state.source?.status, 'raw-scan-record-unavailable');
  assert.equal(canSaveBle(state), true);
  assert.match(state.message, /no advertisement interpretation/);
  const store = journal(); const record = await store.save(state.saveInput!);
  const result = await reopenBleEvidence(record, value => store.verify(value));
  assert.equal(result.observation, null);
  assert.equal(result.source?.snapshot.rawScanRecord, null);
  assert.match(bleReopenMessage(result.observation), /Selected source reopened; advertisement interpretation unavailable/);
  assert.doesNotMatch(bleReopenMessage(result.observation), /Reinterpreted/);
  assert.match(bleReopenMessage(result.observation), /Reception and identity still unverified/);
});
test('selected-source controls never relabel imported provenance, and mode changes invalidate findings', () => {
  const input = JSON.parse(sourceDocument('ios'));
  input.provenance = { origin: 'recorded-import', label: 'Synthetic test of source import', capturedAt: '2026-11-07T00:00:00.000Z' };
  const state = selected(JSON.stringify(input));
  assert.equal(state.saveInput?.source, 'offline-import');
  const changed = reduce(state, { type: 'edit', mode: 'envelope', document });
  assert.equal(changed.source, null); assert.equal(changed.observation, null); assert.equal(canSaveBle(changed), false);
  assert.equal(reduce(changed, { type: 'interpret' }).saveInput?.kind, 'analysis.ble');
});
test('selected-source rejects malformed, oversize, incorrect representation and envelope inputs without truncation', () => {
  const bad = JSON.parse(sourceDocument('ios')); bad.representation = 'android-ad-bytes';
  for (const document of ['{', sourceDocument('android') + ' '.repeat(4096), JSON.stringify(bad), readFileSync(new URL('./fixtures/bthome-observation.json', import.meta.url), 'utf8')]) {
    const state = selected(document);
    assert.equal(canSaveBle(state), false); assert.equal(state.source, null); assert.equal(state.observation, null);
    assert.equal(state.document, document);
  }
});
test('selected-source double taps, mode edits during save and late completion never restore stale source', () => {
  const state = selected(); const pending = reduce(state, { type: 'save-start' });
  assert.equal(reduce(pending, { type: 'save-start' }), pending);
  const edit = reduce(pending, { type: 'edit', mode: 'envelope', document });
  const done = reduce(edit, { type: 'save-finish', revision: state.revision, document: state.document });
  assert.equal(done.source, null); assert.equal(done.saveInput, null); assert.equal(done.message, edit.message);
  assert.equal(done.mode, 'envelope'); assert.equal(done.pending, null);
});
test('selected-source asynchronous verification snapshots input and rejects failing verifier', async () => {
  const store = journal(); const state = selected(); const record = await store.save(state.saveInput!);
  await assert.rejects(reopenBleEvidence(record, async () => { throw new Error('unavailable'); }), /unavailable/);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const opening = reopenBleEvidence(record, async snapshot => { await gate; return store.verify(snapshot); });
  (record.payload as { document: string }).document = '{}'; release();
  assert.deepEqual((await opening).source, state.source);
});

test('reopen success wording distinguishes actual interpretation from unavailable raw bytes', () => {
  assert.match(bleReopenMessage(parsed().observation), /Digest verified. Reinterpreted locally/);
  assert.doesNotMatch(bleReopenMessage(parsed().observation), /interpretation unavailable/);
});
