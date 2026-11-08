/** Installed PLX JS; synthetic RN/native scan events and promises only. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { environment, hooks, verifyInstalled, loaded } from './plx-facade-host/loader.ts';
import { createForegroundBleWorkbench } from '../src/foreground-ble-workbench.ts';
import { AXP_SERVICE, AXP_WRITE, AXP_NOTIFY } from '../packages/core/ble-transport.ts';
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const errorJSON = (reason: string) => JSON.stringify({ errorCode: 600, reason });
const traces: object[] = [];
let serial = 0;
function verifyInputs() {
  verifyInstalled();
  const pins = JSON.parse(readFileSync('verification/plx-ios-scan-void-current/inputs.sha256.json', 'utf8'));
  for (const [path, hash] of Object.entries(pins)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), hash, path);
}
before(verifyInputs);
after(() => {
  verifyInputs(); hooks.deregister(); delete (globalThis as any).__plxFacadeEnvironments;
  if (process.env.APEX_PLX_SCAN_EVIDENCE) {
    mkdirSync(process.env.APEX_PLX_SCAN_EVIDENCE, { recursive: true });
    writeFileSync(`${process.env.APEX_PLX_SCAN_EVIDENCE}/traces.json`, JSON.stringify({ scope: 'Installed PLX 3.5.1 ESM and exact native adapter/controller, synthetic RN/native only. No physical or native ordering evidence.', loaded: [...loaded].map(path => path.slice(path.indexOf('node_modules/'))), traces }, null, 2) + '\n');
  }
});
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function fixture(platform: 'android' | 'ios') {
  const id = `scan-${++serial}`, events: string[] = [], listeners = new Map<string, Set<(value: any) => void>>();
  const saved: ((value: any) => void)[] = [];
  const gates = new Map<string, ReturnType<typeof deferred>>();
  const failures = new Set<string>();
  const phase = async (name: string) => { events.push(name); if (gates.has(name)) await gates.get(name)!.promise; if (failures.has(name)) throw new Error(errorJSON(`${name} failed`)); };
  const device = (patch: object = {}) => ({ id: 'AXP', name: 'synthetic accessory', localName: 'fallback', rssi: -45, mtu: 23, ...patch });
  const emit = (value: any) => { for (const callback of [...listeners.get('ScanEvent') ?? []]) callback(value); };
  const nativeModule = {
    ScanEvent: 'ScanEvent', StateChangeEvent: 'StateChangeEvent', DisconnectionEvent: 'DisconnectionEvent',
    createClient(value: null) { assert.equal(value, null); events.push('create'); },
    async state() { await phase('state'); return 'PoweredOn'; },
    startDeviceScan(uuids: string[], options: object) { assert.equal(listeners.get('ScanEvent')?.size, 1); if (platform === 'ios') { events.push('start-void-dispatch'); return undefined; } return phase('start'); },
    stopDeviceScan() { assert.equal(listeners.get('ScanEvent')?.size, 0); if (platform === 'ios') { events.push('stop-void-dispatch'); return undefined; } return phase('stop'); },
    destroyClient() { if (platform === 'ios') { events.push('ios-destroy-no-ack'); return; } return phase('destroy'); },
    async isDeviceConnected(value: string) { assert.equal(value, 'AXP'); return false; },
    async connectToDevice(value: string) { assert.equal(value, 'AXP'); await phase('connect'); return device(); },
    async discoverAllServicesAndCharacteristicsForDevice() { await phase('discover'); return device(); },
    async servicesForDevice() { return [{ id: 1, uuid: AXP_SERVICE, deviceID: 'AXP', isPrimary: true }]; },
    async requestMTUForDevice() { await phase('mtu'); return device(); },
    async characteristicsForDevice() { return [{ uuid: AXP_WRITE, isWritableWithResponse: true }, { uuid: AXP_NOTIFY, isNotifiable: true }]; },
    async cancelDeviceConnection() { await phase('disconnect'); return device(); },
  };
  class Emitter {
    constructor(module: unknown) { assert.equal(module, nativeModule); }
    addListener(name: string, callback: (value: any) => void) {
      let set = listeners.get(name); if (!set) listeners.set(name, set = new Set()); set.add(callback);
      if (name === 'ScanEvent') saved.push(callback);
      return { remove() { set!.delete(callback); } };
    }
  }
  environment(id, { NativeModules: { BlePlx: nativeModule }, NativeEventEmitter: Emitter, Platform: { OS: platform, Version: 34 }, AppState: { currentState: 'active', addEventListener() { return { remove() {} }; } }, PermissionsAndroid: { PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect' }, RESULTS: { GRANTED: 'granted' }, async requestMultiple() { await phase('permissions'); return { scan: 'granted', connect: 'granted' }; } } });
  const native = await import(`../src/platform/bluetooth.native.ts?plx-case=${id}`);
  const values: any[] = [], ends: (Error | undefined)[] = [];
  traces.push({ id, platform, events, values, ends });
  return { native, events, values, ends, saved, listeners, emit, device,
    hold(name: string) { const gate = deferred(); gates.set(name, gate); return { release() { gates.delete(name); gate.resolve(); } }; },
    fail(name: string, yes = true) { if (yes) failures.add(name); else failures.delete(name); },
    async start() { const stop = await native.scanAccessories((value: unknown) => values.push(value), (error?: Error) => ends.push(error)); await turn(); return stop; },
  };
}

// No native completion callback exists in this boundary. The absence of an ack,
// not a simulated radio or native queue, is the assertion.
test('iOS void boundary: ordinary stop returns and next scan is allowed without native completion input', async () => {
  const f = await fixture('ios'); const stop = await f.start();
  await stop();
  assert.deepEqual(f.ends, [undefined]);
  assert.equal(f.listeners.get('ScanEvent')?.size, 0);
  assert.ok(f.events.includes('start-void-dispatch'));
  assert.ok(f.events.includes('stop-void-dispatch'));
  f.saved[0]!([null, f.device()]); assert.equal(f.values.length, 0);
  const next = await f.start(); await next();
  assert.equal(f.ends.length, 2);
});
test('iOS void boundary: connect dispatch follows JS scan stop settlement without native stop ack', async () => {
  const f = await fixture('ios'); const stop = await f.start();
  const connection = await f.native.bleDriver.connect('AXP');
  assert.ok(f.events.indexOf('stop-void-dispatch') < f.events.indexOf('connect'));
  assert.deepEqual(f.ends, [undefined]);
  await stop(); await connection.disconnect();
});
test('iOS void boundary: advertised-UUID controller publishes reusable true without native ack', async () => {
  const f = await fixture('ios'); let result: any;
  const session = f.native.startForegroundObservation({ serviceUuid: 'FCD2', receiptClock: () => '2026-11-08T00:00:00.000Z', onObservation() {}, onEnd(value: any) { result = value; } });
  await turn(); await session.stop();
  assert.equal(result.reusable, true); assert.equal(result.reason, 'stopped');
  assert.equal(result.error, undefined); assert.equal(f.listeners.get('ScanEvent')?.size, 0);
  assert.ok(f.events.includes('stop-void-dispatch'));
});
test('Android Promise boundary: genuine boundary promise remains a JS handoff gate', async () => {
  const f = await fixture('android'); const stop = await f.start(); const gate = f.hold('stop');
  const connecting = f.native.bleDriver.connect('AXP'); await turn();
  assert.ok(!f.events.includes('connect')); gate.release();
  const connection = await connecting; await stop(); await connection.disconnect();
});

test('iOS void boundary: exact workbench enables retained document inspection after JS-only stop', async () => {
  const f = await fixture('ios');
  const workbench = createForegroundBleWorkbench({ start: f.native.startForegroundObservation, canStart: () => true, clock: () => '2026-11-08T00:00:00.000Z', changed() {}, busy() {}, uncertainty() {} });
  workbench.start(); await turn();
  f.emit([null, f.device()]); assert.equal(workbench.state.items.length, 1);
  workbench.stop();
  assert.equal(workbench.state.message, 'Ending local collection and requesting SDK scan stop…');
  await turn();
  assert.equal(workbench.state.phase, 'idle'); assert.equal(workbench.state.uncertain, false);
  assert.equal(workbench.document(1), workbench.state.items[0]!.document);
  workbench.dispose();
});
