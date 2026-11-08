/** Complete selected BLE PLX source snapshots, not complete Device objects or RF captures. */
import { parseBoundedJson } from './bounded-json.ts';
import { prepareBlePlxObservation } from './ble-plx-observation.ts';
import type { BlePlxPreparation, BlePlxSnapshot } from './ble-plx-observation.ts';
import type { BleImportProvenance } from './ble-advertisements.ts';

export const MAX_BLE_PLX_SOURCE_DOCUMENT_CHARACTERS = 4096;
export const BLE_PLX_SOURCE_SDK = 'react-native-ble-plx@3.5.1';
const fields = ['id', 'name', 'rssi', 'manufacturerData', 'rawScanRecord', 'serviceData', 'serviceUUIDs',
  'localName', 'txPowerLevel', 'solicitedServiceUUIDs', 'isConnectable', 'overflowServiceUUIDs'] as const satisfies readonly (keyof BlePlxSnapshot)[];
type Field = typeof fields[number];
export interface BlePlxSourceEvidencePayload {
  schemaVersion: 1;
  format: 'BLE-PLX-selected-source-document';
  document: string;
}
export interface BlePlxSourceEvidenceInput {
  kind: 'analysis.ble-source';
  source: 'offline-fixture' | 'offline-import';
  payload: BlePlxSourceEvidencePayload;
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) {
    throw new Error('Invalid BLE PLX source schema');
  }
  // Reject executable properties even when called directly rather than through JSON.parse.
  for (const key of keys) if (!('value' in Object.getOwnPropertyDescriptor(value, key)!)) throw new Error('Invalid BLE PLX source accessor');
  return value as Record<string, unknown>;
}
function fieldList(value: unknown): Field[] {
  if (!Array.isArray(value) || value.length > fields.length ||
      value.some(key => typeof key !== 'string' || !fields.includes(key as Field)) || new Set(value).size !== value.length) {
    throw new Error('Invalid BLE PLX unavailable fields');
  }
  return value as Field[];
}

/** Parse untrusted saved source and interpret again. No decoded claims are accepted. */
export function readBlePlxSourceEvidencePayload(payload: unknown): BlePlxPreparation {
  const row = object(payload, ['schemaVersion', 'format', 'document']);
  if (row.schemaVersion !== 1 || row.format !== 'BLE-PLX-selected-source-document' ||
      typeof row.document !== 'string' || row.document.length > MAX_BLE_PLX_SOURCE_DOCUMENT_CHARACTERS) {
    throw new Error('BLE PLX evidence requires a bounded exact selected-source document');
  }
  const source = object(parseBoundedJson(row.document, MAX_BLE_PLX_SOURCE_DOCUMENT_CHARACTERS, 3), ['schemaVersion', 'sdk', 'platform', 'representation', 'provenance', 'snapshot', 'unavailableFields', 'undefinedFields']);
  if (source.schemaVersion !== 1 || source.sdk !== BLE_PLX_SOURCE_SDK ||
      (source.platform !== 'android' && source.platform !== 'ios') ||
      source.representation !== (source.platform === 'android' ? 'android-ad-bytes' : 'ios-normalized-fields-with-opaque-json-base64')) {
    throw new Error('Invalid BLE PLX source version, SDK or representation');
  }
  const snapshot = object(source.snapshot, fields);
  const unavailable = fieldList(source.unavailableFields);
  const undefinedFields = fieldList(source.undefinedFields);
  if (unavailable.some(key => snapshot[key] !== null) || undefinedFields.some(key => !unavailable.includes(key))) {
    throw new Error('Inconsistent BLE PLX unavailable source fields');
  }
  const device: Record<string, unknown> = {};
  for (const key of fields) {
    if (!unavailable.includes(key)) device[key] = snapshot[key];
    else if (undefinedFields.includes(key)) device[key] = undefined;
  }
  // Adapter validates every source field and provenance, including synthetic timestamps.
  const prepared = prepareBlePlxObservation(source.platform, device, source.provenance as BleImportProvenance);
  return { ...prepared, retentionWarning: 'Complete selected BLE PLX snapshot retained; not a complete Device object, over-air capture, authenticated identity or verified reception. Android missing raw bytes remain uninterpretable; iOS rawScanRecord remains opaque.' };
}

/** Preserve even whitespace in imported source documents; reject rather than truncate or chunk. */
export function prepareBlePlxSourceEvidenceDocument(document: string): BlePlxSourceEvidenceInput {
  const payload: BlePlxSourceEvidencePayload = { schemaVersion: 1, format: 'BLE-PLX-selected-source-document', document };
  const prepared = readBlePlxSourceEvidencePayload(payload);
  return { kind: 'analysis.ble-source', source: prepared.provenance.origin === 'synthetic-fixture' ? 'offline-fixture' : 'offline-import', payload };
}

/** Copies only selected own data fields. Never reads Device methods or arbitrary properties. */
export function prepareBlePlxSourceEvidenceInput(platform: 'android' | 'ios', device: unknown, provenance: BleImportProvenance): BlePlxSourceEvidenceInput {
  const prepared = prepareBlePlxObservation(platform, device, provenance);
  const undefinedFields = fields.filter(key => {
    const descriptor = Object.getOwnPropertyDescriptor(device, key);
    return descriptor && 'value' in descriptor && descriptor.value === undefined;
  });
  return prepareBlePlxSourceEvidenceDocument(JSON.stringify({
    schemaVersion: 1, sdk: BLE_PLX_SOURCE_SDK, platform, representation: prepared.representation,
    provenance: prepared.provenance, snapshot: prepared.snapshot, unavailableFields: prepared.unavailableFields, undefinedFields,
  }));
}
