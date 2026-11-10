import { toByteArray, fromByteArray } from 'base64-js';
import type { BleManager } from 'react-native-ble-plx';
import { FLIPPER_ADVERTISEMENTS, FLIPPER_STATUS_FIELDS } from '../packages/core/flipper-status.ts';
import type { FlipperStatusRadio } from '../packages/core/flipper-status.ts';

/** A dedicated manager used only by the opt-in iPhone screen. No write/monitor API. */
export function flipperStatusPlxRadio(manager: BleManager): FlipperStatusRadio {
  return {
    async state() {
      const initial = await manager.state();
      if (initial !== 'Unknown' && initial !== 'Resetting') return initial;
      return new Promise<string>((resolve, reject) => {
        let subscription: { remove(): void } | undefined;
        let settled = false, registered = false, requested = false;
        let selected: string | undefined;
        const timer = setTimeout(() => finish(undefined), 8000);
        const finish = (state: string | undefined) => {
          if (settled) return;
          requested = true; selected = state;
          if (!registered) return;
          settled = true; clearTimeout(timer);
          try { subscription?.remove(); } catch { reject(new Error('Bluetooth state listener cleanup failed')); return; }
          if (selected) resolve(selected); else reject(new Error('Bluetooth readiness timed out. Check Settings and retry.'));
        };
        try {
          subscription = manager.onStateChange(state => { if (state !== 'Unknown' && state !== 'Resetting') finish(state); }, true);
          registered = true; if (requested) finish(selected);
        } catch { clearTimeout(timer); settled = true; reject(new Error('Bluetooth readiness failed')); }
      });
    },
    async scan(callback) {
      await manager.startDeviceScan([...FLIPPER_ADVERTISEMENTS], { allowDuplicates: false }, (error, device) => {
        if (error) { callback(new Error('Bluetooth scan failed')); return; }
        if (device) callback(null, { id: device.id, name: device.localName ?? device.name ?? 'Flipper candidate', rssi: device.rssi });
      });
    },
    async stopScan() { await manager.stopDeviceScan(); },
    async connect(id) { await manager.connectToDevice(id, { autoConnect: false, timeout: 15000 }); },
    async discover(id) {
      await manager.discoverAllServicesAndCharacteristicsForDevice(id);
      const services = await manager.servicesForDevice(id);
      if (services.length > 32) throw new Error('Too many Bluetooth services');
      return services.map(service => service.uuid);
    },
    async read(id, field) {
      if (!FLIPPER_STATUS_FIELDS.some(allowed => allowed === field)) throw new Error('Read outside the Flipper status allowlist');
      const characteristic = await manager.readCharacteristicForDevice(id, field.service, field.characteristic);
      const value = characteristic.value;
      if (typeof value !== 'string' || value.length < 4 || value.length > 172 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Malformed Bluetooth status value');
      const bytes = toByteArray(value);
      if (bytes.length > 128 || fromByteArray(bytes) !== value) throw new Error('Malformed Bluetooth status encoding');
      return bytes;
    },
    async disconnect(id) { await manager.cancelDeviceConnection(id); },
    isConnected: id => manager.isDeviceConnected(id),
    onDisconnect(id, callback) {
      const subscription = manager.onDeviceDisconnected(id, () => callback());
      return () => subscription.remove();
    },
  };
}
