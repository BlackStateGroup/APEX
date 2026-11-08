/** Independent synthetic event-boundary review. No native builds, C, or radio. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { environment, hooks, verifyInstalled, loaded } from './plx-facade-host/loader.ts';
import { AXP_SERVICE } from '../packages/core/ble-transport.ts';

const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const scanError = JSON.stringify({ errorCode: 600, reason: 'independent scan failure' });
type Callback = (event: unknown[]) => void;
let serial = 0;
function verify() {
  verifyInstalled();
  const pins = JSON.parse(readFileSync('verification/plx-scan-facade-current/inputs.sha256.json', 'utf8'));
  for (const [path, hash] of Object.entries(pins)) {
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), hash, path);
  }
}
before(verify);
after(() => {
  verify();
  for (const name of ['BleManager', 'Device', 'BleError']) {
    assert.ok([...loaded].some(path => path.endsWith(`/lib/module/${name}.js`)), `${name} executed from installed ESM`);
  }
  hooks.deregister();
  delete (globalThis as any).__plxFacadeEnvironments;
});
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function fixture(platform: 'android' | 'ios', options: { stateGate?: Promise<void>; early?: 'data' | 'error'; startGate?: Promise<void> } = {}) {
  const id = `independent-scan-${++serial}`;
  const listeners = new Map<string, Set<Callback>>();
  const saved: Callback[] = [], events: string[] = [];
  const device = { id: 'independent-device', name: 'Early accessory', rssi: -62, mtu: 23 };
  const emit = (value: unknown[]) => { for (const fn of [...listeners.get('ScanEvent') ?? []]) fn(value); };
  const module = {
    ScanEvent: 'ScanEvent', StateChangeEvent: 'StateChangeEvent', DisconnectionEvent: 'DisconnectionEvent',
    createClient() { events.push('create'); },
    async state() { events.push('state'); await options.stateGate; return 'PoweredOn'; },
    async startDeviceScan(uuids: string[], flags: object) {
      assert.deepEqual(uuids, [AXP_SERVICE]);
      assert.deepEqual(flags, { allowDuplicates: false });
      assert.equal(listeners.get('ScanEvent')?.size, 1);
      events.push('start');
      if (options.early) emit(options.early === 'data' ? [null, device] : [scanError, null]);
      await options.startGate;
    },
    async stopDeviceScan() {
      assert.equal(listeners.get('ScanEvent')?.size, 0);
      events.push('stop');
    },
  };
  class Emitter {
    constructor(native: unknown) { assert.equal(native, module); }
    addListener(name: string, callback: Callback) {
      const set = listeners.get(name) ?? new Set<Callback>(); listeners.set(name, set); set.add(callback);
      if (name === 'ScanEvent') saved.push(callback);
      return { remove() { set.delete(callback); } };
    }
  }
  environment(id, {
    NativeModules: { BlePlx: module }, NativeEventEmitter: Emitter,
    Platform: { OS: platform, Version: 34 }, AppState: { currentState: 'active' },
    PermissionsAndroid: { PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect' }, RESULTS: { GRANTED: 'granted' }, async requestMultiple() { return { scan: 'granted', connect: 'granted' }; } },
  });
  const adapter = await import(`../src/platform/bluetooth.native.ts?plx-case=${id}`);
  const values: unknown[] = [], ends: (Error | undefined)[] = [];
  async function start() {
    const stop = await adapter.scanAccessories((value: unknown) => values.push(value), (error?: Error) => ends.push(error));
    await turn(); return stop;
  }
  return { start, adapter, values, ends, saved, events, listeners, emit, device };
}

for (const platform of ['android', 'ios'] as const) {
  test(`${platform}: synchronous event inside native start reaches installed listener before raw acknowledgement`, async () => {
    const gate = deferred(); const f = await fixture(platform, { early: 'data', startGate: gate.promise });
    const stop = await f.start();
    try {
      assert.deepEqual(f.values, [{ id: 'independent-device', name: 'Early accessory', rssi: -62 }]);
      assert.deepEqual(f.ends, []);
    } finally { gate.release(); await stop(); }
    assert.deepEqual(f.ends, [undefined]);
    assert.equal(f.listeners.get('ScanEvent')?.size, 0);
  });
  test(`${platform}: synchronous SDK error during held start ends once and waits for raw start`, async () => {
    const gate = deferred(); const f = await fixture(platform, { early: 'error', startGate: gate.promise });
    const stop = await f.start(); let complete = false;
    const stopping = stop().then(() => { complete = true; });
    try {
      await turn(); assert.equal(complete, false);
      assert.equal(f.listeners.get('ScanEvent')?.size, 0);
      await assert.rejects(f.adapter.scanAccessories(() => {}, () => {}), /busy/);
    } finally { gate.release(); await stopping; }
    assert.equal(f.ends.length, 1);
    assert.equal(f.ends[0]?.constructor.name, 'BleError');
    assert.equal((f.ends[0] as any).reason, 'independent scan failure');
    assert.equal(f.events.filter(event => event === 'stop').length, 2);
    assert.deepEqual(f.values, []);
  });
  test(`${platform}: cancellation during held readiness never issues native scan`, async () => {
    const gate = deferred(); const f = await fixture(platform, { stateGate: gate.promise });
    const stop = await f.start();
    try { assert.ok(f.events.includes('state')); await stop(); }
    finally { gate.release(); }
    await turn();
    assert.equal(f.events.includes('start'), false);
    assert.equal(f.saved.length, 0);
    assert.deepEqual(f.ends, [undefined]);
    const next = await f.start(); await next();
    assert.equal(f.events.filter(event => event === 'start').length, 1);
    assert.equal(f.ends.length, 2);
  });
  test(`${platform}: stale uncapped error and data cannot terminate or publish into replacement`, async () => {
    const f = await fixture(platform); const first = await f.start();
    f.emit([null, f.device]); await first();
    const second = await f.start();
    try {
      f.saved[0]!([scanError, null]); f.saved[0]!([null, { ...f.device, id: 'stale' }]);
      await first(); await turn();
      assert.equal(f.ends.length, 1);
      assert.equal(f.values.length, 1);
      assert.equal(f.listeners.get('ScanEvent')?.size, 1);
      assert.equal(f.events.filter(event => event === 'stop').length, 1);
      f.emit([null, { ...f.device, id: 'replacement' }]);
      assert.equal(f.values.length, 2);
      assert.equal((f.values[1] as any).id, 'replacement');
    } finally { await second(); }
    assert.deepEqual(f.ends, [undefined, undefined]);
    assert.equal(f.events.filter(event => event === 'stop').length, 2);
  });
}
