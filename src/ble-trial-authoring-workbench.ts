import { BleTrialAuthoring } from '../packages/core/ble-trial-authoring.ts';
import type { BleTrialGroup, BleTrialSource, BleTrialEntry } from '../packages/core/ble-trial-authoring.ts';
import { prepareBlePlxSourceEvidenceDocument } from '../packages/core/ble-plx-source-evidence.ts';
import type { BleWorkbenchState } from './ble-workbench.ts';

export function selectedTrialDocument(state: BleWorkbenchState): string | null {
  return state.mode === 'selected-source' && state.pending === null && state.source !== null &&
    state.saveInput?.kind === 'analysis.ble-source' && state.saveInput.payload.document === state.document
    ? state.document : null;
}
/** Consume a validated revision before invoking the staging callback. */
export class BleTrialStageGate {
  revision: number | null = null;
  available(state: BleWorkbenchState): boolean {
    return this.revision !== state.revision && selectedTrialDocument(state) !== null;
  }
  take(state: BleWorkbenchState): string | null {
    if (!this.available(state)) return null;
    const document = selectedTrialDocument(state);
    this.revision = state.revision;
    return document;
  }
}
/** Synchronous coordination shared across mounted tabs. No I/O or implicit declarations. */
export class BleTrialAuthoringWorkbench {
  author: BleTrialAuthoring | null = null;
  staged: string | null = null;
  built: ReturnType<BleTrialAuthoring['build']> | null = null;
  message = 'Declare owned-lab scope and select a service to start. Memory only; lost on reload.';
  invalidate() { this.built = null; }
  stage(document: string) {
    this.invalidate();
    prepareBlePlxSourceEvidenceDocument(document);
    this.staged = document;
    this.message = 'Exact source staged only. Declare aliases, groups and trial/receipt references explicitly.';
  }
  start(scope: string, service: string) {
    this.invalidate();
    if (scope !== 'owned-lab' || (service !== 'FCD2' && service !== 'FEAA')) throw new Error('Enter owned-lab and select FCD2 or FEAA explicitly');
    this.author = new BleTrialAuthoring(scope, service);
    this.message = 'New empty draft. Staged source retained; no trial added.';
  }
  edit(kind: 'groups' | 'sources' | 'trials', entry: BleTrialGroup | BleTrialSource | BleTrialEntry, replace = false) {
    this.invalidate();
    if (!this.author) throw new Error('Start a declared draft first');
    if (!['groups', 'sources', 'trials'].includes(kind)) throw new Error('Unsupported authoring entry kind');
    if (kind === 'groups') replace ? this.author.replaceGroup(entry as BleTrialGroup) : this.author.addGroup(entry as BleTrialGroup);
    if (kind === 'sources') replace ? this.author.replaceSource(entry as BleTrialSource) : this.author.addSource(entry as BleTrialSource);
    if (kind === 'trials') replace ? this.author.replaceTrial(entry as BleTrialEntry) : this.author.addTrial(entry as BleTrialEntry);
    this.message = 'Draft updated atomically. Build explicitly when ready.';
  }
  remove(kind: 'groups' | 'sources' | 'trials', id: string) {
    this.invalidate();
    if (!this.author) throw new Error('Start a declared draft first');
    this.author.remove(kind, id);
    this.message = 'Entry removed. Build again when ready.';
  }
  build() {
    this.invalidate();
    if (!this.author) throw new Error('Start a declared draft first');
    this.built = this.author.build();
    this.message = 'Validated dataset ready. Use dataset separately to replace the comparison draft.';
  }
  takeDocument(): string | null {
    const document = this.built?.document ?? null;
    this.built = null; // consume before callback, including same-frame double clicks
    if (document !== null) this.message = 'Comparison draft replaced. Analyze explicitly in comparison.';
    return document;
  }
}
