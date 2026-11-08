import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanController } from '../packages/core/ble-scan-session.ts';
import type { ScanBackend, ScanResult, ScanOptions } from '../packages/core/ble-scan-session.ts';
import { prepareForegroundObservation, observationServiceUuid } from '../packages/core/ble-observation-session.ts';
const tick = () => new Promise<void>(r => setImmediate(r));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function harness(overrides: Partial<ScanBackend<string>> = {}) {
  let callback!: (error: Error | null, value?: string) => void; let timeout!: () => void; let stops = 0; let starts = 0;
  const ends: ScanResult[] = []; const values: string[] = [];
  const controller = createScanController<string>({ prepare: async () => {}, start: async (_uuid, cb) => { starts++; callback = cb; }, stop: async () => { stops++; }, ...overrides }, { set: cb => { timeout = cb; return 1; }, clear: () => {} });
  const options: ScanOptions<string, string> = { serviceUuid: 'FCD2', durationMs: 100, maxCount: 3, maxCharacters: 30, project: value => ({ value, characters: value.length }), onValue: value => values.push(value), onEnd: value => ends.push(value) };
  return { controller, options, ends, values, emit: (value: string) => callback(null, value), error: () => callback(new Error('scan failed')), expire: () => timeout(), stops: () => stops, starts: () => starts };
}
test('duplicate SDK callbacks count toward a strict cap; late events and duplicate stops cannot deliver twice', async () => {
  const h = harness(); const s = h.controller.start(h.options); await tick();
  h.emit('same'); h.emit('same'); h.emit('same'); h.emit('late'); h.error();
  assert.equal((await s.done).reason, 'count'); await s.stop(); h.expire();
  assert.deepEqual(h.values, ['same', 'same', 'same']); assert.equal(h.ends.length, 1); assert.equal(h.stops(), 1);
});
test('cancellation during unresolved preparation releases lease and never starts late', async () => {
  const prep = deferred(); const h = harness({ prepare: () => prep.promise }); const s = h.controller.start(h.options);
  assert.throws(() => h.controller.start(h.options), /busy/);
  assert.equal((await s.stop()).reason, 'stopped'); prep.resolve(); await tick();
  assert.equal(h.starts(), 0); assert.equal(h.stops(), 0); assert.equal(h.ends.length, 1);
});
test('preparation failure has one terminal result without an SDK stop', async () => {
  const h = harness({ prepare: async () => { throw new Error('permission denied'); } });
  assert.match((await h.controller.start(h.options).done).error!.message, /permission denied/); assert.equal(h.stops(), 0);
});
test('synchronous start callbacks, rejected start, delayed acknowledgement and immediate stop are safe', async () => {
  const gate = deferred(); let stops = 0; const h = harness({ start: async (_uuid, callback) => { callback(null, 'x'); callback(new Error('sync error')); await gate.promise; }, stop: async () => { stops++; } });
  const s = h.controller.start(h.options); await tick(); assert.equal(stops, 1); assert.equal(h.controller.busy, true);
  assert.throws(() => h.controller.start(h.options), /busy/); gate.resolve();
  assert.equal((await s.done).error!.message, 'sync error'); assert.equal(stops, 2); assert.equal(h.ends.length, 1);
  const bad = harness({ start: async () => { throw new Error('start rejected'); } });
  assert.match((await bad.controller.start(bad.options).done).error!.message, /start rejected/);
});
test('stop failure reports once and poisons subsequent scans', async () => {
  const h = harness({ stop: async () => { throw new Error('stop rejected'); } }); const s = h.controller.start(h.options); await tick();
  assert.equal((await s.stop()).reason, 'error'); assert.equal(h.ends.length, 1); assert.throws(() => h.controller.start(h.options), /unknown/);
});
test('duration, background, memory limits, projection and consumer failures invalidate callbacks', async () => {
  for (const scenario of ['duration', 'background', 'memory', 'project', 'consumer'] as const) {
    const h = harness();
    if (scenario === 'project') h.options.project = () => { throw new Error('invalid source'); };
    if (scenario === 'consumer') h.options.onValue = () => { throw new Error('consumer'); };
    const s = h.controller.start(h.options); await tick();
    if (scenario === 'duration') h.expire();
    else if (scenario === 'background') void s.stop('background');
    else h.emit(scenario === 'memory' ? 'x'.repeat(31) : 'x');
    const result = await s.done; assert.equal(result.reason, scenario === 'project' || scenario === 'consumer' ? 'error' : scenario);
    const count = h.values.length; h.emit('late'); assert.equal(h.values.length, count); assert.equal(h.ends.length, 1);
  }
});
test('invalid bounds fail before preparation, and mutating options cannot widen a running scan', async () => {
  const h = harness();
  for (const patch of [{ durationMs: 30001 }, { maxCount: 101 }, { maxCharacters: 409601 }, { maxCount: NaN }, { serviceUuid: '' }, { serviceUuid: ['FCD2'] as unknown as string }, { serviceUuid: { toString: () => 'FCD2' } as unknown as string }]) assert.throws(() => h.controller.start({ ...h.options, ...patch }));
  const mutable = { ...h.options, onEnd: () => { throw new Error('UI gone'); } };
  const s = h.controller.start(mutable); await tick();
  mutable.maxCount = 100; h.emit('a'); h.emit('b'); h.emit('c'); assert.equal((await s.done).count, 3); assert.equal(h.controller.busy, false);
});
test('selected source clock is callback receipt, Android bytes and iOS opaque fields remain separate', () => {
  const time = '2026-11-07T00:00:00.000Z'; const source = { id: 'source', rawScanRecord: 'AgEG', serviceUUIDs: ['FCD2'] };
  const android = prepareForegroundObservation('android', source, 'FCD2', time).value;
  assert.equal(android.timestampBasis, 'caller-supplied-sdk-callback-receipt');
  const a = JSON.parse(android.source.document); assert.equal(a.representation, 'android-ad-bytes'); assert.equal(a.snapshot.rawScanRecord, 'AgEG'); assert.match(a.provenance.label, /NOT hardware/);
  const ios = JSON.parse(prepareForegroundObservation('ios', { rawScanRecord: 'e30=' }, 'FEAA', time).value.source.document);
  assert.equal(ios.representation, 'ios-normalized-fields-with-opaque-json-base64'); assert.equal(ios.snapshot.rawScanRecord, 'e30=');
  assert.throws(() => prepareForegroundObservation('android', source, 'FCD2', 'bad time'));
  assert.throws(() => observationServiceUuid('180D')); assert.throws(() => observationServiceUuid('*'));
  assert.throws(() => prepareForegroundObservation('ios', { rawScanRecord: 'AAAA'.repeat(1200) }, 'FEAA', time), /bounded exact selected-source document/);
  assert.throws(() => prepareForegroundObservation('android', { rawScanRecord: 'invalid' }, 'FCD2', time));
});

test('deadline cancels unresolved preparation; delayed stop keeps the manager leased', async () => {
  const prep = deferred(); const h = harness({ prepare: () => prep.promise });
  const s = h.controller.start(h.options); h.expire(); assert.equal((await s.done).reason, 'duration');
  prep.resolve(); await tick(); assert.equal(h.starts(), 0);
  const stopping = deferred(); const slow = harness({ stop: () => stopping.promise });
  const running = slow.controller.start(slow.options); await tick(); void running.stop(); await tick();
  assert.throws(() => slow.controller.start(slow.options), /busy/);
  slow.emit('late'); assert.equal(slow.values.length, 0); assert.equal(slow.ends.length, 0);
  stopping.resolve(); await running.done; assert.equal(slow.ends.length, 1);
});

test('unresolved SDK start and stop settle terminal notification within cleanup bounds and fail closed', async () => {
  for (const stuck of ['start', 'stop'] as const) {
    let callback!: (error: Error | null, value?: string) => void;
    const lateStart = deferred(); const never = new Promise<void>(() => {}); const ends: ScanResult[] = []; const values: string[] = [];
    const controller = createScanController<string>({ prepare: async () => {},
      start: (_uuid, cb) => { callback = cb; return stuck === 'start' ? lateStart.promise : Promise.resolve(); },
      stop: () => stuck === 'stop' ? never : Promise.resolve(),
    }, undefined, 5);
    const h = harness(); const session = controller.start({ ...h.options, onValue: value => values.push(value), onEnd: result => ends.push(result) });
    await tick(); const result = await session.stop();
    assert.equal(result.reason, 'error'); assert.equal(result.reusable, false); assert.match(result.error!.message, /did not settle/);
    assert.equal(ends.length, 1); assert.throws(() => controller.start(h.options), /unknown/);
    lateStart.resolve(); await tick();
    assert.throws(() => controller.start(h.options), /unknown/);
    callback(null, 'late'); assert.equal(values.length, 0); await session.stop(); assert.equal(ends.length, 1);
  }
});
