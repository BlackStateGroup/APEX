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
// Regression derived from the independent review reproduction: reset previously
// destroyed the singleton and admitted broad scanning with an old stop pending.
for (const kind of ['start', 'stop'] as const) {
  for (const outcome of ['resolve', 'reject'] as const) {
    test(`ordinary pending ${kind} (${outcome}) fences reset and exclusive scanning past timeout`, async () => {
      let resolve!: () => void; let reject!: (error: Error) => void;
      const gate = new Promise<void>((r, j) => { resolve = r; reject = j; });
      if (kind === 'start') startGate = gate;
      const values: unknown[] = [];
      const ordinaryStop = await native.scanAccessories(value => values.push(value), () => {});
      await tick(); const stale = scanCallback;
      if (kind === 'stop') stopGate = gate;
      const before = destroyCount;
      // For stop, shutdown enters with no pending effects and itself issues stop.
      // The second fence must catch that new operation after the core timeout.
      if (kind === 'stop') await assert.rejects(native.shutdownBluetooth(), /still pending/);
      else { await assert.rejects(native.shutdownBluetooth(), /busy/); await ordinaryStop(); }
      assert.equal(destroyCount, before);
      await assert.rejects(native.shutdownBluetooth(), /busy/);
      assert.throws(selected, /unknown|busy/);
      await assert.rejects(native.bleDriver.connect('AXP'), /unknown|busy/);
      stale(null, { id: 'late-old-callback' }); assert.equal(values.length, 0);
      if (outcome === 'resolve') resolve(); else reject(new Error('late native rejection'));
      startGate = stopGate = undefined; await tick(); await tick();
      // Settlement alone does not restore the poisoned core controller.
      assert.throws(selected, /unknown/);
      await native.shutdownBluetooth(); assert.equal(destroyCount, before + 1);
      const session = selected(); await tick(); assert.equal(filters.at(-1), null);
      stale(null, { id: 'stale-after-replacement' });
      assert.equal((await session.stop()).metrics.total, 0); assert.equal(values.length, 0);
    });
  }
}
