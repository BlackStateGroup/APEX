import { inspectNfcStatic } from '../packages/core/nfc-static-offline.ts';
import type { NfcStaticContext, NfcStaticReport } from '../packages/core/nfc-static-offline.ts';
export type StaticMode = NfcStaticContext['mode'];
export type StaticProvenance = NfcStaticContext['provenance'];
export const NFC_STATIC_HEX_LIMIT = 128;
export const NFC_STATIC_PAGE = 4;
// Manually authored empty NDEF TLV and complete en/UTF-8 Text APEX examples; never device captures.
export const NFC_STATIC_DATA_EXAMPLE = '0300fe' + '00'.repeat(45);
export const NFC_STATIC_STRUCTURE_EXAMPLE = '00'.repeat(12) + 'e1100600' + '030bd101075402656e41504558fe' + '00'.repeat(34);
export function decodeStaticHex(text: string, mode: StaticMode): Uint8Array {
 if ((mode !== 'static-data-48' && mode !== 'static-structure-64') || typeof text !== 'string' || text.length !== (mode === 'static-data-48' ? 96 : 128) || !/^[0-9a-fA-F]+$/.test(text)) throw new Error('Exact selected-mode ASCII hex required.');
 return Uint8Array.from(text.match(/../g)!, pair => parseInt(pair, 16));
}
export const staticExcerpt = (s: string) => JSON.stringify(s.slice(0, 96)) + (s.length > 96 ? ` [first 96 of ${s.length} characters]` : '');
export interface NfcStaticWorkbenchState {
 readonly draft: string; readonly mode: StaticMode | null; readonly provenance: StaticProvenance | null;
 readonly report: NfcStaticReport | null; readonly tlvPage: number; readonly recordPage: number; readonly issuePage: number;
 readonly rejectedEdit: boolean; readonly pending: boolean; readonly message: string;
}
const initial = (): NfcStaticWorkbenchState => Object.freeze({ draft: '', mode: null, provenance: null, report: null, tlvPage: 0, recordPage: 0, issuePage: 0, rejectedEdit: false, pending: false, message: 'Select mode and provenance, paste hex, then Inspect.' });
export class NfcStaticWorkbenchController {
 #state = initial(); #active: boolean; #lease = 0; #generation = 0;
 readonly #hash: (bytes: Uint8Array) => Promise<string>;
 constructor(active: boolean, hash: (bytes: Uint8Array) => Promise<string>) { this.#active = active; this.#hash = hash; Object.freeze(this); }
 get state() { return this.#state; } get lease() { return this.#lease; }
 isActive(lease: number) { return this.#active && lease === this.#lease; }
 activate() { if (!this.#active) { this.#active = true; ++this.#lease; } }
 #publish(changes: Partial<NfcStaticWorkbenchState>) { this.#state = Object.freeze({ ...this.#state, ...changes }); }
 #reset(message: string, changes: Partial<NfcStaticWorkbenchState> = {}) { ++this.#generation; this.#publish({ report: null, tlvPage: 0, recordPage: 0, issuePage: 0, pending: false, message, ...changes }); }
 deactivate() { this.#active = false; ++this.#lease; this.#reset('Report cleared on leaving this inspector. Draft, mode, provenance and rejected-edit fence retained.'); }
 edit(draft: string, lease: number) {
  if (!this.isActive(lease)) return;
  if (typeof draft !== 'string' || draft.length > NFC_STATIC_HEX_LIMIT || /[^0-9a-fA-F]/.test(draft)) this.#reset('Edit rejected whole. Previous draft retained; Inspect blocked until accepted replacement or Clear.', { rejectedEdit: true });
  else this.#reset('Draft changed; inspect explicitly. Odd-length drafts are allowed only while typing.', { draft, rejectedEdit: false });
 }
 mode(mode: StaticMode, lease: number) { if (this.isActive(lease)) this.#reset('Mode changed; inspect explicitly.', { mode: mode === 'static-data-48' || mode === 'static-structure-64' ? mode : null }); }
 declare(provenance: StaticProvenance, lease: number) { if (this.isActive(lease)) this.#reset('Provenance changed; inspect explicitly.', { provenance: provenance === 'synthetic-fixture' || provenance === 'recorded-import' ? provenance : null }); }
 example(mode: StaticMode, lease: number) {
  if (!this.isActive(lease) || (mode !== 'static-data-48' && mode !== 'static-structure-64')) return;
  this.#reset('Manually authored synthetic example loaded, not inspected.', { draft: mode === 'static-data-48' ? NFC_STATIC_DATA_EXAMPLE : NFC_STATIC_STRUCTURE_EXAMPLE, mode, provenance: 'synthetic-fixture', rejectedEdit: false });
 }
 clear(lease: number) { if (this.isActive(lease)) this.#reset('Draft, mode and provenance cleared.', { draft: '', mode: null, provenance: null, rejectedEdit: false }); }
 async inspect(lease: number) {
  if (!this.isActive(lease) || this.#state.pending || this.#state.rejectedEdit) return;
  this.#reset('Inspecting supplied bytes locally.'); const generation = this.#generation;
  const { mode, provenance, draft } = this.#state;
  if (!mode || !provenance) { this.#publish({ message: 'Select explicit mode and provenance first.' }); return; }
  this.#publish({ pending: true });
  try {
   const report = await inspectNfcStatic(decodeStaticHex(draft, mode), { mode, provenance, label: 'pasted static NFC bytes' }, this.#hash);
   if (this.isActive(lease) && generation === this.#generation) this.#publish({ report, pending: false, message: 'Host/source-only inspection finished. TLV acceptance and NDEF decoding are separate.' });
  } catch { if (this.isActive(lease) && generation === this.#generation) this.#publish({ pending: false, message: 'Inspection refused: selected mode requires exactly 96 or 128 ASCII hex characters respectively and a successful local byte hash.' }); }
 }
 page(kind: 'tlvPage' | 'recordPage' | 'issuePage', page: number, lease: number, observed: NfcStaticWorkbenchState) {
  const r = this.#state.report;
  if (!this.isActive(lease) || observed !== this.#state || !r || !['tlvPage', 'recordPage', 'issuePage'].includes(kind)) return;
  const count = kind === 'tlvPage' ? r.elements.length : kind === 'recordPage' ? r.ndef.decoder?.records.length ?? 0 : r.ndef.decoder?.issues.length ?? 0;
  if (!Number.isSafeInteger(page) || page < 0 || page * NFC_STATIC_PAGE >= count) return;
  this.#publish({ [kind]: page });
 }
}
