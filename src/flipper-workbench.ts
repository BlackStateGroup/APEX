import { FLIPPER_LIMITS, inspectFlipperResponses } from '../packages/core/flipper-offline.ts';
import type { FlipperInspection, FlipperProvenance } from '../packages/core/flipper-offline.ts';

export const FLIPPER_TEXT_LIMIT = 196608;
export const FLIPPER_FRAME_PAGE = 4;
export const FLIPPER_FIELD_PAGE = 8;
// Manually authored response: ID 1, explicit status 0, has_next false, version 1.0.
export const FLIPPER_RESPONSE_FIXTURE = '0d 08 01 10 00 18 00 c2 02 04 08 01 10 00';
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
/** UI observations only. Exact source stays in draft; mutable parser bytes never escape. */
export type FlipperWorkbenchReport = Immutable<Omit<FlipperInspection, 'originalBytes'> & { byteLength: number }>;
function freezeSnapshot<T>(value: T): Immutable<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}
interface WorkbenchState {
  draft: string; provenance: FlipperProvenance | null; report: FlipperWorkbenchReport | null;
  framePage: number; selectedFrame: number; fieldPage: number; message: string;
}
export type FlipperWorkbenchState = Readonly<WorkbenchState>;
export const initialFlipperWorkbench: FlipperWorkbenchState = Object.freeze({
  draft: '', provenance: null, report: null, framePage: 0, selectedFrame: 0, fieldPage: 0,
  message: 'Paste complete hex pairs and declare provenance, then Inspect.',
});
export type FlipperWorkbenchAction =
  | { type: 'edit'; draft: string } | { type: 'provenance'; provenance: FlipperProvenance }
  | { type: 'fixture' } | { type: 'inspect' }
  | { type: 'frame-page'; page: number } | { type: 'select-frame'; index: number } | { type: 'field-page'; page: number };
/** ASCII SP, HT, LF, VT, FF, CR only, between complete pairs. No normalization of retained draft. */
export function parseFlipperHex(draft: string): Uint8Array {
  if (typeof draft !== 'string' || draft.length > FLIPPER_TEXT_LIMIT) throw new Error('Hex text budget exceeded (196608 characters).');
  let digits = 0;
  for (let i = 0; i < draft.length; i++) {
    const code = draft.charCodeAt(i);
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102)) digits++;
    else if (!((code >= 9 && code <= 13) || code === 32) || digits % 2) throw new Error('Use even hex pairs separated only by ASCII whitespace. Entire edit rejected.');
  }
  if (digits % 2) throw new Error('Use even hex pairs. Entire edit rejected.');
  if (digits / 2 > FLIPPER_LIMITS.input) throw new Error('Binary budget exceeded (65536 bytes). Entire edit rejected.');
  const hex = draft.replace(/[\x09-\x0d\x20]/g, '');
  const bytes = new Uint8Array(digits / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
const validPage = (page: number, count: number, size: number) => Number.isSafeInteger(page) && page >= 0 && page < Math.max(1, Math.ceil(count / size));
export function flipperSelectedFields(state: FlipperWorkbenchState) {
  const frame = state.report?.frames[state.selectedFrame];
  return frame ? [...frame.fields.map(field => ({ scope: 'envelope', ...field })), ...frame.content.fields.map(field => ({ scope: 'content', ...field }))] : [];
}
export function flipperVisibleFrames(state: FlipperWorkbenchState) {
  return state.report?.frames.slice(state.framePage * FLIPPER_FRAME_PAGE, (state.framePage + 1) * FLIPPER_FRAME_PAGE) ?? [];
}
export function flipperVisibleFields(state: FlipperWorkbenchState) {
  return flipperSelectedFields(state).slice(state.fieldPage * FLIPPER_FIELD_PAGE, (state.fieldPage + 1) * FLIPPER_FIELD_PAGE);
}
/** Reject accessor/inherited actions without invoking caller getters. Snapshot own data once. */
function snapshotAction(input: FlipperWorkbenchAction): FlipperWorkbenchAction {
  if (input === null || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) throw new Error('Invalid action');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const type = descriptors.type;
  if (!type || !Object.hasOwn(type, 'value')) throw new Error('Invalid action type');
  const kind: unknown = type.value;
  const field = kind === 'edit' ? 'draft' : kind === 'provenance' ? 'provenance' : kind === 'frame-page' || kind === 'field-page' ? 'page' : kind === 'select-frame' ? 'index' : kind === 'fixture' || kind === 'inspect' ? null : undefined;
  if (field === undefined || Reflect.ownKeys(input).length !== (field ? 2 : 1)) throw new Error('Invalid action shape');
  if (field) {
    const descriptor = descriptors[field];
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('Action values must be own data');
    return { type: kind, [field]: descriptor.value } as FlipperWorkbenchAction;
  }
  return { type: kind } as FlipperWorkbenchAction;
}
export function flipperWorkbenchReducer(state: FlipperWorkbenchState, input: FlipperWorkbenchAction): FlipperWorkbenchState {
  let action: FlipperWorkbenchAction;
  try { action = snapshotAction(input); }
  catch { return Object.freeze({ ...state, report: null, framePage: 0, selectedFrame: 0, fieldPage: 0, message: 'Invalid action rejected whole; previous draft retained and result cleared.' }); }
  return Object.freeze(transition(state, action));
}
function transition(state: FlipperWorkbenchState, action: FlipperWorkbenchAction): FlipperWorkbenchState {
  const invalidate = { ...state, report: null, framePage: 0, selectedFrame: 0, fieldPage: 0 };
  switch (action.type) {
    case 'edit':
      try { parseFlipperHex(action.draft); return { ...invalidate, draft: action.draft, message: 'Draft changed. Inspect explicitly to view results.' }; }
      catch (error) { return { ...invalidate, message: `${String(error)} Previous draft retained; result cleared.` }; }
    case 'provenance': return { ...invalidate, provenance: action.provenance === 'synthetic' || action.provenance === 'imported' ? action.provenance : null, message: 'Caller declaration changed. Inspect again.' };
    case 'fixture': return { ...initialFlipperWorkbench, draft: FLIPPER_RESPONSE_FIXTURE, provenance: 'synthetic', message: 'Manually authored synthetic response loaded. Not inspected.' };
    case 'inspect':
      try {
        if (!state.provenance) throw new Error('Declare synthetic or imported provenance first.');
        const bytes = parseFlipperHex(state.draft);
        if (!bytes.length) throw new Error('Paste at least one response byte.');
        const { originalBytes, ...observations } = inspectFlipperResponses(bytes, { provenance: state.provenance });
        const report = freezeSnapshot({ ...observations, byteLength: originalBytes.length });
        return { ...invalidate, report, message: 'Offline inspection only. No device identity or authentication established.' };
      } catch (error) { return { ...invalidate, message: `Inspection error: ${String(error)}` }; }
    case 'frame-page': return state.report && validPage(action.page, state.report.frames.length, FLIPPER_FRAME_PAGE) ? { ...state, framePage: action.page, selectedFrame: action.page * FLIPPER_FRAME_PAGE, fieldPage: 0 } : state;
    case 'select-frame': return state.report && Number.isSafeInteger(action.index) && action.index >= state.framePage * FLIPPER_FRAME_PAGE && action.index < Math.min(state.report.frames.length, (state.framePage + 1) * FLIPPER_FRAME_PAGE) ? { ...state, selectedFrame: action.index, fieldPage: 0 } : state;
    case 'field-page': return state.report && validPage(action.page, flipperSelectedFields(state).length, FLIPPER_FIELD_PAGE) ? { ...state, fieldPage: action.page } : state;
  }
}
