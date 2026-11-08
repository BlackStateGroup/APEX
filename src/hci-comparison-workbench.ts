import { readHciLegacyEventDocument, HCI_LEGACY_DOCUMENT_LIMIT } from '../packages/core/hci-offline.ts';
import { compareHciLegacyReportBytes } from '../packages/core/hci-report-comparison.ts';
import type { HciReportComparisonResult } from '../packages/core/hci-report-comparison.ts';
import { AnalysisSourceGate } from './analysis-navigation.ts';
export type Side = 'left' | 'right';
export type ComparisonSource = { id: number; document: string; index: number; side: Side };
type Opened = Awaited<ReturnType<typeof readHciLegacyEventDocument>>;
export type ReportMetadata = Readonly<Pick<Opened['selection']['reports'][number], 'index' | 'eventType' | 'kind' | 'addressType' | 'addressWireHex' | 'dataLength' | 'dataOffset'> & { adStatus: string }>;
export interface ComparisonSlot { readonly draft: string; readonly rejected: boolean; readonly pending: boolean; readonly requested: number | null; readonly selected: number | null; readonly page: number; readonly reports: readonly ReportMetadata[]; readonly value: Opened['value'] | null; readonly message: string }
export interface ComparisonState { readonly left: ComparisonSlot; readonly right: ComparisonSlot; readonly pending: boolean; readonly result: HciReportComparisonResult | null; readonly page: number; readonly message: string }
const validIndex = (index: number) => Number.isSafeInteger(index) && !Object.is(index, -0) && index >= 0 && index <= 24;
const empty = (): ComparisonSlot => Object.freeze({ draft: '', rejected: false, pending: false, requested: null, selected: null, page: 0, reports: Object.freeze([]), value: null, message: 'Explicitly Verify, then select a report.' });
export class HciComparisonController {
 #state: ComparisonState = Object.freeze({ left: empty(), right: empty(), pending: false, result: null, page: 0, message: 'Memory-only explicit comparison.' });
 #active: boolean; #lease = 0; #generation = 0; #sideGeneration = { left: 0, right: 0 }; #sources = new AnalysisSourceGate();
 readonly #hash: (b: Uint8Array) => Promise<string>;
 constructor(active: boolean, hash: (b: Uint8Array) => Promise<string>) { this.#active = active; this.#hash = hash; Object.freeze(this); }
 get state() { return this.#state; } get lease() { return this.#lease; }
 isActive(lease: number) { return this.#active && lease === this.#lease; }
 activate() { if (!this.#active) { this.#active = true; ++this.#lease; } }
 #publish(changes: Partial<ComparisonState>) { this.#state = Object.freeze({ ...this.#state, ...changes }); }
 #slot(side: Side, changes: Partial<ComparisonSlot>) { this.#publish({ [side]: Object.freeze({ ...this.#state[side], ...changes }) }); }
 #fence() { ++this.#generation; this.#publish({ pending: false, result: null, page: 0, message: 'Compare explicitly after both slots are verified and selected.' }); }
 #replace(side: Side, draft: string, requested: number | null = null) {
  this.#fence(); ++this.#sideGeneration[side];
  const rejected = typeof draft !== 'string' || draft.length > HCI_LEGACY_DOCUMENT_LIMIT;
  this.#slot(side, { ...empty(), draft: rejected ? this.#state[side].draft : draft, rejected, requested: rejected ? this.#state[side].requested : requested, message: rejected ? 'Whole edit rejected; old draft retained and verification fenced until replacement or Clear.' : 'Exact draft retained. Explicit Verify required.' });
 }
 deactivate() { this.#active = false; ++this.#lease; this.#fence(); for (const side of ['left','right'] as const) { ++this.#sideGeneration[side]; this.#slot(side, { pending: false, selected: null, value: null, reports: Object.freeze([]), page: 0, message: 'Verification cleared on exit. Draft and requested selection retained.' }); } }
 receive(source?: ComparisonSource | null) { if (source && (source.side === 'left' || source.side === 'right') && this.#sources.take(source)) this.#replace(source.side, source.document, validIndex(source.index) ? source.index : null); }
 #current(lease: number, state: ComparisonState) { return this.isActive(lease) && state === this.#state; }
 edit(side: Side, draft: string, lease: number, state: ComparisonState) { if (this.#current(lease,state)) this.#replace(side,draft); }
 clear(side: Side, lease: number, state: ComparisonState) { this.edit(side,'',lease,state); }
 example(left: string, right: string, lease: number, state: ComparisonState) { if (this.#current(lease,state)) { this.#replace('left',left); this.#replace('right',right); } }
 async verify(side: Side, lease: number, state: ComparisonState) {
  if (!this.#current(lease,state) || state[side].pending || state[side].rejected) return;
  this.#fence(); const generation = ++this.#sideGeneration[side], document = state[side].draft;
  this.#slot(side, { pending: true, value: null, reports: Object.freeze([]), selected: null, page: 0, message: 'Verifying whole derivative. Hash work is fenced, not cancelled.' });
  try {
   const opened = await readHciLegacyEventDocument(document,this.#hash);
   if (!this.isActive(lease) || generation !== this.#sideGeneration[side]) return;
   const reports = Object.freeze(opened.selection.reports.map(r => Object.freeze({ index:r.index,eventType:r.eventType,kind:r.kind,addressType:r.addressType,addressWireHex:r.addressWireHex,dataLength:r.dataLength,dataOffset:r.dataOffset,adStatus:r.advertising.status })));
   const requested = this.#state[side].requested;
   this.#slot(side, { pending:false,value:opened.value,reports,selected: requested !== null && reports.some(r=>r.index===requested) ? requested : null,message:'Derivative verified. Original references UNVERIFIED. Select explicitly unless already requested by staging.' });
  } catch { if (this.isActive(lease) && generation === this.#sideGeneration[side]) this.#slot(side,{pending:false,message:'Verification refused. No usable selected report.'}); }
 }
 select(side: Side, index: number, lease: number, state: ComparisonState) {
  if (!validIndex(index) || !this.#current(lease,state) || !state[side].value || !state[side].reports.slice(state[side].page*4,state[side].page*4+4).some(r=>r.index===index)) return;
  this.#fence(); this.#slot(side,{ selected:index, requested:index });
 }
 reportPage(side: Side, page: number, lease: number, state: ComparisonState) { if (this.#current(lease,state) && Number.isSafeInteger(page) && page>=0 && page*4<state[side].reports.length) this.#slot(side,{page}); }
 resultPage(page: number, lease: number, state: ComparisonState) { if (this.#current(lease,state) && Number.isSafeInteger(page) && page>=0 && state.result && page*8<state.result.rows.length) this.#publish({page}); }
 canCompare() { return this.#active && !this.#state.pending && (['left','right'] as const).every(s=>this.#state[s].value && !this.#state[s].pending && !this.#state[s].rejected && this.#state[s].selected !== null); }
 async compare(lease: number, state: ComparisonState) {
  if (!this.#current(lease,state) || !this.canCompare()) return;
  this.#fence(); const generation = this.#generation; this.#publish({pending:true,message:'Re-verifying both exact documents before comparison.'});
  try { const result = await compareHciLegacyReportBytes(state.left.draft,state.left.selected!,state.right.draft,state.right.selected!,this.#hash);
   if (this.isActive(lease) && generation === this.#generation) this.#publish({pending:false,result,message:'Mathematical selected-byte comparison only.'});
  } catch { if (this.isActive(lease) && generation === this.#generation) this.#publish({pending:false,message:'Comparison refused; no result.'}); }
 }
}
