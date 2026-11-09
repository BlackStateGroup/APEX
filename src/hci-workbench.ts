import { createHciLegacyEventDocument, prepareHci, listHciRecords, selectHciLegacyEvent, selectHciExtendedMetadata } from '../packages/core/hci-offline.ts';
import type { PreparedHci, HciContext } from '../packages/core/hci-offline.ts';
export const HCI_HEX_LIMIT = 65536;
export const HCI_PAGE = 4;
// Manually authored btsnoop header and one empty-data legacy advertisement; not a capture.
export const HCI_EXAMPLE = '6274736e6f6f700000000001000003ea0000000f0000000f00000003000000000000000000000000043e0c0201000001020304050600c0';
export function decodeHciHex(text: string): Uint8Array {
  if (typeof text !== 'string' || text.length > HCI_HEX_LIMIT || !/^(?:[0-9a-fA-F]{2})+$/.test(text)) throw new Error('Strict even-length ASCII hex required.');
  return Uint8Array.from(text.match(/../g)!, pair => parseInt(pair, 16));
}
export function hciExcerpt(text: string): string { return JSON.stringify(text.slice(0, 96)) + (text.length > 96 ? ` [first 96 of ${text.length} characters]` : ''); }
type Metadata = ReturnType<typeof listHciRecords>;
type Selection = ReturnType<typeof selectHciLegacyEvent>;
// Only selected legacy fields are projected. Nested AD values are intentionally not exposed.
export type LegacySummary = Readonly<Pick<Selection['reports'][number], 'index' | 'reportOffset' | 'eventType' | 'kind' | 'addressType' | 'addressWireHex' | 'addressDisplay' | 'dataOffset' | 'dataLength' | 'dataHex' | 'rssiDbm'> & { adElements: number; adStatus: Selection['reports'][number]['advertising']['status']; adIssues: number; adUnparsedBytes: number; serviceReadings: number; serviceMatched: number; serviceOpaque: number; serviceInvalid: number; serviceIncomplete: number; bthomeComplete: number; bthomeUnsupported: number; bthomeMalformed: number; bthomeLimit: number; bthomeOpaque: number }>;
export function summarizeLegacyReports(reports: Selection['reports']): readonly LegacySummary[] { return Object.freeze(reports.map(r => Object.freeze({ index: r.index, reportOffset: r.reportOffset, eventType: r.eventType, kind: r.kind, addressType: r.addressType, addressWireHex: r.addressWireHex, addressDisplay: r.addressDisplay, dataOffset: r.dataOffset, dataLength: r.dataLength, dataHex: r.dataHex, rssiDbm: r.rssiDbm, adElements: r.advertising.elements.length, adStatus: r.advertising.status, adIssues: r.advertising.issues.length, adUnparsedBytes: r.advertising.unparsedHex.length / 2, serviceReadings: r.serviceReadings.length, serviceMatched: r.serviceReadings.filter(s => s.reading.status === 'format-match').length, serviceOpaque: r.serviceReadings.filter(s => s.reading.status === 'opaque').length, serviceInvalid: r.serviceReadings.filter(s => s.reading.status === 'invalid').length, serviceIncomplete: r.serviceReadings.filter(s => 'parseStatus' in s.reading && s.reading.parseStatus !== 'complete').length, bthomeComplete: r.serviceReadings.filter(s => 'parseStatus' in s.reading && s.reading.parseStatus === 'complete').length, bthomeUnsupported: r.serviceReadings.filter(s => 'parseStatus' in s.reading && s.reading.parseStatus === 'unsupported-object').length, bthomeMalformed: r.serviceReadings.filter(s => 'parseStatus' in s.reading && s.reading.parseStatus === 'malformed').length, bthomeLimit: r.serviceReadings.filter(s => 'parseStatus' in s.reading && s.reading.parseStatus === 'limit-exceeded').length, bthomeOpaque: r.serviceReadings.filter(s => 'parseStatus' in s.reading && s.reading.parseStatus === 'opaque').length }))); }
export type ExtendedSummary = ReturnType<typeof selectHciExtendedMetadata>['reports'][number];
export interface HciWorkbenchState {
 readonly inputRevision: number;
 readonly extendedIndex: number | null; readonly extendedReports: readonly ExtendedSummary[]; readonly extendedCount: number; readonly extendedPage: number;
 readonly preparedDocument: string | null; readonly preparingDocument: boolean;
 readonly draft: string; readonly provenance: HciContext['provenance'] | null;
 readonly metadata: Metadata | null; readonly selectedIndex: number | null; readonly reports: readonly LegacySummary[];
 readonly reportCount: number; readonly reportPage: number; readonly pending: boolean; readonly rejectedEdit: boolean; readonly message: string;
}
const initial = (): HciWorkbenchState => Object.freeze({ inputRevision: 0, preparedDocument: null, preparingDocument: false, draft: '', provenance: null, extendedIndex: null, extendedReports: Object.freeze([]), extendedCount: 0, extendedPage: 0, metadata: null, selectedIndex: null, reports: Object.freeze([]), reportCount: 0, reportPage: 0, pending: false, rejectedEdit: false, message: 'Paste hex and declare provenance, then Inspect metadata.' });
export class HciWorkbenchController {
 #state = initial(); #active: boolean; #lease = 0; #generation = 0;
 #inputLabel = 'pasted HCI bytes';
 #prepared: PreparedHci | null = null; #selected: readonly LegacySummary[] = Object.freeze([]);
 #extended: readonly ExtendedSummary[] = Object.freeze([]);
 readonly #hash: (bytes: Uint8Array) => Promise<string>;
 constructor(active: boolean, hash: (bytes: Uint8Array) => Promise<string>) { this.#active = active; this.#hash = hash; Object.freeze(this); }
 get state() { return this.#state; } get lease() { return this.#lease; }
 isActive(lease: number) { return this.#active && lease === this.#lease; }
 activate() { if (!this.#active) { this.#active = true; ++this.#lease; } }
 #publish(changes: Partial<HciWorkbenchState>) { this.#state = Object.freeze({ ...this.#state, ...changes }); }
 #reset(message: string, changes: Partial<HciWorkbenchState> = {}) {
  ++this.#generation; this.#prepared = null; this.#selected = Object.freeze([]); this.#extended = Object.freeze([]);
  this.#publish({ inputRevision: this.#state.inputRevision + 1, preparedDocument: null, preparingDocument: false, extendedIndex: null, extendedReports: Object.freeze([]), extendedCount: 0, extendedPage: 0, metadata: null, selectedIndex: null, reports: Object.freeze([]), reportCount: 0, reportPage: 0, pending: false, message, ...changes });
 }
 deactivate() { this.#active = false; ++this.#lease; this.#reset('Inspection cleared on leaving this inspector or Analysis. Draft, declaration and rejected-edit fence retained.'); }
 edit(draft: string, lease: number) {
  if (!this.isActive(lease)) return;
  this.#inputLabel = 'pasted HCI bytes';
  if (typeof draft !== 'string' || draft.length > HCI_HEX_LIMIT || /[^0-9a-fA-F]/.test(draft)) this.#reset('Edit rejected whole. Previous draft retained; Inspect blocked until accepted replacement or Clear.', { rejectedEdit: true });
  else this.#reset('Draft changed; inspect explicitly. Odd-length drafts may be typed but cannot be inspected.', { draft, rejectedEdit: false });
 }
 declare(provenance: HciContext['provenance'], lease: number) { if (this.isActive(lease)) this.#reset('Declaration changed; inspect explicitly.', { provenance: provenance === 'synthetic-fixture' || provenance === 'recorded-import' ? provenance : null }); }
 example(lease: number) { if (this.isActive(lease)) { this.#inputLabel = 'manually authored HCI example'; this.#reset('Manually authored example loaded, not inspected.', { draft: HCI_EXAMPLE, provenance: 'synthetic-fixture', rejectedEdit: false }); } }
 clear(lease: number) { if (this.isActive(lease)) this.#reset('Draft and declaration cleared.', { draft: '', provenance: null, rejectedEdit: false }); }
 /** Atomic native-file handoff. No parse, hash or inspection occurs here. */
 stageFileBytes(bytes: Uint8Array, lease: number, observed: HciWorkbenchState): boolean {
  if (!this.isActive(lease) || observed !== this.#state) return false;
  try {
   if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer) ||
       ('resizable' in bytes.buffer && bytes.buffer.resizable) || bytes.byteLength < 16 || bytes.byteLength > HCI_HEX_LIMIT / 2)
    throw new Error('Invalid supplied HCI bytes');
   const draft = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
   if (!this.isActive(lease) || observed !== this.#state) return false;
   this.#inputLabel = 'selected native HCI file';
   this.#reset('Exact selected file bytes loaded into the draft. Imported provenance is declared, not verified. Inspect metadata explicitly.', { draft, provenance: 'recorded-import', rejectedEdit: false });
   return true;
  } catch {
   if (this.isActive(lease) && observed === this.#state) this.#reset('File bytes refused whole. Previous draft retained; Inspect blocked until accepted replacement or Clear.', { rejectedEdit: true });
   return false;
  }
 }
 async inspect(lease: number) {
  if (!this.isActive(lease) || this.#state.pending || this.#state.rejectedEdit) return;
  this.#reset('Inspecting supplied bytes locally.'); const generation = this.#generation;
  if (!this.#state.provenance) { this.#publish({ message: 'Declare synthetic or imported provenance first.' }); return; }
  this.#publish({ pending: true });
  try {
   const bytes = decodeHciHex(this.#state.draft);
   const prepared = await prepareHci(bytes, { provenance: this.#state.provenance, label: this.#inputLabel }, this.#hash);
   if (!this.isActive(lease) || generation !== this.#generation) return;
   this.#prepared = prepared;
   this.#publish({ pending: false, metadata: listHciRecords(prepared, 0, HCI_PAGE), message: 'Metadata inspected. Explicitly select legacy reports or extended header metadata; classification is not validation.' });
  } catch { if (this.isActive(lease) && generation === this.#generation) this.#publish({ pending: false, message: 'Inspection refused: require bounded even-length hex, supported btsnoop/H4 framing and a successful local byte hash.' }); }
 }
 page(start: number, lease: number, observed: HciWorkbenchState) {
  if (!this.isActive(lease) || observed !== this.#state || !this.#prepared || !Number.isSafeInteger(start) || start < 0 || start % HCI_PAGE || start >= this.#prepared.recordCount) return;
  this.#publish({ metadata: listHciRecords(this.#prepared, start, HCI_PAGE) });
 }
 select(index: number, lease: number, observed: HciWorkbenchState) {
  if (!this.isActive(lease) || observed !== this.#state || !this.#prepared || !this.#state.metadata?.records.some(r => r.index === index && r.classification === 'legacy-advertising-candidate')) return;
  this.#clearSelection();
  try {
   const result = selectHciLegacyEvent(this.#prepared, index);
   this.#selected = summarizeLegacyReports(result.reports);
   this.#publish({ selectedIndex: index, reports: Object.freeze(this.#selected.slice(0, HCI_PAGE)), reportCount: this.#selected.length, message: 'Selected whole legacy transport framing accepted. AD and service interpretation have separate statuses; no authentication or sensor truth established.' });
  } catch { this.#publish({ message: 'Whole legacy event refused; no partial reports shown.' }); }
 }
 async prepareDocument(lease: number, observed: HciWorkbenchState) {
  if (!this.isActive(lease) || observed !== this.#state || !this.#prepared || this.#state.selectedIndex === null || this.#state.preparingDocument) return;
  const generation = ++this.#generation, prepared = this.#prepared, index = this.#state.selectedIndex;
  this.#publish({ preparingDocument: true, preparedDocument: null, message: 'Preparing only the explicitly selected whole event. Pending hash is fenced, not cancelled.' });
  try {
   const document = await createHciLegacyEventDocument(prepared, index, this.#hash);
   if (!this.isActive(lease) || generation !== this.#generation) return;
   this.#publish({ preparingDocument: false, preparedDocument: document, message: 'Selected event document prepared in memory. Open it separately, then explicitly Verify/reopen.' });
  } catch { if (this.isActive(lease) && generation === this.#generation) this.#publish({ preparingDocument: false, preparedDocument: null, message: 'Selected event preparation refused. No document available.' }); }
 }
 takeDocument(lease: number, observed: HciWorkbenchState): string | null {
  if (!this.isActive(lease) || observed !== this.#state || !this.#state.preparedDocument) return null;
  const document = this.#state.preparedDocument;
  ++this.#generation;
  this.#publish({ preparedDocument: null, preparingDocument: false });
  return document;
 }
 #clearSelection() {
  ++this.#generation;
  this.#selected = Object.freeze([]); this.#extended = Object.freeze([]);
  this.#publish({ preparedDocument: null, preparingDocument: false, selectedIndex: null, reports: Object.freeze([]), reportCount: 0, reportPage: 0, extendedIndex: null, extendedReports: Object.freeze([]), extendedCount: 0, extendedPage: 0 });
 }
 selectExtended(index: number, lease: number, observed: HciWorkbenchState) {
  if (!this.isActive(lease) || observed !== this.#state || !this.#prepared || !this.#state.metadata?.records.some(r => r.index === index && r.classification === 'extended-advertising-uninspected')) return;
  this.#clearSelection();
  try {
   // The core returns a deeply frozen, metadata-only tree after whole-event validation.
   // Keep only report headers, never the prepared handle, source bytes or payload.
   this.#extended = selectHciExtendedMetadata(this.#prepared, index).reports;
   this.#publish({ extendedIndex: index, extendedReports: Object.freeze(this.#extended.slice(0, HCI_PAGE)), extendedCount: this.#extended.length, message: 'Selected whole extended transport framing accepted. Header metadata only; structural acceptance is not exhaustive semantic legality. Host-feature and scanner context unknown.' });
  } catch { this.#publish({ message: 'Whole extended event refused; no partial reports shown.' }); }
 }
 extendedPage(page: number, lease: number, observed: HciWorkbenchState) {
  if (!this.isActive(lease) || observed !== this.#state || !Number.isSafeInteger(page) || page < 0 || page * HCI_PAGE >= this.#extended.length) return;
  this.#publish({ extendedPage: page, extendedReports: Object.freeze(this.#extended.slice(page * HCI_PAGE, (page + 1) * HCI_PAGE)) });
 }
 reportPage(page: number, lease: number, observed: HciWorkbenchState) {
  if (!this.isActive(lease) || observed !== this.#state || !Number.isSafeInteger(page) || page < 0 || page * HCI_PAGE >= this.#selected.length) return;
  this.#publish({ reportPage: page, reports: Object.freeze(this.#selected.slice(page * HCI_PAGE, (page + 1) * HCI_PAGE)) });
 }
}
