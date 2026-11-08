import { importBleObservation } from '../packages/core/ble-advertisements.ts';
import type { BleObservation } from '../packages/core/ble-advertisements.ts';
import { prepareBleEvidenceInput, readBleEvidencePayload } from '../packages/core/ble-evidence.ts';
import type { BleEvidenceInput } from '../packages/core/ble-evidence.ts';
import { prepareBlePlxSourceEvidenceDocument, readBlePlxSourceEvidencePayload } from '../packages/core/ble-plx-source-evidence.ts';
import type { BlePlxSourceEvidenceInput } from '../packages/core/ble-plx-source-evidence.ts';
import type { BlePlxPreparation } from '../packages/core/ble-plx-observation.ts';
import { parseEvidence } from '../packages/core/evidence.ts';
import type { EvidenceRecord } from '../packages/core/evidence.ts';

export interface BleWorkbenchState {
  mode: 'envelope' | 'selected-source';
  source: BlePlxPreparation | null;
  document: string;
  revision: number;
  observation: BleObservation | null;
  saveInput: BleEvidenceInput | BlePlxSourceEvidenceInput | null;
  pending: number | null;
  savedDocument: string | null;
  message: string;
}
export const initialBleWorkbench: BleWorkbenchState = {
  mode: 'envelope', source: null, document: '', revision: 0, observation: null, saveInput: null,
  pending: null, savedDocument: null, message: 'Paste an offline BLE envelope or load the synthetic demo, then interpret.',
};
export type BleWorkbenchAction =
  | { type: 'edit'; document: string; mode?: BleWorkbenchState['mode'] }
  | { type: 'interpret' }
  | { type: 'save-start' }
  | { type: 'save-finish'; revision: number; document: string; error?: string };
export function canSaveBle(state: BleWorkbenchState): boolean {
  return state.pending === null && state.saveInput !== null && state.savedDocument !== state.document;
}
/** No I/O. Edits invalidate findings immediately; late saves cannot restore stale findings. */
export function bleWorkbenchReducer(state: BleWorkbenchState, action: BleWorkbenchAction): BleWorkbenchState {
  switch (action.type) {
    case 'edit': return { ...state, mode: action.mode ?? state.mode, source: null, document: action.document, revision: state.revision + 1,
      observation: null, saveInput: null, message: 'Input changed. Interpret again before saving.' };
    case 'interpret': {
      if (state.pending !== null) return state;
      try {
        if (state.mode === 'selected-source') {
          const saveInput = prepareBlePlxSourceEvidenceDocument(state.document);
          const source = readBlePlxSourceEvidencePayload(saveInput.payload);
          return { ...state, source, observation: source.observation, saveInput, message: source.observation
            ? 'Selected source validated and interpreted. Save retains the exact source document, not just its projection.'
            : 'Selected source validated and retainable. Android raw scan bytes are unavailable; no advertisement interpretation is possible.' };
        }
        const observation = importBleObservation(state.document);
        try {
          const saveInput = prepareBleEvidenceInput(state.document);
          return { ...state, observation, saveInput, message: 'Offline interpretation ready. Capture and identity remain unverified.' };
        } catch (error) {
          return { ...state, observation, saveInput: null, message: `Interpreted, but not saveable: ${String(error)}` };
        }
      } catch (error) {
        return { ...state, source: null, observation: null, saveInput: null, message: `BLE import error: ${String(error)}` };
      }
    }
    case 'save-start': return canSaveBle(state) ? { ...state, pending: state.revision, message: 'Saving exact document locally…' } : state;
    case 'save-finish': {
      if (state.pending !== action.revision) return state;
      const next = { ...state, pending: null, savedDocument: action.error ? state.savedDocument : action.document };
      if (state.revision !== action.revision) return next;
      return { ...next, message: action.error ? `BLE save failed: ${action.error}` : 'BLE document saved to local evidence.' };
    }
  }
}

/** Verify a private snapshot, then re-interpret it. Never display an unverified stored result. */
export async function reopenBleEvidence(record: EvidenceRecord, verify: (record: EvidenceRecord) => Promise<boolean>) {
  const snapshot = parseEvidence(JSON.stringify(record));
  if (snapshot.kind !== 'analysis.ble' && snapshot.kind !== 'analysis.ble-source') throw new Error('Not BLE evidence');
  if (!await verify(snapshot)) throw new Error('Evidence digest mismatch. BLE interpretation was not opened.');
  if (snapshot.kind === 'analysis.ble-source') {
    const source = readBlePlxSourceEvidencePayload(snapshot.payload);
    return { record: snapshot, source, observation: source.observation };
  }
  return { record: snapshot, source: null, observation: readBleEvidencePayload(snapshot.payload) };
}

/** A verified source may be retainable without an interpretable advertisement. */
export function bleReopenMessage(observation: BleObservation | null): string {
  return observation
    ? 'Digest verified. Reinterpreted locally; reception and identity still unverified.'
    : 'Digest verified. Selected source reopened; advertisement interpretation unavailable because Android raw scan bytes are unavailable. Reception and identity still unverified.';
}
