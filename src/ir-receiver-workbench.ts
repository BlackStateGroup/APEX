import { inspectIrReceiverExcerpt, IrReceiverImportError, IR_RECEIVER_LIMITS } from '../packages/core/ir-receiver-import.ts';
import type { IrReceiverInspection } from '../packages/core/ir-receiver-import.ts';
import type { IrContext, IrStringHasher } from '../packages/core/ir-offline.ts';
// Original synthetic values, not upstream fixture bytes or a physical recording.
export const IR_RECEIVER_EXAMPLE = '// Manually authored synthetic timing excerpt\nuint16_t rawData[3] = {9000, 2250, 563};  // no carrier metadata\n';
export interface IrReceiverWorkbenchState {
  readonly draft: string; readonly provenance: IrContext['provenance'] | null;
  readonly report: IrReceiverInspection | null; readonly page: number;
  readonly pending: boolean; readonly rejectedEdit: boolean; readonly message: string;
}
export class IrReceiverWorkbenchController {
  #state: IrReceiverWorkbenchState = Object.freeze({ draft: '', provenance: null, report: null, page: 0, pending: false, rejectedEdit: false, message: 'Paste rawData source-code excerpts and declare provenance, then Inspect.' });
  #active: boolean; #lease = 0; #generation = 0; readonly #hash: IrStringHasher | undefined;
  constructor(active = true, localHash?: IrStringHasher) { this.#active = active; this.#hash = localHash; Object.freeze(this); }
  get state() { return this.#state; }
  get lease() { return this.#lease; }
  isActive(lease: number) { return this.#active && lease === this.#lease; }
  activate() { if (!this.#active) { this.#active = true; ++this.#lease; } }
  #reset(message: string, changes: Partial<IrReceiverWorkbenchState> = {}) {
    ++this.#generation;
    this.#state = Object.freeze({ ...this.#state, report: null, page: 0, pending: false, message, ...changes });
  }
  deactivate() { this.#active = false; ++this.#lease; this.#reset('Receiver result cleared on leaving. Draft retained; rejected edits still block Inspect.'); }
  edit(draft: string, lease: number) {
    if (!this.isActive(lease)) return;
    if (typeof draft !== 'string' || draft.length > IR_RECEIVER_LIMITS.bytes || /[^\x00-\x7f]/.test(draft)) {
      this.#reset('Edit rejected whole: maximum 262144 ASCII characters. Previous draft retained; Inspect blocked until an accepted replacement or Clear.', { rejectedEdit: true });
    } else this.#reset('Receiver draft changed. Inspect explicitly; nothing is persisted.', { draft, rejectedEdit: false });
  }
  declare(provenance: IrContext['provenance'], lease: number) {
    if (this.isActive(lease)) this.#reset('Caller declaration changed. Inspect again; rejected edits still block Inspect.', { provenance: provenance === 'synthetic-fixture' || provenance === 'recorded-import' ? provenance : null });
  }
  example(lease: number) { if (this.isActive(lease)) this.#reset('Original synthetic timing example loaded, not inspected.', { draft: IR_RECEIVER_EXAMPLE, provenance: 'synthetic-fixture', rejectedEdit: false }); }
  clear(lease: number) { if (this.isActive(lease)) this.#reset('Receiver draft, declaration and results cleared.', { draft: '', provenance: null, rejectedEdit: false }); }
  page(page: number, lease: number) {
    if (this.isActive(lease) && Number.isSafeInteger(page) && page >= 0 && this.#state.report && page * 4 < this.#state.report.records.length) this.#state = Object.freeze({ ...this.#state, page });
  }
  async inspect(lease: number) {
    if (!this.isActive(lease) || this.#state.rejectedEdit || this.#state.pending) return;
    const { draft, provenance } = this.#state;
    if (!provenance) { this.#reset('Declare synthetic or imported receiver provenance first.'); return; }
    this.#reset('Checking bounded receiver excerpt and hashing accepted ASCII draft locally…', { pending: true });
    const generation = this.#generation;
    try {
      const report = await inspectIrReceiverExcerpt(draft, { provenance, sourceLabel: 'pasted IRremoteESP8266 rawData excerpt' }, this.#hash);
      if (!this.isActive(lease) || generation !== this.#generation) return;
      this.#state = Object.freeze({ ...this.#state, pending: false, report, message: 'Receiver excerpt inspected offline. Carrier, capture completeness and authenticity remain unverified.' });
    } catch (error) {
      if (!this.isActive(lease) || generation !== this.#generation) return;
      this.#state = Object.freeze({ ...this.#state, pending: false, report: null, message: error instanceof IrReceiverImportError ? `Receiver subset rejected: ${error.code} at line ${error.line}. No partial report; unsupported does not mean physically invalid IR.` : 'Local receiver inspection or hashing failed. No report produced.' });
    }
  }
}
