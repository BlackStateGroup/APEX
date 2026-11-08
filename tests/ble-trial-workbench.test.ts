import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bleTrialReducer as reduce, initialBleTrialState as initial, bleTrialSummary as summary, OFFSET_PAGE_SIZE } from '../src/ble-trial-workbench.ts';
import { analyzeBleDifferential, MAX_DIFFERENTIAL_CHARACTERS } from '../packages/core/ble-differential.ts';
import { prepareBlePlxSourceEvidenceInput } from '../packages/core/ble-plx-source-evidence.ts';
const fixture = readFileSync(new URL('./fixtures/ble-differential.json', import.meta.url), 'utf8');
const analyze = (document = fixture) => reduce(reduce(initial, { type: 'edit', document }), { type: 'analyze' });

test('explicit analysis only; exact draft and complete core report survive selection changes', () => {
  assert.equal(summary(initial), null);
  const document = '\n' + fixture + '  \n';
  const edited = reduce(initial, { type: 'edit', document });
  assert.equal(edited.report, null);
  const state = analyze(document);
  assert.equal(state.document, document);
  assert.deepEqual(state.report, analyzeBleDifferential(document));
  const selected = reduce(reduce(state, { type: 'source', index: 1 }), { type: 'offset', offset: 2 });
  assert.equal(selected.document, document); assert.equal(selected.report, state.report);
  assert.equal(summary(selected)!.source.id, 'ios');
  assert.deepEqual(summary(selected)!.detail!.cells.map(cell => cell.values), [['d0', 'd0'], ['34', '34']]);
  assert.deepEqual(reduce(state, { type: 'analyze' }), state);
});

test('every edit and fixture reload invalidates results, including repeated identical text', () => {
  for (const document of [fixture, fixture + ' ', '{}', '']) {
    const edited = reduce(analyze(), { type: 'edit', document });
    assert.equal(edited.report, null); assert.equal(summary(edited), null);
    assert.equal(edited.document, document); assert.equal(edited.offset, 0); assert.equal(edited.page, 0);
  }
});

test('oversized edit is rejected whole without silently truncating or leaving stale results', () => {
  const state = analyze();
  const rejected = reduce(state, { type: 'edit', document: fixture.padEnd(MAX_DIFFERENTIAL_CHARACTERS + 1) });
  assert.equal(rejected.document, state.document); assert.equal(rejected.report, null);
  assert.match(rejected.message, /rejected whole.*Previous draft retained/);
  assert.ok(analyze(fixture.padEnd(MAX_DIFFERENTIAL_CHARACTERS)).report);
});

test('malformed, duplicate-key, declaration mismatch and missing reference fail without partial report', () => {
  const mismatch = JSON.parse(fixture); mismatch.sources[0].platform = 'ios';
  const missing = JSON.parse(fixture); missing.trials[0].groupId = 'missing';
  for (const document of ['', '{', '{}', fixture.replace('"scope":', '"scope":"owned-lab","scope":'), JSON.stringify(mismatch), JSON.stringify(missing)]) {
    const state = analyze(document);
    assert.equal(state.report, null); assert.equal(summary(state), null); assert.match(state.message, /Trial dataset error/);
  }
});

test('summary separates sources and exposes declared references without raw documents or payload dumps', () => {
  const state = analyze(); const view = summary(state)!;
  assert.equal(view.sourceCount, 2); assert.equal(view.trialCount, 8); assert.equal(view.trials.length, 4);
  assert.deepEqual(view.groups, state.report!.groups);
  assert.equal(view.changedCount, 1); assert.equal(view.width, 4);
  assert.deepEqual(view.offsets.filter(row => row.changed).map(row => row.offset), [2]);
  assert.ok(view.trials.every(trial => trial.bytes === 4 && trial.adOffset === 0));
  assert.equal(view.trials[0]!.receiptId, 'synthetic-android-baseline-1');
  assert.ok(view.trials.every(trial => !('document' in trial) && !('payloadHex' in trial)));
  const ios = summary(reduce(state, { type: 'source', index: 1 }))!;
  assert.ok(ios.trials.every(trial => trial.adOffset === null));
});

function wideDataset() {
  const value = JSON.parse(fixture);
  value.sources = value.sources.filter((source: { id: string }) => source.id === 'ios');
  value.trials = value.trials.filter((trial: { sourceId: string }) => trial.sourceId === 'ios');
  for (const [index, trial] of value.trials.entries()) {
    const payload = '41' + '00'.repeat(index === 0 ? 33 : 32);
    trial.document = prepareBlePlxSourceEvidenceInput('ios', { id: 'ios', serviceData: { FCD2: Buffer.from(payload, 'hex').toString('base64') } },
      { origin: 'synthetic-fixture', label: 'synthetic opaque bytes', capturedAt: null }).payload.document;
  }
  return JSON.stringify(value);
}

test('bounded pagination retains full matrix, distinguishes absent and zero, and leaves ciphertext opaque', () => {
  const state = analyze(wideDataset()); assert.ok(state.report);
  assert.equal(summary(state)!.offsets.length, OFFSET_PAGE_SIZE);
  assert.equal(state.report!.comparisons[0]!.matrix.length, 34);
  assert.equal(summary(state)!.pageCount, 3);
  assert.ok(summary(state)!.trials.every(trial => trial.interpretation === 'opaque-encrypted-bthome'));
  const last = reduce(state, { type: 'page', page: 2 });
  assert.equal(summary(last)!.offsets.length, 2); assert.equal(last.offset, 32);
  const detail = summary(reduce(last, { type: 'offset', offset: 33 }))!.detail!;
  assert.deepEqual(detail.cells[0]!.values, ['00', null]); assert.equal(detail.changed, true);
  assert.equal(detail.stableWithinEachGroup, false); assert.equal(detail.cells[0]!.runCount, 2);
  assert.equal(last.report, state.report); assert.equal(last.document, state.document);
});

test('invalid navigation cannot leave the bounded projection or select another source accidentally', () => {
  const state = analyze();
  for (const index of [-1, 2, 0.5, NaN, Infinity]) assert.equal(reduce(state, { type: 'source', index }), state);
  for (const offset of [-1, 4, 0.5, NaN, Infinity]) assert.equal(reduce(state, { type: 'offset', offset }), state);
  for (const page of [-1, 1, 0.5, NaN, Infinity]) assert.equal(reduce(state, { type: 'page', page }), state);
  assert.equal(reduce(initial, { type: 'source', index: 0 }), initial);
});

test('Analysis integration remains mounted and presentation has no persistence or actionable data paths', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/BleTrialWorkbench.tsx', import.meta.url), 'utf8');
  assert.match(app, /<BleTrialWorkbench active=\{tab === 'Analysis' && inspector === 'ble-trials'\} authoring=\{trialAuthoring\}/);
  assert.match(ui, /!active && \{ display: 'none' \}/);
  assert.match(ui, /Draft is not persisted/);
  assert.doesNotMatch(ui, /Linking|href=|fetch\(|\.save\(|AsyncStorage|localStorage|dangerouslySetInnerHTML|maxLength=/);
});
