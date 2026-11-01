import type { BleCandidate, BleDriver } from '../../packages/core/ble-transport.ts';
export const bleDriver: BleDriver = { connect: async () => { throw new Error('Bluetooth requires an iPhone or Android development build'); } };
export async function scanAccessories(_onDevice: (device: BleCandidate) => void, _onEnd: (error?: Error) => void): Promise<() => Promise<void>> {
  throw new Error('Bluetooth is unavailable in this web console');
}
export async function shutdownBluetooth(): Promise<void> {}
