/** Executes only injected JS mocks. No React Native runtime, permission request, or radio. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { AXP_SERVICE, AXP_NOTIFY, AXP_WRITE } from '../packages/core/ble-transport.ts';
import type { ScanResult } from '../packages/core/ble-scan-session.ts';
let scanCallback: (error: Error | null, device?: object) => void;
let stateListener: ((state: string) => void) | undefined;
let filters: (string[] | null)[] = []; const duplicatePolicies: boolean[] = []; let stopCount = 0; let connects = 0; let writes = 0; let removes = 0;
let permission = async () => ({ scan: 'granted', connect: 'granted' });
const appState = { currentState: 'active', addEventListener(_event: string, cb: (state: string) => void) { stateListener = cb; return { remove() { stateListener = undefined; removes++; } }; } };
const disconnectCallbacks: { id: string; callback: (error: Error | null) => void; removed: boolean }[] = [];
let synchronousDisconnect = false;
let cancelFailure = false; let cancelCount = 0; let cancelGate: Promise<void> | undefined; let closeDuringCancel = false;
let characteristicFailure = false; let mtuFailure = false; let notificationRemoves = 0;
const closeNative = (id = 'AXP') => { for (const item of [...disconnectCallbacks]) if (item.id === id && !item.removed) item.callback(null); };
let writeGate: Promise<void> | undefined;
let connectGate: Promise<void> | undefined; let discoveryGate: Promise<void> | undefined;
let stopFailure = false; let destroyFailure = false; let destroyCount = 0; let discoveryCount = 0;
const device = { id: 'AXP', mtu: 185, discoverAllServicesAndCharacteristics: async () => { discoveryCount++; await discoveryGate; return device; }, requestMTU: async () => { if (mtuFailure) throw new Error('MTU rejected'); return device; },
  characteristicsForService: async () => { if (characteristicFailure) throw new Error('characteristics rejected'); return [{ uuid: AXP_WRITE, isWritableWithResponse: true }, { uuid: AXP_NOTIFY, isNotifiable: true }]; },
  monitorCharacteristicForService: () => ({ remove() { notificationRemoves++; } }),
  writeCharacteristicWithResponseForService: async () => { writes++; await writeGate; },
};
let preparationState: ((callback: (state: string) => void) => void) | undefined;
let startGate: Promise<void> | undefined; let stopGate: Promise<void> | undefined; let destroyGate: Promise<void> | undefined;
let synchronousScan: (() => void) | undefined;
let constructorFailure = false;
class FakeManager {
  async state() { return 'Unknown'; }
  constructor() { if (constructorFailure) throw new Error('partial constructor'); }
  onStateChange(callback: (state: string) => void) { if (preparationState) preparationState(callback); else callback('PoweredOn'); return { remove() {} }; }
  async startDeviceScan(uuids: string[] | null, options: { allowDuplicates: boolean }, callback: typeof scanCallback) { filters.push(uuids); duplicatePolicies.push(options.allowDuplicates); scanCallback = callback; synchronousScan?.(); await startGate; }
  async stopDeviceScan() { stopCount++; await stopGate; if (stopFailure) throw new Error('stop rejected'); }
  async destroy() { destroyCount++; await destroyGate; if (destroyFailure) throw new Error('destroy rejected'); }
  async connectToDevice() { connects++; await connectGate; return device; }
  onDeviceDisconnected(id: string, callback: (error: Error | null) => void) {
    const item = { id, callback, removed: false }; disconnectCallbacks.push(item);
    if (synchronousDisconnect) callback(null);
    return { remove() { item.removed = true; } };
  }
  async cancelDeviceConnection(id: string) { cancelCount++; if (closeDuringCancel) closeNative(id); await cancelGate; if (cancelFailure) throw new Error('cancel rejected'); }
}
(globalThis as any).__apexBluetoothMocks = { AppState: appState, Platform: { OS: 'android', Version: 34 }, PermissionsAndroid: {
  PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect' }, RESULTS: { GRANTED: 'granted' }, requestMultiple: () => permission(),
}, BleManager: FakeManager };
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'react-native' || specifier === 'react-native-ble-plx') {
    const names = specifier === 'react-native' ? 'AppState, Platform, PermissionsAndroid' : 'BleManager';
    return { url: `data:text/javascript,${encodeURIComponent(`export const { ${names} } = globalThis.__apexBluetoothMocks;`)}`, shortCircuit: true };
  }
  return next(specifier, context);
} });
const native = await import('../src/platform/bluetooth.native.ts');
const tick = () => new Promise<void>(r => setImmediate(r));
const options = (ends: ScanResult[], values: unknown[] = []) => ({ serviceUuid: 'FCD2' as const, receiptClock: () => '2026-11-07T00:00:00.000Z', onObservation: (value: unknown) => values.push(value), onEnd: (end: ScanResult) => ends.push(end) });

const selected = () => native.startSelectedServiceDataObservation({ service: 'FCD2', receiptClock: () => '2026-11-08T00:00:00.000Z' });
test('reservation is synchronous, broad duplicates only for explicit mode, matching then destruction', async () => {
  const session = selected();
  assert.throws(selected, /busy/);
  await assert.rejects(native.scanAccessories(() => {}, () => {}), /busy/);
  await assert.rejects(native.bleDriver.connect('AXP'), /busy/);
  await assert.rejects(native.shutdownBluetooth(), /busy/);
  await tick(); assert.equal(filters.at(-1), null); assert.equal(duplicatePolicies.at(-1), true);
  const before = destroyCount;
  scanCallback(null, { rawScanRecord: 'BBbS/AA=' });
  const result = await session.stop();
  assert.equal(result.metrics.match, 1); assert.equal(result.observations.length, 1); assert.equal(result.reusable, true);
  assert.equal(destroyCount, before + 1);
  const callbacks = result.metrics.total; scanCallback(null, { rawScanRecord: 'BBbS/AA=' }); assert.equal(result.metrics.total, callbacks);
  const normal = await native.scanAccessories(() => {}, () => {}); await tick(); assert.deepEqual(filters.at(-1), [AXP_SERVICE]); await normal(); await native.shutdownBluetooth();
});
test('busy ordinary scan, owned connection and unknown cancellation reject exclusive mode', async () => {
  const stop = await native.scanAccessories(() => {}, () => {}); await tick(); assert.throws(selected, /busy/); await stop();
  const connection = await native.bleDriver.connect('AXP'); assert.throws(selected, /busy/);
  cancelFailure = true; await assert.rejects(connection.disconnect()); assert.throws(selected, /unknown/);
  cancelFailure = false; await connection.disconnect(); await native.shutdownBluetooth();
});
test('permission cancellation reserves until delayed permission settles and never starts', async () => {
  let grant!: (value: {scan: string; connect: string}) => void;
  permission = () => new Promise(r => { grant = r; });
  const before = filters.length; const session = selected(); await tick(); const stopping = session.stop();
  assert.throws(selected, /busy/); await assert.rejects(native.shutdownBluetooth(), /busy/);
  grant({scan: 'granted', connect: 'granted'}); assert.equal((await stopping).reusable, true); assert.equal(filters.length, before);
  permission = async () => ({scan: 'granted', connect: 'granted'});
});
test('immediate stop before deferred acquisition releases reservation without permissions', async () => {
  let calls = 0; permission = async () => { calls++; return {scan: 'granted', connect: 'granted'}; };
  const session = selected(); await session.stop(); assert.equal(calls, 0);
  permission = async () => ({scan: 'granted', connect: 'granted'});
  const next = selected(); await tick(); await next.stop();
});
test('denied permission certifies no acquisition and background/inactive rules', async () => {
  permission = async () => ({scan: 'denied', connect: 'denied'});
  const denied = await selected().done; assert.equal(denied.reason, 'ownership-unavailable'); assert.equal(denied.reusable, true);
  permission = async () => ({scan: 'granted', connect: 'granted'});
  appState.currentState = 'inactive'; assert.throws(selected, /foreground/); appState.currentState = 'active';
  const session = selected(); await tick(); stateListener!('inactive'); await tick(); assert.throws(selected, /busy/);
  stateListener!('background'); assert.equal((await session.done).reason, 'background'); assert.equal(stateListener, undefined);
});
test('synchronous callbacks exhaust callback budget and still stop/destroy once', async () => {
  synchronousScan = () => { for (let i = 0; i < 120; i++) scanCallback(null, { rawScanRecord: 'AgEG' }); };
  const before = destroyCount; const result = await selected().done;
  assert.equal(result.reason, 'callback-budget'); assert.equal(result.metrics.total, 100); assert.equal(result.metrics.noMatch, 100); assert.equal(result.reusable, true); assert.equal(destroyCount, before + 1);
  synchronousScan = undefined;
});
test('pending start blocks shutdown and destruction until final start settlement', async () => {
  let resolve!: () => void; startGate = new Promise(r => { resolve = r; });
  const before = destroyCount; const session = selected(); await tick(); const stopping = session.stop(); await tick();
  assert.equal(destroyCount, before); await assert.rejects(native.shutdownBluetooth(), /busy/); assert.throws(selected, /busy/);
  resolve(); startGate = undefined; assert.equal((await stopping).reusable, true); assert.equal(destroyCount, before + 1);
});
test('failed stop still destroys but reports nonreusable; failed destroy requires explicit recovery', async () => {
  const first = selected(); await tick(); stopFailure = true; const stopped = await first.stop(); assert.equal(stopped.reusable, false); stopFailure = false;
  const second = selected(); await tick(); destroyFailure = true; const failed = await second.stop(); assert.equal(failed.reusable, false);
  assert.throws(selected, /busy/); await assert.rejects(native.shutdownBluetooth(), /destroy rejected/);
  destroyFailure = false; await native.shutdownBluetooth(); const next = selected(); await tick(); await next.stop();
});
test('hung stop timeout never releases; late settlement safely finishes destruction', async () => {
  let resolve!: () => void; stopGate = new Promise(r => { resolve = r; });
  const session = selected(); await tick(); const before = destroyCount;
  const result = await session.stop(); assert.equal(result.reusable, false); assert.equal(destroyCount, before);
  assert.throws(selected, /busy/); await assert.rejects(native.shutdownBluetooth(), /busy/);
  resolve(); stopGate = undefined; await tick(); await tick(); assert.equal(destroyCount, before + 1);
  const next = selected(); await tick(); await next.stop(); assert.equal(result.reusable, false);
});
test('hung destruction timeout holds singleton; late success releases without rewriting result', async () => {
  let resolve!: () => void; destroyGate = new Promise(r => { resolve = r; });
  const session = selected(); await tick(); const result = await session.stop(); assert.equal(result.reusable, false);
  assert.throws(selected, /busy/); await assert.rejects(native.shutdownBluetooth(), /busy/);
  resolve(); destroyGate = undefined; await tick(); const next = selected(); await tick(); await next.stop(); assert.equal(result.reusable, false);
});

test('closed connection with unsettled write still fences broad acquisition and destruction', async () => {
  const connection = await native.bleDriver.connect('AXP');
  let resolve!: () => void; writeGate = new Promise(r => { resolve = r; });
  const writing = connection.writeWithResponse(new Uint8Array([1])); closeNative();
  assert.equal(native.accessoryConnectionOwnership(), 'idle');
  assert.throws(selected, /busy/); await assert.rejects(native.shutdownBluetooth(), /busy/);
  resolve(); writeGate = undefined; await writing;
  const next = selected(); await tick(); await next.stop();
});
test('readiness failure destroys Android manager; iOS rejects before preparation', async () => {
  const before = destroyCount; preparationState = callback => callback('PoweredOff');
  const failed = await selected().done; assert.equal(failed.reason, 'ownership-unavailable'); assert.equal(destroyCount, before + 1); preparationState = undefined;
  const platform = (globalThis as any).__apexBluetoothMocks.Platform; platform.OS = 'ios';
  const scans = filters.length; assert.throws(selected, /iOS destruction acknowledgement unavailable/); assert.equal(filters.length, scans); platform.OS = 'android';
});
test('late start settlement after timeout only cleans old owner, never starts replacement', async () => {
  let resolve!: () => void; startGate = new Promise(r => { resolve = r; });
  const session = selected(); await tick(); const callback = scanCallback; const before = destroyCount;
  const result = await session.stop(); assert.equal(result.reusable, false); assert.equal(destroyCount, before);
  await assert.rejects(native.shutdownBluetooth(), /busy/); assert.throws(selected, /busy/);
  resolve(); startGate = undefined; await tick(); await tick(); assert.equal(destroyCount, before + 1);
  const next = selected(); await tick(); callback(null, { rawScanRecord: 'BBbS/AA=' }); assert.equal((await next.stop()).metrics.total, 0);
});

test('hung permission keeps quarantine past done until late no-effect cleanup', async () => {
  let grant!: (value: {scan: string; connect: string}) => void;
  permission = () => new Promise(r => { grant = r; });
  const before = filters.length; const session = selected(); await tick();
  const result = await session.stop(); assert.equal(result.reusable, false);
  assert.throws(selected, /busy/); await assert.rejects(native.shutdownBluetooth(), /busy/);
  grant({scan: 'granted', connect: 'granted'}); await tick(); await tick(); assert.equal(filters.length, before);
  permission = async () => ({scan: 'granted', connect: 'granted'});
  const next = selected(); await tick(); await next.stop(); assert.equal(result.reusable, false);
});

test('start rejection after native entry still stops and destroys', async () => {
  synchronousScan = () => { throw new Error('start rejected'); };
  const before = destroyCount; const result = await selected().done;
  assert.equal(result.reason, 'backend-error'); assert.equal(destroyCount, before + 1); synchronousScan = undefined;
});
test('constructor throw cannot masquerade as no native ownership', async () => {
  const isolated = await import('../src/platform/' + 'bluetooth.native.ts?constructor-quarantine');
  constructorFailure = true;
  const result = await isolated.startSelectedServiceDataObservation({service: 'FCD2', receiptClock: () => '2026-11-08T00:00:00.000Z'}).done;
  assert.equal(result.reusable, false); assert.equal(result.reason, 'backend-error');
  await assert.rejects(isolated.shutdownBluetooth(), /construction state unknown/);
  assert.throws(() => isolated.startSelectedServiceDataObservation({service: 'FCD2', receiptClock: () => ''}), /busy/);
  constructorFailure = false;
});
test('iOS void destruction never certifies teardown or permits manager reuse; empty shutdown is safe', async () => {
  const platform = (globalThis as any).__apexBluetoothMocks.Platform; platform.OS = 'ios';
  await native.shutdownBluetooth();
  const connection = await native.bleDriver.connect('AXP'); const before = destroyCount;
  await assert.rejects(native.shutdownBluetooth(), /iOS Bluetooth teardown is unacknowledged/);
  assert.equal(destroyCount, before + 1); assert.equal(native.accessoryConnectionOwnership(), 'unknown');
  await assert.rejects(connection.writeWithResponse(new Uint8Array([1])), /state unknown/);
  await assert.rejects(native.bleDriver.connect('OTHER'), /state unknown/);
  await assert.rejects(native.scanAccessories(() => {}, () => {}), /state unknown/);
});
