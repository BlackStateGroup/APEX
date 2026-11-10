import test from 'node:test';
import assert from 'node:assert/strict';
import type { BleManager } from 'react-native-ble-plx';
import { flipperStatusPlxRadio } from '../src/flipper-status-plx.ts';
import { FLIPPER_ADVERTISEMENTS, FLIPPER_STATUS_FIELDS } from '../packages/core/flipper-status.ts';

test('actual PLX adapter uses exact advertised UUIDs, read allowlist and no characteristic writes', async () => {
  const calls: unknown[][] = []; let value = 'Nw==';
  const manager = {
    async state() { return 'PoweredOn'; },
    async startDeviceScan(...args: any[]) { calls.push(['scan', ...args.slice(0,2)]); args[2](null, { id: 'ios-id', localName: 'Test', name: 'Other', rssi: -42 }); },
    async stopDeviceScan() { calls.push(['stop']); },
    async connectToDevice(...args: any[]) { calls.push(['connect', ...args]); },
    async discoverAllServicesAndCharacteristicsForDevice(id: string) { calls.push(['discover', id]); },
    async servicesForDevice() { return [{ uuid: '180a' }]; },
    async readCharacteristicForDevice(...args: any[]) { calls.push(['read', ...args]); return { value }; },
    async cancelDeviceConnection(id: string) { calls.push(['disconnect', id]); },
    async isDeviceConnected() { return false; },
    onDeviceDisconnected() { return { remove() { calls.push(['unsubscribe']); } }; },
  };
  const radio = flipperStatusPlxRadio(manager as unknown as BleManager);
  assert.equal(await radio.state(), 'PoweredOn'); let found: unknown;
  await radio.scan((_error, candidate) => { found = candidate; });
  assert.deepEqual(calls[0], ['scan', [...FLIPPER_ADVERTISEMENTS], { allowDuplicates: false }]);
  assert.deepEqual(found, { id: 'ios-id', name: 'Test', rssi: -42 });
  await radio.stopScan(); await radio.connect('ios-id'); assert.deepEqual(await radio.discover('ios-id'), ['180a']);
  for (const field of FLIPPER_STATUS_FIELDS) await radio.read('ios-id', field);
  assert.deepEqual(calls.filter(c => c[0] === 'read'), FLIPPER_STATUS_FIELDS.map(f => ['read', 'ios-id', f.service, f.characteristic]));
  const before = calls.length;
  await assert.rejects(radio.read('ios-id', { ...FLIPPER_STATUS_FIELDS[0], characteristic: 'arbitrary' }), /allowlist/);
  assert.equal(calls.length, before);
  for (const bad of [null, '', '!!!!', 'Nw=', 'Nx==', 'A'.repeat(176)]) { value = bad as string; await assert.rejects(radio.read('ios-id', FLIPPER_STATUS_FIELDS[0]), /Malformed/); }
  radio.onDisconnect('ios-id', () => {})(); await radio.disconnect('ios-id'); assert.equal(await radio.isConnected('ios-id'), false);
});
test('readiness handles initial OS state and synchronous callback cleanup before resolving', async () => {
  for (const cleanupThrows of [false, true]) {
    let removed = 0;
    const radio = flipperStatusPlxRadio({ state: async () => 'Unknown', onStateChange(callback: (s: string) => void) {
      callback('PoweredOn'); return { remove() { removed++; if (cleanupThrows) throw new Error('remove failed'); } };
    } } as unknown as BleManager);
    if (cleanupThrows) await assert.rejects(radio.state(), /cleanup/); else assert.equal(await radio.state(), 'PoweredOn');
    assert.equal(removed, 1);
  }
});
