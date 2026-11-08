import { CAN_FIXTURE, decodeNec, necFixture, parseCanLog } from '../packages/core/analysis.ts';
import { parseReaElfEvidence } from '../packages/core/rea-inspection.ts';
import type { EvidenceStore } from '../packages/core/evidence.ts';

export const MAX_RECORDING_INPUT_CHARACTERS = 262144;

type Format = 'NEC' | 'CAN' | 'REA ELF';
type SaveInput = Parameters<EvidenceStore['save']>[0];
/** Synchronous draft transitions and save claims; no native or provider operations. */
export class RecordingWorkbench {
  format: Format = 'NEC';
  input = JSON.stringify(necFixture());
  fixture = true;
  analysis = 'Load a fixture or paste a local recording, then analyse.';
  private rejectedEdit = false;
  private candidate: SaveInput | null = null;
  private pending = false;
  private savedKey: string | null = null;
  private key() { return JSON.stringify([this.format, this.fixture, this.input]); }
  get canSave() { return !this.pending && this.candidate !== null && this.savedKey !== this.key(); }
  edit(input: string, format: Format = this.format, fixture = false, message = 'Input changed. Analyse again before saving.') {
    this.candidate = null;
    this.rejectedEdit = input.length > MAX_RECORDING_INPUT_CHARACTERS;
    if (this.rejectedEdit) {
      this.analysis = `Paste rejected whole: maximum ${MAX_RECORDING_INPUT_CHARACTERS} UTF-16 code units. Previous draft retained; results cleared. Edit or load a fixture before analysing.`;
      return;
    }
    this.input = input; this.format = format; this.fixture = fixture;
    this.candidate = null; this.analysis = message;
  }
  loadFixture(format: 'NEC' | 'CAN') {
    this.edit(format === 'NEC' ? JSON.stringify(necFixture()) : CAN_FIXTURE, format, true, 'Fixture loaded. Ready to analyse.');
  }
  analyse() {
    this.candidate = null;
    if (this.rejectedEdit) return;
    try {
      if (this.input.length > MAX_RECORDING_INPUT_CHARACTERS) throw new Error('Input exceeds analysis limit');
      let result: unknown;
      if (this.format === 'REA ELF') result = parseReaElfEvidence(this.input);
      else if (this.format === 'NEC') {
        const value: unknown = JSON.parse(this.input);
        if (!Array.isArray(value) || value.some(x => typeof x !== 'number')) throw new Error('Expected a JSON array of pulse durations');
        result = decodeNec(value);
      } else {
        const frames = parseCanLog(this.input);
        result = { frames: frames.length, identifiers: [...new Set(frames.map(f => f.id.toString(16)))], firstFrame: frames[0] ?? null };
      }
      this.candidate = { kind: this.format === 'REA ELF' ? 'analysis.firmware' : this.format === 'NEC' ? 'analysis.nec' : 'analysis.can',
        source: this.fixture ? 'offline-fixture' : 'offline-import', payload: { format: this.format, result } };
      this.analysis = JSON.stringify({ source: this.fixture ? this.format === 'REA ELF' ? 'recorded lab sample' : 'synthetic fixture' : 'user-supplied offline data', format: this.format, result }, null, 2);
    } catch (error) { this.analysis = `Analysis error: ${error instanceof Error ? error.message : String(error)}`; }
  }
  async save(store: Pick<EvidenceStore, 'save'>): Promise<boolean> {
    if (!this.canSave || !this.candidate) return false;
    const candidate = this.candidate;
    const key = this.key();
    this.pending = true;
    try {
      await store.save(candidate);
      // Completion records only the persisted draft, never restores its report.
      this.savedKey = key;
      return true;
    } finally { this.pending = false; }
  }
}
