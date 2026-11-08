import { prepareBlePlxSourceEvidenceInput } from './ble-plx-source-evidence.ts';
import type { BlePlxSourceEvidencePayload } from './ble-plx-source-evidence.ts';
import type { ScanResult, ScanSession } from './ble-scan-session.ts';

export interface ForegroundObservation {
  /** Caller-supplied callback receipt clock, NOT hardware transmission/reception time. */
  callbackReceivedAt: string;
  timestampBasis: 'caller-supplied-sdk-callback-receipt';
  selectedServiceUuid: string;
  source: BlePlxSourceEvidencePayload;
}
export interface ForegroundObservationOptions {
  /** Exactly one public service, BTHome FCD2 or Eddystone FEAA. No broad scan option. */
  serviceUuid: 'FCD2' | 'FEAA';
  receiptClock(): string;
  onObservation(observation: ForegroundObservation): void;
  onEnd(result: ScanResult): void;
  durationMs?: number;
  maxCount?: number;
  maxCharacters?: number;
}
export type ForegroundObservationSession = ScanSession;
export function observationServiceUuid(service: string): string {
  if (service !== 'FCD2' && service !== 'FEAA') throw new Error('Select BTHome FCD2 or Eddystone FEAA');
  return `0000${service.toLowerCase()}-0000-1000-8000-00805f9b34fb`;
}
export function prepareForegroundObservation(platform: 'android' | 'ios', device: unknown, serviceUuid: string, receipt: string) {
  observationServiceUuid(serviceUuid);
  const source = prepareBlePlxSourceEvidenceInput(platform, device, {
    origin: 'recorded-import', label: `Selected service ${serviceUuid}; SDK callback receipt clock supplied by caller; NOT hardware transmission time`, capturedAt: receipt,
  }).payload;
  const value: ForegroundObservation = { callbackReceivedAt: receipt, timestampBasis: 'caller-supplied-sdk-callback-receipt', selectedServiceUuid: serviceUuid, source };
  return { value, characters: JSON.stringify(value).length };
}
