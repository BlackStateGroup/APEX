import { importBleObservation } from './ble-advertisements.ts';
import type { BleObservation } from './ble-advertisements.ts';

/** Journal limit in UTF-16 characters, narrower than the standalone import limit. */
export const MAX_BLE_EVIDENCE_DOCUMENT_CHARACTERS = 4096;
export interface BleEvidencePayload {
  schemaVersion: 1;
  format: 'BLE-offline-document';
  document: string;
}
export interface BleEvidenceInput {
  kind: 'analysis.ble';
  source: 'offline-fixture' | 'offline-import';
  payload: BleEvidencePayload;
}

/** Reinterpret retained input; never trust a stored, caller-supplied decoded result. */
export function readBleEvidencePayload(payload: unknown): BleObservation {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.getPrototypeOf(payload) !== Object.prototype) throw new Error('Invalid BLE evidence payload');
  const row = payload as Record<string, unknown>;
  if (Object.keys(row).length !== 3 || row.schemaVersion !== 1 || row.format !== 'BLE-offline-document' ||
      typeof row.document !== 'string' || row.document.length > MAX_BLE_EVIDENCE_DOCUMENT_CHARACTERS) {
    throw new Error('BLE evidence requires a bounded exact offline document');
  }
  return importBleObservation(row.document);
}

/** Local-only preparation. Does not save, export, scan, contact a model or attest capture. */
export function prepareBleEvidenceInput(document: string): BleEvidenceInput {
  const payload: BleEvidencePayload = { schemaVersion: 1, format: 'BLE-offline-document', document };
  const observation = readBleEvidencePayload(payload);
  return {
    kind: 'analysis.ble',
    source: observation.provenance.origin === 'synthetic-fixture' ? 'offline-fixture' : 'offline-import',
    payload,
  };
}
