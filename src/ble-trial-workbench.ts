import { analyzeBleDifferential, MAX_DIFFERENTIAL_CHARACTERS } from '../packages/core/ble-differential.ts';
export type TrialReport = ReturnType<typeof analyzeBleDifferential>;
export const OFFSET_PAGE_SIZE = 16;
export interface BleTrialState {
  document: string;
  report: TrialReport | null;
  sourceIndex: number;
  offset: number;
  page: number;
  message: string;
}
export const initialBleTrialState: BleTrialState = {
  document: '', report: null, sourceIndex: 0, offset: 0, page: 0,
  message: 'Paste a trial dataset or load the synthetic fixture, then Analyze.',
};
export type BleTrialAction =
  | { type: 'edit'; document: string }
  | { type: 'analyze' }
  | { type: 'source'; index: number }
  | { type: 'offset'; offset: number }
  | { type: 'page'; page: number };
/** Pure controller. No persistence, native calls, time stamping or provenance upgrades. */
export function bleTrialReducer(state: BleTrialState, action: BleTrialAction): BleTrialState {
  switch (action.type) {
    case 'edit': return { ...state, report: null, sourceIndex: 0, offset: 0, page: 0,
      document: action.document.length > MAX_DIFFERENTIAL_CHARACTERS ? state.document : action.document,
      message: action.document.length > MAX_DIFFERENTIAL_CHARACTERS
        ? `Paste rejected whole: maximum ${MAX_DIFFERENTIAL_CHARACTERS} UTF-16 code units. Previous draft retained; results cleared.`
        : 'Draft changed. Analyze again. Draft is not persisted.' };
    case 'analyze': {
      try { return { ...state, report: analyzeBleDifferential(state.document), sourceIndex: 0, offset: 0, page: 0,
        message: 'Byte comparison ready. Declarations remain unverified. Draft is not persisted.' }; }
      catch (error) { return { ...state, report: null, message: `Trial dataset error: ${error instanceof Error ? error.message : String(error)}` }; }
    }
    case 'source': return Number.isInteger(action.index) && state.report?.sources[action.index]
      ? { ...state, sourceIndex: action.index, offset: 0, page: 0 } : state;
    case 'offset': return Number.isInteger(action.offset) && state.report?.comparisons[state.sourceIndex]?.matrix[action.offset]
      ? { ...state, offset: action.offset, page: Math.floor(action.offset / OFFSET_PAGE_SIZE) } : state;
    case 'page': {
      const width = state.report?.comparisons[state.sourceIndex]?.matrix.length ?? 0;
      return Number.isInteger(action.page) && action.page >= 0 && action.page * OFFSET_PAGE_SIZE < width
        ? { ...state, page: action.page, offset: action.page * OFFSET_PAGE_SIZE } : state;
    }
  }
}
/** Bounded presentation projection; the full report and exact document stay in state. */
export function bleTrialSummary(state: BleTrialState) {
  const report = state.report;
  if (!report) return null;
  const source = report.sources[state.sourceIndex]!;
  const comparison = report.comparisons[state.sourceIndex]!;
  return {
    serviceUuid: report.serviceUuid, groups: report.groups, source,
    sourceCount: report.sources.length, trialCount: report.trials.length,
    trials: report.trials.filter(trial => trial.sourceId === source.id).map(trial => ({
      id: trial.id, groupId: trial.groupId, receiptId: trial.receiptId,
      bytes: trial.payloadHex.length / 2, interpretation: trial.interpretation,
      representation: trial.representation, adOffset: trial.adOffset,
    })),
    width: comparison.matrix.length, changedCount: comparison.changedOffsets.length,
    offsets: comparison.matrix.slice(state.page * OFFSET_PAGE_SIZE, (state.page + 1) * OFFSET_PAGE_SIZE)
      .map(row => ({ offset: row.offset, changed: row.changed })),
    detail: comparison.matrix[state.offset] ?? null,
    pageCount: Math.ceil(comparison.matrix.length / OFFSET_PAGE_SIZE),
  };
}
