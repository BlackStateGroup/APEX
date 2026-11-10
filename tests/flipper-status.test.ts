import test from 'node:test';
import assert from 'node:assert/strict';
import { FlipperStatusController, FLIPPER_SERIAL_SERVICE, DEVICE_INFORMATION, BATTERY_SERVICE, FLIPPER_STATUS_FIELDS, decodeFlipperStatus } from '../packages/core/flipper-status.ts';
import type { FlipperStatusRadio, FlipperCandidate, FlipperStatusField } from '../packages/core/flipper-status.ts';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture(options: { timeoutMs?: number; scanMs?: number; unavailable?: string } = {}) {
  const calls: string[] = [];
  let callback!: (error: Error | null, candidate?: FlipperCandidate) => void;
  let disconnected!: () => void;
  let connected = false;
  const data = ['Flipper Devices Inc.', '7', 'abc123 release 1 2026-11-10', '0.25'];
  const radio: FlipperStatusRadio = {
    async state() { calls.push('state'); return 'PoweredOn'; },
    async scan(fn) { calls.push('scan'); callback = fn; },
    async stopScan() { calls.push('stopScan'); },
    async connect(id) { calls.push(`connect:${id}`); connected = true; },
    async discover() { calls.push('discover'); return [FLIPPER_SERIAL_SERVICE, DEVICE_INFORMATION, BATTERY_SERVICE]; },
    async read(_id, field) { calls.push(`read:${field.key}`); return field.kind === 'battery' ? Uint8Array.of(87) : field.kind === 'power' ? Uint8Array.of(0x7b) : new TextEncoder().encode(data[FLIPPER_STATUS_FIELDS.indexOf(field)]); },
    async disconnect() { calls.push('disconnect'); connected = false; },
    async isConnected() { calls.push('isConnected'); return connected; },
    onDisconnect(_id, fn) { calls.push('subscribe'); disconnected = fn; return () => { calls.push('unsubscribe'); }; },
  };
  const controller = new FlipperStatusController(async () => { calls.push('create'); return radio; }, { ...options, revision: 'synthetic-test-revision' });
  const found = (id = 'owned', name = 'Flipper Test') => callback(null, { id, name, rssi: -55 });
  return { calls, radio, controller, found, drop: () => { connected = false; disconnected(); }, scanError: () => callback(new Error('scan')), candidate: (value: FlipperCandidate) => callback(null, value) };
}

test('explicit selection reads only six allowlisted fields, closes before report and preserves accurate labels', async () => {
  const f = fixture(); assert.equal(f.calls.length, 0);
  await f.controller.scan(); f.found(); await f.controller.inspect('owned', true);
  const state = f.controller.snapshot();
  assert.equal(state.phase, 'complete'); assert.equal(state.held, false);
  assert.equal(state.report?.values.hardwareTarget, '7'); assert.equal(state.report?.values.firmwareBuild, 'abc123 release 1 2026-11-10');
  assert.equal(state.report?.values.batteryPercent, 87); assert.equal(state.report?.values.powerState, 'Charging');
  assert.equal(state.report?.authenticatedIdentity, false); assert.equal(state.report?.connectionClosed, true);
  assert.ok(Object.isFrozen(state.report?.values));
  assert.deepEqual(f.calls.filter(c => c.startsWith('read:')), FLIPPER_STATUS_FIELDS.map(f => `read:${f.key}`));
  assert.ok(f.calls.indexOf('stopScan') < f.calls.indexOf('connect:owned'));
  assert.ok(f.calls.indexOf('disconnect') > f.calls.indexOf('read:powerState'));
  assert.equal('serialNumber' in state.report!.values, false);
});
test('ownership, list selection, native availability and foreground are enforced in controller', async () => {
  const f = fixture(); await assert.rejects(f.controller.inspect('owned', false)); await assert.rejects(f.controller.inspect('unlisted', true));
  assert.equal(f.calls.length, 0); f.controller.setForeground(false); await assert.rejects(f.controller.scan()); assert.equal(f.calls.length, 0);
  const unsupported = fixture({ unavailable: 'iPhone required' }); await assert.rejects(unsupported.controller.scan(), /iPhone/); assert.deepEqual(unsupported.calls, []);
});
test('bounded scan updates candidates without auto-connect and ignores late callbacks', async () => {
  const f = fixture(); await f.controller.scan();
  for (let i = 0; i < 100; i++) f.found(`id${i}`);
  assert.equal(f.controller.snapshot().candidates.length, 32);
  f.found('id0', 'updated\u202ename'); assert.equal(f.controller.snapshot().candidates.at(-1)?.name, 'updatedname');
  await f.controller.finishScan(); f.found('late'); assert.equal(f.controller.snapshot().candidates.length, 32);
  assert.equal(f.calls.some(x => x.startsWith('connect')), false);
});
test('scan deadline ends discovery and gives an actionable empty state', async () => {
  const f = fixture({ scanMs: 5 }); await f.controller.scan(); await new Promise(r => setTimeout(r, 20));
  assert.equal(f.controller.snapshot().held, false); assert.match(f.controller.snapshot().message, /No Flipper found/);
});
test('Bluetooth denial, scan errors and malformed candidates never connect', async () => {
  const denied = fixture(); denied.radio.state = async () => 'Unauthorized'; await denied.controller.scan();
  assert.match(denied.controller.snapshot().message, /Allow Bluetooth/); assert.equal(denied.controller.snapshot().held, false);
  const f = fixture(); await f.controller.scan(); f.candidate({ id: 'x', name: 'x', rssi: NaN }); assert.equal(f.controller.snapshot().candidates.length, 0);
  f.scanError(); await tick(); assert.equal(f.controller.snapshot().phase, 'error'); assert.equal(f.calls.includes('disconnect'), false);
});
test('device selection cancelled while stopping scan cannot dispatch a new connection', async () => {
  const f = fixture(), gate = deferred<void>(); await f.controller.scan(); f.found(); f.radio.stopScan = () => gate.promise;
  const inspect = f.controller.inspect('owned', true); const cancelled = f.controller.cancel(); gate.resolve();
  await assert.rejects(inspect, /cancelled/); await cancelled;
  assert.equal(f.calls.some(x => x.startsWith('connect')), false);
});
test('wrong service profile and malformed status close without partial success', async () => {
  for (const kind of ['profile', 'battery', 'utf8', 'read-reject']) {
    const f = fixture(); await f.controller.scan(); f.found();
    if (kind === 'profile') f.radio.discover = async () => [DEVICE_INFORMATION, BATTERY_SERVICE];
    else { const original = f.radio.read; f.radio.read = async (id, field) => {
      if (kind === 'read-reject') throw new Error('Pairing refused');
      if (kind === 'battery' && field.kind === 'battery') return Uint8Array.of(101);
      if (kind === 'utf8') return Uint8Array.of(0xff);
      return original(id, field);
    }; }
    await f.controller.inspect('owned', true);
    assert.equal(f.controller.snapshot().phase, 'error', kind); assert.equal(f.controller.snapshot().report, null, kind); assert.equal(f.controller.snapshot().held, false, kind);
    assert.ok(f.calls.includes('disconnect'), kind);
  }
});
test('cancellation during late connect keeps ownership until it settles and closes returned connection', async () => {
  const f = fixture(), gate = deferred<void>(); await f.controller.scan(); f.found();
  const original = f.radio.connect; f.radio.connect = async id => { await gate.promise; await original(id); };
  const work = f.controller.inspect('owned', true); await tick();
  const stop = f.controller.cancel(); await tick(); assert.equal(f.controller.snapshot().phase, 'closing'); assert.equal(f.controller.snapshot().held, true);
  await assert.rejects(f.controller.scan()); gate.resolve(); await Promise.all([work, stop]);
  assert.equal(f.controller.snapshot().held, false); assert.equal(f.controller.snapshot().report, null); assert.equal(f.calls.includes('discover'), false);
  assert.equal(f.calls.filter(x => x === 'disconnect').length, 2);
});
test('background during read invalidates result even across immediate resume', async () => {
  const f = fixture(), gate = deferred<Uint8Array>(); await f.controller.scan(); f.found(); f.radio.read = () => gate.promise;
  const work = f.controller.inspect('owned', true); await tick(); f.controller.setForeground(false); f.controller.setForeground(true);
  assert.equal(f.controller.snapshot().report, null); assert.equal(f.controller.snapshot().held, true);
  gate.resolve(new TextEncoder().encode('late')); await work; await tick();
  assert.equal(f.controller.snapshot().report, null); assert.equal(f.controller.snapshot().phase, 'idle');
});
test('timeout does not release native work or allow a replacement', async () => {
  const f = fixture({ timeoutMs: 5 }), gate = deferred<Uint8Array>(); await f.controller.scan(); f.found(); f.radio.read = () => gate.promise;
  const work = f.controller.inspect('owned', true); await new Promise(r => setTimeout(r, 20));
  assert.equal(f.controller.snapshot().phase, 'closing'); await assert.rejects(f.controller.scan());
  gate.resolve(new TextEncoder().encode('late')); await work;
  assert.equal(f.controller.snapshot().phase, 'error'); assert.match(f.controller.snapshot().message, /timed out/); assert.equal(f.controller.snapshot().report, null);
});
test('disconnect while reading cancels all following reads', async () => {
  const f = fixture(), gate = deferred<Uint8Array>(); await f.controller.scan(); f.found(); f.radio.read = () => gate.promise;
  const work = f.controller.inspect('owned', true); await tick(); f.drop(); gate.resolve(new TextEncoder().encode('late')); await work; await tick();
  assert.equal(f.controller.snapshot().phase, 'error'); assert.equal(f.controller.snapshot().report, null);
});
test('failed scan or connection cleanup blocks replacement and withholds complete reports', async () => {
  for (const kind of ['scan', 'disconnect', 'still-connected', 'query']) {
    const f = fixture(); await f.controller.scan(); f.found();
    if (kind === 'scan') { f.radio.stopScan = async () => { throw new Error('stop failed'); }; await f.controller.finishScan(); }
    else {
      if (kind === 'disconnect') f.radio.disconnect = async () => { throw new Error('close failed'); };
      if (kind === 'still-connected') f.radio.disconnect = async () => {};
      if (kind === 'query') f.radio.isConnected = async () => { throw new Error('query failed'); };
      await f.controller.inspect('owned', true);
    }
    assert.equal(f.controller.snapshot().phase, 'blocked', kind); assert.equal(f.controller.snapshot().report, null, kind); await assert.rejects(f.controller.scan());
  }
});
test('normal repeat sessions require a new scan and clear previous evidence', async () => {
  const f = fixture(); await f.controller.scan(); f.found(); await f.controller.inspect('owned', true);
  await assert.rejects(f.controller.inspect('owned', true), /current scan/);
  await f.controller.scan(); assert.equal(f.controller.snapshot().report, null); f.found(); await f.controller.inspect('owned', true);
  assert.equal(f.controller.snapshot().phase, 'complete'); assert.equal(f.calls.filter(c => c === 'create').length, 1);
  f.controller.setForeground(false); assert.equal(f.controller.snapshot().report, null);
});
test('decoder rejects invalid UTF-8, control characters, lengths and battery range; power states stay explicit', () => {
  for (const bytes of [new Uint8Array(), new Uint8Array(129), Uint8Array.of(255), Uint8Array.of(0), new TextEncoder().encode('x\u202ey')]) assert.throws(() => decodeFlipperStatus(FLIPPER_STATUS_FIELDS[0], bytes));
  for (const bytes of [Uint8Array.of(101), Uint8Array.of(1,2)]) assert.throws(() => decodeFlipperStatus(FLIPPER_STATUS_FIELDS[4], bytes));
  for (const [value, expected] of [[0, 'Charging unknown'], [16, 'Charging unsupported'], [32, 'Not charging'], [48, 'Charging']] as const) assert.equal(decodeFlipperStatus(FLIPPER_STATUS_FIELDS[5], Uint8Array.of(value)), expected);
});
