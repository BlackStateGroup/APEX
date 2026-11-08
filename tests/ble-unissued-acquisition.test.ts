/** Actual application TS with injected RN/PLX modules. Host proof, never radio proof. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { BleTransport, AXP_WRITE, AXP_NOTIFY } from '../packages/core/ble-transport.ts';
const tick = () => new Promise<void>(r => setImmediate(r));
function gate<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
let mocks: object, serial = 0;
(globalThis as any).__unissuedAcquisition = () => mocks;
const hooks = registerHooks({ resolve(name, context, next) {
  if (name === 'react-native' || name === 'react-native-ble-plx') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(`export const { ${name === 'react-native' ? 'Platform, PermissionsAndroid, AppState' : 'BleManager'} } = globalThis.__unissuedAcquisition(); // ${context.parentURL}`) };
  return next(name, context);
} });
after(() => { hooks.deregister(); delete (globalThis as any).__unissuedAcquisition; });
async function fixture(options: { version?: number; os?: string; holdReady?: boolean; connectError?: unknown; listenerError?: unknown; managerError?: unknown; stopError?: unknown; stopGate?: Promise<void>; readinessError?: unknown; readinessState?: string } = {}) {
  const permission = gate<Record<string,string>>(), entered = gate<void>(); const events: string[] = [];
  let ready: ((state: string) => void) | undefined;
  const device = { mtu: 23, async discoverAllServicesAndCharacteristics() { events.push('discover'); return device; }, async requestMTU() { events.push('mtu'); return device; }, async characteristicsForService() { events.push('characteristics'); return [{ uuid: AXP_WRITE, isWritableWithResponse: true }, { uuid: AXP_NOTIFY, isNotifiable: true }]; } };
  class BleManager {
    async state() { return 'Unknown'; }
    constructor() { events.push('manager'); if ('managerError' in options) throw options.managerError; }
    onStateChange(cb: (state: string) => void) { events.push('readiness'); ready = cb; if ('readinessError' in options) throw options.readinessError; if (!options.holdReady) cb(options.readinessState ?? 'PoweredOn'); return { remove() { events.push('remove-readiness'); } }; }
    onDeviceDisconnected() { events.push('listener'); if ('listenerError' in options) throw options.listenerError; return { remove() { events.push('remove-listener'); } }; }
    connectToDevice() { events.push('connect'); if ('connectError' in options) throw options.connectError; return Promise.resolve(device); }
    async cancelDeviceConnection() { events.push('cancel'); }
    async startDeviceScan() { events.push('scan-start'); }
    async stopDeviceScan() { events.push('scan-stop'); if ('stopError' in options) throw options.stopError; await options.stopGate; }
    async destroy() { events.push('destroy'); }
  }
  mocks = { BleManager, AppState: { currentState: 'active' }, Platform: { OS: options.os ?? 'android', Version: options.version ?? 34 }, PermissionsAndroid: { PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect', ACCESS_FINE_LOCATION: 'location' }, RESULTS: { GRANTED: 'granted' }, async requestMultiple() { events.push('permission'); entered.resolve(); return permission.promise; } } };
  const native = await import(`../src/platform/bluetooth.native.ts?unissued-acquisition=${++serial}`);
  const driver = native.bleDriver as any;
  return { native, driver, events, permission, entered: entered.promise, ready(state = 'PoweredOn') { ready?.(state); }, transport: new BleTransport(driver, 'AXP') };
}
const granted = { scan: 'granted', connect: 'granted', location: 'granted' };
const denied = { scan: 'denied', connect: 'denied', location: 'denied' };
for (const version of [30, 34]) for (const cancel of [false, true]) for (const grants of [granted, denied]) {
  if (!cancel && grants === granted) continue;
  test(`normal Android ${version} permission ${grants === granted ? 'grant' : 'denial'}${cancel ? ' after cancel' : ''} releases only after settlement`, async () => {
    const x = await fixture({version});
    const opening = x.transport.connect().catch(e => e); await x.entered;
    let closed = false;
    const closing = cancel ? x.transport.disconnect().then(() => { closed = true; }) : undefined;
    await tick(); assert.equal(closed, false); assert.equal(x.native.accessoryConnectionOwnership(), 'owned');
    x.permission.resolve(grants);
    assert.ok(await opening instanceof Error); await closing; await x.transport.disconnect();
    assert.deepEqual(x.events, ['permission']); assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
  });
}
async function cancelledAttempt(x: Awaited<ReturnType<typeof fixture>>, token: object = Object.freeze({}), id = 'AXP') {
  const abort = new AbortController(); abort.abort();
  const error = await x.driver.connect(id, abort.signal, token).catch((e: unknown) => e);
  return { token, id, error };
}
test('initial cancellation proves only the exact unique invocation and is one-shot', async () => {
  const x = await fixture(); const a = await cancelledAttempt(x);
  assert.equal(x.driver.consumeUnissuedConnection(a.token, a.id, a.error), true);
  assert.equal(x.driver.consumeUnissuedConnection(a.token, a.id, a.error), false);
  assert.deepEqual(x.events, []); assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
});
for (const mismatch of ['id', 'error', 'receiver', 'premature']) test(`native ${mismatch} query retires token without certifying`, async () => {
  const x = await fixture();
  if (mismatch === 'premature') {
    const token = Object.freeze({}); const opening = x.driver.connect('AXP', undefined, token).catch((e: unknown) => e); await x.entered;
    assert.equal(x.driver.consumeUnissuedConnection(token, 'AXP', new Error('Bluetooth permission denied')), false);
    x.permission.resolve(denied); const error = await opening;
    assert.equal(x.driver.consumeUnissuedConnection(token, 'AXP', error), false);
  } else {
    const a = await cancelledAttempt(x);
    const consume = x.driver.consumeUnissuedConnection;
    const result = consume.call(mismatch === 'receiver' ? {} : x.driver, a.token, mismatch === 'id' ? 'OTHER' : a.id, mismatch === 'error' ? Object.assign(new Error(a.error.message), a.error) : a.error);
    assert.equal(result, false);
    assert.equal(x.driver.consumeUnissuedConnection(a.token, a.id, a.error), false);
  }
});
test('copied token and fabricated error properties cannot claim native provenance', async () => {
  const x = await fixture(); const a = await cancelledAttempt(x);
  assert.equal(x.driver.consumeUnissuedConnection(Object.freeze({...a.token}), a.id, a.error), false);
  assert.equal(x.driver.consumeUnissuedConnection(Object.freeze({released: true}), a.id, Object.assign(new Error('Bluetooth preparation cancelled'), {released: true, unissued: true})), false);
  assert.equal(x.driver.consumeUnissuedConnection(a.token, a.id, a.error), true);
});
for (const when of ['before-consumption', 'after-consumption', 'concurrent']) test(`reusing token ${when} invalidates both invocations`, async () => {
  const x = await fixture(); const token = Object.freeze({});
  if (when === 'concurrent') {
    const first = x.driver.connect('AXP', undefined, token).catch((e: unknown) => e); await x.entered;
    const second = await cancelledAttempt(x, token, 'OTHER');
    assert.equal(x.driver.consumeUnissuedConnection(token, 'OTHER', second.error), false);
    assert.equal(x.native.accessoryConnectionOwnership(), 'owned');
    x.permission.resolve(denied); const error = await first;
    assert.equal(x.driver.consumeUnissuedConnection(token, 'AXP', error), false);
  } else {
    const first = await cancelledAttempt(x, token);
    if (when === 'after-consumption') assert.equal(x.driver.consumeUnissuedConnection(token, first.id, first.error), true);
    const second = await cancelledAttempt(x, token);
    assert.equal(x.driver.consumeUnissuedConnection(token, second.id, second.error), false);
    assert.equal(x.driver.consumeUnissuedConnection(token, first.id, first.error), false);
  }
});
for (const rejection of [new Error('Bluetooth permission denied'), Object.freeze({name:'AbortError', released:true}), 'Bluetooth preparation cancelled', null, undefined]) test(`unexpected permission rejection remains unknown with exact original ${String(rejection)}`, async () => {
  const x = await fixture(); const opening = x.transport.connect().catch(e => ({error:e})); await x.entered;
  x.permission.reject(rejection); const result = await opening;
  assert.ok(result && 'error' in result); assert.equal(result.error, rejection);
  await assert.rejects(x.transport.disconnect(), /unknown/); assert.deepEqual(x.events, ['permission']);
});
test('same rejection reused by later permission call cannot borrow initial cancellation proof', async () => {
  const x = await fixture(); const a = await cancelledAttempt(x);
  assert.equal(x.driver.consumeUnissuedConnection(a.token,a.id,a.error),true);
  const token = Object.freeze({}); const opening = x.driver.connect('AXP',undefined,token).catch((e:unknown)=>e); await x.entered;
  x.permission.reject(a.error); assert.equal(await opening,a.error);
  assert.equal(x.driver.consumeUnissuedConnection(token,'AXP',a.error),false);
});
for (const os of ['android','ios']) test(`${os} readiness cancellation remains unknown and late callbacks inert`, async () => {
  const x = await fixture({os,holdReady:true}); const opening = x.transport.connect().catch(e=>e);
  if(os==='android') { await x.entered; x.permission.resolve(granted); }
  await tick(); assert.ok(x.events.includes('readiness'));
  const closing = x.transport.disconnect().catch(e=>e); assert.ok(await opening instanceof Error); assert.match(String(await closing),/unknown/);
  const before = [...x.events]; x.ready(); await tick(); assert.deepEqual(x.events,before);
  assert.equal(x.events.includes('listener'),false); assert.equal(x.events.includes('connect'),false);
});
for (const phase of ['listenerError','connectError','managerError'] as const) test(`${phase} remains unknown even with successful native cancellation`, async () => {
  const error = new Error(`side effect ${phase}`); const x = await fixture({[phase]:error});
  const opening = x.transport.connect().catch(e=>e); await x.entered; x.permission.resolve(granted);
  const actual = await opening; if(phase!=='managerError') assert.equal(actual,error);
  await assert.rejects(x.transport.disconnect(),/unknown/);
  assert.equal(x.events.includes('cancel'),phase!=='managerError');
  if(phase==='managerError') { assert.equal(x.native.accessoryConnectionOwnership(),'unknown'); await assert.rejects(x.native.shutdownBluetooth(),/construction state unknown/); }
});
test('busy rejection does not release another preparation reservation', async () => {
  const x=await fixture(); const token=Object.freeze({}); const first=x.driver.connect('AXP',undefined,token).catch((e:unknown)=>e); await x.entered;
  const secondToken=Object.freeze({}); const second=await x.driver.connect('OTHER',undefined,secondToken).catch((e:unknown)=>e);
  assert.match(String(second),/busy/); assert.equal(x.driver.consumeUnissuedConnection(secondToken,'OTHER',second),false);
  assert.equal(x.native.accessoryConnectionOwnership(),'owned'); await assert.rejects(x.native.shutdownBluetooth(),/busy/);
  x.permission.resolve(denied); const error=await first; assert.equal(x.driver.consumeUnissuedConnection(token,'AXP',error),true);
});
test('scanner stop failure is not permission proof and preserves poisoned scanner', async () => {
  const error=new Error('scanner stop failed');const x=await fixture({stopError:error});
  await x.native.scanAccessories(()=>{},()=>{});await x.entered;x.permission.resolve(granted);await tick();assert.ok(x.events.includes('scan-start'));
  assert.equal(await x.transport.connect().catch(e=>e),error);
  await assert.rejects(x.transport.disconnect(),/unknown/);
  const before=[...x.events];await assert.rejects(x.native.bleDriver.connect('OTHER'),/unknown/);assert.deepEqual(x.events,before);
});
test('bounded scanner stop with unresolved raw effect retains global shutdown fence and stays unknown after late settlement', async () => {
  const raw=gate<void>();const x=await fixture({stopGate:raw.promise});
  await x.native.scanAccessories(()=>{},()=>{});await x.entered;x.permission.resolve(granted);await tick();assert.ok(x.events.includes('scan-start'));
  const error=await x.transport.connect().catch(e=>e);assert.match(String(error),/did not settle/);
  await assert.rejects(x.transport.disconnect(),/unknown/);await assert.rejects(x.native.shutdownBluetooth(),/busy/);
  assert.equal(x.events.includes('destroy'),false);assert.equal(x.events.includes('listener'),false);assert.equal(x.events.includes('connect'),false);
  raw.resolve();await tick();await assert.rejects(x.transport.disconnect(),/unknown/);await assert.rejects(x.native.bleDriver.connect('OTHER'),/unknown/);
});
for(const kind of ['partial-registration','readiness-state']) test(`${kind} remains unknown without entering connection section`,async()=>{
  const failure=new Error('readiness registration installed then threw');const x=await fixture(kind==='partial-registration'?{readinessError:failure}:{readinessState:'PoweredOff'});
  const opening=x.transport.connect().catch(e=>e);await x.entered;x.permission.resolve(granted);const error=await opening;
  if(kind==='partial-registration')assert.equal(error,failure);else assert.match(String(error),/poweredoff/);
  await assert.rejects(x.transport.disconnect(),/unknown/);const before=[...x.events];x.ready();await tick();assert.deepEqual(x.events,before);
  assert.equal(x.events.includes('listener'),false);assert.equal(x.events.includes('connect'),false);
});
test('duplicate identifier failure after successful manager preparation never certifies',async()=>{
  const x=await fixture();const first=x.driver.connect('AXP');await x.entered;x.permission.resolve(granted);const handle=await first;await handle.disconnect();
  const token=Object.freeze({});const rejection=await x.driver.connect('AXP',undefined,token).catch((e:unknown)=>e);
  assert.match(String(rejection),/already owned/);assert.equal(x.driver.consumeUnissuedConnection(token,'AXP',rejection),false);
  assert.equal(x.events.filter(e=>e==='connect').length,1);
});
for (const [name, grants] of Object.entries({
  missing: {}, partial: { scan: 'denied' }, unknown: { scan: 'unexpected', connect: 'granted' },
  inherited: Object.create(denied), accessor: { get scan() { return 'denied'; }, connect: 'granted' },
  skippedGetter: { scan: 'denied', get connect(): string { throw Error('unread getter'); } },
  array: Object.assign([], denied),
})) test(`malformed normal-result candidate ${name} preserves denial without receipt`, async () => {
  const x = await fixture(); const opening = x.transport.connect().catch(e => e); await x.entered;
  x.permission.resolve(grants as Record<string,string>);
  assert.match(String(await opening), /Bluetooth permission denied/);
  await assert.rejects(x.transport.disconnect(), /unknown/);
  assert.deepEqual(x.events, ['permission']);
});
test('normal never_ask_again data result certifies denial', async () => {
  const x = await fixture(); const opening = x.transport.connect().catch(e => e); await x.entered;
  x.permission.resolve({ scan: 'never_ask_again', connect: 'granted' });
  assert.match(String(await opening), /permission denied/); await x.transport.disconnect();
  assert.deepEqual(x.events, ['permission']);
});
