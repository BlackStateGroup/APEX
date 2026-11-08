/** Offline explanation only. See docs/BLE_FILTER_DIAGNOSTIC.md for scope and sources. */
import type { BleObservation } from './ble-advertisements.ts';

export type SuppliedPresence = 'present' | 'not-present-in-supplied-source' | 'cannot-assess';
export interface BleFilterDiagnostic {
  requestedService: 'FCD2' | 'FEAA' | null;
  serviceData: SuppliedPresence;
  androidUuidList: SuppliedPresence;
  /** Deliberately never predicts platform delivery from an offline projection. */
  platformDelivery: 'unverified';
}

/** Accept only the two supported service IDs, in Bluetooth 16/32/128-bit notation. */
function requestedService(uuid: string): 'FCD2' | 'FEAA' | null {
  const short = uuid.toLowerCase().replace(/^0000(fcd2|feaa)(?:-0000-1000-8000-00805f9b34fb)?$/, '$1');
  return short === 'fcd2' ? 'FCD2' : short === 'feaa' ? 'FEAA' : null;
}

/**
 * Input must come from the existing offline validator (or verified evidence reopen).
 * Positive membership is a byte/field fact, not reception, identity or OS matching.
 * An incomplete UUID list can establish membership, but cannot establish absence.
 */
export function explainBleFilter(observation: BleObservation | null, uuid: string): BleFilterDiagnostic {
  const requested = requestedService(uuid);
  const result: BleFilterDiagnostic = { requestedService: requested, serviceData: 'cannot-assess',
    androidUuidList: 'cannot-assess', platformDelivery: 'unverified' };
  if (!observation || !requested) return result;
  const canonical = `0000${requested.toLowerCase()}-0000-1000-8000-00805f9b34fb`;
  if (observation.inputKind === 'ios-advertisement-fields') {
    const fields = observation.normalizedFields;
    if (fields) result.serviceData = fields.serviceData.some(field => field.uuid === canonical)
      ? 'present' : 'not-present-in-supplied-source';
    // CoreBluetooth normalized service UUID fields are not Android AD list bytes.
    return result;
  }
  const raw = observation.rawAdvertising;
  if (!raw || raw.status !== 'parsed') return result;
  const suppliedComplete = observation.captureCompleteness === 'complete';
  result.serviceData = raw.elements.some(field => field.value.kind === 'service-data' && field.value.uuid === canonical)
    ? 'present' : suppliedComplete ? 'not-present-in-supplied-source' : 'cannot-assess';
  const lists = raw.elements.flatMap(field => field.value.kind === 'service-uuids' ? [field.value] : []);
  result.androidUuidList = lists.some(list => list.uuids.includes(canonical)) ? 'present'
    : suppliedComplete && lists.every(list => list.complete) ? 'not-present-in-supplied-source' : 'cannot-assess';
  return result;
}

export const BLE_FILTER_DIAGNOSTIC_LIMITS = 'Supplied source only, not a full capture or an OS scan result. Unknown scan-response bytes may change delivery. Reception, identity and device support remain unverified. iOS matching is not assessed. The current advertised-UUID filter is not general BTHome discovery.';

export function formatBleFilterDiagnostic(result: BleFilterDiagnostic): string {
  const label = (value: SuppliedPresence) => value === 'not-present-in-supplied-source' ? 'not present in supplied source'
    : value === 'cannot-assess' ? 'cannot assess' : 'present';
  return `${result.requestedService ?? 'Unsupported service'}: service data ${label(result.serviceData)}; Android UUID-list entry ${label(result.androidUuidList)}.`;
}
