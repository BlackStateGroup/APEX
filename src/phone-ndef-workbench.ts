import { importPhoneNdefObservation } from '../packages/core/nfc-manager-ndef.ts';
import type { PhoneNdefObservation } from '../packages/core/nfc-manager-ndef.ts';
import { preparePhoneNdefEvidenceInput, readPhoneNdefEvidencePayload } from '../packages/core/phone-ndef-evidence.ts';
import type { PhoneNdefEvidenceInput } from '../packages/core/phone-ndef-evidence.ts';
import { parseEvidence } from '../packages/core/evidence.ts';
import type { EvidenceRecord } from '../packages/core/evidence.ts';

export interface PhoneNdefWorkbenchState {
  expectedPlatform: 'android' | 'ios';
  document: string;
  revision: number;
  observation: PhoneNdefObservation | null;
  saveInput: PhoneNdefEvidenceInput | null;
  pending: number | null;
  savedDocument: string | null;
  message: string;
}
export const initialPhoneNdefWorkbench: PhoneNdefWorkbenchState = {
  expectedPlatform: 'android', document: '', revision: 0, observation: null, saveInput: null,
  pending: null, savedDocument: null, message: 'Select the expected phone platform and paste a normalized selected-field document, then interpret.',
};
export type PhoneNdefWorkbenchAction =
  | { type: 'edit'; document: string; expectedPlatform?: 'android' | 'ios' }
  | { type: 'interpret' }
  | { type: 'save-start' }
  | { type: 'save-finish'; revision: number; document: string; error?: string };
export function canSavePhoneNdef(state: PhoneNdefWorkbenchState): boolean {
  return state.pending === null && state.saveInput !== null && state.savedDocument !== state.document;
}
/** No I/O. Edits invalidate findings immediately; late saves cannot restore stale findings. */
export function phoneNdefWorkbenchReducer(state: PhoneNdefWorkbenchState, action: PhoneNdefWorkbenchAction): PhoneNdefWorkbenchState {
  switch (action.type) {
    case 'edit': return { ...state, document: action.document, expectedPlatform: action.expectedPlatform ?? state.expectedPlatform, revision: state.revision + 1,
      observation: null, saveInput: null, message: 'Input changed. Interpret again before saving.' };
    case 'interpret': {
      if (state.pending !== null) return state;
      try {
        const observation = importPhoneNdefObservation(state.document, state.expectedPlatform);
        try {
          const saveInput = preparePhoneNdefEvidenceInput(state.document, state.expectedPlatform);
          return { ...state, observation, saveInput, message: 'Selected fields interpreted. Original wire, reception, identity and source timestamp are unavailable or unverified.' };
        } catch (error) {
          return { ...state, observation, saveInput: null, message: `Interpreted, but not saveable: ${String(error)}` };
        }
      } catch (error) {
        return { ...state, observation: null, saveInput: null, message: `NDEF import error: ${String(error)}` };
      }
    }
    case 'save-start': return canSavePhoneNdef(state) ? { ...state, pending: state.revision, message: 'Saving exact document locally…' } : state;
    case 'save-finish': {
      if (state.pending !== action.revision) return state;
      const next = { ...state, pending: null, savedDocument: action.error ? state.savedDocument : action.document };
      if (state.revision !== action.revision) return next;
      return { ...next, message: action.error ? `NDEF save failed: ${action.error}` : 'NDEF document saved to local evidence.' };
    }
  }
}

/** Verify a private snapshot, then re-interpret it. Never display an unverified stored result. */
export async function reopenPhoneNdefEvidence(record: EvidenceRecord, verify: (record: EvidenceRecord) => Promise<boolean>) {
  const snapshot = parseEvidence(JSON.stringify(record));
  if (snapshot.kind !== 'analysis.ndef-source') throw new Error('Not NDEF evidence');
  if (!await verify(snapshot)) throw new Error('Evidence digest mismatch. NDEF interpretation was not opened.');
  return { record: snapshot, observation: readPhoneNdefEvidencePayload(snapshot.payload) };
}
