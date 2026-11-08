/** Installed PLX JS; synthetic RN/native scan events and promises only. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { environment, hooks, verifyInstalled, loaded } from './plx-facade-host/loader.ts';
import { AXP_SERVICE, AXP_WRITE, AXP_NOTIFY } from '../packages/core/ble-transport.ts';
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const errorJSON = (reason: string) => JSON.stringify({ errorCode: 600, reason });
const traces: object[] = [];
let serial = 0;
function verifyInputs() {
  verifyInstalled();
  const pins = JSON.parse(readFileSync('verification/plx-scan-facade-current/inputs.sha256.json', 'utf8'));
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
    async startDeviceScan(uuids: string[], options: object) { assert.deepEqual(uuids, [AXP_SERVICE]); assert.deepEqual(options, { allowDuplicates: false }); assert.equal(listeners.get('ScanEvent')?.size, 1); await phase('start'); },
    async stopDeviceScan() { assert.equal(listeners.get('ScanEvent')?.size, 0); await phase('stop'); },
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
  environment(id, { NativeModules: { BlePlx: nativeModule }, NativeEventEmitter: Emitter, Platform: { OS: platform, Version: 34 }, AppState: { currentState: 'active' }, PermissionsAndroid: { PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect' }, RESULTS: { GRANTED: 'granted' }, async requestMultiple() { await phase('permissions'); return { scan: 'granted', connect: 'granted' }; } } });
  const native = await import(`../src/platform/bluetooth.native.ts?plx-case=${id}`);
  const values: any[] = [], ends: (Error | undefined)[] = [];
  traces.push({ id, platform, events, values, ends });
  return { native, events, values, ends, saved, listeners, emit, device,
    hold(name: string) { const gate = deferred(); gates.set(name, gate); return { release() { gates.delete(name); gate.resolve(); } }; },
    fail(name: string, yes = true) { if (yes) failures.add(name); else failures.delete(name); },
    async start() { const stop = await native.scanAccessories((value: unknown) => values.push(value), (error?: Error) => ends.push(error)); await turn(); return stop; },
  };
}

for (const platform of ['android', 'ios'] as const) {
  test(`${platform}: exact AXP filter, real Device conversion, 100 callback cap and late event fencing`, async () => {
    const f = await fixture(platform); const stop = await f.start();
    f.emit([null, f.device({ name: 'n'.repeat(200) })]);
    f.emit([null, f.device({ name: null, localName: 'local' })]);
    f.emit([null, f.device({ name: null, localName: null })]);
    for (let n = 3; n < 105; n++) f.emit([null, f.device()]);
    await stop(); assert.equal(f.values.length, 100); assert.equal(f.values[0].name.length, 128);
    assert.equal(f.values[1].name, 'local'); assert.equal(f.values[2].name, 'AXP accessory');
    assert.deepEqual(Object.keys(f.values[0]), ['id', 'name', 'rssi']);
    f.saved[0]!([null, f.device({ id: 'late' })]); f.saved[0]!([errorJSON('late error'), null]);
    assert.equal(f.values.length, 100); assert.deepEqual(f.ends, [undefined]); assert.equal(f.listeners.get('ScanEvent')?.size, 0);
    const stops = f.events.filter(e => e === 'stop').length; await stop(); assert.equal(f.events.filter(e => e === 'stop').length, stops);
  });
  test(`${platform}: absent native device ignored and oversized projected candidate ends before publication`, async () => {
    const f = await fixture(platform); const stop = await f.start();
    f.emit([null, null]); assert.equal(f.values.length, 0);
    f.emit([null, f.device({ id: 'x'.repeat(409601) })]); await stop();
    assert.equal(f.values.length, 0); assert.deepEqual(f.ends, [undefined]);
    assert.equal(f.listeners.get('ScanEvent')?.size, 0);
    const next = await f.start(); f.emit([null, f.device()]); assert.equal(f.values.length, 1); await next();
  });
  test(`${platform}: cancel pending start, remove listener immediately, await raw start before replacement`, async () => {
    const f = await fixture(platform), gate = f.hold('start'); const stop = await f.start();
    assert.ok(f.events.includes('start')); let completed = false; const stopped = stop().then(() => { completed = true; }); await turn();
    assert.equal(f.listeners.get('ScanEvent')?.size, 0); assert.equal(completed, false);
    await assert.rejects(f.native.scanAccessories(() => {}, () => {}), /busy/);
    await assert.rejects(f.native.shutdownBluetooth(), /busy/);
    f.saved[0]!([null, f.device()]); assert.equal(f.values.length, 0);
    gate.release(); await stopped; assert.equal(f.events.filter(e => e === 'stop').length, 2);
    const next = await f.start(); await stop(); f.saved[0]!([null, f.device()]); assert.equal(f.values.length, 0);
    f.emit([null, f.device()]); assert.equal(f.values.length, 1); await next(); assert.equal(f.ends.length, 2);
  });
  test(`${platform}: stop acknowledgement gates connection handoff and fences stale callbacks`, async () => {
    const f = await fixture(platform); const stop = await f.start(); const gate = f.hold('stop');
    const connecting = f.native.bleDriver.connect('AXP'); await turn();
    assert.ok(f.events.includes('stop')); assert.ok(!f.events.includes('connect'));
    await assert.rejects(f.native.scanAccessories(() => {}, () => {}), /busy/);
    f.saved[0]!([null, f.device()]); assert.equal(f.values.length, 0);
    gate.release(); const connection = await connecting; assert.ok(f.events.indexOf('stop') < f.events.indexOf('connect'));
    assert.equal(f.ends.length, 1); await stop(); await connection.disconnect(); assert.equal(f.native.accessoryConnectionOwnership(), 'idle');
  });
  test(`${platform}: ScanEvent error converted by actual SDK and stops once`, async () => {
    const f = await fixture(platform); const stop = await f.start(); f.emit([errorJSON('scan event failed'), null]); await stop();
    assert.equal(f.ends.length, 1); assert.equal(f.ends[0]?.constructor.name, 'BleError'); assert.equal((f.ends[0] as any).errorCode, 600); assert.equal((f.ends[0] as any).reason, 'scan event failed');
    const next = await f.start(); await next();
  });
  test(`${platform}: native start rejection converts error and cleans listener before next scan`, async () => {
    const f = await fixture(platform); f.fail('start'); const stop = await f.start(); await stop();
    assert.equal(f.ends[0]?.constructor.name, 'BleError'); assert.equal((f.ends[0] as any).reason, 'start failed'); assert.equal(f.listeners.get('ScanEvent')?.size, 0);
    f.fail('start', false); const next = await f.start(); await next();
  });
  test(`${platform}: native stop rejection converts error and poisons replacement`, async () => {
    const f = await fixture(platform); const stop = await f.start(); f.fail('stop'); await stop();
    assert.equal(f.ends[0]?.constructor.name, 'BleError'); assert.equal((f.ends[0] as any).reason, 'stop failed'); assert.equal(f.listeners.get('ScanEvent')?.size, 0);
    await assert.rejects(f.native.scanAccessories(() => {}, () => {}), /unknown/);
    await assert.rejects(f.native.bleDriver.connect('AXP'), /unknown/); assert.ok(!f.events.includes('connect'));
  });
}

test('Android preparation cancellation never dispatches a late start after permission returns', async () => {
  const f = await fixture('android'), gate = f.hold('permissions'); const stop = await f.start(); await stop(); gate.release(); await turn();
  assert.deepEqual(f.ends, [undefined]); assert.ok(!f.events.includes('create')); assert.ok(!f.events.includes('start'));
});
for (const phase of ['start', 'stop'] as const) test(`raw ${phase} held beyond controller grace prevents manager replacement`, async () => {
  const f = await fixture('android'), gate = f.hold(phase); const stop = await f.start(); await stop();
  assert.match(f.ends[0]!.message, /did not settle/); assert.equal(f.ends.length, 1);
  await assert.rejects(f.native.scanAccessories(() => {}, () => {}), /unknown/);
  await assert.rejects(f.native.shutdownBluetooth(), /busy/); assert.ok(!f.events.includes('destroy'));
  f.saved[0]!([null, f.device()]); assert.equal(f.values.length, 0);
  gate.release(); await turn(); await f.native.shutdownBluetooth(); assert.equal(f.events.filter(e => e === 'destroy').length, 1);
  const next = await f.start(); await stop(); assert.equal(f.listeners.get('ScanEvent')?.size, 1); await next();
});
test('two isolated case owners preserve their own actual SDK singleton and listeners', async () => {
  const a = await fixture('android'), b = await fixture('ios');
  const stopB = await b.start(), stopA = await a.start();
  a.emit([null, a.device({ name: 'A' })]); b.emit([null, b.device({ name: 'B' })]);
  assert.equal(a.values[0].name, 'A'); assert.equal(b.values[0].name, 'B');
  await stopA(); await a.native.shutdownBluetooth();
  b.emit([null, b.device({ name: 'still B' })]); assert.equal(b.values.length, 2); assert.equal(b.listeners.get('ScanEvent')?.size, 1); await stopB();
});
