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
async function fixture(options: { remove?: () => void; register?: () => void; initial?: string; sync?: string; registrationError?: () => void; malformed?: () => any } = {}) {
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
    return options.malformed ? options.malformed() : { remove() { events.push('remove'); options.remove?.(); } };
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

for (const [name, malformed] of [
  ['undefined', () => undefined], ['null', () => null], ['empty-object', () => ({})],
  ['non-callable-remove', () => ({ remove: false })],
] as const) test('alternate-contract malformed subscription ' + name + ' must reject and fence', async () => {
  const x = await fixture({ sync: 'PoweredOn', malformed });
  const o = opening(x); await turns();
  assert.equal(o.result().status, 'rejected');
  assert.equal(x.events.includes('connect'), false);
  assert.equal(x.native.accessoryConnectionOwnership(), 'unknown');
  await assert.rejects(x.native.shutdownBluetooth(), /readiness cleanup unknown/);
  assert.equal(x.events.includes('destroy'), false);
});
test('reentrant removal callback cannot replace first readiness outcome or remove twice', async () => {
  let reenter = () => {};
  const x = await fixture({ remove() { reenter(); } });
  reenter = () => x.emit('Unauthorized');
  const o = opening(x); await turns();
  x.emit('PoweredOn'); x.stateResolve('PoweredOn'); await turns();
  assert.equal(o.result().status, 'resolved');
  assert.equal(x.events.filter(e => e === 'remove').length, 1);
  await o.result().connection.disconnect();
  x.stateResolve('PoweredOn'); await turns();
  await x.native.shutdownBluetooth();
});
for (const original of [undefined, null, false, 0, '']) {
  test('local AbortSignal registration preserves falsy cause without entering SDK', async t => {
    const x = await fixture(); const controller = new AbortController();
    t.mock.method(controller.signal, 'addEventListener', () => { throw original; });
    const o = opening(x, controller.signal); await turns(); t.mock.restoreAll();
    assert.equal(o.result().status, 'rejected'); assert.equal(o.result().error, original);
    assert.equal(x.listeners.size, 0); assert.equal(x.events.includes('remove'), false);
    assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
    assert.equal(x.native.bleDriver.consumeUnissuedConnection(o.attempt, 'AXP', original), false);
    await x.native.shutdownBluetooth(); assert.equal(x.events.includes('destroy'), true);
  });
}
test('local setTimeout failure rejects without SDK listener or restart latch', async t => {
  const original = {};
  const x = await fixture();
  t.mock.method(globalThis, 'setTimeout', () => { throw original; });
  const o = opening(x); await turns(); t.mock.restoreAll();
  assert.equal(o.result().status, 'rejected'); assert.equal(o.result().error, original);
  assert.equal(x.listeners.size, 0); assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
  await x.native.shutdownBluetooth(); assert.equal(x.events.includes('destroy'), true);
});
test('local abort registration and cleanup faults aggregate but do not imply SDK ownership', async t => {
  const x = await fixture(); const controller = new AbortController();
  t.mock.method(controller.signal, 'addEventListener', () => { throw undefined; });
  t.mock.method(controller.signal, 'removeEventListener', () => { throw false; });
  const o = opening(x, controller.signal); await turns(); t.mock.restoreAll();
  assert.equal(o.result().status, 'rejected');
  assert.ok(o.result().error instanceof AggregateError);
  assert.deepEqual((o.result().error as AggregateError).errors, [undefined, false]);
  assert.equal(x.listeners.size, 0); assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
  await x.native.shutdownBluetooth();
});
