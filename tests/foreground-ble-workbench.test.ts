import test from 'node:test';
import assert from 'node:assert/strict';
import { createForegroundBleWorkbench } from '../src/foreground-ble-workbench.ts';
import { prepareForegroundObservation } from '../packages/core/ble-observation-session.ts';
import type { ForegroundObservationOptions } from '../packages/core/ble-observation-session.ts';
import type { ScanResult } from '../packages/core/ble-scan-session.ts';
import { bleWorkbenchReducer, initialBleWorkbench } from '../src/ble-workbench.ts';
const receipt = '2026-11-07T22:00:00.000Z';
const observation = () => prepareForegroundObservation('ios', { id: 'TEST', rssi: -42, serviceData: { fcd2: 'QAHE' } }, 'FCD2', receipt).value;
function harness() {
  const options: ForegroundObservationOptions[] = []; const busy: boolean[] = []; const states: unknown[] = [];
  const resolves: ((result: ScanResult) => void)[] = [];
  let stops = 0; let allowed = true;
  const controller = createForegroundBleWorkbench({ uncertainty: () => {}, canStart: () => allowed, clock: () => receipt,
    changed: value => states.push(value), busy: value => busy.push(value),
    start: option => { options.push(option); const done = new Promise<ScanResult>(resolve => resolves.push(resolve));
      return { done, stop: () => { stops++; return done; } }; },
  });
  function finish(index = 0, error?: Error) {
    const result: ScanResult = { reusable: true, reason: error ? 'error' : 'stopped', count: 1, characters: 1, ...(error ? { error } : {}) };
    options[index]!.onEnd(result); resolves[index]!(result);
  }
  return { controller, options, busy, states, finish, allow: (value: boolean) => { allowed = value; }, get stops() { return stops; } };
}
test('unavailable environment and repeated start do not start another collector', () => {
  const h = harness(); h.allow(false); h.controller.start(); assert.equal(h.options.length, 0);
  assert.match(h.controller.state.message, /unavailable/);
  h.allow(true); h.controller.start(); h.controller.start(); assert.equal(h.options.length, 1);
  assert.deepEqual(h.busy, [true]);
  assert.equal(h.options[0]!.serviceUuid, 'FCD2'); assert.equal(h.options[0]!.durationMs, 10000);
  assert.equal(h.options[0]!.maxCount, 25); assert.equal(h.options[0]!.maxCharacters, 65536);
  h.finish();
});
test('retains exact copied source, receipt clock and unknown RSSI without save or native claims', () => {
  const h = harness(); h.controller.start(); const value = observation();
  h.options[0]!.onObservation(value);
  const original = value.source.document; value.source.document = '{}';
  assert.equal(h.controller.state.items[0]!.document, original);
  assert.equal(h.controller.state.items[0]!.callbackReceivedAt, receipt);
  assert.equal(h.controller.state.items[0]!.rssiDbm, -42);
  const unknown = prepareForegroundObservation('ios', { id: 'TEST', rssi: 127 }, 'FCD2', receipt).value;
  h.options[0]!.onObservation(unknown); assert.equal(h.controller.state.items[1]!.rssiDbm, null);
  h.finish(); assert.match(h.controller.state.message, /none saved/);
  const imported = bleWorkbenchReducer(initialBleWorkbench, { type: 'edit', mode: 'selected-source', document: h.controller.document(1) });
  assert.equal(imported.saveInput, null);
  const parsed = bleWorkbenchReducer(imported, { type: 'interpret' });
  assert.equal(parsed.saveInput?.source, 'offline-import'); assert.match(parsed.observation!.provenance.label, /Selected service FCD2; SDK callback receipt/); assert.equal(parsed.observation?.physicalReceptionVerified, false);
});
test('stop immediately ignores later callbacks and retains lease until cleanup finishes', async () => {
  const h = harness(); h.controller.start(); h.options[0]!.onObservation(observation());
  h.controller.stop(); assert.equal(h.stops, 1); assert.equal(h.controller.state.phase, 'stopping');
  assert.equal(h.controller.state.message, 'Ending local collection and requesting SDK scan stop…');
  assert.throws(() => h.controller.document(1), /Stop observation/);
  h.options[0]!.onObservation(observation()); assert.equal(h.controller.state.items.length, 1);
  h.controller.start(); assert.equal(h.options.length, 1); assert.deepEqual(h.busy, [true]);
  h.finish(); await Promise.resolve(); assert.deepEqual(h.busy, [true, false]);
  assert.equal(h.controller.document(1), h.controller.state.items[0]!.document);
});
test('stale callbacks and completions cannot mutate a later session', async () => {
  const h = harness(); h.controller.start(); h.finish(); h.controller.select('FEAA'); h.controller.start();
  h.options[0]!.onObservation(observation()); h.finish(0); await Promise.resolve();
  assert.equal(h.controller.state.phase, 'running'); assert.equal(h.controller.state.items.length, 0);
  assert.deepEqual(h.busy, [true, false, true]); h.finish(1);
});
test('service selection and clearing are disabled during active scan and explicit after stop', () => {
  const h = harness(); h.controller.start(); h.options[0]!.onObservation(observation());
  h.controller.select('FEAA'); h.controller.clear();
  assert.equal(h.controller.state.serviceUuid, 'FCD2'); assert.equal(h.controller.state.items.length, 1);
  h.finish(); h.controller.clear(); assert.equal(h.controller.state.items.length, 0);
  assert.throws(() => h.controller.document(1), /no longer available/);
  h.controller.select('FEAA'); h.controller.start(); assert.equal(h.options[1]!.serviceUuid, 'FEAA'); h.finish(1);
});
test('disposal stops collection, suppresses callbacks and prevents restart without stranding busy state', async () => {
  const h = harness(); h.controller.start(); const before = h.states.length;
  h.controller.dispose(); h.controller.start(); h.options[0]!.onObservation(observation());
  assert.equal(h.options.length, 1); assert.equal(h.stops, 1); assert.equal(h.states.length, before);
  h.finish(); await Promise.resolve(); assert.equal(h.states.length, before); assert.deepEqual(h.busy, [true, false]);
});
test('bounded retained observations never exceed count or character budget', () => {
  const h = harness(); h.controller.start();
  for (let i = 0; i < 100; i++) h.options[0]!.onObservation(observation());
  assert.equal(h.controller.state.items.length, 25); assert.equal(h.controller.state.phase, 'stopping');
  assert.equal(h.stops, 1); assert.ok(h.controller.state.characters <= 65536); h.finish();
});
test('mismatched service, clock basis, source receipt and fixture provenance reject', () => {
  const h = harness(); h.controller.start();
  const values = [ { ...observation(), selectedServiceUuid: 'FEAA' }, { ...observation(), timestampBasis: 'radio' },
    { ...observation(), callbackReceivedAt: '2026-11-07T23:00:00.000Z' } ];
  for (const value of values) assert.throws(() => h.options[0]!.onObservation(value as ReturnType<typeof observation>), /mismatch/);
  assert.equal(h.controller.state.items.length, 0); h.finish();
});
test('synchronous start failure releases UI busy state and reports exact error', () => {
  const busy: boolean[] = [];
  const controller = createForegroundBleWorkbench({ uncertainty: () => {}, start: () => { throw new Error('Bluetooth scanner busy'); },
    canStart: () => true, clock: () => receipt, changed: () => {}, busy: value => busy.push(value) });
  controller.start(); assert.equal(controller.state.phase, 'idle'); assert.deepEqual(busy, [true, false]);
  assert.match(controller.state.message, /Bluetooth scanner busy/);
});
test('synchronous end before handle return and done-only settlement finish exactly once', async () => {
  for (const end of [true, false]) {
    const busy: boolean[] = []; const result: ScanResult = { reusable: true, reason: 'duration', count: 0, characters: 0 };
    const controller = createForegroundBleWorkbench({ uncertainty: () => {}, canStart: () => true, clock: () => receipt, changed: () => {}, busy: value => busy.push(value),
      start: options => { if (end) options.onEnd(result); return { done: Promise.resolve(result), stop: async () => result }; } });
    controller.start(); await Promise.resolve(); assert.equal(controller.state.phase, 'idle'); assert.deepEqual(busy, [true, false]);
  }
});
test('stop during synchronous start stops the returned handle before accepting more observations', async () => {
  const busy: boolean[] = []; let stopped = 0;
  const result: ScanResult = { reusable: true, reason: 'stopped', count: 0, characters: 0 };
  const controller = createForegroundBleWorkbench({ uncertainty: () => {}, canStart: () => true, clock: () => receipt, changed: () => {}, busy: value => busy.push(value),
    start: options => { controller.stop(); options.onObservation(observation());
      return { done: Promise.resolve(result), stop: async () => { stopped++; return result; } }; } });
  controller.start(); await Promise.resolve(); assert.equal(stopped, 1);
  assert.equal(controller.state.items.length, 0); assert.deepEqual(busy, [true, false]);
});
test('stop and done rejection do not strand controls or create unhandled rejection', async () => {
  const busy: boolean[] = [];
  const controller = createForegroundBleWorkbench({ uncertainty: () => {}, canStart: () => true, clock: () => receipt, changed: () => {}, busy: value => busy.push(value),
    start: () => ({ done: Promise.reject(new Error('done failed')), stop: () => Promise.reject(new Error('stop failed')) }) });
  controller.start(); controller.stop(); await Promise.resolve(); await Promise.resolve();
  assert.equal(controller.state.phase, 'idle'); assert.deepEqual(busy, [true, false]); assert.match(controller.state.message, /failed/);
});

test('actual scan cleanup failure fences inspection, same-frame starts and app work until explicit recovery', async () => {
  const { createScanController } = await import('../packages/core/ble-scan-session.ts');
  let callback!: (error: Error | null, value?: object) => void;
  const scanner = createScanController<object>({ prepare: async () => {},
    start: async (_uuid, value) => { callback = value; },
    stop: async () => { throw new Error('synthetic stop failure'); } });
  let done!: Promise<ScanResult>; let starts = 0; let uncertain = false;
  const order: string[] = []; const options: ForegroundObservationOptions[] = [];
  const controller = createForegroundBleWorkbench({ canStart: () => !uncertain, clock: () => receipt,
    changed: () => {}, uncertainty: value => { uncertain = value; order.push(`uncertain:${value}`); },
    busy: value => { order.push(`busy:${value}`); if (!value) assert.equal(uncertain, true); },
    start: option => { starts++; options.push(option);
      const handle = scanner.start({ serviceUuid: option.serviceUuid, durationMs: 10000, maxCount: 25, maxCharacters: 65536,
        project: device => prepareForegroundObservation('ios', device, option.serviceUuid, receipt),
        onValue: option.onObservation, onEnd: option.onEnd }); done = handle.done; return handle; } });
  controller.start(); while (!callback) await Promise.resolve();
  callback(null, { id: 'SYNTHETIC', rssi: -42, serviceData: { fcd2: 'QAHE' } });
  controller.stop(); const result = await done;
  assert.equal(result.reusable, false); assert.equal(scanner.healthy, false);
  assert.deepEqual(order, ['busy:true', 'uncertain:true', 'busy:false']);
  assert.equal(controller.state.phase, 'idle'); assert.equal(controller.state.uncertain, true);
  assert.equal(controller.state.items.length, 0); assert.throws(() => controller.document(1));
  controller.start(); assert.equal(starts, 1); // synchronous uncertainty, no render required
  controller.clear(); controller.select('FEAA'); assert.equal(controller.state.uncertain, true);
  controller.resetConfirmed(); assert.equal(uncertain, false); assert.equal(controller.state.items.length, 0);
  assert.throws(() => controller.document(1)); assert.equal(starts, 1); // recovery never restarts
  options[0]!.onObservation(observation());
  options[0]!.onEnd({ reusable: true, reason: 'stopped', count: 1, characters: 1 });
  assert.equal(controller.state.items.length, 0); assert.equal(controller.state.uncertain, false);
});

test('known parser error with successful SDK cleanup remains reusable and retains earlier sources', async () => {
  const { createScanController } = await import('../packages/core/ble-scan-session.ts');
  let callback!: (error: Error | null, value?: object) => void; let done!: Promise<ScanResult>;
  const scanner = createScanController<object>({ prepare: async () => {}, start: async (_uuid, cb) => { callback = cb; }, stop: async () => {} });
  const controller = createForegroundBleWorkbench({ canStart: () => true, clock: () => receipt, changed: () => {}, busy: () => {}, uncertainty: () => {},
    start: option => { const handle = scanner.start({ serviceUuid: option.serviceUuid, durationMs: 10000, maxCount: 25, maxCharacters: 65536,
      project: device => prepareForegroundObservation('ios', device, option.serviceUuid, receipt), onValue: option.onObservation, onEnd: option.onEnd }); done = handle.done; return handle; } });
  controller.start(); while (!callback) await Promise.resolve();
  callback(null, { id: 'SYNTHETIC', rssi: -42 }); callback(null, { rssi: 'invalid' });
  const result = await done;
  assert.equal(result.reason, 'error'); assert.equal(result.reusable, true); assert.equal(scanner.healthy, true);
  assert.equal(controller.state.uncertain, false); assert.ok(controller.document(1));
  assert.match(controller.state.message, /Local collection ended; retained sources remain available/);
  assert.doesNotMatch(controller.state.message, /cleanup completed|scanner released|native stop completed/i);
});

test('unexpected done rejection fails closed and late completion cannot clear the fence', async () => {
  let reject!: (error: Error) => void; let option!: ForegroundObservationOptions;
  const controller = createForegroundBleWorkbench({ canStart: () => true, clock: () => receipt, changed: () => {}, busy: () => {}, uncertainty: () => {},
    start: value => { option = value; const done = new Promise<ScanResult>((_resolve, no) => { reject = no; }); return { done, stop: () => done }; } });
  controller.start(); option.onObservation(observation()); reject(new Error('unexpected')); await Promise.resolve(); await Promise.resolve();
  assert.equal(controller.state.uncertain, true); assert.equal(controller.state.items.length, 0);
  option.onEnd({ reusable: true, reason: 'stopped', count: 1, characters: 1 });
  assert.equal(controller.state.uncertain, true); assert.throws(() => controller.document(1));
});
