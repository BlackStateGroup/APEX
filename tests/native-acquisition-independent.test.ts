/** Independent actual-adapter review. JS fakes only; no native runtime or radio. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { BleTransport, AXP_WRITE, AXP_NOTIFY } from '../packages/core/ble-transport.ts';
const tick = () => new Promise<void>(r => setImmediate(r));
function gate() { let release!: () => void; const promise = new Promise<void>(r => { release = r; }); return { promise, release }; }
let mocks: object, serial = 0;
(globalThis as any).__independentAcquisition = () => mocks;
const hooks = registerHooks({ resolve(name, context, next) {
  if (name === 'react-native' || name === 'react-native-ble-plx') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(`export const { ${name === 'react-native' ? 'Platform, PermissionsAndroid, AppState' : 'BleManager'} } = globalThis.__independentAcquisition(); // ${context.parentURL}`) };
  return next(name, context);
} });
after(() => { hooks.deregister(); delete (globalThis as any).__independentAcquisition; });
async function fixture(stage: string, failCancel = false) {
  const hold = gate(), entered = gate(); const events: string[] = [];
  const effect = async (name: string) => { events.push(name); if (stage === name) { entered.release(); await hold.promise; } };
  let ready: ((state: string) => void) | undefined;
  let disconnect: (() => void) | undefined;
  const device = { mtu: 23,
    async discoverAllServicesAndCharacteristics() { await effect('discover'); return device; },
    async requestMTU() { await effect('mtu'); return device; },
    async characteristicsForService() { await effect('characteristics'); return [{ uuid: AXP_WRITE, isWritableWithResponse: true }, { uuid: AXP_NOTIFY, isNotifiable: true }]; },
  };
  class BleManager {
    async state() { return 'Unknown'; }
    constructor() { events.push('manager'); }
    onStateChange(cb: (state: string) => void) { events.push('readiness'); ready = cb; if (stage === 'readiness') entered.release(); else cb('PoweredOn'); return { remove() { events.push('remove-readiness'); } }; }
    onDeviceDisconnected(_id: string, cb: () => void) { disconnect = cb; return { remove() { events.push('remove-disconnect'); } }; }
    async connectToDevice() { await effect('connect'); return device; }
    async cancelDeviceConnection() { events.push('cancel'); if (failCancel) throw new Error('independent cancel failed'); disconnect?.(); }
    async destroy() { events.push('destroy'); }
  }
  mocks = { BleManager, AppState: { currentState: 'active' }, Platform: { OS: 'android', Version: 34 }, PermissionsAndroid: { PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect' }, RESULTS: { GRANTED: 'granted' }, async requestMultiple() { await effect('permission'); return { scan: 'granted', connect: 'granted' }; } } };
  const native = await import(`../src/platform/bluetooth.native.ts?independent-acquisition=${++serial}`);
  const transport = new BleTransport(native.bleDriver, 'AXP');
  return { native, transport, events, entered: entered.promise, release() { hold.release(); ready?.('PoweredOn'); }, stale() { disconnect?.(); } };
}
for (const stage of ['permission', 'readiness', 'connect', 'discover', 'mtu', 'characteristics']) test(`independent close at ${stage} prevents subsequent acquisition effects`, async () => {
  const x = await fixture(stage);
  const opening = x.transport.connect().then(() => undefined, e => e);
  await x.entered; let settled = false;
  const closing = x.transport.disconnect().then(() => { settled = true; }, () => { settled = true; });
  await tick();
  if (stage !== 'readiness') assert.equal(settled, false, 'issued operation must settle before cleanup finishes');
  const atClose = x.events.filter(e => ['permission','manager','readiness','connect','discover','mtu','characteristics'].includes(e));
  x.release(); assert.ok(await opening instanceof Error); await closing;
  assert.deepEqual(x.events.filter(e => ['permission','manager','readiness','connect','discover','mtu','characteristics'].includes(e)), atClose);
  assert.equal(x.events.filter(e => e === 'cancel').length, ['permission','readiness'].includes(stage) ? 0 : 1);
  assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
  x.stale(); assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
  // Only normally settled pre-manager Android permission cancellation is certified.
  if (stage === 'permission') await x.transport.disconnect();
  else await assert.rejects(x.transport.disconnect(), /unknown/);
});
test('independent failed native cancellation retains unknown ownership and original errors', async () => {
  const x = await fixture('connect', true);
  const opening = x.transport.connect().catch(e => e); await x.entered;
  const closing = x.transport.disconnect().catch(e => e); x.release();
  const failure = await opening; assert.ok(failure instanceof AggregateError);
  assert.match(String(failure.errors[1]), /independent cancel failed/); await closing;
  assert.equal(x.native.accessoryConnectionOwnership(), 'unknown');
  await assert.rejects(x.native.bleDriver.connect('other'), /unknown/);
  await assert.rejects(x.transport.disconnect(), /unknown/);
  assert.equal(x.events.filter(e => e === 'cancel').length, 1);
});
test('independent immediate close before dispatch issues no driver effect and releases', async () => {
  let calls = 0;
  const transport = new BleTransport({ async connect() { calls++; throw new Error('must not execute'); } }, 'never-issued');
  const opening = assert.rejects(transport.connect(), /cancelled/);
  const closing = transport.disconnect();
  await Promise.all([opening, closing]); assert.equal(calls, 0);
  await transport.disconnect();
});
test('independent issued optional-signal-ignoring driver retains exact late handle through failed cleanup', async () => {
  const entered = gate(), release = gate(); let count = 0, aborted: AbortSignal | undefined;
  const handle = { mtu: 23, async subscribe() { throw new Error('must not subscribe'); }, async writeWithResponse() {}, async disconnect() { count++; if (count === 1) throw new Error('late handle cleanup failed'); } };
  const transport = new BleTransport({ async connect(_id, signal) { aborted = signal; entered.release(); await release.promise; return handle; } }, 'issued');
  const opening = assert.rejects(transport.connect(), /cancelled/); await entered.promise;
  const closing = assert.rejects(transport.disconnect(), /late handle cleanup failed/);
  assert.equal(aborted?.aborted, true); await tick(); assert.equal(count, 0);
  release.release(); await Promise.all([opening, closing]); assert.equal(count, 1);
  await transport.disconnect(); assert.equal(count, 2);
});
