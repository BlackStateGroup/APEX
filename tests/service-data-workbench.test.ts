import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceDataWorkbench } from '../src/service-data-workbench.ts';
import { prepareForegroundObservation } from '../packages/core/ble-observation-session.ts';
import type { ServiceDataResult } from '../packages/core/ble-service-data-session.ts';
const receipt = '2026-11-08T01:00:00.000Z';
function harness() {
  let allowed = true; let starts = 0; let stops = 0;
  const busy: boolean[] = []; const uncertainty: boolean[] = [];
  const resolves: ((result: ServiceDataResult) => void)[] = [];
  const c = createServiceDataWorkbench({ canStart: () => allowed, clock: () => receipt, changed() {},
    busy: value => busy.push(value), uncertainty: value => uncertainty.push(value),
    start() { starts++; const done = new Promise<ServiceDataResult>(resolve => resolves.push(resolve)); return { done, stop() { stops++; return done; } }; },
  });
  const result = (reusable = true, count = 1): ServiceDataResult => ({ reusable, reason: 'stopped', errors: [],
    metrics: { total: count + 3, match: count, noMatch: 1, unavailable: 1, malformed: 0, sdkErrors: 1, retained: count, characters: 300 },
    observations: Array.from({ length: count }, () => prepareForegroundObservation('android', { id: 'owned-test', rssi: -40, serviceData: { fcd2: 'QAHE' } }, 'FCD2', receipt).value),
  });
  return { c, busy, uncertainty, result, resolves, allow(value: boolean) { allowed = value; }, get starts() { return starts; }, get stops() { return stops; } };
}
test('one-session opt-in is consumed; selection, leaving and denied start clear it', () => {
  const h = harness(); h.c.start(); assert.equal(h.starts, 0);
  h.c.optIn(); h.c.select('FCD2'); assert.equal(h.c.state.optedIn, false);
  h.c.optIn(); h.c.stop(); assert.equal(h.c.state.optedIn, false);
  h.c.optIn(); h.allow(false); h.c.start(); assert.equal(h.starts, 0); assert.equal(h.c.state.optedIn, false);
  h.allow(true); h.c.optIn(); h.c.start(); h.c.start(); assert.equal(h.starts, 1); assert.equal(h.c.state.optedIn, false);
});
test('Stop works during preparation and keeps busy until confirmed cleanup', async () => {
  const h = harness(); h.c.optIn(); h.c.start(); h.c.stop(); h.c.stop();
  assert.equal(h.stops, 1); assert.deepEqual(h.busy, [true]); assert.equal(h.c.state.phase, 'stopping');
  assert.throws(() => h.c.document(1)); h.resolves[0]!(h.result()); await Promise.resolve();
  assert.deepEqual(h.busy, [true, false]); h.c.start(); assert.equal(h.starts, 1);
});
test('exact source handoff only after reusable result, with distinct metrics and four-row pages', async () => {
  const h = harness(); h.c.optIn(); h.c.start(); const result = h.result(true, 9);
  h.resolves[0]!(result); await Promise.resolve();
  assert.equal(h.c.document(1), result.observations[0]!.source.document);
  assert.deepEqual(h.c.state.metrics, result.metrics); assert.equal(h.c.state.reason, 'stopped');
  h.c.page(1); assert.equal(h.c.state.items.slice(h.c.state.page * 4, h.c.state.page * 4 + 4).length, 4);
  h.c.page(999); assert.equal(h.c.state.page, 2); h.c.page(-999); assert.equal(h.c.state.page, 0);
});
test('uncertainty releases UI task but fences inspection and new starts until explicit reset', async () => {
  const h = harness(); h.c.optIn(); h.c.start(); h.resolves[0]!(h.result(false)); await Promise.resolve();
  assert.equal(h.c.state.phase, 'idle'); assert.equal(h.c.state.uncertain, true); assert.deepEqual(h.busy, [true, false]);
  assert.throws(() => h.c.document(1)); h.c.optIn(); h.c.start(); assert.equal(h.starts, 1);
  h.c.clear(); assert.equal(h.c.state.uncertain, true);
  h.c.resetConfirmed(); assert.equal(h.c.state.uncertain, false); h.c.start(); assert.equal(h.starts, 1);
  h.c.optIn(); h.c.start(); assert.equal(h.starts, 2);
});
test('background/disposal cancel without restart; malformed result fails closed', async () => {
  const h = harness(); h.c.optIn(); h.c.start(); h.c.stop('background'); h.c.dispose();
  h.resolves[0]!(h.result()); await Promise.resolve(); h.c.start(); assert.equal(h.starts, 1); assert.throws(() => h.c.document(1));
  const other = harness(); other.c.optIn(); other.c.start(); const bad = other.result();
  bad.observations[0]!.selectedServiceUuid = 'FEAA'; other.resolves[0]!(bad); await Promise.resolve();
  assert.equal(other.c.state.uncertain, true); assert.equal(other.c.state.items.length, 0);
});
test('synchronous start failure fails closed and exposes recovery without retaining busy', () => {
  const busy: boolean[] = [];
  const c = createServiceDataWorkbench({ canStart: () => true, clock: () => receipt, changed() {}, busy: v => busy.push(v), uncertainty() {}, start() { throw new Error('mock native refusal'); } });
  c.optIn(); c.start(); assert.equal(c.state.uncertain, true); assert.deepEqual(busy, [true, false]); assert.equal(c.state.phase, 'idle');
});
test('reentrant cancellation during start stops the returned handle; stale completion cannot release new session', async () => {
  let resolve!: (r: ServiceDataResult) => void; let stops = 0;
  const c = createServiceDataWorkbench({ canStart: () => true, clock: () => receipt, changed() {}, busy() {}, uncertainty() {},
    start() { c.stop(); const done = new Promise<ServiceDataResult>(r => { resolve = r; }); return { done, stop() { stops++; return done; } }; },
  });
  c.optIn(); c.start(); assert.equal(c.state.phase, 'stopping'); assert.equal(stops, 1);
  resolve(harness().result()); await Promise.resolve(); assert.equal(c.state.phase, 'idle');
});
