import { importPhoneNdefObservation } from './nfc-manager-ndef.ts';
import type { PhoneNdefObservation } from './nfc-manager-ndef.ts';

/** Journal limit in UTF-16 characters, narrower than the standalone import limit. */
export const MAX_PHONE_NDEF_EVIDENCE_DOCUMENT_CHARACTERS = 4096;
export interface PhoneNdefEvidencePayload {
  schemaVersion: 1;
  format: 'NDEF-normalized-source-document';
  document: string;
  expectedPlatform: 'android' | 'ios';
}
export interface PhoneNdefEvidenceInput {
  kind: 'analysis.ndef-source';
  source: 'offline-fixture' | 'offline-import';
  payload: PhoneNdefEvidencePayload;
}

/** Reinterpret retained input; never trust a stored, caller-supplied decoded result. */
export function readPhoneNdefEvidencePayload(payload: unknown): PhoneNdefObservation {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.getPrototypeOf(payload) !== Object.prototype) throw new Error('Invalid NDEF evidence payload');
  const row = payload as Record<string, unknown>;
  if (Object.keys(row).length !== 4 || row.schemaVersion !== 1 || row.format !== 'NDEF-normalized-source-document' ||
      (row.expectedPlatform !== 'android' && row.expectedPlatform !== 'ios') ||
      typeof row.document !== 'string' || row.document.length > MAX_PHONE_NDEF_EVIDENCE_DOCUMENT_CHARACTERS) {
    throw new Error('NDEF evidence requires a bounded exact offline document');
  }
  return importPhoneNdefObservation(row.document, row.expectedPlatform);
}

/** Local-only preparation. Does not save, export, scan, contact a model or attest capture. */
export function preparePhoneNdefEvidenceInput(document: string, expectedPlatform: 'android' | 'ios'): PhoneNdefEvidenceInput {
  const payload: PhoneNdefEvidencePayload = { schemaVersion: 1, format: 'NDEF-normalized-source-document', document, expectedPlatform };
  const observation = readPhoneNdefEvidencePayload(payload);
  return {
    kind: 'analysis.ndef-source',
    source: observation.provenance.origin === 'synthetic-fixture' ? 'offline-fixture' : 'offline-import',
    payload,
  };
}
