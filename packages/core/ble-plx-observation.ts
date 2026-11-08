/** Pure, offline BLE PLX 3.5.1 field adapter. Never starts a scan or invokes Device methods.
 * Source semantics and retention limits: docs/BLE_PLX_OBSERVATION_BRIDGE.md.
 */
import { importBleObservation, MAX_AD_BYTES } from './ble-advertisements.ts';
import type { BleImportProvenance, BleObservation } from './ble-advertisements.ts';

export const MAX_PLX_SERVICE_DATA_ENTRIES = 32;
export const MAX_PLX_SNAPSHOT_CHARACTERS = 16384;
export const MAX_PLX_IOS_RAW_BYTES = 8192;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const fieldNames = ['id', 'name', 'rssi', 'manufacturerData', 'rawScanRecord', 'serviceData', 'serviceUUIDs',
  'localName', 'txPowerLevel', 'solicitedServiceUUIDs', 'isConnectable', 'overflowServiceUUIDs'] as const;
type FieldName = typeof fieldNames[number];
export interface BlePlxSnapshot {
  id: string | null;
  name: string | null;
  rssi: number | null;
  manufacturerData: string | null;
  rawScanRecord: string | null;
  serviceData: Record<string, string> | null;
  serviceUUIDs: string[] | null;
  localName: string | null;
  txPowerLevel: number | null;
  solicitedServiceUUIDs: string[] | null;
  isConnectable: boolean | null;
  overflowServiceUUIDs: string[] | null;
}
export interface BlePlxPreparation {
  platform: 'android' | 'ios';
  representation: 'android-ad-bytes' | 'ios-normalized-fields-with-opaque-json-base64';
  /** Bounded defensive copy of selected source fields, including original base64/UUID case. */
  snapshot: BlePlxSnapshot;
  /** Missing/undefined differs from explicit null; projection treats both as unavailable. */
  unavailableFields: FieldName[];
  provenance: BleImportProvenance;
  /** The current BLE evidence journal retains document only, not this snapshot. */
  retentionWarning: string;
  status: 'prepared' | 'raw-scan-record-unavailable';
  /** Derived document, NOT an exact serialization of the original Device instance. */
  document: string | null;
  observation: BleObservation | null;
}

/** Strict RFC 4648 standard alphabet, required padding and zero pad bits. No Buffer/atob dependency. */
export function decodeBlePlxBase64(value: unknown, maxBytes = MAX_AD_BYTES): string {
  if (!Number.isInteger(maxBytes) || maxBytes < 0 || maxBytes > MAX_PLX_IOS_RAW_BYTES ||
      typeof value !== 'string' || value.length > Math.ceil(maxBytes / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Expected bounded canonical BLE PLX base64');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  if (value.length / 4 * 3 - padding > maxBytes ||
      (padding === 2 && (alphabet.indexOf(value[value.length - 3]!) & 15) !== 0) ||
      (padding === 1 && (alphabet.indexOf(value[value.length - 2]!) & 3) !== 0)) {
    throw new Error('Expected bounded canonical BLE PLX base64');
  }
  let hex = '';
  for (let i = 0; i < value.length; i += 4) {
    const a = alphabet.indexOf(value[i]!); const b = alphabet.indexOf(value[i + 1]!);
    const c = alphabet.indexOf(value[i + 2]!); const d = alphabet.indexOf(value[i + 3]!);
    hex += ((a << 2) | (b >> 4)).toString(16).padStart(2, '0');
    if (c >= 0) hex += (((b & 15) << 4) | (c >> 2)).toString(16).padStart(2, '0');
    if (d >= 0) hex += (((c & 3) << 6) | d).toString(16).padStart(2, '0');
  }
  return hex;
}
function text(value: unknown, max: number): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid BLE PLX string');
  return value;
}
function metric(value: unknown, min: number, max: number): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error('Invalid BLE PLX metric');
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{4}|[a-f0-9]{8}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(value)) throw new Error('Invalid BLE PLX UUID');
  return value;
}
function uuidList(value: unknown): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > 32) throw new Error('Invalid BLE PLX UUID list');
  return Array.from(value, uuid);
}
function base64(value: unknown, max = MAX_AD_BYTES): string | null {
  if (value === null) return null;
  decodeBlePlxBase64(value, max);
  return value as string;
}
function serviceMap(value: unknown): Record<string, string> | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Invalid BLE PLX service dictionary');
  const result: Record<string, string> = {};
  let count = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (++count > MAX_PLX_SERVICE_DATA_ENTRIES) throw new Error('BLE PLX service dictionary exceeds 32');
    uuid(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor) || typeof descriptor.value !== 'string') throw new Error('Invalid BLE PLX service data');
    result[key] = base64(descriptor.value)!;
  }
  return result;
}

/** Caller supplies source time/label, never inferred from Date.now(). Synthetic inputs require null time.
 * No authenticity, reception, freshness or complete-capture claim is made by this conversion.
 */
export function prepareBlePlxObservation(platform: 'android' | 'ios', device: unknown, provenance: BleImportProvenance): BlePlxPreparation {
  if (platform !== 'android' && platform !== 'ios') throw new Error('Unsupported BLE PLX platform');
  if (device === null || typeof device !== 'object' || Array.isArray(device)) throw new Error('Expected BLE PLX Device fields');
  const unavailableFields: FieldName[] = [];
  const raw = {} as Record<FieldName, unknown>;
  for (const key of fieldNames) {
    const descriptor = Object.getOwnPropertyDescriptor(device, key);
    if (descriptor && !('value' in descriptor)) throw new Error('BLE PLX fields must not be accessors');
    if (!descriptor || descriptor.value === undefined) unavailableFields.push(key);
    raw[key] = descriptor?.value ?? null;
  }
  if (raw.isConnectable !== null && typeof raw.isConnectable !== 'boolean') throw new Error('Invalid BLE PLX connectable flag');
  const snapshot: BlePlxSnapshot = {
    id: text(raw.id, 128), name: text(raw.name, 248), rssi: metric(raw.rssi, -127, 127),
    manufacturerData: base64(raw.manufacturerData), rawScanRecord: base64(raw.rawScanRecord, platform === 'ios' ? MAX_PLX_IOS_RAW_BYTES : MAX_AD_BYTES),
    serviceData: serviceMap(raw.serviceData), serviceUUIDs: uuidList(raw.serviceUUIDs), localName: text(raw.localName, 248),
    txPowerLevel: metric(raw.txPowerLevel, -127, 127), solicitedServiceUUIDs: uuidList(raw.solicitedServiceUUIDs),
    isConnectable: raw.isConnectable as boolean | null, overflowServiceUUIDs: uuidList(raw.overflowServiceUUIDs),
  };
  if (JSON.stringify(snapshot).length > MAX_PLX_SNAPSHOT_CHARACTERS) throw new Error('BLE PLX snapshot exceeds size limit');
  const common = { schemaVersion: 1, provenance, rssiDbm: snapshot.rssi === 127 ? null : snapshot.rssi };
  const document = JSON.stringify(platform === 'android' ? {
    ...common, inputKind: 'android-scan-record', dataStatus: 'unknown',
    advertisingHex: snapshot.rawScanRecord === null ? '' : decodeBlePlxBase64(snapshot.rawScanRecord),
  } : {
    ...common, inputKind: 'ios-advertisement-fields', fields: {
      localName: snapshot.localName, serviceUuids: snapshot.serviceUUIDs ?? [],
      serviceData: Object.entries(snapshot.serviceData ?? {}).map(([uuid, payload]) => ({ uuid, payloadHex: decodeBlePlxBase64(payload) })),
      manufacturerDataHex: snapshot.manufacturerData === null ? null : decodeBlePlxBase64(snapshot.manufacturerData),
      txPowerDbm: snapshot.txPowerLevel, isConnectable: snapshot.isConnectable,
    },
  });
  // Reuse the existing strict schema/aggregate limits and interpretation rather than duplicate it.
  const observation = importBleObservation(document);
  const missingRaw = platform === 'android' && snapshot.rawScanRecord === null;
  return {
    platform, representation: platform === 'android' ? 'android-ad-bytes' : 'ios-normalized-fields-with-opaque-json-base64',
    snapshot, unavailableFields, provenance: observation.provenance,
    retentionWarning: 'The offline document is a projection. Saving it does not retain the BLE PLX snapshot, original base64, identifier, extra UUID lists, or null-versus-empty source distinctions.',
    status: missingRaw ? 'raw-scan-record-unavailable' : 'prepared',
    document: missingRaw ? null : document, observation: missingRaw ? null : observation,
  };
}
