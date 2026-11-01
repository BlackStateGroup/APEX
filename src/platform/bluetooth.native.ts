import { PermissionsAndroid, Platform } from 'react-native';
import { fromByteArray, toByteArray } from 'base64-js';
import type { BleManager, Subscription } from 'react-native-ble-plx';
import { AXP_NOTIFY, AXP_SERVICE, AXP_WRITE } from '../../packages/core/ble-transport.ts';
import type { BleCandidate, BleDriver } from '../../packages/core/ble-transport.ts';

let manager: BleManager | null = null;
let loading: Promise<BleManager> | null = null;
let stopScan: (() => Promise<void>) | null = null;
async function getManager(): Promise<BleManager> {
  if (manager) return manager;
  loading ??= import('react-native-ble-plx').then(module => { manager = new module.BleManager(); return manager; }).catch(() => { loading = null; throw new Error('Install an APEX development build with Bluetooth support'); });
  return loading;
}
async function prepare(): Promise<BleManager> {
  if (Platform.OS === 'android') {
    const required = Number(Platform.Version) >= 31 ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const grants = await PermissionsAndroid.requestMultiple(required);
    if (required.some(permission => grants[permission] !== PermissionsAndroid.RESULTS.GRANTED)) throw new Error('Bluetooth permission denied');
  }
  const ble = await getManager();
  await new Promise<void>((resolve, reject) => {
    let subscription: Subscription | undefined; let settled = false;
    const timer = setTimeout(() => finish(new Error('Bluetooth did not become ready')), 10000);
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); subscription?.remove(); if (error) reject(error); else resolve(); };
    subscription = ble.onStateChange(state => {
      if (state === 'PoweredOn') finish();
      else if (state === 'Unauthorized' || state === 'Unsupported' || state === 'PoweredOff') finish(new Error(`Bluetooth ${state.toLowerCase()}`));
    }, true);
    if (settled) subscription.remove();
  });
  return ble;
}

export async function scanAccessories(onDevice: (device: BleCandidate) => void, onEnd: (error?: Error) => void): Promise<() => Promise<void>> {
  await stopScan?.();
  const ble = await prepare(); let active = true;
  let timer: ReturnType<typeof setTimeout>;
  const stop = async () => {
    if (!active) return; active = false; clearTimeout(timer); stopScan = null; await ble.stopDeviceScan(); onEnd();
  };
  stopScan = stop; timer = setTimeout(() => { void stop().catch(onEnd); }, 10000);
  try {
    await ble.startDeviceScan([AXP_SERVICE], { allowDuplicates: false }, (error, device) => {
      if (!active) return;
      if (error) { void stop().then(() => onEnd(error)).catch(onEnd); return; }
      if (device) onDevice({ id: device.id, name: device.name ?? device.localName ?? 'AXP accessory', rssi: device.rssi });
    });
  } catch (error) { await stop(); throw error; }
  return stop;
}

export const bleDriver: BleDriver = {
  async connect(id) {
    await stopScan?.(); const ble = await prepare();
    let device = await ble.connectToDevice(id, { timeout: 10000 });
    try {
      device = await device.discoverAllServicesAndCharacteristics();
      if (Platform.OS === 'android') { try { device = await device.requestMTU(185); } catch { /* use actual negotiated MTU */ } }
      const characteristics = await device.characteristicsForService(AXP_SERVICE);
      if (!characteristics.some(x => x.uuid.toLowerCase() === AXP_WRITE && x.isWritableWithResponse) ||
          !characteristics.some(x => x.uuid.toLowerCase() === AXP_NOTIFY && x.isNotifiable)) throw new Error('Accessory does not expose the required AXP characteristics');
      let disconnected = false;
      return {
        mtu: device.mtu,
        async subscribe(onBytes, onClosed) {
          const closed = device.onDisconnected(error => { if (!disconnected) onClosed(error ?? new Error('Bluetooth accessory disconnected')); });
          const notifications = device.monitorCharacteristicForService(AXP_SERVICE, AXP_NOTIFY, (error, characteristic) => {
            if (disconnected) return;
            if (error) { onClosed(error); return; }
            if (characteristic?.value) {
              try { if (characteristic.value.length > 684) throw new Error('BLE notification exceeds limit'); onBytes(toByteArray(characteristic.value)); }
              catch (error) { onClosed(error instanceof Error ? error : new Error(String(error))); }
            }
          });
          return () => { notifications.remove(); closed.remove(); };
        },
        async writeWithResponse(bytes) { await device.writeCharacteristicWithResponseForService(AXP_SERVICE, AXP_WRITE, fromByteArray(bytes)); },
        async disconnect() { if (disconnected) return; disconnected = true; await ble.cancelDeviceConnection(device.id); },
      };
    } catch (error) { await ble.cancelDeviceConnection(device.id).catch(() => {}); throw error; }
  },
};
export async function shutdownBluetooth(): Promise<void> { await stopScan?.(); const instance = manager; manager = null; loading = null; await instance?.destroy(); }
