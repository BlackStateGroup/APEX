import { importNdefObservation } from './ndef-offline.ts';
import type { NdefObservation } from './ndef-offline.ts';

/** Journal limit in UTF-16 characters, narrower than the standalone import limit. */
export const MAX_NDEF_EVIDENCE_DOCUMENT_CHARACTERS = 4096;
export interface NdefEvidencePayload {
  schemaVersion: 1;
  format: 'NDEF-offline-document';
  document: string;
}
export interface NdefEvidenceInput {
  kind: 'analysis.ndef';
  source: 'offline-fixture' | 'offline-import';
  payload: NdefEvidencePayload;
}

/** Reinterpret retained input; never trust a stored, caller-supplied decoded result. */
export function readNdefEvidencePayload(payload: unknown): NdefObservation {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.getPrototypeOf(payload) !== Object.prototype) throw new Error('Invalid NDEF evidence payload');
  const row = payload as Record<string, unknown>;
  if (Object.keys(row).length !== 3 || row.schemaVersion !== 1 || row.format !== 'NDEF-offline-document' ||
      typeof row.document !== 'string' || row.document.length > MAX_NDEF_EVIDENCE_DOCUMENT_CHARACTERS) {
    throw new Error('NDEF evidence requires a bounded exact offline document');
  }
  return importNdefObservation(row.document);
}

/** Local-only preparation. Does not save, export, scan, contact a model or attest capture. */
export function prepareNdefEvidenceInput(document: string): NdefEvidenceInput {
  const payload: NdefEvidencePayload = { schemaVersion: 1, format: 'NDEF-offline-document', document };
  const observation = readNdefEvidencePayload(payload);
  return {
    kind: 'analysis.ndef',
    source: observation.provenance.origin === 'synthetic-fixture' ? 'offline-fixture' : 'offline-import',
    payload,
  };
}
