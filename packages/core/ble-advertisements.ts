/**
 * Offline BLE advertising interpretation. No transport, network, connection,
 * pairing, transmission, authentication or device-control capability.
 * Sources and deliberately narrower import limits: docs/BLE_OFFLINE_EXPERIMENT.md.
 */
import { parseBoundedJson } from './bounded-json.ts';

export const MAX_AD_BYTES = 1650;
export const MAX_AD_ELEMENTS = 128;
export const MAX_IMPORT_CHARACTERS = 16384;
const BTHOME_UUID = '0000fcd2-0000-1000-8000-00805f9b34fb';
const EDDYSTONE_UUID = '0000feaa-0000-1000-8000-00805f9b34fb';

export type AdValue =
  | { kind: 'flags'; bytesHex: string }
  | { kind: 'name'; complete: boolean; text: string }
  | { kind: 'tx-power'; dbm: number }
  | { kind: 'service-uuids'; complete: boolean; uuids: string[] }
  | { kind: 'service-data'; uuid: string; payloadHex: string }
  | { kind: 'manufacturer-data'; companyId: number; payloadHex: string }
  | { kind: 'unknown' }
  | { kind: 'invalid'; reason: string };
export interface AdElement { offset: number; type: number; dataHex: string; value: AdValue; }
export interface AdIssue { offset: number; code: 'truncated-element' | 'nonzero-padding' | 'invalid-field' | 'element-limit'; }
export interface AdParse {
  inputHex: string;
  elements: AdElement[];
  issues: AdIssue[];
  paddingBytes: number;
  unparsedHex: string;
  status: 'parsed' | 'malformed' | 'limit-exceeded';
}
export interface TlmReading {
  status: 'format-match';
  format: 'Eddystone-TLM-v0';
  batteryMillivolts: number | null;
  temperatureCelsius: number | null;
  advertisementCount: number;
  uptimeDeciseconds: number;
  authenticated: false;
}
/** Unauthenticated wire claims, never a device identity or distance estimate. */
export interface EddystoneUidReading {
  status: 'format-match'; format: 'Eddystone-UID'; payloadHex: string;
  namespaceHex: string; instanceHex: string; calibratedTxPowerAtZeroMetersDbm: number;
  authenticated: false;
}
export interface EddystoneUrlReading {
  status: 'format-match'; format: 'Eddystone-URL'; payloadHex: string;
  schemePrefixCode: number; encodedUrlHex: string;
  /** Inert untrusted text only. Never navigate, fetch, resolve or render as markup. */
  urlText: string;
  calibratedTxPowerAtZeroMetersDbm: number; authenticated: false;
}
export type ServiceReading = TlmReading | EddystoneUidReading | EddystoneUrlReading | BTHomeReading | { status: 'opaque' | 'invalid'; reason: string };

/** A bounded supported subset, not a full BTHome receiver. See docs/BTHOME_OFFLINE.md. */
export const MAX_BTHOME_OBJECTS = 128;
export interface BTHomeObject {
  offset: number; objectId: number; occurrence: number;
  property: string; unit: string | null;
  rawHex: string; rawInteger: number;
  /** Exact rational representation is rawInteger / scaleDivisor; value is a JS number. */
  scaleDivisor: number; value: number;
}
export interface BTHomeReading {
  format: 'BTHome-v2';
  status: 'format-match' | 'opaque' | 'invalid';
  parseStatus: 'complete' | 'unsupported-object' | 'malformed' | 'limit-exceeded' | 'opaque';
  payloadHex: string;
  deviceInfo: number | null;
  triggerBased: boolean | null;
  objects: BTHomeObject[];
  issues: { offset: number; code: 'missing-header' | 'missing-object' | 'truncated-object' | 'object-order' | 'unknown-object' | 'object-limit' }[];
  unparsedHex: string;
  reason: string | null;
  authenticated: false;
  sensorTruthVerified: false;
}
// Numeric wire facts cross-checked against MIT bthome-ble v3.25.0 const.py.
// No upstream implementation code is copied. No runtime dependency is used.
const BTHOME_OBJECTS: Readonly<Record<number, readonly [string, number, boolean, number, string | null]>> = {
  0x00: ['packet-id', 1, false, 1, null],
  0x01: ['battery', 1, false, 1, '%'],
  0x02: ['temperature', 2, true, 100, '°C'],
  0x03: ['humidity', 2, false, 100, '%'],
  0x04: ['pressure', 3, false, 100, 'hPa'],
  0x05: ['illuminance', 3, false, 100, 'lx'],
  0x06: ['mass', 2, false, 100, 'kg'],
  0x07: ['mass', 2, false, 100, 'lb'],
  0x08: ['dew-point', 2, true, 100, '°C'],
  0x09: ['count', 1, false, 1, null],
  0x0a: ['energy', 3, false, 1000, 'kWh'],
  0x0b: ['power', 3, false, 100, 'W'],
  0x0c: ['voltage', 2, false, 1000, 'V'],
  0x0d: ['pm2.5', 2, false, 1, 'µg/m³'],
  0x0e: ['pm10', 2, false, 1, 'µg/m³'],
  0x12: ['co2', 2, false, 1, 'ppm'],
  0x14: ['moisture', 2, false, 100, '%'],
  0x2e: ['humidity', 1, false, 1, '%'],
  0x2f: ['moisture', 1, false, 1, '%'],
  0x3d: ['count', 2, false, 1, null],
  0x3e: ['count', 4, false, 1, null],
  0x3f: ['rotation', 2, true, 10, '°'],
  0x40: ['distance', 2, false, 1, 'mm'],
  0x41: ['distance', 2, false, 10, 'm'],
  0x42: ['duration', 3, false, 1000, 's'],
  0x43: ['current', 2, false, 1000, 'A'],
  0x44: ['speed', 2, false, 100, 'm/s'],
  0x45: ['temperature', 2, true, 10, '°C'],
  0x46: ['uv-index', 1, false, 10, null],
  0x47: ['volume', 2, false, 10, 'L'],
  0x48: ['volume', 2, false, 1, 'mL'],
  0x49: ['volume-flow-rate', 2, false, 1000, 'm³/h'],
  0x4d: ['energy', 4, false, 1000, 'kWh'],
  0x57: ['temperature', 1, true, 1, '°C'],
  0x5b: ['count', 4, true, 1, null],
  0x5c: ['power', 4, true, 100, 'W'],
  0x5d: ['current', 2, true, 1000, 'A'],
};
/** payloadHex has already passed the common bounded hex validator. */
function interpretBTHome(payloadHex: string, data: readonly number[]): BTHomeReading {
  const info = data[0];
  const result: BTHomeReading = {
    format: 'BTHome-v2', status: 'invalid', parseStatus: 'malformed', payloadHex,
    deviceInfo: info ?? null, triggerBased: null, objects: [], issues: [],
    unparsedHex: payloadHex, reason: null, authenticated: false, sensorTruthVerified: false,
  };
  if (info === undefined) {
    result.issues.push({ offset: 0, code: 'missing-header' });
    return result;
  }
  // Never inspect encrypted data as plaintext, even with unknown version/flags.
  if ((info & 1) !== 0 || info >>> 5 !== 2 || (info & 0x1a) !== 0) {
    result.status = 'opaque'; result.parseStatus = 'opaque';
    result.reason = (info & 1) !== 0 ? 'Encrypted BTHome is not decoded; key and advertiser MAC are unavailable' :
      info >>> 5 !== 2 ? 'Unsupported BTHome version' : 'Reserved device-info bits are set';
    return result;
  }
  result.triggerBased = (info & 4) !== 0;
  result.unparsedHex = payloadHex.slice(2);
  if (data.length === 1) {
    result.issues.push({ offset: 1, code: 'missing-object' });
    return result;
  }
  const occurrences = new Map<number, number>();
  let offset = 1;
  let previousId = -1;
  while (offset < data.length) {
    const objectId = data[offset]!;
    let code: BTHomeReading['issues'][number]['code'] | null = null;
    const spec = BTHOME_OBJECTS[objectId];
    if (result.objects.length >= MAX_BTHOME_OBJECTS) code = 'object-limit';
    else if (objectId < previousId) code = 'object-order';
    else if (!spec) code = 'unknown-object';
    else if (offset + 1 + spec[1] > data.length) code = 'truncated-object';
    if (code !== null) {
      result.issues.push({ offset, code });
      result.unparsedHex = payloadHex.slice(offset * 2);
      result.parseStatus = code === 'object-limit' ? 'limit-exceeded' : code === 'unknown-object' ? 'unsupported-object' : 'malformed';
      // A partial prefix must not count as a complete format match.
      result.status = code === 'unknown-object' ? 'opaque' : 'invalid';
      return result;
    }
    const [property, width, signed, scaleDivisor, unit] = spec!;
    let rawInteger = 0;
    for (let i = 0; i < width; i++) rawInteger += data[offset + 1 + i]! * 256 ** i;
    if (signed && rawInteger >= 2 ** (8 * width - 1)) rawInteger -= 2 ** (8 * width);
    const occurrence = (occurrences.get(objectId) ?? 0) + 1;
    occurrences.set(objectId, occurrence);
    result.objects.push({ offset, objectId, occurrence, property, unit,
      rawHex: payloadHex.slice(offset * 2, (offset + 1 + width) * 2),
      rawInteger, scaleDivisor, value: rawInteger / scaleDivisor });
    previousId = objectId;
    offset += 1 + width;
  }
  result.status = 'format-match'; result.parseStatus = 'complete'; result.unparsedHex = '';
  return result;
}

function checkedHex(value: unknown, maxBytes = MAX_AD_BYTES): string {
  if (typeof value !== 'string' || value.length > maxBytes * 2 || value.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value)) {
    throw new Error('Expected bounded even-length hex without separators');
  }
  return value.toLowerCase();
}
function bytes(hex: string): number[] {
  return Array.from({ length: hex.length / 2 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}
function hex(bytes: readonly number[]): string { return bytes.map(x => x.toString(16).padStart(2, '0')).join(''); }
export function canonicalBleServiceUuid(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid UUID');
  const uuid = value.toLowerCase();
  if (/^[0-9a-f]{4}$/.test(uuid)) return `0000${uuid}-0000-1000-8000-00805f9b34fb`;
  if (/^[0-9a-f]{8}$/.test(uuid)) return `${uuid}-0000-1000-8000-00805f9b34fb`;
  if (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(uuid)) return uuid;
  throw new Error('Invalid UUID');
}
function uuidFromLittleEndian(value: readonly number[]): string {
  const text = hex([...value].reverse());
  if (value.length !== 16) return canonicalBleServiceUuid(text);
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}
function parseValue(type: number, data: readonly number[]): AdValue {
  const invalid = (reason: string): AdValue => ({ kind: 'invalid', reason });
  if (type === 0x01) return { kind: 'flags', bytesHex: hex(data) };
  if (type === 0x08 || type === 0x09) {
    try {
      // Standard ECMAScript decoding works without a Node Buffer or platform decoder.
      const text = decodeURIComponent(data.map(x => `%${x.toString(16).padStart(2, '0')}`).join(''));
      return { kind: 'name', complete: type === 0x09, text };
    } catch { return invalid('Local name is not valid UTF-8'); }
  }
  if (type === 0x0a) {
    if (data.length !== 1 || data[0] === 0x80) return invalid('TX power must be one signed octet in -127..127');
    return { kind: 'tx-power', dbm: data[0]! > 127 ? data[0]! - 256 : data[0]! };
  }
  if (type >= 0x02 && type <= 0x07) {
    const width = type <= 0x03 ? 2 : type <= 0x05 ? 4 : 16;
    if (data.length % width !== 0) return invalid('Service UUID list is not aligned to its UUID width');
    const uuids: string[] = [];
    for (let offset = 0; offset < data.length; offset += width) uuids.push(uuidFromLittleEndian(data.slice(offset, offset + width)));
    return { kind: 'service-uuids', complete: type % 2 === 1, uuids };
  }
  if (type === 0x16 || type === 0x20 || type === 0x21) {
    const width = type === 0x16 ? 2 : type === 0x20 ? 4 : 16;
    if (data.length < width) return invalid('Service data is missing its UUID');
    return { kind: 'service-data', uuid: uuidFromLittleEndian(data.slice(0, width)), payloadHex: hex(data.slice(width)) };
  }
  if (type === 0xff) {
    if (data.length < 2) return invalid('Manufacturer data is missing its company identifier');
    return { kind: 'manufacturer-data', companyId: data[0]! + 256 * data[1]!, payloadHex: hex(data.slice(2)) };
  }
  return { kind: 'unknown' };
}

/** Parses host-visible AD bytes, not a link-layer packet, waveform or I/Q capture. */
export function parseBleAdvertisingHex(input: string): AdParse {
  const inputHex = checkedHex(input);
  const data = bytes(inputHex);
  const result: AdParse = { inputHex, elements: [], issues: [], paddingBytes: 0, unparsedHex: '', status: 'parsed' };
  let offset = 0;
  while (offset < data.length) {
    const length = data[offset]!;
    if (length === 0) {
      if (data.slice(offset).some(x => x !== 0)) {
        result.issues.push({ offset, code: 'nonzero-padding' });
        result.unparsedHex = inputHex.slice(offset * 2);
      } else result.paddingBytes = data.length - offset;
      break;
    }
    if (result.elements.length >= MAX_AD_ELEMENTS) {
      result.issues.push({ offset, code: 'element-limit' });
      result.unparsedHex = inputHex.slice(offset * 2);
      break;
    }
    if (offset + 1 + length > data.length) {
      result.issues.push({ offset, code: 'truncated-element' });
      result.unparsedHex = inputHex.slice(offset * 2);
      break;
    }
    const type = data[offset + 1]!;
    const fieldData = data.slice(offset + 2, offset + 1 + length);
    const value = parseValue(type, fieldData);
    result.elements.push({ offset, type, dataHex: hex(fieldData), value });
    if (value.kind === 'invalid') result.issues.push({ offset, code: 'invalid-field' });
    offset += 1 + length;
  }
  if (result.issues.length) result.status = result.issues.some(x => x.code === 'element-limit') ? 'limit-exceeded' : 'malformed';
  return result;
}

const EDDYSTONE_URL_PREFIXES = ['http://www.', 'https://www.', 'http://', 'https://'] as const;
const EDDYSTONE_URL_EXPANSIONS = ['.com/', '.org/', '.edu/', '.net/', '.info/', '.biz/', '.gov/',
  '.com', '.org', '.edu', '.net', '.info', '.biz', '.gov'] as const;
/** Strict current layouts from the pinned Google spec; no legacy RFU omission. */
function interpretEddystoneIdentityFrame(payloadHex: string, data: readonly number[]): ServiceReading {
  const uid = data[0] === 0x00;
  if (uid ? data.length !== 20 : data.length < 3 || data.length > 20) {
    return { status: 'invalid', reason: uid ? 'Eddystone-UID requires exactly 20 service payload bytes' :
      'Eddystone-URL requires 3..20 service payload bytes' };
  }
  if (uid && (data[18] !== 0 || data[19] !== 0)) {
    return { status: 'opaque', reason: 'Reserved Eddystone-UID bytes are set' };
  }
  const power = data[1]! >= 128 ? data[1]! - 256 : data[1]!;
  if (power < -100 || power > 20) return { status: 'invalid', reason: 'Eddystone calibrated power must be -100..20 dBm' };
  if (uid) return {
    status: 'format-match', format: 'Eddystone-UID', payloadHex,
    namespaceHex: payloadHex.slice(4, 24), instanceHex: payloadHex.slice(24, 36),
    calibratedTxPowerAtZeroMetersDbm: power, authenticated: false,
  };
  const schemePrefixCode = data[2]!;
  const prefix = EDDYSTONE_URL_PREFIXES[schemePrefixCode];
  if (prefix === undefined) return { status: 'opaque', reason: 'Unsupported Eddystone-URL scheme prefix' };
  let urlText: string = prefix;
  for (const code of data.slice(3)) {
    if (code <= 0x0d) urlText += EDDYSTONE_URL_EXPANSIONS[code]!;
    else if (code >= 0x21 && code <= 0x7e) urlText += String.fromCharCode(code);
    else return { status: 'opaque', reason: 'Reserved Eddystone-URL encoding code' };
  }
  return { status: 'format-match', format: 'Eddystone-URL', payloadHex, schemePrefixCode,
    encodedUrlHex: payloadHex.slice(6), urlText, calibratedTxPowerAtZeroMetersDbm: power, authenticated: false };
}

/** Recognizes bounded public layouts. No decryption, navigation or identity verification. */
export function interpretBleServiceData(uuid: string, payload: string): ServiceReading {
  const serviceUuid = canonicalBleServiceUuid(uuid);
  const payloadHex = checkedHex(payload);
  const data = bytes(payloadHex);
  if (serviceUuid === BTHOME_UUID) return interpretBTHome(payloadHex, data);
  if (serviceUuid === EDDYSTONE_UUID && (data[0] === 0x00 || data[0] === 0x10)) {
    return interpretEddystoneIdentityFrame(payloadHex, data);
  }
  if (serviceUuid !== EDDYSTONE_UUID || data[0] !== 0x20 || data[1] !== 0x00) {
    return { status: 'opaque', reason: 'No supported public payload layout matched' };
  }
  if (data.length !== 14) return { status: 'invalid', reason: 'Unencrypted Eddystone-TLM v0 requires exactly 14 service payload bytes' };
  const u16 = (offset: number) => data[offset]! * 256 + data[offset + 1]!;
  const u32 = (offset: number) => u16(offset) * 65536 + u16(offset + 2);
  const temperature = u16(4);
  return {
    status: 'format-match', format: 'Eddystone-TLM-v0',
    batteryMillivolts: u16(2) === 0 ? null : u16(2),
    temperatureCelsius: temperature === 0x8000 ? null : (temperature >= 0x8000 ? temperature - 65536 : temperature) / 256,
    advertisementCount: u32(6), uptimeDeciseconds: u32(10), authenticated: false,
  };
}

export interface BleImportProvenance {
  origin: 'synthetic-fixture' | 'recorded-import';
  label: string;
  capturedAt: string | null;
}
export interface IosAdvertisementFields {
  localName: string | null;
  serviceUuids: string[];
  serviceData: { uuid: string; payloadHex: string }[];
  manufacturerDataHex: string | null;
  txPowerDbm: number | null;
  isConnectable: boolean | null;
}
export interface BleObservation {
  schemaVersion: 1;
  inputKind: 'android-scan-record' | 'ios-advertisement-fields';
  provenance: BleImportProvenance;
  rssiDbm: number | null;
  validation: 'offline-format-check';
  physicalReceptionVerified: false;
  authenticatedIdentity: false;
  rawAdvertising: AdParse | null;
  normalizedFields: IosAdvertisementFields | null;
  captureCompleteness: 'complete' | 'truncated' | 'unknown' | 'not-exposed';
  serviceReadings: { uuid: string; reading: ServiceReading }[];
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Invalid BLE import schema');
  return value as Record<string, unknown>;
}
function boundedArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error('BLE field count exceeds 32');
  return value;
}
function nullableDbm(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -127 || value > 126) throw new Error('Invalid RSSI; use null for unavailable');
  return value;
}
function provenance(value: unknown): BleImportProvenance {
  const row = object(value, ['origin', 'label', 'capturedAt']);
  if (row.origin !== 'synthetic-fixture' && row.origin !== 'recorded-import') throw new Error('Offline imports cannot claim live/native verification');
  if (typeof row.label !== 'string' || row.label.length < 1 || row.label.length > 128) throw new Error('Invalid provenance label');
  if (row.origin === 'synthetic-fixture' && row.capturedAt !== null) throw new Error('Synthetic fixture must not claim a capture time');
  if (row.capturedAt !== null && (typeof row.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.capturedAt) ||
      !Number.isFinite(Date.parse(row.capturedAt)) || new Date(row.capturedAt).toISOString() !== row.capturedAt)) throw new Error('Invalid capture timestamp');
  if (row.origin === 'recorded-import' && row.capturedAt === null) throw new Error('Recorded import needs its source capture timestamp');
  return { origin: row.origin, label: row.label, capturedAt: row.capturedAt as string | null };
}
function iosFields(value: unknown): IosAdvertisementFields {
  const row = object(value, ['localName', 'serviceUuids', 'serviceData', 'manufacturerDataHex', 'txPowerDbm', 'isConnectable']);
  if (row.localName !== null && (typeof row.localName !== 'string' || row.localName.length > 248)) throw new Error('Invalid local name');
  if (row.isConnectable !== null && typeof row.isConnectable !== 'boolean') throw new Error('Invalid connectable flag');
  if (row.txPowerDbm !== null && (typeof row.txPowerDbm !== 'number' || !Number.isInteger(row.txPowerDbm) || row.txPowerDbm < -127 || row.txPowerDbm > 127)) throw new Error('Invalid TX power');
  const serviceUuids = boundedArray(row.serviceUuids).map(canonicalBleServiceUuid);
  const serviceData = boundedArray(row.serviceData).map(value => {
    const field = object(value, ['uuid', 'payloadHex']);
    return { uuid: canonicalBleServiceUuid(field.uuid), payloadHex: checkedHex(field.payloadHex) };
  });
  if (new Set(serviceData.map(x => x.uuid)).size !== serviceData.length) throw new Error('Duplicate iOS service-data dictionary key');
  const manufacturerDataHex = row.manufacturerDataHex === null ? null : checkedHex(row.manufacturerDataHex);
  if (manufacturerDataHex !== null && manufacturerDataHex.length < 4) throw new Error('Manufacturer data needs its company identifier');
  // Bound the entire normalized payload, not just each individual field.
  // Three bytes per UTF-16 code unit is a conservative UTF-8 upper bound.
  if (serviceData.reduce((sum, field) => sum + field.payloadHex.length / 2 + 16, 0) +
      (manufacturerDataHex?.length ?? 0) / 2 + serviceUuids.length * 16 + (row.localName === null ? 0 : (row.localName as string).length * 3) > MAX_AD_BYTES) {
    throw new Error('Normalized BLE payload exceeds size limit');
  }
  return { localName: row.localName as string | null, serviceUuids, serviceData, manufacturerDataHex, txPowerDbm: row.txPowerDbm as number | null, isConnectable: row.isConnectable as boolean | null };
}

/**
 * An explicitly offline boundary. iOS normalized fields are never converted into
 * invented raw advertisements; imported capture claims are not hardware attestation.
 */
export function importBleObservation(document: string): BleObservation {
  if (typeof document !== 'string' || document.length > MAX_IMPORT_CHARACTERS) throw new Error('BLE import exceeds size limit');
  // Deepest supported shape: root > fields > serviceData array > entry.
  const raw = parseBoundedJson(document, MAX_IMPORT_CHARACTERS, 4);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid BLE import');
  const kind = (raw as Record<string, unknown>).inputKind;
  const specific = kind === 'android-scan-record' ? ['advertisingHex', 'dataStatus'] : kind === 'ios-advertisement-fields' ? ['fields'] : [];
  if (!specific.length) throw new Error('Unsupported BLE input kind');
  const row = object(raw, ['schemaVersion', 'inputKind', 'provenance', 'rssiDbm', ...specific]);
  if (row.schemaVersion !== 1) throw new Error('Unsupported BLE schema version');
  const result: BleObservation = {
    schemaVersion: 1, inputKind: kind as BleObservation['inputKind'], provenance: provenance(row.provenance), rssiDbm: nullableDbm(row.rssiDbm),
    validation: 'offline-format-check', physicalReceptionVerified: false, authenticatedIdentity: false,
    rawAdvertising: null, normalizedFields: null, captureCompleteness: 'not-exposed', serviceReadings: [],
  };
  let serviceData: { uuid: string; payloadHex: string }[];
  if (kind === 'android-scan-record') {
    if (row.dataStatus !== 'complete' && row.dataStatus !== 'truncated' && row.dataStatus !== 'unknown') throw new Error('Invalid Android data status');
    result.captureCompleteness = row.dataStatus;
    result.rawAdvertising = parseBleAdvertisingHex(checkedHex(row.advertisingHex));
    serviceData = result.rawAdvertising.elements.flatMap(field => field.value.kind === 'service-data' ? [field.value] : []);
  } else {
    result.normalizedFields = iosFields(row.fields);
    serviceData = result.normalizedFields.serviceData;
  }
  result.serviceReadings = serviceData.map(field => ({ uuid: field.uuid, reading: interpretBleServiceData(field.uuid, field.payloadHex) }));
  return result;
}

/** Structurally compatible with APEX ObservationSummary; metadata only, no export. */
export function summarizeBleObservation(id: string, inputSha256: string, observation: BleObservation): {
  id: string; kind: 'signal-metadata'; inputSha256: string; summary: string;
} {
  if (!/^[\w.:-]{1,80}$/.test(id) || !/^[a-f0-9]{64}$/.test(inputSha256)) throw new Error('Invalid observation reference');
  return {
    id, kind: 'signal-metadata', inputSha256,
    summary: `BLE offline format check; origin=${observation.provenance.origin}; input=${observation.inputKind}; ` +
      `completeness=${observation.captureCompleteness}; AD fields=${observation.rawAdvertising?.elements.length ?? 'not exposed'}; ` +
      `AD issues=${observation.rawAdvertising?.issues.length ?? 'not applicable'}; service fields=${observation.serviceReadings.length}; ` +
      `public TLM v0 format matches=${observation.serviceReadings.filter(x => x.reading.status === 'format-match' && x.reading.format === 'Eddystone-TLM-v0').length}; ` +
      `public BTHome v2 complete format matches=${observation.serviceReadings.filter(x => x.reading.status === 'format-match' && x.reading.format === 'BTHome-v2').length}; ` +
      'physical reception unverified; identity unauthenticated. No device name, address or payload bytes included.',
  };
}
