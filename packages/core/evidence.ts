export const EVIDENCE_SCHEMA = `CREATE TABLE IF NOT EXISTS apex_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  document TEXT NOT NULL
);`;
export const INSERT_EVIDENCE = 'INSERT INTO apex_evidence(id, document) VALUES (?, ?)';
export const SELECT_EVIDENCE = 'SELECT document FROM apex_evidence ORDER BY rowid DESC LIMIT ?';
export type EvidenceKind = 'nfc.metadata' | 'analysis.nec' | 'analysis.can' | 'analysis.firmware';
export type EvidenceSource = 'native-ios' | 'native-android' | 'offline-fixture' | 'offline-import';
export interface EvidenceRecord {
  schemaVersion: 1; id: string; kind: EvidenceKind; source: EvidenceSource;
  observedAt: string; payload: unknown; sha256: string;
}
export interface EvidenceBackend {
  insert(id: string, document: string): Promise<void>;
  list(limit: number): Promise<string[]>;
}
export interface EvidenceCrypto { sha256(value: string): Promise<string>; randomId(): string; }

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
      !['nfc.metadata', 'analysis.nec', 'analysis.can', 'analysis.firmware'].includes(String(record.kind)) ||
      !['native-ios', 'native-android', 'offline-fixture', 'offline-import'].includes(String(record.source)) ||
      typeof record.observedAt !== 'string' || !Number.isFinite(Date.parse(record.observedAt))) throw new Error('Invalid evidence envelope');
  if (record.kind === 'nfc.metadata' && !['native-ios', 'native-android'].includes(String(record.source))) throw new Error('NFC evidence needs a native source');
  if (record.kind !== 'nfc.metadata' && !['offline-fixture', 'offline-import'].includes(String(record.source))) throw new Error('Offline analysis needs an offline source');
  return { schemaVersion: 1 as const, id: record.id, kind: record.kind as EvidenceKind, source: record.source as EvidenceSource, observedAt: record.observedAt, payload: canonical(record.payload) };
}
export function parseEvidence(document: string): EvidenceRecord {
  if (document.length > 16384) throw new Error('Stored evidence exceeds size limit');
  const raw: unknown = JSON.parse(document);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid stored evidence');
  const row = raw as Record<string, unknown>;
  if (Object.keys(row).length !== 7 || typeof row.sha256 !== 'string' || !/^[a-f\d]{64}$/.test(row.sha256)) throw new Error('Invalid stored evidence digest');
  return { ...checkedBase(row), sha256: row.sha256 };
}

/** Local metadata journal. Content digests detect changes; they are not signatures or attestation. */
export class EvidenceStore {
  private backend: EvidenceBackend;
  private crypto: EvidenceCrypto;
  constructor(backend: EvidenceBackend, crypto: EvidenceCrypto) { this.backend = backend; this.crypto = crypto; }
  async save(input: { kind: EvidenceKind; source: EvidenceSource; payload: unknown; observedAt?: string }): Promise<EvidenceRecord> {
    const base = checkedBase({ ...input, schemaVersion: 1, id: this.crypto.randomId(), observedAt: input.observedAt ?? new Date().toISOString() });
    const text = JSON.stringify(base);
    if (text.length > 16000) throw new Error('Evidence exceeds metadata size limit');
    const sha256 = await this.crypto.sha256(text);
    if (!/^[a-f\d]{64}$/.test(sha256)) throw new Error('Invalid digest implementation');
    const result = { ...base, sha256 };
    await this.backend.insert(base.id, JSON.stringify(result)); return result;
  }
  async list(limit = 50): Promise<EvidenceRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid evidence limit');
    return (await this.backend.list(limit)).map(parseEvidence);
  }
  async verify(record: EvidenceRecord): Promise<boolean> {
    const value = parseEvidence(JSON.stringify(record));
    return await this.crypto.sha256(JSON.stringify(checkedBase(value as unknown as Record<string, unknown>))) === value.sha256;
  }
}
