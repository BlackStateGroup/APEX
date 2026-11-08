import type { BleCandidate, BleDriver } from '../../packages/core/ble-transport.ts';
export const bleDriver: BleDriver = { connect: async () => { throw new Error('Bluetooth requires an iPhone or Android development build'); } };
export async function scanAccessories(_onDevice: (device: BleCandidate) => void, _onEnd: (error?: Error) => void): Promise<() => Promise<void>> {
  throw new Error('Bluetooth is unavailable in this web console');
}
export async function shutdownBluetooth(): Promise<void> {}

export async function stopAccessoryDiscovery(): Promise<void> {}

export function startForegroundObservation(_options: import('../../packages/core/ble-observation-session.ts').ForegroundObservationOptions): import('../../packages/core/ble-observation-session.ts').ForegroundObservationSession {
  throw new Error('Bluetooth observation is unavailable in this web console');
}
export async function stopForegroundObservation(): Promise<void> {}

export function startSelectedServiceDataObservation(_options: { service: import('../../packages/core/ble-plx-service-data-filter.ts').BlePlxSelectedService; receiptClock(): string }): import('../../packages/core/ble-service-data-session.ts').ServiceDataSession {
  throw new Error('Bluetooth service-data observation is unavailable in this web console');
}
