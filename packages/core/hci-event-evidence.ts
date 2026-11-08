import { parseHciLegacyEventDocument, readHciLegacyEventDocument } from './hci-offline.ts';

export type HciEvidenceByteHasher = (bytes: Uint8Array) => Promise<string>;
export const MAX_HCI_EVIDENCE_DOCUMENT_CHARACTERS = 4096;
export interface HciEventEvidencePayload {
  schemaVersion: 1;
  format: 'HCI-selected-legacy-event-document';
  document: string;
}
export interface HciEventEvidenceInput {
  kind: 'analysis.hci-event';
  source: 'offline-fixture' | 'offline-import';
  payload: HciEventEvidencePayload;
}
/** Snapshot exact own data before asynchronous work; never invoke payload accessors. */
export function snapshotHciEventEvidencePayload(payload: unknown): HciEventEvidencePayload {
  if (!payload || typeof payload !== 'object' || Object.getPrototypeOf(payload) !== Object.prototype) throw new Error('Invalid HCI evidence payload');
  const keys = ['schemaVersion', 'format', 'document'];
  const descriptors = Object.getOwnPropertyDescriptors(payload);
  if (Reflect.ownKeys(descriptors).length !== keys.length || !keys.every(key => {
    const field = descriptors[key];
    return field && 'value' in field && field.enumerable;
  })) throw new Error('HCI evidence requires exact own-data fields');
  const schemaVersion = descriptors.schemaVersion!.value;
  const format = descriptors.format!.value;
  const document = descriptors.document!.value;
  if (schemaVersion !== 1 || format !== 'HCI-selected-legacy-event-document' || typeof document !== 'string' || document.length > MAX_HCI_EVIDENCE_DOCUMENT_CHARACTERS) throw new Error('HCI evidence requires a bounded exact selected document');
  return { schemaVersion, format, document };
}
/** Structural only, not binary integrity verification or complete legacy interpretation. */
export function readHciEventEvidencePayload(payload: unknown) {
  return parseHciLegacyEventDocument(snapshotHciEventEvidencePayload(payload).document);
}
/** Local structural preparation. All provenance remains operator declared. */
export function prepareHciEventEvidenceInput(document: string): HciEventEvidenceInput {
  const payload = snapshotHciEventEvidencePayload({ schemaVersion: 1, format: 'HCI-selected-legacy-event-document', document });
  const value = readHciEventEvidencePayload(payload);
  return { kind: 'analysis.hci-event', source: value.context.provenance === 'synthetic-fixture' ? 'offline-fixture' : 'offline-import', payload };
}
/** Full binary integrity and legacy framing gate, with no persistence side effects. */
export async function verifyHciEventEvidencePayload(payload: unknown, hash?: HciEvidenceByteHasher) {
  const snapshot = snapshotHciEventEvidencePayload(payload);
  if (typeof hash !== 'function') throw new Error('HCI evidence requires a byte SHA-256 implementation');
  return readHciLegacyEventDocument(snapshot.document, hash);
}
