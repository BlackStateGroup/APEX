import { validateBleFieldHypothesis, MAX_FIELD_HYPOTHESIS_CHARACTERS } from '../packages/core/ble-field-hypothesis.ts';
export type CandidateReport = ReturnType<typeof validateBleFieldHypothesis>;
export const CANDIDATE_PAGE_SIZE = 4;
export interface BleCandidateState {
  document: string; report: CandidateReport | null; sourceIndex: number; page: number; message: string;
}
export const initialBleCandidateState: BleCandidateState = {
  document: '', report: null, sourceIndex: 0, page: 0,
  message: 'Paste a candidate document or load the synthetic fixture, then Analyze.',
};
export type BleCandidateAction = { type: 'edit'; document: string } | { type: 'analyze' }
  | { type: 'source'; index: number } | { type: 'page'; page: number };
/** Pure, bounded offline controller. No persistence or device/provider access. */
export function bleCandidateReducer(state: BleCandidateState, action: BleCandidateAction): BleCandidateState {
  switch (action.type) {
    case 'edit': {
      const refused = action.document.length > MAX_FIELD_HYPOTHESIS_CHARACTERS;
      return { ...state, document: refused ? state.document : action.document, report: null, sourceIndex: 0, page: 0,
        message: refused ? `Paste rejected whole: maximum ${MAX_FIELD_HYPOTHESIS_CHARACTERS} UTF-16 code units. Previous draft retained; results cleared.`
          : 'Draft changed. Analyze again. Draft is not persisted.' };
    }
    case 'analyze': {
      try { return { ...state, report: validateBleFieldHypothesis(state.document), sourceIndex: 0, page: 0,
        message: 'Declared candidate check ready. No physical validation. Draft is not persisted.' }; }
      catch (error) { return { ...state, report: null, sourceIndex: 0, page: 0,
        message: `Candidate document error: ${error instanceof Error ? error.message : String(error)}` }; }
    }
    case 'source': return Number.isInteger(action.index) && state.report?.sources[action.index]
      ? { ...state, sourceIndex: action.index, page: 0 } : state;
    case 'page': {
      const count = bleCandidateSummary(state)?.rowCount ?? 0;
      return Number.isInteger(action.page) && action.page >= 0 && action.page * CANDIDATE_PAGE_SIZE < count
        ? { ...state, page: action.page } : state;
    }
  }
}
export function bleCandidateSummary(state: BleCandidateState) {
  const report = state.report;
  if (!report) return null;
  const selected = report.sources[state.sourceIndex]!;
  const source = report.dataset.sources.find(source => source.id === selected.sourceId)!;
  const rows = report.results.filter(row => row.sourceId === selected.sourceId);
  return { source, subsets: selected.subsets, rowCount: rows.length, pageCount: Math.ceil(rows.length / CANDIDATE_PAGE_SIZE),
    rows: rows.slice(state.page * CANDIDATE_PAGE_SIZE, (state.page + 1) * CANDIDATE_PAGE_SIZE),
    unselectedTrialIds: report.dataset.trials.filter(trial => trial.sourceId === source.id && report.unselectedTrialIds.includes(trial.id)).map(trial => trial.id) };
}
export function exactCandidateValue(value: CandidateReport['results'][number]['value']): string {
  return value === null ? 'incomplete (not zero)' : `${value.numerator}/${value.denominator} (approximate display only: ${value.approximate})`;
}
