import type { HciEvidenceByteHasher } from './hci-event-evidence.ts';
import { parseBoundedJson } from './bounded-json.ts';
import { parseEvidence, verifyEvidenceDocument } from './evidence.ts';
import type { EvidenceRecord } from './evidence.ts';

export const MAX_BUNDLE_RECORDS = 100;
/** All core serialized limits count UTF-16 code units. */
export const MAX_BUNDLE_CHARACTERS = 2 * 1024 * 1024;
export const MAX_BUNDLE_RECORD_CHARACTERS = 16384;
export type EvidenceHasher = (text: string) => Promise<string>;
interface BundleBase {
  schemaVersion: 1;
  format: 'apex.selected-evidence';
  exportedAt: string;
  recordCount: number;
  records: string[];
}
export interface EvidenceBundlePreview {
  exportedAt: string;
  sha256: string;
  recordDocuments: string[];
  records: EvidenceRecord[];
}
function snapshot(records: readonly string[], exportedAt: string): BundleBase {
  if (typeof exportedAt !== 'string' || !Number.isFinite(Date.parse(exportedAt)) || new Date(exportedAt).toISOString() !== exportedAt) {
    throw new Error('Bundle exportedAt must be canonical ISO UTC');
  }
  if (!Array.isArray(records) || records.length < 1 || records.length > MAX_BUNDLE_RECORDS) throw new Error('Bundle record count limit');
  const copies: string[] = [];
  const ids = new Set<string>();
  // Copy and structurally validate every input before any asynchronous hashing.
  for (let i = 0; i < records.length; i++) {
    const document = records[i];
    if (typeof document !== 'string' || document.length > MAX_BUNDLE_RECORD_CHARACTERS) throw new Error('Bundle record size or type');
    const record = parseEvidence(document);
    if (ids.has(record.id)) throw new Error('Duplicate bundle record ID');
    ids.add(record.id); copies.push(document);
  }
  return { schemaVersion: 1, format: 'apex.selected-evidence', exportedAt, recordCount: copies.length, records: copies };
}
function serialized(base: BundleBase, sha256: string): string {
  const text = JSON.stringify({ ...base, sha256 });
  if (text.length > MAX_BUNDLE_CHARACTERS) throw new Error('Bundle serialized size limit');
  return text;
}
async function hash(base: BundleBase, sha256: EvidenceHasher): Promise<string> {
  const digest = await sha256(JSON.stringify(base));
  if (typeof digest !== 'string' || !/^[a-f\d]{64}$/.test(digest)) throw new Error('Invalid digest implementation');
  return digest;
}
/** Selected exact stored records only: no journal access, persistence or restoration. */
export async function createEvidenceBundle(records: readonly string[], exportedAt: string, sha256: EvidenceHasher, sha256Bytes?: HciEvidenceByteHasher): Promise<string> {
  const base = snapshot(records, exportedAt);
  serialized(base, '0'.repeat(64));
  for (const document of base.records) await verifyEvidenceDocument(document, sha256, sha256Bytes);
  return serialized(base, await hash(base, sha256));
}
/** Returns isolated data only after all envelope and content digest checks succeed. */
export async function readEvidenceBundle(document: string, sha256: EvidenceHasher, sha256Bytes?: HciEvidenceByteHasher): Promise<EvidenceBundlePreview> {
  const raw = parseBoundedJson(document, MAX_BUNDLE_CHARACTERS, 2);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid bundle');
  const row = raw as Record<string, unknown>;
  const keys = ['schemaVersion', 'format', 'exportedAt', 'recordCount', 'records', 'sha256'];
  if (Object.keys(row).length !== keys.length || !Object.keys(row).every(key => keys.includes(key)) ||
      row.schemaVersion !== 1 || row.format !== 'apex.selected-evidence' ||
      typeof row.sha256 !== 'string' || !/^[a-f\d]{64}$/.test(row.sha256)) throw new Error('Invalid bundle envelope');
  const base = snapshot(row.records as string[], row.exportedAt as string);
  if (row.recordCount !== base.recordCount) throw new Error('Bundle record count mismatch');
  serialized(base, row.sha256);
  if (await hash(base, sha256) !== row.sha256) throw new Error('Bundle digest mismatch');
  const records: EvidenceRecord[] = [];
  for (const text of base.records) records.push(await verifyEvidenceDocument(text, sha256, sha256Bytes));
  return { exportedAt: base.exportedAt, sha256: row.sha256, recordDocuments: base.records, records };
}
