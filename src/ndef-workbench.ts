import { importNdefObservation } from '../packages/core/ndef-offline.ts';
import type { NdefObservation } from '../packages/core/ndef-offline.ts';
import { prepareNdefEvidenceInput, readNdefEvidencePayload } from '../packages/core/ndef-evidence.ts';
import type { NdefEvidenceInput } from '../packages/core/ndef-evidence.ts';
import { parseEvidence } from '../packages/core/evidence.ts';
import type { EvidenceRecord } from '../packages/core/evidence.ts';

export interface NdefWorkbenchState {
  document: string;
  revision: number;
  observation: NdefObservation | null;
  saveInput: NdefEvidenceInput | null;
  pending: number | null;
  savedDocument: string | null;
  message: string;
}
export const initialNdefWorkbench: NdefWorkbenchState = {
  document: '', revision: 0, observation: null, saveInput: null,
  pending: null, savedDocument: null, message: 'Paste an offline NDEF envelope or load the synthetic demo, then interpret.',
};
export type NdefWorkbenchAction =
  | { type: 'edit'; document: string }
  | { type: 'interpret' }
  | { type: 'save-start' }
  | { type: 'save-finish'; revision: number; document: string; error?: string };
export function canSaveNdef(state: NdefWorkbenchState): boolean {
  return state.pending === null && state.saveInput !== null && state.savedDocument !== state.document;
}
/** No I/O. Edits invalidate findings immediately; late saves cannot restore stale findings. */
export function ndefWorkbenchReducer(state: NdefWorkbenchState, action: NdefWorkbenchAction): NdefWorkbenchState {
  switch (action.type) {
    case 'edit': return { ...state, document: action.document, revision: state.revision + 1,
      observation: null, saveInput: null, message: 'Input changed. Interpret again before saving.' };
    case 'interpret': {
      if (state.pending !== null) return state;
      try {
        const observation = importNdefObservation(state.document);
        try {
          const saveInput = prepareNdefEvidenceInput(state.document);
          return { ...state, observation, saveInput, message: 'Offline interpretation ready. Capture and identity remain unverified.' };
        } catch (error) {
          return { ...state, observation, saveInput: null, message: `Interpreted, but not saveable: ${String(error)}` };
        }
      } catch (error) {
        return { ...state, observation: null, saveInput: null, message: `NDEF import error: ${String(error)}` };
      }
    }
    case 'save-start': return canSaveNdef(state) ? { ...state, pending: state.revision, message: 'Saving exact document locally…' } : state;
    case 'save-finish': {
      if (state.pending !== action.revision) return state;
      const next = { ...state, pending: null, savedDocument: action.error ? state.savedDocument : action.document };
      if (state.revision !== action.revision) return next;
      return { ...next, message: action.error ? `NDEF save failed: ${action.error}` : 'NDEF document saved to local evidence.' };
    }
  }
}

/** Verify a private snapshot, then re-interpret it. Never display an unverified stored result. */
export async function reopenNdefEvidence(record: EvidenceRecord, verify: (record: EvidenceRecord) => Promise<boolean>) {
  const snapshot = parseEvidence(JSON.stringify(record));
  if (snapshot.kind !== 'analysis.ndef') throw new Error('Not NDEF evidence');
  if (!await verify(snapshot)) throw new Error('Evidence digest mismatch. NDEF interpretation was not opened.');
  return { record: snapshot, observation: readNdefEvidencePayload(snapshot.payload) };
}
