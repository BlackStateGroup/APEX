import { readHciEventEvidencePayload, snapshotHciEventEvidencePayload, verifyHciEventEvidencePayload } from './hci-event-evidence.ts';
import type { HciEvidenceByteHasher } from './hci-event-evidence.ts';
import { readPhoneNdefEvidencePayload } from './phone-ndef-evidence.ts';
import { readNdefEvidencePayload } from './ndef-evidence.ts';
import { readBlePlxSourceEvidencePayload } from './ble-plx-source-evidence.ts';
import { readBleEvidencePayload } from './ble-evidence.ts';
import { parseBoundedJson } from './bounded-json.ts';

export const EVIDENCE_SCHEMA = `CREATE TABLE IF NOT EXISTS apex_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  document TEXT NOT NULL
);`;
export const INSERT_EVIDENCE = 'INSERT INTO apex_evidence(id, document) VALUES (?, ?)';
export const SELECT_EVIDENCE = 'SELECT document FROM apex_evidence ORDER BY rowid DESC LIMIT ?';
export type EvidenceKind = 'nfc.metadata' | 'analysis.nec' | 'analysis.can' | 'analysis.firmware' | 'analysis.ble' | 'analysis.ble-source' | 'analysis.ndef' | 'analysis.ndef-source' | 'analysis.hci-event';
export type EvidenceSource = 'native-ios' | 'native-android' | 'offline-fixture' | 'offline-import';
export interface EvidenceRecord {
  schemaVersion: 1; id: string; kind: EvidenceKind; source: EvidenceSource;
  observedAt: string; payload: unknown; sha256: string;
}
export interface EvidenceBackend {
  insert(id: string, document: string): Promise<void>;
  list(limit: number): Promise<string[]>;
}
export interface EvidenceCrypto { sha256(value: string): Promise<string>; randomId(): string; sha256Bytes?: HciEvidenceByteHasher; }

function canonical(value: unknown, depth = 0): unknown {
  if (depth > 8) throw new Error('Evidence nesting exceeds limit');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 4096) return value;
  if (Array.isArray(value) && value.length <= 256) return value.map(x => canonical(x, depth + 1));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length <= 128) {
    return Object.fromEntries(Object.keys(value).sort().map(key => { if (key.length > 128) throw new Error('Evidence key too long'); return [key, canonical((value as Record<string, unknown>)[key], depth + 1)]; }));
  }
  throw new Error('Evidence must contain bounded JSON data');
}
function checkedBase(record: Record<string, unknown>) {
  if (record.schemaVersion !== 1 || typeof record.id !== 'string' || !/^[\w.:-]{1,80}$/.test(record.id) ||
      typeof record.kind !== 'string' || typeof record.source !== 'string' ||
      !['nfc.metadata', 'analysis.nec', 'analysis.can', 'analysis.firmware', 'analysis.ble', 'analysis.ble-source', 'analysis.ndef', 'analysis.ndef-source', 'analysis.hci-event'].includes(String(record.kind)) ||
      !['native-ios', 'native-android', 'offline-fixture', 'offline-import'].includes(String(record.source)) ||
      typeof record.observedAt !== 'string' || !Number.isFinite(Date.parse(record.observedAt))) throw new Error('Invalid evidence envelope');
  if (record.kind === 'nfc.metadata' && !['native-ios', 'native-android'].includes(String(record.source))) throw new Error('NFC evidence needs a native source');
  if (record.kind !== 'nfc.metadata' && !['offline-fixture', 'offline-import'].includes(String(record.source))) throw new Error('Offline analysis needs an offline source');
  let payloadSnapshot = record.payload;
  if (record.kind === 'analysis.hci-event') {
    const payload = snapshotHciEventEvidencePayload(record.payload);
    const value = readHciEventEvidencePayload(payload);
    const expectedSource = value.context.provenance === 'synthetic-fixture' ? 'offline-fixture' : 'offline-import';
    if (record.source !== expectedSource) throw new Error('HCI evidence source does not match its retained document');
    payloadSnapshot = payload;
  }
  if (record.kind === 'analysis.ndef-source') {
    const observation = readPhoneNdefEvidencePayload(record.payload);
    const expectedSource = observation.provenance.origin === 'synthetic-fixture' ? 'offline-fixture' : 'offline-import';
    if (record.source !== expectedSource) throw new Error('Phone NDEF evidence source does not match its retained document');
  }
  if (record.kind === 'analysis.ndef') {
    const observation = readNdefEvidencePayload(record.payload);
    const expectedSource = observation.provenance.origin === 'synthetic-fixture' ? 'offline-fixture' : 'offline-import';
    if (record.source !== expectedSource) throw new Error('NDEF evidence source does not match its retained document');
  }
  if (record.kind === 'analysis.ble') {
    const observation = readBleEvidencePayload(record.payload);
    const expectedSource = observation.provenance.origin === 'synthetic-fixture' ? 'offline-fixture' : 'offline-import';
    if (record.source !== expectedSource) throw new Error('BLE evidence source does not match its retained document');
  }
  if (record.kind === 'analysis.ble-source') {
    const prepared = readBlePlxSourceEvidencePayload(record.payload);
    const expectedSource = prepared.provenance.origin === 'synthetic-fixture' ? 'offline-fixture' : 'offline-import';
    if (record.source !== expectedSource) throw new Error('BLE PLX evidence source does not match its retained document');
  }
  return { schemaVersion: 1 as const, id: record.id, kind: record.kind as EvidenceKind, source: record.source as EvidenceSource, observedAt: record.observedAt, payload: canonical(payloadSnapshot) };
}
export function parseEvidence(document: string): EvidenceRecord {
  if (document.length > 16384) throw new Error('Stored evidence exceeds size limit');
  // The envelope adds one container to the existing canonical payload's maximum
  // nine containers. Reject duplicate decoded keys before JSON.parse can choose
  // a last value, including duplicates inside ordinary metadata payloads.
  const raw: unknown = parseBoundedJson(document, 16384, 10);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid stored evidence');
  const row = raw as Record<string, unknown>;
  if (Object.keys(row).length !== 7 || typeof row.sha256 !== 'string' || !/^[a-f\d]{64}$/.test(row.sha256)) throw new Error('Invalid stored evidence digest');
  return { ...checkedBase(row), sha256: row.sha256 };
}

/** Verify a stored document using the unchanged v1 canonical content digest. */
export async function verifyEvidenceDocument(document: string, sha256: (text: string) => Promise<string>, sha256Bytes?: HciEvidenceByteHasher): Promise<EvidenceRecord> {
  const record = parseEvidence(document);
  if (record.kind === 'analysis.hci-event') await verifyHciEventEvidencePayload(record.payload, sha256Bytes);
  const digest = await sha256(JSON.stringify(checkedBase(record as unknown as Record<string, unknown>)));
  if (typeof digest !== 'string' || !/^[a-f\d]{64}$/.test(digest)) throw new Error('Invalid digest implementation');
  if (digest !== record.sha256) throw new Error('Evidence content digest mismatch');
  return record;
}

/** Only the new kind uses a descriptor snapshot; legacy input behavior stays intact. */
function snapshotHciEnvelope<T extends { kind: EvidenceKind }>(input: T): T {
  const kind = Object.getOwnPropertyDescriptor(input, 'kind');
  if (!kind || !('value' in kind)) throw new Error('Evidence kind must be an own data field');
  if (kind?.value !== 'analysis.hci-event') return input;
  if (Object.getPrototypeOf(input) !== Object.prototype) throw new Error('Invalid HCI evidence envelope');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const allowed = ['schemaVersion', 'id', 'kind', 'source', 'observedAt', 'payload', 'sha256'];
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !allowed.includes(key) || !('value' in descriptors[key]!) || !descriptors[key]!.enumerable)) throw new Error('HCI evidence envelope requires own-data fields');
  const snapshot = Object.fromEntries(Object.entries(descriptors).map(([key, field]) => [key, field.value])) as T;
  const payload = descriptors.payload;
  if (!payload) throw new Error('HCI evidence payload missing');
  return { ...snapshot, payload: snapshotHciEventEvidencePayload(payload.value) };
}

/** Local metadata journal. Content digests detect changes; they are not signatures or attestation. */
export class EvidenceStore {
  private backend: EvidenceBackend;
  private crypto: EvidenceCrypto;
  constructor(backend: EvidenceBackend, crypto: EvidenceCrypto) { this.backend = backend; this.crypto = crypto; }
  async save(input: { kind: EvidenceKind; source: EvidenceSource; payload: unknown; observedAt?: string }): Promise<EvidenceRecord> {
    input = snapshotHciEnvelope(input);
    const base = checkedBase({ ...input, schemaVersion: 1, id: this.crypto.randomId(), observedAt: input.observedAt ?? new Date().toISOString() });
    const text = JSON.stringify(base);
    if (text.length > 16000) throw new Error('Evidence exceeds metadata size limit');
    if (base.kind === 'analysis.hci-event') await verifyHciEventEvidencePayload(base.payload, this.crypto.sha256Bytes?.bind(this.crypto));
    const sha256 = await this.crypto.sha256(text);
    if (!/^[a-f\d]{64}$/.test(sha256)) throw new Error('Invalid digest implementation');
    const result = { ...base, sha256 };
    await this.backend.insert(base.id, JSON.stringify(result)); return result;
  }
  async list(limit = 50): Promise<EvidenceRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid evidence limit');
    return (await this.backend.list(limit)).map(parseEvidence);
  }
  /** Exact stored documents, structurally checked only; no content digest claim. */
  async listDocuments(limit = 50): Promise<string[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid evidence limit');
    const documents = await this.backend.list(limit);
    if (!Array.isArray(documents) || documents.length > limit) throw new Error('Invalid evidence document list');
    const copies: string[] = [];
    for (let index = 0; index < documents.length; index++) {
      const document = documents[index];
      if (typeof document !== 'string' || document.length > 16384) throw new Error('Invalid evidence document size or type');
      parseEvidence(document);
      copies.push(document);
    }
    return copies;
  }
  async verify(record: EvidenceRecord): Promise<boolean> {
    // HCI own-data validation must precede JSON serialization (which invokes getters).
    const snapshot = snapshotHciEnvelope(record);
    const originalKind = Object.getOwnPropertyDescriptor(record, 'kind')!.value;
    const value = parseEvidence(JSON.stringify(snapshot));
    // Legacy toJSON compatibility cannot smuggle HCI past its own-data ingress gate.
    if (value.kind === 'analysis.hci-event' && originalKind !== value.kind) throw new Error('HCI evidence kind changed during serialization');
    if (value.kind === 'analysis.hci-event') await verifyHciEventEvidencePayload(value.payload, this.crypto.sha256Bytes?.bind(this.crypto));
    return await this.crypto.sha256(JSON.stringify(checkedBase(value as unknown as Record<string, unknown>))) === value.sha256;
  }
}
