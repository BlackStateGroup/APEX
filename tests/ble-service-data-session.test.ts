import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceDataController, SERVICE_DATA_LIMITS } from '../packages/core/ble-service-data-session.ts';
import type { ServiceDataBackend, ServiceDataLease, ServiceDataRuntime } from '../packages/core/ble-service-data-session.ts';
import { prepareForegroundObservation } from '../packages/core/ble-observation-session.ts';
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
class Clock implements ServiceDataRuntime {
  time = 0; id = 0; timers = new Map<number, { at: number; fn: () => void }>();
  now = () => this.time;
  set = (fn: () => void, ms: number) => { const id = ++this.id; this.timers.set(id, { at: this.time + ms, fn }); return id; };
  clear = (id: unknown) => { this.timers.delete(id as number); };
  async advance(ms: number) { this.time += ms; for (const [id, timer] of [...this.timers]) if (timer.at <= this.time) { this.timers.delete(id); timer.fn(); } await flush(); }
}
const receipt = '2026-11-08T00:00:00.000Z';
const options = { platform: 'ios' as const, service: 'FCD2' as const, receiptClock: () => receipt };
const match = () => ({ serviceData: { FCD2: 'QAFk' } });
function harness(change: Partial<ServiceDataLease> = {}, acquire?: ServiceDataBackend['acquireExclusive']) {
  const clock = new Clock(); const calls: string[] = []; let callback!: (error: unknown, value?: unknown) => void;
  const lease: ServiceDataLease = {
    startBroad: async (request, cb) => { calls.push('start'); assert.deepEqual(request, { serviceUUIDs: null, allowDuplicates: true }); callback = cb; },
    stop: async () => { calls.push('stop'); }, destroyAndRelease: async () => { calls.push('destroy'); }, ...change,
  };
  const controller = createServiceDataController({ acquireExclusive: acquire ?? (async () => { calls.push('acquire'); return lease; }) }, clock);
  return { clock, calls, lease, controller, emit: (value?: unknown, error: unknown = null) => callback(error, value) };
}

test('100 unrelated deliveries exhaust total budget without invoking full preparation or receipt clock', async () => {
  const h = harness(); const session = h.controller.start({ ...options, receiptClock: () => { throw Error('must not prepare'); } }); await flush();
  const unrelated = { serviceData: {}, get id() { throw Error('must not inspect'); } };
  for (let i = 0; i < 110; i++) h.emit(unrelated);
  const result = await session.done;
  assert.equal(result.reason, 'callback-budget'); assert.equal(result.metrics.total, 100); assert.equal(result.metrics.noMatch, 100);
  assert.equal(result.metrics.retained, 0); assert.equal(result.reusable, true); assert.equal(h.controller.busy, false);
  assert.deepEqual(h.calls, ['acquire', 'start', 'stop', 'stop', 'destroy']);
});

test('mixed callback statuses sum to total; 25 duplicate matches retain exact selected source', async () => {
  const h = harness(); const session = h.controller.start(options); await flush();
  for (let i = 0; i < 25; i++) { h.emit({}); h.emit({ serviceData: {} }); h.emit(match()); }
  const r = await session.done;
  assert.equal(r.reason, 'match-budget'); assert.deepEqual(r.metrics, { total: 75, match: 25, noMatch: 25, unavailable: 25, malformed: 0, sdkErrors: 0, retained: 25, characters: prepareForegroundObservation('ios', match(), 'FCD2', receipt).characters * 25 });
  assert.deepEqual(r.observations[0], prepareForegroundObservation('ios', match(), 'FCD2', receipt).value);
});

test('retained serialized-character budget rejects whole matching callback, never truncates', async () => {
  const h = harness(); const session = h.controller.start(options); await flush();
  const device = { serviceData: { FCD2: Buffer.alloc(1600, 1).toString('base64') } };
  const size = prepareForegroundObservation('ios', device, 'FCD2', receipt).characters;
  for (let i = 0; i < 100; i++) h.emit(device);
  const r = await session.done;
  assert.equal(r.reason, 'character-budget'); assert.equal(r.metrics.retained, Math.floor(65536 / size));
  assert.equal(r.metrics.match, r.metrics.retained + 1); assert.equal(r.metrics.characters, size * r.metrics.retained);
  assert.ok(r.metrics.characters <= 65536);
});

for (const [name, device, error, reason, counter] of [
  ['undefined callback', undefined, null, 'malformed', 'malformed'],
  ['malformed source', { serviceData: { FCD2: '!' } }, null, 'malformed', 'malformed'],
  ['SDK error', match(), new Error('SDK failed'), 'sdk-error', 'sdkErrors'],
] as const) test(`${name} counts before terminating`, async () => {
  const h = harness(); const s = h.controller.start(options); await flush(); h.emit(device, error); const r = await s.done;
  assert.equal(r.reason, reason); assert.equal(r.metrics.total, 1); assert.equal(r.metrics[counter], 1); assert.equal(r.metrics.retained, 0);
});

test('full preparation may reject a membership match; malformed count remains gate-only', async () => {
  const h = harness(); const s = h.controller.start(options); await flush(); h.emit({ ...match(), id: 123 });
  const r = await s.done; assert.equal(r.reason, 'preparation-error'); assert.equal(r.metrics.match, 1); assert.equal(r.metrics.malformed, 0); assert.equal(r.metrics.retained, 0);
});

test('deadline at callback entry rejects even when scheduled timer has not run', async () => {
  const h = harness(); const s = h.controller.start(options); await flush(); h.clock.time = 10000; h.emit(match());
  const r = await s.done; assert.equal(r.reason, 'duration'); assert.equal(r.metrics.total, 0);
});

test('deadline includes acquisition and preparation', async () => {
  const pending = deferred<ServiceDataLease | null>(); const h = harness({}, () => pending.promise); const s = h.controller.start(options); await flush();
  await h.clock.advance(10000); pending.resolve(h.lease); const r = await s.done;
  assert.equal(r.reason, 'duration'); assert.equal(r.reusable, true); assert.deepEqual(h.calls, ['stop', 'destroy']);
});

test('deadline after synchronous preparation prevents retention', async () => {
  const h = harness(); const s = h.controller.start({ ...options, receiptClock: () => { h.clock.time = 10001; return receipt; } }); await flush(); h.emit(match());
  const r = await s.done; assert.equal(r.reason, 'duration'); assert.equal(r.metrics.total, 1); assert.equal(r.metrics.match, 1); assert.equal(r.metrics.retained, 0);
});

test('immediate cancellation avoids acquire, repeated stop shares one result', async () => {
  const h = harness(); const s = h.controller.start(options); const one = s.stop(); assert.equal(one, s.stop());
  const r = await one; assert.equal(r.reason, 'stopped'); assert.equal(r.reusable, true); assert.deepEqual(h.calls, []);
});

test('pending acquisition aborts, retains lease until late acquisition is stopped and destroyed', async () => {
  const pending = deferred<ServiceDataLease | null>(); let signal!: AbortSignal;
  const h = harness({}, value => { signal = value; return pending.promise; }); const s = h.controller.start(options); await flush();
  void s.stop('background'); assert.equal(signal.aborted, true); assert.equal(h.controller.busy, true); pending.resolve(h.lease);
  const r = await s.done; assert.equal(r.reason, 'background'); assert.equal(r.reusable, true); assert.deepEqual(h.calls, ['stop', 'destroy']);
});

test('acquisition timeout poisons, late ownership is cleaned and never automatically recycled', async () => {
  const pending = deferred<ServiceDataLease | null>(); const h = harness({}, () => pending.promise); const s = h.controller.start(options); await flush(); void s.stop(); await flush();
  await h.clock.advance(2000); const r = await s.done; assert.equal(r.reusable, false); assert.equal(h.controller.healthy, false);
  assert.throws(() => h.controller.start(options)); pending.resolve(h.lease); await flush(); assert.deepEqual(h.calls, ['stop', 'destroy']); assert.equal(h.controller.healthy, false);
});

test('acquisition rejection means ownership unknown; null certifies unavailable without poisoning', async () => {
  const bad = harness({}, async () => { throw new Error('unknown acquisition'); }); const r = await bad.controller.start(options).done;
  assert.equal(r.reason, 'backend-error'); assert.equal(r.reusable, false); assert.equal(r.errors[0]!.message, 'Acquisition failed; ownership unknown');
  const no = harness({}, async () => null); const n = await no.controller.start(options).done;
  assert.equal(n.reason, 'ownership-unavailable'); assert.equal(n.reusable, true); assert.deepEqual(no.calls, []);
});

test('synchronous callbacks during start obey budget, stale callbacks ignored across explicit sessions', async () => {
  let stale!: (error: unknown, value?: unknown) => void;
  const h = harness({ startBroad: async (_request, cb) => { stale = cb; for (let i = 0; i < 150; i++) cb(null, { serviceData: {} }); } });
  const first = await h.controller.start(options).done; assert.equal(first.metrics.total, 100);
  stale(null, match()); assert.equal(first.metrics.total, 100);
  const second = h.controller.start(options); stale(null, match()); const r = await second.done; assert.equal(r.metrics.total, 100); assert.equal(r.metrics.match, 0);
});

test('pending start receives early stop and final stop after acknowledgement before destruction', async () => {
  const pending = deferred<void>(); const h = harness({ startBroad: () => { h.calls.push('start'); return pending.promise; } });
  const s = h.controller.start(options); await flush(); void s.stop(); await flush(); assert.deepEqual(h.calls, ['acquire', 'start', 'stop']); assert.equal(h.controller.busy, true);
  pending.resolve(); const r = await s.done; assert.equal(r.reusable, true); assert.deepEqual(h.calls, ['acquire', 'start', 'stop', 'stop', 'destroy']);
});

test('unknown late start cannot release reuse; cleanup follows settlement, never overlaps destruction', async () => {
  const pending = deferred<void>(); const h = harness({ startBroad: () => pending.promise }); const s = h.controller.start(options); await flush(); void s.stop(); await flush();
  await h.clock.advance(2000); const r = await s.done; assert.equal(r.reusable, false); assert.deepEqual(h.calls, ['acquire', 'stop']);
  pending.resolve(); await flush(); assert.deepEqual(h.calls, ['acquire', 'stop', 'stop', 'destroy']); assert.throws(() => h.controller.start(options));
});

for (const operation of ['stop', 'destroyAndRelease'] as const) test(`${operation} failure retains error and poisons even if other cleanup succeeds`, async () => {
  const failure = new Error(`${operation} failed`); const h = harness({ [operation]: async () => { h.calls.push(operation); throw failure; } }); const s = h.controller.start(options); await flush();
  const r = await s.stop(); assert.equal(r.reason, 'stopped'); assert.equal(r.reusable, false); assert.ok(r.errors.length > 0); assert.ok(!r.errors.includes(failure)); assert.equal(h.controller.healthy, false); assert.throws(() => h.controller.start(options));
  assert.ok(h.calls.includes(operation === 'stop' ? 'destroy' : 'stop'));
});

test('delayed destruction holds busy until confirmation; timeout remains poisoned after late success', async () => {
  const pending = deferred<void>(); const h = harness({ destroyAndRelease: () => pending.promise }); const s = h.controller.start(options); await flush(); void s.stop(); await flush();
  assert.equal(h.controller.busy, true); assert.throws(() => h.controller.start(options)); await h.clock.advance(2000);
  const r = await s.done; assert.equal(r.reusable, false); pending.resolve(); await flush(); assert.equal(h.controller.healthy, false);
});

test('timer terminates a zero-result session without retry; explicit next start requires successful cleanup', async () => {
  const h = harness(); const s = h.controller.start(options); await flush(); await h.clock.advance(10000); const r = await s.done;
  assert.equal(r.reason, 'duration'); assert.equal(r.metrics.total, 0); assert.equal(h.calls.filter(c => c === 'start').length, 1); assert.equal(h.clock.timers.size, 0);
  const next = h.controller.start(options); await flush(); await next.stop(); assert.equal(h.calls.filter(c => c === 'start').length, 2);
});

test('bounds fixed and invalid service/platform rejected before acquisition', () => {
  const h = harness(); assert.deepEqual(SERVICE_DATA_LIMITS, { durationMs: 10000, callbacks: 100, matches: 25, characters: 65536 });
  for (const invalid of [{ service: '180F' }, { platform: 'web' }]) assert.throws(() => h.controller.start({ ...options, ...invalid } as typeof options));
  assert.deepEqual(h.calls, []);
});

test('SDK diagnostic does not retain arbitrary messages, causes, custom properties or callback references', async () => {
  const h = harness(); const s = h.controller.start(options); await flush();
  const secret = { id: 'private-device', payload: match() }; const error = Object.assign(new Error('private-device'), { cause: secret, device: secret });
  h.emit(secret, error); const r = await s.done;
  assert.equal(r.errors[0]!.message, 'SDK callback error'); assert.notEqual(r.errors[0], error);
  assert.equal(Object.hasOwn(r.errors[0]!, 'cause'), false); assert.equal(Object.hasOwn(r.errors[0]!, 'device'), false);
  assert.equal(JSON.stringify(r).includes('private-device'), false);
});

for (const invalid of [NaN, Infinity, -1]) test(`invalid monotonic reading ${invalid} fails closed`, async () => {
  const h = harness(); const s = h.controller.start(options); await flush(); h.clock.time = invalid; h.emit(match());
  const r = await s.done; assert.equal(r.reason, 'backend-error'); assert.equal(r.metrics.total, 0); assert.equal(r.reusable, false);
});

test('synchronous start throw after synchronous callback still cleans and preserves processed counts', async () => {
  const h = harness({ startBroad: (_request, cb) => { cb(null, match()); throw Error('private-message'); } });
  const r = await h.controller.start(options).done; assert.equal(r.reason, 'backend-error'); assert.equal(r.metrics.retained, 1); assert.equal(r.reusable, true);
  assert.equal(r.errors[0]!.message, 'Start failed'); assert.deepEqual(h.calls, ['acquire', 'stop', 'stop', 'destroy']);
});

test('callbacks arriving during delayed cleanup do not count or retain data', async () => {
  const pending = deferred<void>(); const h = harness({ destroyAndRelease: () => pending.promise }); const s = h.controller.start(options); await flush();
  h.emit(match()); void s.stop('background'); await flush(); for (let i = 0; i < 1000; i++) h.emit(match());
  pending.resolve(); const r = await s.done; assert.equal(r.metrics.total, 1); assert.equal(r.metrics.retained, 1); assert.equal(r.reason, 'background');
});

test('late cleanup failure is visible through safe controller diagnostics but never reopens controller', async () => {
  const pending = deferred<ServiceDataLease | null>(); const h = harness({ destroyAndRelease: async () => { throw Error('private late error'); } }, () => pending.promise);
  const s = h.controller.start(options); await flush(); void s.stop(); await flush(); await h.clock.advance(2000); const r = await s.done;
  const initial = r.errors.length; pending.resolve(h.lease); await flush(); assert.equal(r.errors.length, initial); assert.ok(h.controller.errors.length > initial);
  assert.equal(h.controller.healthy, false); assert.ok(!JSON.stringify(h.controller.errors).includes('private late error'));
});

test('Android raw membership and FEAA selection preserve authoritative source semantics', async () => {
  const h = harness(); const s = h.controller.start({ ...options, platform: 'android', service: 'FEAA' }); await flush();
  h.emit({ rawScanRecord: Buffer.from('0616d2fc400164', 'hex').toString('base64'), serviceData: { FEAA: '' } });
  const source = { rawScanRecord: Buffer.from('0416aafeee', 'hex').toString('base64') }; h.emit(source);
  const r = await s.stop(); assert.equal(r.metrics.noMatch, 1); assert.equal(r.metrics.match, 1);
  assert.deepEqual(r.observations[0], prepareForegroundObservation('android', source, 'FEAA', receipt).value);
});

test('oversized matching exact source fails preparation without truncation', async () => {
  const h = harness(); const s = h.controller.start(options); await flush(); h.emit({ ...match(), rawScanRecord: Buffer.alloc(3000).toString('base64') });
  const r = await s.done; assert.equal(r.reason, 'preparation-error'); assert.equal(r.metrics.match, 1); assert.equal(r.metrics.retained, 0);
});

test('timer setup throw poisons deterministically without acquiring or stranding done', async () => {
  const h = harness(); h.clock.set = () => { throw new Error('private timer error'); };
  const s = h.controller.start(options); const r = await s.done;
  assert.equal(r.reason, 'backend-error'); assert.equal(r.reusable, false); assert.equal(h.controller.busy, false); assert.deepEqual(h.calls, []);
});

test('callback clock throw terminates and cleans without throwing through callback', async () => {
  const h = harness(); const s = h.controller.start(options); await flush(); h.clock.now = () => { throw new Error('private clock error'); };
  assert.doesNotThrow(() => h.emit(match())); const r = await s.done;
  assert.equal(r.reason, 'backend-error'); assert.equal(r.reusable, false); assert.equal(r.metrics.total, 0); assert.ok(h.calls.includes('destroy'));
});

test('timer clear throw cannot strand completion or permit reuse', async () => {
  const h = harness(); const s = h.controller.start(options); await flush(); h.clock.clear = () => { throw new Error('private clear error'); };
  const r = await s.stop(); assert.equal(r.reusable, false); assert.equal(h.controller.busy, false); assert.ok(h.calls.includes('destroy'));
});

test('cleanup timer setup throw reports uncertainty and never automatically reopens', async () => {
  const h = harness(); const s = h.controller.start(options); await flush(); h.clock.set = () => { throw new Error('cleanup timer failed'); };
  const r = await s.stop(); assert.equal(r.reusable, false); assert.equal(h.controller.busy, false); assert.throws(() => h.controller.start(options));
});

test('retained observations and source payloads are immutable copies', async () => {
  const h = harness(); const s = h.controller.start(options); await flush(); const device = match(); h.emit(device); device.serviceData.FCD2 = '';
  const r = await s.stop(); assert.deepEqual(r.observations[0], prepareForegroundObservation('ios', match(), 'FCD2', receipt).value);
  assert.ok(Object.isFrozen(r.observations)); assert.ok(Object.isFrozen(r.observations[0])); assert.ok(Object.isFrozen(r.observations[0]!.source));
});
