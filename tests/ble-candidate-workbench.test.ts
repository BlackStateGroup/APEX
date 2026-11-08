import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bleCandidateReducer as reduce, initialBleCandidateState as initial, bleCandidateSummary as summary, exactCandidateValue, CANDIDATE_PAGE_SIZE } from '../src/ble-candidate-workbench.ts';
import { validateBleFieldHypothesis, MAX_FIELD_HYPOTHESIS_CHARACTERS } from '../packages/core/ble-field-hypothesis.ts';
const fixture = readFileSync(new URL('./fixtures/ble-field-hypothesis.json', import.meta.url), 'utf8');
const analyze = (document = fixture) => reduce(reduce(initial, { type: 'edit', document }), { type: 'analyze' });

test('explicit check retains exact document and full report; repeated analysis is deterministic', () => {
  assert.equal(summary(initial), null);
  assert.equal(reduce(initial, { type: 'edit', document: fixture }).report, null);
  const document = '\n' + fixture + '  ';
  const state = analyze(document);
  assert.equal(state.document, document);
  assert.deepEqual(state.report, validateBleFieldHypothesis(document));
  assert.deepEqual(reduce(state, { type: 'analyze' }), state);
  const ios = reduce(state, { type: 'source', index: 1 });
  assert.equal(summary(ios)!.source.id, 'ios');
  assert.equal(ios.document, document); assert.equal(ios.report, state.report);
});

test('every edit invalidates results; oversize is refused whole including after a report', () => {
  const state = analyze();
  for (const document of ['', '{}', fixture, fixture + ' ']) {
    const next = reduce(state, { type: 'edit', document });
    assert.equal(next.report, null); assert.equal(summary(next), null);
    assert.equal(next.document, document); assert.equal(next.page, 0); assert.equal(next.sourceIndex, 0);
  }
  const rejected = reduce(state, { type: 'edit', document: fixture.padEnd(MAX_FIELD_HYPOTHESIS_CHARACTERS + 1) });
  assert.equal(rejected.document, state.document); assert.equal(rejected.report, null);
  assert.match(rejected.message, /rejected whole.*Previous draft retained/);
  assert.ok(analyze(fixture.padEnd(MAX_FIELD_HYPOTHESIS_CHARACTERS)).report);
});

test('invalid, duplicate and ineligible documents fail closed without stale report', () => {
  const invalid = JSON.parse(fixture); invalid.assignments[0].expected = '20.0';
  const ineligible = JSON.parse(fixture); const dataset = JSON.parse(ineligible.dataset);
  const document = JSON.parse(dataset.trials[0].document);
  document.snapshot.rawScanRecord = 'BxbS/EE C0Ac='.replace(' ', '');
  dataset.trials[0].document = JSON.stringify(document); ineligible.dataset = JSON.stringify(dataset);
  for (const input of ['', '{', '{}', fixture.replace('"schemaVersion":', '"schemaVersion":1,"schemaVersion":'), JSON.stringify(invalid), JSON.stringify(ineligible)]) {
    const next = analyze(input); assert.equal(next.report, null); assert.equal(summary(next), null);
    assert.match(next.message, /Candidate document error/);
  }
});

function manyRows() {
  const input = JSON.parse(fixture); const dataset = JSON.parse(input.dataset);
  for (let i = 0; i < 5; i++) {
    const trial = { ...dataset.trials[0], id: `extra-${i}`, receiptId: `extra-receipt-${i}` };
    dataset.trials.push(trial); input.assignments.push({ trialId: trial.id, subset: 'held-out', expected: '20' });
  }
  input.dataset = JSON.stringify(dataset); return JSON.stringify(input);
}

test('source-separated bounded pagination preserves all rows and rejects invalid navigation', () => {
  const state = analyze(manyRows()); assert.ok(state.report);
  assert.equal(summary(state)!.rows.length, CANDIDATE_PAGE_SIZE);
  assert.equal(summary(state)!.rowCount, 9); assert.equal(summary(state)!.pageCount, 3);
  const last = reduce(state, { type: 'page', page: 2 });
  assert.equal(summary(last)!.rows.length, 1); assert.equal(last.report, state.report);
  assert.ok(summary(last)!.rows.every(row => row.sourceId === 'android'));
  const ios = reduce(last, { type: 'source', index: 1 });
  assert.equal(ios.page, 0); assert.ok(summary(ios)!.rows.every(row => row.sourceId === 'ios'));
  assert.deepEqual(summary(ios)!.subsets.map(s => s.count), [2, 2]);
  for (const index of [-1, 2, 0.5, NaN, Infinity]) assert.equal(reduce(state, { type: 'source', index }), state);
  for (const page of [-1, 3, 0.5, NaN, Infinity]) assert.equal(reduce(state, { type: 'page', page }), state);
  assert.equal(reduce(initial, { type: 'source', index: 0 }), initial);
  assert.equal(reduce(initial, { type: 'page', page: 0 }), initial);
});

test('exact fractions stay primary, incomplete never becomes zero; unselected rows excluded', () => {
  const input = JSON.parse(fixture); input.candidate.divisor = 3;
  let state = analyze(JSON.stringify(input)); const row = summary(state)!.rows[0]!;
  assert.equal(row.value!.numerator, '2000'); assert.equal(row.value!.denominator, '3');
  assert.match(exactCandidateValue(row.value), /^2000\/3 \(approximate display only:/);
  input.candidate.byteOffset = 4; state = analyze(JSON.stringify(input));
  assert.ok(summary(state)!.rows.every(row => row.status === 'incomplete'));
  assert.equal(exactCandidateValue(summary(state)!.rows[0]!.value), 'incomplete (not zero)');
  input.candidate.byteOffset = 2; input.assignments = input.assignments.filter((row: {trialId: string}) => !row.trialId.endsWith('changed-2'));
  state = analyze(JSON.stringify(input));
  assert.deepEqual(summary(state)!.unselectedTrialIds, ['android-changed-2']);
  assert.equal(summary(state)!.rowCount, 3); assert.equal(state.report!.unselectedTrialIds.length, 2);
});

test('integration stays mounted and imported content cannot trigger actions or persistence', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/BleCandidateWorkbench.tsx', import.meta.url), 'utf8');
  assert.match(app, /<BleCandidateWorkbench active=\{tab === 'Analysis' && inspector === 'ble-candidate'\} \/>/);
  assert.match(ui, /if \(!active\) return null/); assert.match(ui, /lost on reload/);
  assert.match(ui, /Operator-designated/); assert.match(ui, /exactCandidateValue\(row.value\)/);
  assert.doesNotMatch(ui, /Linking|href=|fetch\(|\.save\(|AsyncStorage|localStorage|dangerouslySetInnerHTML|maxLength=/);
});
