import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BleTrialAuthoringWorkbench, BleTrialStageGate, selectedTrialDocument } from '../src/ble-trial-authoring-workbench.ts';
import { initialBleWorkbench, bleWorkbenchReducer as reduce } from '../src/ble-workbench.ts';
import { initialBleTrialState, bleTrialReducer } from '../src/ble-trial-workbench.ts';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/ble-differential.json', import.meta.url), 'utf8'));
function ready() {
  const c = new BleTrialAuthoringWorkbench();
  c.start('owned-lab', 'FCD2');
  fixture.groups.forEach((entry: any) => c.edit('groups', entry));
  fixture.sources.forEach((entry: any) => c.edit('sources', entry));
  fixture.trials.forEach((entry: any) => c.edit('trials', entry));
  return c;
}
test('staging requires exact current validated selected source, never legacy, edits, or pending saves', () => {
  const document = '\n' + fixture.trials[0].document + '\n ';
  const edited = reduce(initialBleWorkbench, { type: 'edit', mode: 'selected-source', document });
  assert.equal(selectedTrialDocument(edited), null);
  const interpreted = reduce(edited, { type: 'interpret' });
  assert.equal(selectedTrialDocument(interpreted), document);
  assert.equal(selectedTrialDocument(reduce(interpreted, { type: 'save-start' })), null);
  assert.equal(selectedTrialDocument(reduce(interpreted, { type: 'edit', document })), null);
  assert.equal(selectedTrialDocument({ ...interpreted, mode: 'envelope' }), null);
  assert.equal(selectedTrialDocument({ ...interpreted, document: document + ' ' }), null);
});
test('stage preserves exact strings without adding trial, ownership or export; same-frame invalidation', () => {
  const c = new BleTrialAuthoringWorkbench();
  const document = '\n' + fixture.trials[0].document + '  ';
  c.stage(document);
  assert.equal(c.staged, document); assert.equal(c.author, null); assert.equal(c.built, null);
  assert.throws(() => c.start('', 'FCD2')); assert.equal(c.author, null);
  c.start('owned-lab', 'FCD2');
  assert.equal(c.author!.snapshot().trials.length, 0);
  const built = ready(); built.build();
  built.stage(document); assert.equal(built.takeDocument(), null);
  built.build(); built.invalidate(); assert.equal(built.takeDocument(), null);
});
test('atomic edits, referenced removal and failed builds clear stale exports', () => {
  const c = ready(); c.build();
  const before = c.author!.snapshot();
  assert.throws(() => c.remove('sources', fixture.sources[0].id));
  assert.deepEqual(c.author!.snapshot(), before); assert.equal(c.built, null);
  c.build(); assert.throws(() => c.edit('trials', { ...fixture.trials[0], receiptId: 'replacement' }));
  assert.equal(c.built, null); assert.deepEqual(c.author!.snapshot(), before);
  c.build(); assert.throws(() => c.stage('{invalid')); assert.equal(c.built, null);
  c.start('owned-lab', 'FEAA'); assert.throws(() => c.build()); assert.equal(c.built, null);
});
test('explicit build then single-use handoff replaces comparison without analysis or automatic save', () => {
  const c = ready(); assert.equal(c.takeDocument(), null);
  c.build();
  const document = c.takeDocument(); assert.ok(document); assert.equal(c.takeDocument(), null);
  const state = bleTrialReducer(initialBleTrialState, { type: 'edit', document });
  assert.equal(state.document, document); assert.equal(state.report, null);
  assert.deepEqual(JSON.parse(document).trials, fixture.trials);
  assert.ok(bleTrialReducer(state, { type: 'analyze' }).report);
});

test('staging gate consumes before callbacks and reads current revision, not a stale render', () => {
  const gate = new BleTrialStageGate();
  const edited = reduce(initialBleWorkbench, { type: 'edit', mode: 'selected-source', document: fixture.trials[0].document });
  const current = reduce(edited, { type: 'interpret' });
  assert.equal(gate.take(current), current.document);
  assert.equal(gate.take(current), null);
  const newer = reduce(current, { type: 'edit', document: current.document + ' ' });
  assert.equal(gate.take(newer), null);
  assert.equal(gate.take(reduce(newer, { type: 'interpret' })), newer.document);
});

test('unsupported runtime edit kind rejects atomically and clears built output', () => {
  const c = ready();
  c.build();
  const before = c.author!.snapshot();
  assert.throws(() => c.edit('unsupported' as 'groups', fixture.groups[0]), /Unsupported authoring entry kind/);
  assert.deepEqual(c.author!.snapshot(), before);
  assert.equal(c.built, null);
});
