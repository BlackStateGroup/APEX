/** Executes only injected JS mocks. No React Native runtime, permission request, or radio. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { AXP_SERVICE, AXP_NOTIFY, AXP_WRITE } from '../packages/core/ble-transport.ts';
import type { ScanResult } from '../packages/core/ble-scan-session.ts';
let scanCallback: (error: Error | null, device?: object) => void;
let stateListener: ((state: string) => void) | undefined;
let filters: string[][] = []; const duplicatePolicies: boolean[] = []; let stopCount = 0; let connects = 0; let writes = 0; let removes = 0;
let permission = async () => ({ scan: 'granted', connect: 'granted' });
const appState = { currentState: 'active', addEventListener(_event: string, cb: (state: string) => void) { stateListener = cb; return { remove() { stateListener = undefined; removes++; } }; } };
const disconnectCallbacks: { id: string; callback: (error: Error | null) => void; removed: boolean }[] = [];
let synchronousDisconnect = false;
let cancelFailure = false; let cancelCount = 0; let cancelGate: Promise<void> | undefined; let closeDuringCancel = false;
let characteristicFailure = false; let mtuFailure = false; let notificationRemoves = 0;
const closeNative = (id = 'AXP') => { for (const item of [...disconnectCallbacks]) if (item.id === id && !item.removed) item.callback(null); };
let connectGate: Promise<void> | undefined; let discoveryGate: Promise<void> | undefined;
let stopFailure = false; let destroyFailure = false; let destroyCount = 0; let discoveryCount = 0;
const device = { id: 'AXP', mtu: 185, discoverAllServicesAndCharacteristics: async () => { discoveryCount++; await discoveryGate; return device; }, requestMTU: async () => { if (mtuFailure) throw new Error('MTU rejected'); return device; },
  characteristicsForService: async () => { if (characteristicFailure) throw new Error('characteristics rejected'); return [{ uuid: AXP_WRITE, isWritableWithResponse: true }, { uuid: AXP_NOTIFY, isNotifiable: true }]; },
  monitorCharacteristicForService: () => ({ remove() { notificationRemoves++; } }),
  writeCharacteristicWithResponseForService: async () => { writes++; },
};
let preparationState: ((callback: (state: string) => void) => void) | undefined;
class FakeManager {
  async state() { return 'Unknown'; }
  onStateChange(callback: (state: string) => void) { if (preparationState) preparationState(callback); else callback('PoweredOn'); return { remove() {} }; }
  async startDeviceScan(uuids: string[], options: { allowDuplicates: boolean }, callback: typeof scanCallback) { filters.push(uuids); duplicatePolicies.push(options.allowDuplicates); scanCallback = callback; }
  async stopDeviceScan() { stopCount++; if (stopFailure) throw new Error('stop rejected'); }
  async destroy() { destroyCount++; if (destroyFailure) throw new Error('destroy rejected'); }
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
test('native wrappers use one lease, preserve AXP filter and connect/write behavior, never connect for observations', async () => {
  const ends: ScanResult[] = []; const values: unknown[] = [];
  const observation = native.startForegroundObservation(options(ends, values)); await tick();
  assert.deepEqual(filters.at(-1), ['0000fcd2-0000-1000-8000-00805f9b34fb']); assert.equal(duplicatePolicies.at(-1), true);
  await assert.rejects(native.scanAccessories(() => {}, () => {}), /busy/);
  scanCallback(null, { id: 'source', rawScanRecord: 'AgEG' }); assert.equal(values.length, 1); assert.equal(connects, 0); assert.equal(writes, 0);
  stateListener!('inactive'); await tick(); assert.equal(ends.length, 0);
  stateListener!('active'); scanCallback(null, { id: 'source', rawScanRecord: 'AgEG' }); assert.equal(values.length, 2);
  stateListener!('background'); await observation.done; scanCallback(null, { id: 'late' });
  assert.equal(values.length, 2); assert.equal(ends.length, 1); assert.equal(ends[0]!.reason, 'background'); assert.equal(stateListener, undefined);
  const candidates: any[] = []; const axpEnds: unknown[] = [];
  const stop = await native.scanAccessories(value => candidates.push(value), error => axpEnds.push(error)); await tick();
  assert.deepEqual(filters.at(-1), [AXP_SERVICE]); assert.equal(duplicatePolicies.at(-1), false); scanCallback(null, { id: 'AXP', name: 'x'.repeat(200), rssi: -50 });
  assert.equal(candidates[0].name.length, 128); assert.equal(candidates[0].rssi, -50);
  const connection = await native.bleDriver.connect('AXP'); assert.equal(axpEnds.length, 1); assert.equal(connects, 1);
  await connection.writeWithResponse(new Uint8Array([1])); assert.equal(writes, 1); await connection.disconnect(); await stop();
  await native.shutdownBluetooth();
});
test('native permission cancellation never starts later and invalid/oversize source fails without invented bytes', async () => {
  let grant!: (value: { scan: string; connect: string }) => void;
  permission = () => new Promise(r => { grant = r; });
  const before = filters.length; const ends: ScanResult[] = [];
  const session = native.startForegroundObservation(options(ends)); await session.stop();
  grant({ scan: 'granted', connect: 'granted' }); await tick(); assert.equal(filters.length, before); assert.equal(ends.length, 1);
  permission = async () => ({ scan: 'granted', connect: 'granted' });
  const values: unknown[] = []; const failed = native.startForegroundObservation(options(ends, values)); await tick();
  scanCallback(null, { rawScanRecord: 'not base64' }); assert.equal((await failed.done).reason, 'error'); assert.equal(values.length, 0);
  await native.shutdownBluetooth();
});
test('foreground validation and single AXP error callback', async () => {
  const before = filters.length;
  appState.currentState = 'background'; assert.throws(() => native.startForegroundObservation(options([])), /foreground/); appState.currentState = 'active';
  assert.throws(() => native.startForegroundObservation({ ...options([]), serviceUuid: '180D' as 'FCD2' }), /Select/);
  assert.equal(filters.length, before);
  const ends: unknown[] = []; const stop = await native.scanAccessories(() => {}, error => ends.push(error)); await tick();
  scanCallback(new Error('failure')); await tick(); await stop(); assert.equal(ends.length, 1); assert.match(String(ends[0]), /failure/);
  assert.ok(stopCount >= 3); assert.ok(removes >= 3); await native.shutdownBluetooth();
});
test('first iOS permission sheet inactive/active preserves preparation, while real background cancels', async () => {
  const platform = (globalThis as any).__apexBluetoothMocks.Platform;
  platform.OS = 'ios'; let ready!: (state: string) => void;
  preparationState = callback => { ready = callback; appState.currentState = 'inactive'; stateListener!('inactive'); };
  const ends: ScanResult[] = []; const before = filters.length;
  const session = native.startForegroundObservation(options(ends)); await tick();
  assert.equal(ends.length, 0); assert.equal(filters.length, before);
  appState.currentState = 'active'; stateListener!('active'); ready('PoweredOn'); await tick();
  assert.equal(filters.length, before + 1); assert.equal(ends.length, 0);
  appState.currentState = 'background'; stateListener!('background'); assert.equal((await session.done).reason, 'background');
  preparationState = undefined; platform.OS = 'android'; appState.currentState = 'active'; await native.shutdownBluetooth();
});
test('poisoned manager blocks connect, both scans and existing writes until successful destruction', async () => {
  const existing = await native.bleDriver.connect('AXP');
  const session = native.startForegroundObservation(options([])); await tick(); stopFailure = true;
  assert.equal((await session.stop()).reason, 'error'); const before = connects; const beforeWrites = writes;
  await assert.rejects(native.bleDriver.connect('AXP'), /state unknown/);
  await assert.rejects(native.scanAccessories(() => {}, () => {}), /state unknown/);
  assert.throws(() => native.startForegroundObservation(options([])), /state unknown/);
  await assert.rejects(existing.writeWithResponse(new Uint8Array([1])), /state unknown/);
  assert.equal(connects, before); assert.equal(writes, beforeWrites);
  destroyFailure = true; await assert.rejects(native.shutdownBluetooth(), /destroy rejected/);
  await assert.rejects(native.bleDriver.connect('AXP'), /state unknown/);
  destroyFailure = false; stopFailure = false; await native.shutdownBluetooth();
  const fresh = await native.bleDriver.connect('AXP'); await fresh.writeWithResponse(new Uint8Array([2]));
  await assert.rejects(existing.writeWithResponse(new Uint8Array([3])), /unavailable manager/);
  await fresh.disconnect(); await native.shutdownBluetooth();
});
test('connection setup lease spans pending connect and discovery and forbids reset or overlapping work', async () => {
  let allowConnect!: () => void; let allowDiscovery!: () => void;
  connectGate = new Promise(r => { allowConnect = r; }); discoveryGate = new Promise(r => { allowDiscovery = r; });
  const beforeDestroy = destroyCount; const beforeDiscovery = discoveryCount;
  const pending = native.bleDriver.connect('AXP'); await tick();
  for (const stage of ['connect', 'discovery']) {
    await assert.rejects(native.shutdownBluetooth(), /busy/);
    await assert.rejects(native.bleDriver.connect('AXP'), /busy/);
    await assert.rejects(native.scanAccessories(() => {}, () => {}), /busy/);
    assert.throws(() => native.startForegroundObservation(options([])), /busy/);
    assert.equal(destroyCount, beforeDestroy);
    if (stage === 'connect') { assert.equal(discoveryCount, beforeDiscovery); allowConnect(); await tick(); }
  }
  assert.equal(discoveryCount, beforeDiscovery + 1); allowDiscovery(); const connection = await pending;
  connectGate = undefined; discoveryGate = undefined;
  await native.shutdownBluetooth(); const beforeWrites = writes;
  await assert.rejects(connection.writeWithResponse(new Uint8Array([1])), /unavailable manager/);
  assert.equal(writes, beforeWrites);
});
test('failed connect or discovery releases the setup lease without allowing stale work', async () => {
  for (const stage of ['connect', 'discovery']) {
    let reject!: (error: Error) => void; const gate = new Promise<void>((_resolve, r) => { reject = r; });
    if (stage === 'connect') connectGate = gate; else discoveryGate = gate;
    const pending = native.bleDriver.connect('AXP'); const rejection = assert.rejects(pending, /setup failed/);
    await tick(); reject(new Error('setup failed')); await rejection;
    connectGate = undefined; discoveryGate = undefined;
    await native.shutdownBluetooth();
    const connection = await native.bleDriver.connect('AXP'); await connection.disconnect(); await native.shutdownBluetooth();
  }
});
test('all connection handles retain ownership and lifecycle listeners survive notification unsubscribe', async () => {
  const first = await native.bleDriver.connect('AXP');
  const second = await native.bleDriver.connect('OTHER');
  assert.equal(native.accessoryConnectionOwnership(), 'owned');
  let closes = 0;
  const unsubscribe = await first.subscribe(() => {}, () => { closes++; });
  unsubscribe();
  closeNative();
  assert.equal(closes, 0);
  assert.equal(native.accessoryConnectionOwnership(), 'owned');
  await assert.rejects(first.subscribe(() => {}, () => {}), /disconnected/);
  await assert.rejects(first.writeWithResponse(new Uint8Array([1])), /disconnected/);
  const again = await native.bleDriver.connect('AXP'); await again.disconnect(); closeNative();
  await second.disconnect(); closeNative('OTHER');
  assert.equal(native.accessoryConnectionOwnership(), 'idle');
  assert.ok(disconnectCallbacks.every(item => item.removed));
  await native.shutdownBluetooth();
});
test('native close delivers once and removes notification subscriptions independently of the caller', async () => {
  const connection = await native.bleDriver.connect('AXP'); let closes = 0;
  const before = notificationRemoves;
  const unsubscribe = await connection.subscribe(() => {}, () => { closes++; });
  const stale = disconnectCallbacks.at(-1)!.callback;
  closeNative(); stale(null); unsubscribe(); unsubscribe();
  assert.equal(closes, 1); assert.equal(notificationRemoves, before + 1);
  assert.equal(native.accessoryConnectionOwnership(), 'idle');
  await assert.rejects(connection.writeWithResponse(new Uint8Array([1])), /disconnected/);
  await native.shutdownBluetooth();
});
test('identical close callbacks retain independent notification subscription lifetimes', async () => {
  const connection = await native.bleDriver.connect('AXP'); let closes = 0;
  const onClosed = () => { closes++; };
  const first = await connection.subscribe(() => {}, onClosed);
  const second = await connection.subscribe(() => {}, onClosed);
  first(); closeNative(); assert.equal(closes, 1); second();
  await native.shutdownBluetooth();
  const next = await native.bleDriver.connect('AXP');
  await next.subscribe(() => {}, onClosed); await next.subscribe(() => {}, onClosed);
  closeNative(); assert.equal(closes, 3);
  await native.shutdownBluetooth();
});
test('Android reconnect waits for both cancellation settlement and terminal event consumption', async () => {
  const first = await native.bleDriver.connect('AXP'); const stale = disconnectCallbacks.at(-1)!.callback;
  await first.disconnect();
  assert.equal(native.accessoryConnectionOwnership(), 'idle');
  await assert.rejects(native.bleDriver.connect('AXP'), /shut down Bluetooth/);
  closeNative();
  const second = await native.bleDriver.connect('AXP'); stale(null);
  assert.equal(native.accessoryConnectionOwnership(), 'owned');
  await second.writeWithResponse(new Uint8Array([1])); await second.disconnect();
  await native.shutdownBluetooth();
});
test('iOS successful connection uses consumed single-terminal monitor and settled-cancel fence', async () => {
  const platform = (globalThis as any).__apexBluetoothMocks.Platform; platform.OS = 'ios';
  const first = await native.bleDriver.connect('AXP'); const stale = disconnectCallbacks.at(-1)!.callback;
  await first.disconnect(); await assert.rejects(native.bleDriver.connect('AXP'), /shut down Bluetooth/);
  closeNative();
  const next = await native.bleDriver.connect('AXP'); stale(null);
  assert.equal(native.accessoryConnectionOwnership(), 'owned');
  closeNative();
  const fresh = await native.bleDriver.connect('AXP'); await fresh.disconnect();
  // End the iOS connection-fence simulation; Android mock teardown resets this test module.
  platform.OS = 'android'; await native.shutdownBluetooth();
});
test('failed startup cancellation retains unknown ownership until native close or destruction', async () => {
  for (const stage of ['connect', 'discovery', 'characteristics']) {
    let reject!: (error: Error) => void;
    const gate = new Promise<void>((_resolve, r) => { reject = r; });
    if (stage === 'connect') connectGate = gate;
    else if (stage === 'discovery') discoveryGate = gate;
    else characteristicFailure = true;
    cancelFailure = true;
    const pending = native.bleDriver.connect('AXP');
    const rejected = assert.rejects(pending, /cancellation failed/);
    await tick(); if (stage !== 'characteristics') reject(new Error('startup rejected'));
    await rejected;
    connectGate = discoveryGate = undefined; characteristicFailure = false;
    assert.equal(native.accessoryConnectionOwnership(), 'unknown');
    await assert.rejects(native.bleDriver.connect('OTHER'), /state unknown/);
    await assert.rejects(native.scanAccessories(() => {}, () => {}), /state unknown/);
    assert.throws(() => native.startForegroundObservation(options([])), /state unknown/);
    closeNative(); assert.equal(native.accessoryConnectionOwnership(), 'idle');
    cancelFailure = false; await native.shutdownBluetooth();
  }
});
test('characteristic failure cancels, optional MTU rejection preserves normal writes', async () => {
  characteristicFailure = true; const before = cancelCount;
  await assert.rejects(native.bleDriver.connect('AXP'), /characteristics rejected/);
  assert.equal(cancelCount, before + 1); assert.equal(native.accessoryConnectionOwnership(), 'idle');
  characteristicFailure = false; await native.shutdownBluetooth();
  mtuFailure = true; const connection = await native.bleDriver.connect('AXP');
  await connection.writeWithResponse(new Uint8Array([1])); await connection.disconnect();
  mtuFailure = false; await native.shutdownBluetooth();
});
test('failed explicit disconnect is unknown, retryable, and a late native close releases ownership', async () => {
  const connection = await native.bleDriver.connect('AXP'); let closes = 0;
  await connection.subscribe(() => {}, () => { closes++; });
  cancelFailure = true;
  await assert.rejects(connection.disconnect(), /cancel rejected/);
  assert.equal(native.accessoryConnectionOwnership(), 'unknown');
  await assert.rejects(connection.writeWithResponse(new Uint8Array([1])), /state unknown/);
  closeNative(); assert.equal(native.accessoryConnectionOwnership(), 'idle'); assert.equal(closes, 0);
  const before = cancelCount; await connection.disconnect(); assert.equal(cancelCount, before);
  cancelFailure = false; await native.shutdownBluetooth();
  const retry = await native.bleDriver.connect('AXP'); cancelFailure = true;
  await assert.rejects(retry.disconnect(), /cancel rejected/); cancelFailure = false;
  await retry.disconnect(); assert.equal(native.accessoryConnectionOwnership(), 'idle');
  await native.shutdownBluetooth();
});
test('native close during cancellation cannot release the in-flight operation; repeated disconnect coalesces', async () => {
  const connection = await native.bleDriver.connect('AXP');
  let finish!: () => void; cancelGate = new Promise(r => { finish = r; }); closeDuringCancel = true;
  const before = cancelCount; const a = connection.disconnect(); const b = connection.disconnect(); await tick();
  assert.equal(cancelCount, before + 1); assert.equal(native.accessoryConnectionOwnership(), 'owned');
  await assert.rejects(native.shutdownBluetooth(), /busy/);
  cancelFailure = true; const rejectedA = assert.rejects(a, /cancel rejected/); const rejectedB = assert.rejects(b, /cancel rejected/);
  finish(); await Promise.all([rejectedA, rejectedB]);
  assert.equal(native.accessoryConnectionOwnership(), 'idle');
  cancelGate = undefined; cancelFailure = closeDuringCancel = false;
  await connection.disconnect(); await native.shutdownBluetooth();
});
test('native close before subscribe is remembered and stale callbacks cannot release a new epoch', async () => {
  const old = await native.bleDriver.connect('AXP'); const oldCallback = disconnectCallbacks.at(-1)!.callback;
  closeNative(); await assert.rejects(old.subscribe(() => {}, () => {}), /disconnected/);
  await native.shutdownBluetooth(); const fresh = await native.bleDriver.connect('AXP');
  oldCallback(null); assert.equal(native.accessoryConnectionOwnership(), 'owned');
  const before = cancelCount; await assert.rejects(old.disconnect(), /unavailable manager/); assert.equal(cancelCount, before);
  await fresh.disconnect(); await native.shutdownBluetooth();
});
test('disconnect during pending connect or synchronous registration requires settled startup cleanup', async () => {
  for (const synchronous of [false, true]) {
    synchronousDisconnect = synchronous;
    let finish!: () => void; connectGate = new Promise(r => { finish = r; });
    const pending = native.bleDriver.connect('AXP'); const rejected = assert.rejects(pending, /cancellation failed/);
    await tick(); if (!synchronous) closeNative();
    assert.equal(native.accessoryConnectionOwnership(), 'owned');
    await assert.rejects(native.shutdownBluetooth(), /busy/);
    cancelFailure = true; finish(); await rejected;
    assert.equal(native.accessoryConnectionOwnership(), 'unknown');
    connectGate = undefined; synchronousDisconnect = cancelFailure = false;
    destroyFailure = true; await assert.rejects(native.shutdownBluetooth(), /destroy rejected/);
    assert.equal(native.accessoryConnectionOwnership(), 'unknown');
    destroyFailure = false; await native.shutdownBluetooth();
    assert.equal(native.accessoryConnectionOwnership(), 'idle');
  }
});
test.after(() => { hooks.deregister(); delete (globalThis as any).__apexBluetoothMocks; });
