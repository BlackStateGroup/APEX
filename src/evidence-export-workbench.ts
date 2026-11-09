import { createEvidenceBundle, readEvidenceBundle, MAX_BUNDLE_RECORDS, MAX_BUNDLE_RECORD_CHARACTERS } from '../packages/core/evidence-bundle.ts';
import type { EvidenceHasher } from '../packages/core/evidence-bundle.ts';
import { parseEvidence } from '../packages/core/evidence.ts';
import type { EvidenceKind, EvidenceSource } from '../packages/core/evidence.ts';
import type { HciEvidenceByteHasher } from '../packages/core/hci-event-evidence.ts';

export const EVIDENCE_EXPORT_LIMIT = MAX_BUNDLE_RECORDS;
export const EVIDENCE_EXPORT_PAGE_SIZE = 4;
export interface EvidenceExportRecord {
  readonly id: string; readonly kind: EvidenceKind; readonly source: EvidenceSource; readonly observedAt: string;
}
export interface EvidenceExportState {
  readonly records: readonly EvidenceExportRecord[];
  readonly selectedIds: readonly string[];
  readonly bundle: string | null;
  readonly preparationId: number;
  readonly pending: 'list' | 'prepare' | null;
  readonly page: number;
  readonly message: string;
}
const initialMessage = 'Refresh to list local records. Nothing is selected or verified.';
function empty(message: string): EvidenceExportState {
  return Object.freeze({ records: Object.freeze([]), selectedIds: Object.freeze([]), bundle: null, preparationId: 0, pending: null, page: 0, message });
}
/** Exact documents stay private and memory-only. Listing does not verify digests. */
export class EvidenceExportWorkbench {
  #active: boolean;
  #lease = 0;
  #generation = 0;
  #nextPreparationId = 0;
  #documents = new Map<string, string>();
  #state: EvidenceExportState = empty(initialMessage);
  constructor(active = true) { this.#active = active; Object.freeze(this); }
  get state(): EvidenceExportState { return this.#state; }
  get lease(): number { return this.#lease; }
  isActive(lease: number): boolean { return this.#active && lease === this.#lease; }
  activate() { if (!this.#active) { this.#active = true; ++this.#lease; } }
  #matches(lease: number, state: EvidenceExportState) { return this.isActive(lease) && state === this.#state; }
  #publish(state: EvidenceExportState) { this.#state = Object.freeze(state); }
  #reset(message: string) { ++this.#generation; this.#documents.clear(); this.#state = empty(message); }
  clear() { if (this.#active) this.#reset('Listed documents, selection and bundle cleared.'); }
  deactivate() { this.#active = false; ++this.#lease; this.#reset('Export cleared on leaving Evidence. Refresh to list records again.'); }
  page(page: number) {
    if (this.#active && Number.isInteger(page) && page >= 0 && page * EVIDENCE_EXPORT_PAGE_SIZE < this.#state.records.length) {
      this.#publish({ ...this.#state, page });
    }
  }
  toggle(id: string, lease: number, observedState: EvidenceExportState) {
    if (!this.#matches(lease, observedState) || !this.#documents.has(id)) return;
    ++this.#generation;
    const selectedIds = this.#state.selectedIds.includes(id)
      ? this.#state.selectedIds.filter(value => value !== id) : [...this.#state.selectedIds, id];
    this.#publish({ ...this.#state, selectedIds: Object.freeze(selectedIds), bundle: null, pending: null,
      message: 'Selection changed. Prepare to verify selected records. Authenticity is not verified.' });
  }
  async refresh(read: () => Promise<readonly string[]>, lease: number, observedState: EvidenceExportState) {
    if (!this.#matches(lease, observedState)) return;
    this.#reset('Reading local record metadata. Content digests are not verified.');
    const generation = this.#generation;
    this.#publish({ ...this.#state, pending: 'list' });
    try {
      const documents = await read();
      if (!this.isActive(lease) || generation !== this.#generation) return;
      if (!Array.isArray(documents) || documents.length > EVIDENCE_EXPORT_LIMIT) throw new Error('Invalid document list');
      const captured = new Map<string, string>();
      const records: EvidenceExportRecord[] = [];
      for (let index = 0; index < documents.length; index++) {
        const document = documents[index];
        if (typeof document !== 'string' || document.length > MAX_BUNDLE_RECORD_CHARACTERS) throw new Error('Invalid document');
        const { id, kind, source, observedAt } = parseEvidence(document);
        if (captured.has(id)) throw new Error('Duplicate ID');
        captured.set(id, document);
        records.push(Object.freeze({ id, kind, source, observedAt }));
      }
      this.#documents = captured;
      this.#publish({ ...this.#state, records: Object.freeze(records), pending: null,
        message: 'Local metadata listed. Content digests are unverified. Select records explicitly, then Prepare.' });
    } catch {
      if (!this.isActive(lease) || generation !== this.#generation) return;
      this.#reset('Could not list local evidence. The read failed or the returned records were invalid. Nothing is selected.');
    }
  }
  async prepare(sha256: EvidenceHasher, sha256Bytes: HciEvidenceByteHasher | undefined, exportedAt: string, lease: number, observedState: EvidenceExportState) {
    if (!this.#matches(lease, observedState)) return;
    const generation = ++this.#generation;
    const documents = this.#state.selectedIds.map(id => this.#documents.get(id)!);
    this.#publish({ ...this.#state, bundle: null, pending: documents.length ? 'prepare' : null,
      message: documents.length ? 'Checking selected records and whole-bundle content digests…' : 'Select at least one record before preparing a bundle.' });
    if (!documents.length) return;
    const current = () => this.isActive(lease) && generation === this.#generation;
    const guardedHash: EvidenceHasher = async text => {
      if (!current()) throw new Error('Export superseded');
      const result = await sha256(text);
      if (!current()) throw new Error('Export superseded');
      return result;
    };
    const guardedBytes: HciEvidenceByteHasher | undefined = sha256Bytes ? async bytes => {
      if (!current()) throw new Error('Export superseded');
      const result = await sha256Bytes(bytes);
      if (!current()) throw new Error('Export superseded');
      return result;
    } : undefined;
    try {
      const bundle = await createEvidenceBundle(documents, exportedAt, guardedHash, guardedBytes);
      if (!current()) return;
      // Read-back checks the whole-bundle digest, not just its computation. This
      // deliberately repeats selected-record hashes before exposing any output.
      await readEvidenceBundle(bundle, guardedHash, guardedBytes);
      if (!this.isActive(lease) || generation !== this.#generation) return;
      this.#publish({ ...this.#state, bundle, preparationId: ++this.#nextPreparationId, pending: null,
        message: 'Selected record and whole-bundle content digests verified. Authenticity is not verified. Nothing has been shared.' });
    } catch {
      if (!this.isActive(lease) || generation !== this.#generation) return;
      this.#publish({ ...this.#state, bundle: null, pending: null,
        message: 'Could not prepare a complete verified bundle. Check the selection and hashing capability, then try again.' });
    }
  }
}
