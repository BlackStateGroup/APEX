import { prepareHciEventEvidenceInput } from '../packages/core/hci-event-evidence.ts';
import type { EvidenceStore } from '../packages/core/evidence.ts';
import { HCI_LEGACY_DOCUMENT_LIMIT, readHciLegacyEventDocument } from '../packages/core/hci-offline.ts';
import { AnalysisSourceGate } from './analysis-navigation.ts';
import { HCI_PAGE, summarizeLegacyReports } from './hci-workbench.ts';
import type { LegacySummary } from './hci-workbench.ts';
type Reopened = Awaited<ReturnType<typeof readHciLegacyEventDocument>>;
export interface HciDocumentState {
 readonly saving: boolean; readonly savedDocument: string | null; readonly saveMessage: string;
 readonly draft: string; readonly rejectedEdit: boolean; readonly pending: boolean; readonly message: string;
 readonly value: Reopened['value'] | null; readonly reports: readonly LegacySummary[]; readonly reportCount: number; readonly page: number;
}
const initial = (): HciDocumentState => Object.freeze({ saving: false, savedDocument: null, saveMessage: '', draft: '', rejectedEdit: false, pending: false, message: 'Paste or receive a document, then explicitly Verify/reopen.', value: null, reports: Object.freeze([]), reportCount: 0, page: 0 });
export class HciDocumentController {
 #state = initial(); #active: boolean; #lease = 0; #generation = 0;
 #reports: readonly LegacySummary[] = Object.freeze([]); #sources = new AnalysisSourceGate();
 readonly #hash: (bytes: Uint8Array) => Promise<string>;
 constructor(active: boolean, hash: (bytes: Uint8Array) => Promise<string>) { this.#active = active; this.#hash = hash; Object.freeze(this); }
 get state() { return this.#state; } get lease() { return this.#lease; }
 isActive(lease: number) { return this.#active && lease === this.#lease; }
 activate() { if (!this.#active) { this.#active = true; ++this.#lease; } }
 #publish(changes: Partial<HciDocumentState>) { this.#state = Object.freeze({ ...this.#state, ...changes }); }
 #reset(message: string, changes: Partial<HciDocumentState> = {}) { ++this.#generation; this.#reports = Object.freeze([]); this.#publish({ value: null, reports: Object.freeze([]), reportCount: 0, page: 0, pending: false, message, ...changes }); }
 deactivate() { this.#active = false; ++this.#lease; this.#reset('Verification cleared on leaving. Exact draft and rejected-edit fence retained.'); }
 #replace(draft: string) {
  if (typeof draft !== 'string' || draft.length > HCI_LEGACY_DOCUMENT_LIMIT) this.#reset('Edit rejected whole. Prior draft retained; Verify/reopen blocked until valid replacement or Clear.', { rejectedEdit: true });
  else this.#reset('Exact draft retained without normalization. Verify/reopen explicitly.', { draft, rejectedEdit: false });
 }
 receive(source: { id: number; document: string } | null | undefined) { if (this.#sources.take(source)) this.#replace(source!.document); }
 edit(draft: string, lease: number, observed: HciDocumentState) { if (this.isActive(lease) && observed === this.#state) this.#replace(draft); }
 clear(lease: number, observed: HciDocumentState) { if (this.isActive(lease) && observed === this.#state) this.#reset('Document cleared.', { draft: '', rejectedEdit: false }); }
 async verify(lease: number, observed: HciDocumentState) {
  if (!this.isActive(lease) || observed !== this.#state || this.#state.pending || this.#state.rejectedEdit) return;
  this.#reset('Verifying derivative binary digest and whole legacy framing.');
  const generation = this.#generation, document = this.#state.draft;
  this.#publish({ pending: true });
  try {
   const result = await readHciLegacyEventDocument(document, this.#hash);
   if (!this.isActive(lease) || generation !== this.#generation) return;
   this.#reports = summarizeLegacyReports(result.selection.reports);
   this.#publish({ pending: false, value: result.value, reports: Object.freeze(this.#reports.slice(0, HCI_PAGE)), reportCount: this.#reports.length, message: 'Verified binary SHA-256 and legacy structure. Original-source references remain UNVERIFIED.' });
  } catch { if (this.isActive(lease) && generation === this.#generation) this.#publish({ pending: false, message: 'Verify/reopen refused. Require a bounded exact supported document, matching binary digest and valid whole legacy event.' }); }
 }
 stage(index: number, side: 'left' | 'right', lease: number, observed: HciDocumentState) {
  if (!Number.isSafeInteger(index) || Object.is(index, -0) || (side !== 'left' && side !== 'right') || !this.isActive(lease) || observed !== this.#state || !this.#state.value || this.#state.pending || this.#state.rejectedEdit || !this.#state.reports.some(r => r.index === index)) return null;
  const source = Object.freeze({ document: this.#state.draft, index, side });
  // Consume the observed callback synchronously, before React navigation/effects.
  this.#publish({ message: 'Exact explicitly chosen report staged. Comparison requires its own verification.' });
  return source;
 }
 canSave() { return this.#active && !!this.#state.value && !this.#state.pending && !this.#state.rejectedEdit && !this.#state.saving && this.#state.savedDocument !== this.#state.draft; }
 async save(store: Pick<EvidenceStore, 'save'>, lease: number, observed: HciDocumentState, onSaved?: () => Promise<void>) {
  if (!this.isActive(lease) || observed !== this.#state || !this.canSave()) return;
  const document = this.#state.draft;
  this.#publish({ saving: true, saveMessage: 'Saving the exact verified snapshot locally. Editing or leaving does not cancel this save.' });
  try { await saveHciDocument(store, document); }
  catch { this.#publish({ saving: false, saveMessage: 'Local save failed; no successful save was confirmed. Current draft and verification are unchanged.' }); return; }
  this.#publish({ savedDocument: document, saveMessage: 'Exact selected document saved locally. This status refers to the dispatched snapshot, not necessarily the current draft.' });
  try { await onSaved?.(); }
  catch { this.#publish({ saveMessage: 'Exact selected document saved locally, but evidence refresh failed.' }); }
  finally { this.#publish({ saving: false }); }
 }
 page(page: number, lease: number, observed: HciDocumentState) {
  if (!this.isActive(lease) || observed !== this.#state || !Number.isSafeInteger(page) || page < 0 || page * HCI_PAGE >= this.#reports.length) return;
  this.#publish({ page, reports: Object.freeze(this.#reports.slice(page * HCI_PAGE, (page + 1) * HCI_PAGE)) });
 }
}

/** Prepare a detached, exact document input before dispatching to the trusted store. */
export function saveHciDocument(store: Pick<EvidenceStore, 'save'>, document: string) {
 return store.save(prepareHciEventEvidenceInput(document));
}
