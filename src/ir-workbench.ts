import { inspectIrFile, IrInspectionError, IR_LIMITS } from '../packages/core/ir-offline.ts';
import type { IrContext, IrInspection, IrStringHasher } from '../packages/core/ir-offline.ts';
export const IR_RECORD_PAGE = 4;
// Independently authored example, not upstream bytes or a physical recording.
export const IR_EXAMPLE = 'Filetype: IR signals file\nVersion: 1\n# Manually authored example\nname: Example NEC\ntype: parsed\nprotocol: NEC\naddress: 04 00 00 00\ncommand: 08 00 00 00\nname: Example raw timings\ntype: raw\nfrequency: 38000\nduty_cycle: 0.33\ndata: 9000 4500 563 563 563 563 563 1688 563 563 563 563 563 563 563 563 563 563 563 1688 563 1688 563 563 563 1688 563 1688 563 1688 563 1688 563 1688 563 563 563 563 563 563 563 1688 563 563 563 563 563 563 563 563 563 1688 563 1688 563 1688 563 563 563 1688 563 1688 563 1688 563 1688 563\n';
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export interface IrWorkbenchState {
  readonly draft: string; readonly provenance: IrContext['provenance'] | null;
  readonly report: Immutable<IrInspection> | null; readonly page: number;
  readonly pending: boolean; readonly rejectedEdit: boolean; readonly message: string;
}
const initial = (): IrWorkbenchState => Object.freeze({ draft: '', provenance: null, report: null, page: 0, pending: false, rejectedEdit: false, message: 'Paste an ordinary .ir remote and declare provenance, then Inspect.' });
/** Only a bounded display excerpt; the exact draft/report are never rewritten. */
export function irExcerpt(value: string): string {
  return `${JSON.stringify(value.slice(0, 64))} [${value.length > 64 ? 'excerpt: first 64 of ' : ''}${value.length} ASCII characters]`;
}
export function irVisibleRecords(state: IrWorkbenchState) {
  return state.report?.records.slice(state.page * IR_RECORD_PAGE, (state.page + 1) * IR_RECORD_PAGE) ?? [];
}
/** Private immutable observations and activation leases. In-flight hashing is fenced, not cancelled. */
export class IrWorkbenchController {
  #state = initial();
  #active: boolean;
  #lease = 0;
  #generation = 0;
  readonly #hash: IrStringHasher | undefined;
  constructor(active = true, localHash?: IrStringHasher) { this.#active = active; this.#hash = localHash; Object.freeze(this); }
  get state(): IrWorkbenchState { return this.#state; }
  get lease(): number { return this.#lease; }
  isActive(lease: number): boolean { return this.#active && lease === this.#lease; }
  activate() { if (!this.#active) { this.#active = true; ++this.#lease; } }
  #publish(state: IrWorkbenchState) { this.#state = Object.freeze(state); }
  #reset(message: string, changes: Partial<IrWorkbenchState> = {}) {
    ++this.#generation;
    this.#publish({ ...this.#state, report: null, page: 0, pending: false, message, ...changes });
  }
  deactivate() {
    this.#active = false; ++this.#lease;
    this.#reset(this.#state.rejectedEdit ? 'Draft retained; rejected edit still blocks Inspect until an accepted replacement or Clear.' : 'Inspection cleared on leaving this inspector or Analysis. Draft and declaration retained in memory; Inspect again.');
  }
  edit(draft: string, lease: number) {
    if (!this.isActive(lease)) return;
    if (typeof draft !== 'string' || draft.length > IR_LIMITS.bytes || /[^\x00-\x7f]/.test(draft)) {
      this.#reset('Edit rejected whole: maximum 262144 ASCII characters. Previous draft retained; Inspect blocked until an accepted replacement or Clear.', { rejectedEdit: true });
    } else this.#reset('Draft changed. Inspect explicitly; nothing is persisted.', { draft, rejectedEdit: false });
  }
  declare(provenance: IrContext['provenance'], lease: number) {
    if (!this.isActive(lease)) return;
    this.#reset('Caller declaration changed. Inspect again; a rejected edit still blocks Inspect.', { provenance: provenance === 'synthetic-fixture' || provenance === 'recorded-import' ? provenance : null });
  }
  example(lease: number) {
    if (this.isActive(lease)) this.#reset('Manually authored synthetic example loaded, not inspected.', { draft: IR_EXAMPLE, provenance: 'synthetic-fixture', rejectedEdit: false });
  }
  clear(lease: number) { if (this.isActive(lease)) this.#reset('Draft, declaration and results cleared.', { draft: '', provenance: null, rejectedEdit: false }); }
  page(page: number, lease: number) {
    if (this.isActive(lease) && Number.isSafeInteger(page) && page >= 0 && this.#state.report && page * IR_RECORD_PAGE < this.#state.report.records.length) this.#publish({ ...this.#state, page });
  }
  async inspect(lease: number): Promise<void> {
    if (!this.isActive(lease) || this.#state.rejectedEdit || this.#state.pending) return;
    this.#reset('Checking strict .ir subset and hashing exact ASCII bytes locally…');
    const generation = this.#generation;
    const { draft, provenance } = this.#state;
    if (!provenance) { this.#reset('Declare synthetic or imported provenance first.'); return; }
    this.#publish({ ...this.#state, pending: true });
    try {
      // No TextEncoder dependency in controller/native. Accepted draft is ASCII.
      const bytes = Uint8Array.from(draft, c => c.charCodeAt(0));
      const report = await inspectIrFile(bytes, { provenance, sourceLabel: 'pasted ordinary .ir remote' }, this.#hash);
      if (!this.isActive(lease) || generation !== this.#generation) return;
      this.#publish({ ...this.#state, pending: false, report, message: 'Offline subset inspected. Digest identifies bytes, not authenticity, capture or compatibility.' });
    } catch (error) {
      if (!this.isActive(lease) || generation !== this.#generation) return;
      this.#publish({ ...this.#state, pending: false, report: null, message: error instanceof IrInspectionError ? `Subset rejected: ${error.code} at line ${error.line}. Unsupported does not mean physically invalid IR.` : 'Local inspection or hashing failed. No report produced.' });
    }
  }
}
