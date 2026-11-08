import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { environment, hooks, verifyInstalled } from './loader.ts';
import { bridge } from '../browser-c-host/bridge.ts';
import { BleTransport, AXP_SERVICE, AXP_WRITE, AXP_NOTIFY } from '../../packages/core/ble-transport.ts';
import { DeviceSession } from '../../packages/core/session.ts';
const dir = mkdtempSync(join(tmpdir(), 'apex-plx-facade-'));
export const binary = join(dir, 'bridge');
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const errorJSON = (code: number, reason: string) => JSON.stringify({ errorCode: code, reason });
before(() => {
  verifyInstalled();
  const pins = JSON.parse(readFileSync('tests/browser-c-host/current-inputs.sha256.json', 'utf8'));
  for (const [path, hash] of Object.entries(pins)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), hash, path);
  const result = spawnSync('gcc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-Wno-misleading-indentation', '-DCONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=1', '-DESP_PLATFORM', '-Itests/esp32-reviewed-host/fakes', '-Ifirmware/core', '-Ifirmware/esp32s3/main', 'tests/browser-c-host/bridge.c', 'firmware/core/apex.c', '-o', binary], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});
after(() => { verifyInstalled(); hooks.deregister(); rmSync(dir, { recursive: true, force: true }); delete (globalThis as any).__plxFacadeEnvironments; });
let serial = 0;
export async function fixture(platform: 'android' | 'ios', mtu: 23 | 517, permissionResult?: () => Record<string, string>) {
  const id = String(++serial), events: string[] = [], listeners = new Map<string, Set<(value: any) => void>>();
  const emit = (event: string, value: any) => { for (const callback of [...listeners.get(event) ?? []]) callback(value); };
  class SyntheticNativeEventEmitter {
    constructor(module: unknown) { assert.equal(module, nativeModule); }
    addListener(name: string, callback: (value: any) => void) {
      let set = listeners.get(name); if (!set) listeners.set(name, set = new Set()); set.add(callback);
      return { remove() { set!.delete(callback); } };
    }
  }
  const gates = new Map<string, { entered(): void; promise: Promise<void> }>();
  const phase = async (name: string) => { events.push(name); const gate = gates.get(name); if (gate) { gate.entered(); await gate.promise; } };
  let reportedMtu = platform === 'android' ? 23 : mtu;
  const device = () => ({ id: 'AXP', mtu: reportedMtu, name: 'synthetic C peer' });
  const characteristic = (uuid: string, value: string | null = null) => ({ id: uuid === AXP_NOTIFY ? 2 : 1, uuid, deviceID: 'AXP', serviceID: 1, serviceUUID: AXP_SERVICE, isWritableWithResponse: uuid === AXP_WRITE, isNotifiable: uuid === AXP_NOTIFY, value });
  let transaction = '', monitorResolve = () => {}, monitorReject = (_error: Error) => {};
  let holdCancel = false, cancelFailure = false;
  const f = bridge(binary, mtu, bytes => emit('ReadEvent', [null, characteristic(AXP_NOTIFY, Buffer.from(bytes).toString('base64')), transaction]));
  // These are synthetic native boundaries, not an implementation of either native stack.
  const common = {
    ReadEvent: 'ReadEvent', DisconnectionEvent: 'DisconnectionEvent', StateChangeEvent: 'StateChangeEvent',
    createClient(value: null) { assert.equal(value, null); events.push('create'); },
    async isDeviceConnected(value: string) { assert.equal(value, "AXP"); return false; },
    async state() { await phase('readiness'); return 'PoweredOn'; }, async stopDeviceScan() {},
    async connectToDevice(value: string) { assert.equal(value, 'AXP'); await phase('connect'); return device(); },
    async discoverAllServicesAndCharacteristicsForDevice(value: string, tx: string) { assert.equal(value, 'AXP'); assert.equal(typeof tx, 'string'); await phase('discover'); return device(); },
    async servicesForDevice(value: string) { assert.equal(value,"AXP"); return [{ id: 1, uuid: AXP_SERVICE, deviceID: "AXP", isPrimary: true }]; },
    async characteristicsForDevice(value: string, service: string) { assert.equal(value, 'AXP'); assert.equal(service, AXP_SERVICE); await phase('characteristics'); return [characteristic(AXP_WRITE), characteristic(AXP_NOTIFY)]; },
    async writeCharacteristicForDevice(value: string, service: string, uuid: string, base64: string, response: boolean, tx: string) {
      assert.deepEqual([value,service,uuid,response], ['AXP',AXP_SERVICE,AXP_WRITE,true]); assert.equal(typeof tx, 'string'); assert.notEqual(tx, transaction);
      const bytes = Buffer.from(base64, 'base64'); assert.equal(bytes.toString('base64'), base64); assert.ok(bytes.length <= Math.min(mtu - 3, 244));
      await phase('write');
      const result = await f.command('W ' + bytes.toString('hex'), 'plx-client-write');
      if (result[0]) throw new Error(errorJSON(401, 'C ATT rejection ' + result[0]));
      return characteristic(AXP_WRITE, base64);
    },
    monitorCharacteristicForDevice(...args: any[]) {
      assert.equal(args.length, platform === 'ios' ? 4 : 5); assert.deepEqual(args.slice(0,3), ['AXP', AXP_SERVICE, AXP_NOTIFY]);
      transaction = args[3]; assert.equal(typeof transaction, 'string'); events.push('monitor:' + transaction);
      const promise = new Promise<void>((resolve, reject) => { monitorResolve = resolve; monitorReject = reject; });
      void phase('monitor-ready').then(() => f.command('SUBSCRIBE')).catch(monitorReject); return promise;
    },
    async cancelTransaction(tx: string) { assert.equal(tx, transaction); events.push('cancelTransaction'); if (!holdCancel) monitorReject(new Error(errorJSON(2, 'synthetic cancellation'))); },
    async cancelDeviceConnection(value: string) {
      assert.equal(value, 'AXP'); await phase('cancelDevice'); if (cancelFailure) throw new Error(errorJSON(201, 'synthetic cancellation failed'));
      await f.command('CLOSE'); emit('DisconnectionEvent', [null, device()]); return device();
    },
  };
  // Distinct platform models: Android Promise acknowledgment; iOS void return.
  const nativeModule = platform === 'android' ? { ...common,
    async requestMTUForDevice(value: string, requested: number, tx: string) { assert.equal(value,'AXP'); assert.equal(requested,185); assert.equal(typeof tx,'string'); await phase('mtu'); reportedMtu = mtu; return device(); },
    async destroyClient() { events.push('android-destroy-ack'); },
  } : { ...common, destroyClient() { events.push('ios-destroy-dispatched-no-ack'); } };
  environment(id, { NativeModules: { BlePlx: nativeModule }, NativeEventEmitter: SyntheticNativeEventEmitter, Platform: { OS: platform, Version: 34 }, AppState: { currentState: 'active' }, PermissionsAndroid: { PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect' }, RESULTS: { GRANTED: 'granted' }, async requestMultiple() { await phase('permissions'); return permissionResult ? permissionResult() : { scan: 'granted', connect: 'granted' }; } } });
  const native = await import(`../../src/platform/bluetooth.native.ts?plx-case=${id}`);
  const transport = new BleTransport(native.bleDriver, 'AXP', { timeoutMs: 1500 });
  const session = new DeviceSession(transport, { timeoutMs: 2500 });
  return { f, native, transport, session, events, listeners, emit, characteristic, device,
    hold(name: string) { let release!: () => void, notify!: () => void; const promise = new Promise<void>(r => { release = r; }); const entered = new Promise<void>(r => { notify = r; }); gates.set(name, { entered: notify, promise }); return { entered, release() { gates.delete(name); release(); } }; },
    transaction: () => transaction, holdMonitorCancellation() { holdCancel = true; }, settleMonitor: () => monitorResolve(),
    failMonitor: () => monitorReject(new Error(errorJSON(201, 'monitor failed'))), failCancel: (value: boolean) => { cancelFailure = value; },
    async finish(managedSession = session, unknown = false) { try { if (unknown) await assert.rejects(managedSession.close(), /release unknown/); else await managedSession.close(); } finally { monitorResolve(); await turn(); await f.dispose(); if (process.env.APEX_PLX_EVIDENCE) { mkdirSync(process.env.APEX_PLX_EVIDENCE, { recursive: true }); writeFileSync(join(process.env.APEX_PLX_EVIDENCE, `${id}-${platform}-${mtu}.json`), JSON.stringify({ scope: 'Installed PLX published ESM; synthetic RN/native events and promises; C data callbacks only. No native ordering, ABI, radio or startup proof.', platform, mtu, events, trace: f.trace }, null, 2) + '\n'); } } },
  };
}
