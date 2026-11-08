import { MAX_BUNDLE_CHARACTERS, readEvidenceBundle } from '../packages/core/evidence-bundle.ts';
import type { EvidenceBundlePreview, EvidenceHasher } from '../packages/core/evidence-bundle.ts';
export const BUNDLE_PAGE_SIZE = 4;
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export interface BundleState {
  readonly document: string; readonly report: Immutable<EvidenceBundlePreview> | null;
  readonly page: number; readonly pending: boolean; readonly message: string; readonly rejectedEdit: boolean;
}
function freeze<T>(value: T): Immutable<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}
/** Memory-only controller. Every edit, clear, inspection and deactivation fences prior async results. */
export class EvidenceBundleWorkbench {
  #generation = 0;
  #active: boolean;
  #lease = 0;
  #state: BundleState = Object.freeze({ document: '', report: null, page: 0, pending: false, rejectedEdit: false, message: 'Paste a selected-record bundle, then Inspect.' });
  constructor(active = true) { this.#active = active; Object.freeze(this); }
  get state(): BundleState { return this.#state; }
  get lease(): number { return this.#lease; }
  isActive(lease: number): boolean { return this.#active && lease === this.#lease; }
  activate() { if (!this.#active) { this.#active = true; ++this.#lease; } }
  #publish(state: BundleState) { this.#state = Object.freeze(state); }
  #reset(message: string, document = this.state.document, rejectedEdit = this.state.rejectedEdit) {
    ++this.#generation;
    this.#publish({ document, report: null, page: 0, pending: false, rejectedEdit, message });
  }
  edit(document: string) {
    if (!this.#active) return;
    if (document.length > MAX_BUNDLE_CHARACTERS) {
      this.#reset(`Paste rejected whole: maximum ${MAX_BUNDLE_CHARACTERS} UTF-16 code units. Previous draft retained; results cleared. Inspect is blocked until an accepted replacement edit or Clear.`, this.state.document, true);
    } else this.#reset('Draft changed. Inspect again. Nothing is persisted.', document, false);
  }
  clear() { if (this.#active) this.#reset('Draft and results cleared.', '', false); }
  deactivate() {
    this.#active = false; ++this.#lease;
    this.#reset(this.state.rejectedEdit
      ? 'Draft retained; oversized edit still blocks Inspect until an accepted replacement edit or Clear.'
      : 'Inspection cleared on leaving Evidence. Draft retained in memory; Inspect again.');
  }
  page(page: number) {
    if (this.#active && Number.isInteger(page) && page >= 0 && this.state.report && page * BUNDLE_PAGE_SIZE < this.state.report.records.length) {
      this.#publish({ ...this.state, page });
    }
  }
  async inspect(sha256: EvidenceHasher, sha256Bytes?: (bytes: Uint8Array) => Promise<string>) {
    if (!this.#active || this.state.rejectedEdit) return;
    this.#reset('Checking whole-bundle and individual content digests…');
    const generation = this.#generation;
    const document = this.state.document;
    this.#publish({ ...this.state, pending: true });
    try {
      const report = await readEvidenceBundle(document, sha256, sha256Bytes);
      if (generation !== this.#generation) return;
      this.#publish({ ...this.state, pending: false, report: freeze(report), message: 'Whole-bundle and all individual record content digests verified. Authenticity is not verified.' });
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#publish({ ...this.state, pending: false, report: null, message: `Bundle inspection failed: ${error instanceof Error ? error.message : 'Unknown validation error'}` });
    }
  }
}
