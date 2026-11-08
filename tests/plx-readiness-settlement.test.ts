// Exact installed PLX ESM + adapter; synthetic RN boundary exceptions, not phone
// failures. Only tests explicitly named alternate-contract replace onStateChange.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { environment, verifyInstalled, hooks } from './plx-facade-host/loader.ts';
import { BleTransport, AXP_SERVICE, AXP_WRITE, AXP_NOTIFY } from '../packages/core/ble-transport.ts';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const turns = async () => { for (let i = 0; i < 8; ++i) await tick(); };
verifyInstalled();
after(() => { verifyInstalled(); hooks.deregister(); });
let serial = 0;
async function fixture(options: { remove?: () => void; register?: () => void; initial?: string; sync?: string; registrationError?: () => void; subscription?: { value: unknown } } = {}) {
  const id = `settlement-${++serial}`, events: string[] = [];
  const listeners = new Set<(state: string) => void>();
  let stateResolve!: (state: string) => void;
  const statePromise = new Promise<string>(r => { stateResolve = r; });
  const device = { id: 'AXP', mtu: 23 };
  const bridge = {
    StateChangeEvent: 'state', DisconnectionEvent: 'disconnect',
    createClient() { events.push('create'); }, state() { return options.initial ? Promise.resolve(options.initial) : statePromise; },
    async isDeviceConnected() { return false; }, async connectToDevice() { events.push('connect'); return device; },
    async discoverAllServicesAndCharacteristicsForDevice() { return device; }, async requestMTUForDevice() { return device; },
    async servicesForDevice() { return [{ id: 1, uuid: AXP_SERVICE, deviceID: 'AXP', isPrimary: true }]; },
    async characteristicsForDevice() { return [ { uuid: AXP_WRITE, isWritableWithResponse: true }, { uuid: AXP_NOTIFY, isNotifiable: true } ]; },
    async cancelDeviceConnection() { events.push('cancel'); return device; },
    async destroyClient() { events.push('destroy'); }, async stopDeviceScan() { events.push('stop'); },
    async startDeviceScan() { events.push('scan'); },
  };
  class Emitter {
    addListener(name: string, callback: (state: string) => void) {
      if (name !== 'state') return { remove() {} };
      listeners.add(callback); options.register?.();
      return { remove() { events.push('remove'); options.remove?.(); listeners.delete(callback); } };
    }
  }
  environment(id, { NativeModules: { BlePlx: bridge }, NativeEventEmitter: Emitter,
    Platform: { OS: 'android', Version: 34 }, AppState: { currentState: 'active', addEventListener() { return { remove() {} }; } },
    PermissionsAndroid: { PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect' }, RESULTS: { GRANTED: 'granted' }, async requestMultiple() { return { scan: 'granted', connect: 'granted' }; } } });
  const { BleManager } = await import(`../evidence/readiness-cleanup/sdk-owner.ts?plx-case=${id}`);
  const manager = new BleManager();
  if (options.sync) manager.onStateChange = (callback: (state: string) => void) => {
    callback(options.sync!); options.registrationError?.();
    return options.subscription ? options.subscription.value : { remove() { events.push('remove'); options.remove?.(); } };
  };
  const native = await import(`../src/platform/bluetooth.native.ts?plx-case=${id}`);
  const emit = (state: string) => { for (const cb of [...listeners]) cb(state); };
  return { native, manager, events, listeners, emit, stateResolve };
}
function opening(x: Awaited<ReturnType<typeof fixture>>, signal?: AbortSignal) {
  const attempt = {};
  let result: { status: 'pending' | 'resolved' | 'rejected'; error?: unknown; connection?: any } = { status: 'pending' };
  const promise = x.native.bleDriver.connect('AXP', signal, attempt);
  void promise.then((connection: any) => { result = { status: 'resolved', connection }; }, (error: unknown) => { result = { status: 'rejected', error }; });
  return { attempt, promise, result: () => result };
}
async function fenced(x: Awaited<ReturnType<typeof fixture>>, o: ReturnType<typeof opening>, expected: unknown) {
  await turns();
  assert.equal(o.result().status, 'rejected'); assert.equal(o.result().error, expected);
  assert.equal(x.events.includes('connect'), false);
  assert.equal(x.native.accessoryConnectionOwnership(), 'unknown');
  assert.equal(x.native.bleDriver.consumeUnissuedConnection(o.attempt, 'AXP', expected), false);
  await assert.rejects(x.native.shutdownBluetooth(), /readiness cleanup unknown.*restart/);
  await assert.rejects(x.native.bleDriver.connect('OTHER'), /readiness cleanup unknown/);
  assert.equal(x.events.includes('destroy'), false);
}
const falsy = [undefined, null, false, 0, '', Object.freeze({ toString() { throw new Error('must not coerce'); } })];
for (const [index, original] of [new Error('remove fault'), ...falsy].entries()) {
  for (const mode of ['event', 'initial', 'alternate-contract-sync'] as const) test(`readiness ${mode} remove rejects original ${index} without escape`, async () => {
    const x = await fixture({ remove() { throw original; }, ...(mode === 'initial' ? { initial: 'PoweredOn' } : mode === 'alternate-contract-sync' ? { sync: 'PoweredOn' } : {}) });
    const o = opening(x); await turns();
    if (mode === 'event') { assert.doesNotThrow(() => x.emit('PoweredOn')); x.emit('PoweredOff'); x.stateResolve('PoweredOn'); }
    await fenced(x, o, original);
    if (mode !== 'alternate-contract-sync') { assert.equal(Object.keys(x.manager._activeSubscriptions).length, 0); assert.equal(x.listeners.size, 1); }
  });
  test(`alternate-contract-sync registration after success rejects original ${index}`, async () => {
    const x = await fixture({ sync: 'PoweredOn', registrationError() { throw original; } });
    await fenced(x, opening(x), original);
  });
  test(`installed registration failure preserves original ${index}`, async () => {
    const x = await fixture({ register() { throw original; } });
    await fenced(x, opening(x), original);
  });
}
test('alternate-contract-sync readiness denial precedes registration error without coercion', async () => {
  const original = false;
  const x = await fixture({ sync: 'PoweredOff', registrationError() { throw original; } });
  const o = opening(x); await turns();
  const error = o.result().error as AggregateError;
  assert.ok(error instanceof AggregateError); assert.match(error.errors[0].message, /poweredoff/); assert.equal(error.errors[1], original);
  await fenced(x, o, error);
});
test('independent timer, subscription and abort cleanup preserve deterministic causes', async t => {
  const timerFault = {}, removeFault = false, abortFault = 0;
  const x = await fixture({ remove() { throw removeFault; } });
  const controller = new AbortController();
  const realClear = globalThis.clearTimeout;
  const o = opening(x, controller.signal); await turns();
  let abortedCleanup = false;
  t.mock.method(controller.signal, 'removeEventListener', () => { abortedCleanup = true; throw abortFault; });
  t.mock.method(globalThis, 'clearTimeout', (timer: any) => { realClear(timer); throw timerFault; });
  x.emit('Unauthorized'); await turns();
  t.mock.restoreAll();
  const error = o.result().error as AggregateError;
  assert.ok(error instanceof AggregateError); assert.match(error.errors[0].message, /unauthorized/);
  assert.deepEqual(error.errors.slice(1), [timerFault, removeFault, abortFault]); assert.equal(abortedCleanup, true);
  await fenced(x, o, error);
});
for (const terminal of ['PoweredOff', 'Unauthorized', 'Unsupported', 'abort', 'timeout']) test(`normal ${terminal} cleanup does not latch`, async t => {
  const x = await fixture(); const controller = new AbortController();
  if (terminal === 'timeout') t.mock.timers.enable({ apis: ['setTimeout'] });
  const o = opening(x, controller.signal); await turns();
  if (terminal === 'abort') controller.abort(); else if (terminal === 'timeout') t.mock.timers.tick(10000); else x.emit(terminal);
  await turns(); if (terminal === 'timeout') t.mock.timers.reset();
  assert.equal(o.result().status, 'rejected'); assert.equal(x.native.accessoryConnectionOwnership(), 'owned');
  await assert.rejects(x.native.shutdownBluetooth(), /readiness operation still pending/);
  assert.equal(x.listeners.size, 0); assert.equal(x.events.filter(v => v === 'remove').length, 1);
  assert.equal(x.native.bleDriver.consumeUnissuedConnection(o.attempt, 'AXP', o.result().error), false);
  x.stateResolve('PoweredOff'); await turns();
  await x.native.shutdownBluetooth(); assert.equal(x.events.includes('destroy'), true);
});
for (const mode of ['event', 'initial', 'alternate-contract-sync']) test(`normal ${mode} success waits for removal and disconnect remains usable`, async () => {
  const x = await fixture(mode === 'initial' ? { initial: 'PoweredOn' } : mode === 'alternate-contract-sync' ? { sync: 'PoweredOn' } : {});
  const o = opening(x); await turns(); if (mode === 'event') { x.emit('PoweredOn'); x.stateResolve('PoweredOn'); } await turns();
  assert.equal(o.result().status, 'resolved'); assert.ok(x.events.indexOf('remove') < x.events.indexOf('connect'));
  await o.result().connection.disconnect(); assert.equal(x.events.includes('cancel'), true);
  x.stateResolve('PoweredOn'); await turns();
  await x.native.shutdownBluetooth();
});
test('readiness failure remains transport acquisitionUnknown, without receipt certification', async () => {
  const original = {}; const x = await fixture({ initial: 'PoweredOn', remove() { throw original; } });
  const transport = new BleTransport(x.native.bleDriver, 'AXP', { timeoutMs: 1000 });
  await assert.rejects(transport.connect(), error => error === original);
  await assert.rejects(transport.disconnect(), /unknown/);
  assert.equal(x.events.includes('connect'), false);
});
test('exclusive failure blocks automatic destruction and explicit shutdown', async () => {
  const x = await fixture({ initial: 'PoweredOn', remove() { throw new Error('remove'); } });
  const session = x.native.startSelectedServiceDataObservation({ service: 'FCD2', receiptClock: () => 'synthetic' });
  const result = await session.done;
  assert.equal(result.reusable, false); assert.equal(x.events.includes('destroy'), false);
  await assert.rejects(x.native.shutdownBluetooth(), /readiness cleanup unknown/);
});
test('owned connection can still cancel after another readiness cleanup loses ownership', async () => {
  let fail = false;
  const x = await fixture({ initial: 'PoweredOn', remove() { if (fail) throw new Error('remove'); } });
  const connection = await x.native.bleDriver.connect('AXP');
  fail = true;
  await assert.rejects(x.native.bleDriver.connect('SECOND'), /remove/);
  await connection.disconnect(); assert.equal(x.events.includes('cancel'), true);
  await assert.rejects(x.native.shutdownBluetooth(), /readiness cleanup unknown/);
});
for (const local of ['timer', 'abort-listener', 'abort-registration']) test(`local-only ${local} failure rejects without restart latch`, async t => {
  const original = false;
  const x = await fixture(); const controller = new AbortController();
  const realClear = globalThis.clearTimeout;
  if (local === 'abort-registration') t.mock.method(controller.signal, 'addEventListener', () => { throw original; });
  const o = opening(x, controller.signal); await turns();
  if (local === 'timer') t.mock.method(globalThis, 'clearTimeout', (timer: any) => { realClear(timer); throw original; });
  if (local === 'abort-listener') t.mock.method(controller.signal, 'removeEventListener', () => { throw original; });
  x.emit('PoweredOn'); x.stateResolve('PoweredOn'); await turns(); t.mock.restoreAll();
  assert.equal(o.result().status, 'rejected'); assert.equal(o.result().error, original);
  assert.equal(x.native.accessoryConnectionOwnership(), 'idle'); assert.equal(x.listeners.size, 0);
  assert.equal(x.native.bleDriver.consumeUnissuedConnection(o.attempt, 'AXP', original), false);
  x.stateResolve('PoweredOn'); await turns(); await x.native.shutdownBluetooth();
  assert.equal(x.events.includes('destroy'), true);
});
for (const terminal of ['abort', 'timeout']) test(`${terminal} plus SDK remove failure aggregates and fences destruction`, async t => {
  const original = false; const x = await fixture({ remove() { throw original; } });
  const controller = new AbortController();
  if (terminal === 'timeout') t.mock.timers.enable({ apis: ['setTimeout'] });
  const o = opening(x, controller.signal); await turns();
  if (terminal === 'abort') controller.abort(); else t.mock.timers.tick(10000);
  await turns(); if (terminal === 'timeout') t.mock.timers.reset();
  const error = o.result().error as AggregateError;
  assert.ok(error instanceof AggregateError); assert.match(error.errors[0].message, terminal === 'abort' ? /cancelled/ : /did not become ready/);
  assert.equal(error.errors[1], original); await fenced(x, o, error);
});
test('stale preparation cannot acquire a second subscription while its query is pending', async t => {
  const x = await fixture({ remove() { throw new Error('lost older listener'); } });
  const add = AbortSignal.prototype.addEventListener;
  t.mock.method(AbortSignal.prototype, 'addEventListener', function(this: AbortSignal, name: string, listener: any, options: any) {
    if (name === 'abort' && listener.name === 'cancelled') return;
    return add.call(this, name, listener, options);
  });
  const stop = await x.native.scanAccessories(() => {}, () => {}); await turns();
  assert.equal(x.listeners.size, 1); t.mock.restoreAll();
  await stop();
  const o = opening(x); await turns();
  assert.equal(o.result().status, 'rejected'); assert.match(String(o.result().error), /readiness operation still pending/);
  assert.equal(x.listeners.size, 1); assert.equal(x.events.includes('connect'), false);
  await assert.rejects(x.native.shutdownBluetooth(), /readiness operation still pending/);
  x.emit('PoweredOn'); x.stateResolve('PoweredOn'); await turns();
  await assert.rejects(x.native.shutdownBluetooth(), /readiness cleanup unknown/);
  assert.equal(x.events.includes('destroy'), false);
});

for (const [index, value] of [undefined, null, {}, { remove: false }].entries()) for (const state of ['PoweredOn', 'Unknown']) test(`alternate-contract missing cleanup capability ${index} state ${state} cannot succeed`, async () => {
  const x = await fixture({ sync: state, subscription: { value } });
  const o = opening(x); await turns();
  const error = o.result().error;
  // An invalid non-null handle also fails removal independently, so its second
  // error is retained rather than suppressing the attempted cleanup.
  if (error instanceof AggregateError) assert.match(error.errors[0].message, /cleanup unavailable/);
  else assert.match(String(error), /cleanup unavailable/);
  await fenced(x, o, error);
});
