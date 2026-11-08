/** Offline membership only. No scans, interpretation, source retention or identity claims. */
import { canonicalBleServiceUuid, parseBleAdvertisingHex } from './ble-advertisements.ts';
import { decodeBlePlxBase64, MAX_PLX_SERVICE_DATA_ENTRIES, MAX_PLX_SNAPSHOT_CHARACTERS } from './ble-plx-observation.ts';

export type BlePlxSelectedService = 'FCD2' | 'FEAA';
export type BlePlxServiceDataFilterResult = Readonly<{
  status: 'match' | 'no-match' | 'unavailable' | 'malformed';
  source: 'android-ad-bytes' | 'ios-normalized-service-data';
  service: BlePlxSelectedService;
}>;

/**
 * Android raw bytes alone are authoritative, even when normalized fields disagree.
 * iOS examines serviceData alone; rawScanRecord is opaque JSON, never Android AD.
 * Missing/undefined/null own source is unavailable. A valid empty source is no-match.
 * Only plain bridge values are supported, not adversarial proxies. Device prototypes
 * are allowed (PLX constructs a Device instance), but inherited source fields are not read.
 * No callback or payload is returned, even on match. Caller must explicitly prepare
 * evidence separately; a match is not a certificate for a later mutable callback.
 */
export function matchBlePlxSelectedServiceData(
  platform: 'android' | 'ios', device: unknown, service: BlePlxSelectedService,
): BlePlxServiceDataFilterResult {
  if ((platform !== 'android' && platform !== 'ios') || (service !== 'FCD2' && service !== 'FEAA')) {
    throw new Error('Select Android/iOS and FCD2/FEAA');
  }
  const source = platform === 'android' ? 'android-ad-bytes' : 'ios-normalized-service-data';
  const result = (status: BlePlxServiceDataFilterResult['status']): BlePlxServiceDataFilterResult => Object.freeze({ status, source, service });
  try {
    if (!device || typeof device !== 'object' || Array.isArray(device)) return result('malformed');
    const descriptor = Object.getOwnPropertyDescriptor(device, platform === 'android' ? 'rawScanRecord' : 'serviceData');
    if (descriptor && !('value' in descriptor)) return result('malformed');
    if (!descriptor || descriptor.value === undefined || descriptor.value === null) return result('unavailable');
    const selected = canonicalBleServiceUuid(service);
    if (platform === 'android') {
      const parsed = parseBleAdvertisingHex(decodeBlePlxBase64(descriptor.value));
      if (parsed.status !== 'parsed') return result('malformed');
      let count = 0;
      for (const element of parsed.elements) {
        if (element.value.kind === 'service-data' && element.value.uuid === selected) count++;
      }
      return result(count > 1 ? 'malformed' : count === 1 ? 'match' : 'no-match');
    }
    const map: unknown = descriptor.value;
    if (!map || typeof map !== 'object' || Array.isArray(map) || Object.getPrototypeOf(map) !== Object.prototype) return result('malformed');
    // Reflection enumerates existing own keys; no copying/decoding of values before
    // count validation. JS reflection itself is not a hard native allocation bound.
    const keys = Reflect.ownKeys(map);
    if (keys.length > MAX_PLX_SERVICE_DATA_ENTRIES) return result('malformed');
    const seen = new Set<string>();
    let characters = 0;
    let matches = false;
    for (const key of keys) {
      if (typeof key !== 'string' || key.length > 36) return result('malformed');
      const field = Object.getOwnPropertyDescriptor(map, key)!;
      if (!field.enumerable || !('value' in field) || typeof field.value !== 'string') return result('malformed');
      characters += key.length + field.value.length;
      if (characters > MAX_PLX_SNAPSHOT_CHARACTERS) return result('malformed');
      const uuid = canonicalBleServiceUuid(key);
      if (seen.has(uuid)) return result('malformed');
      seen.add(uuid);
      decodeBlePlxBase64(field.value);
      if (uuid === selected) matches = true;
    }
    return result(matches ? 'match' : 'no-match');
  } catch {
    // Fixed result only: no thrown source value, message, bytes or identifier escapes.
    return result('malformed');
  }
}
