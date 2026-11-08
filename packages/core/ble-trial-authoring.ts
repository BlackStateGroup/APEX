/** Memory-only authoring. Declarations are never evidence of ownership or journal verification. */
import { analyzeBleDifferential, readBleDifferentialDocument } from './ble-differential.ts';
import { MAX_BLE_PLX_SOURCE_DOCUMENT_CHARACTERS } from './ble-plx-source-evidence.ts';

export interface BleTrialGroup { id: string; condition: string }
export interface BleTrialSource {
  id: string;
  platform: 'android' | 'ios';
  snapshotId: string | null;
  origin: 'synthetic-fixture' | 'recorded-import';
}
export interface BleTrialEntry {
  id: string; groupId: string; sourceId: string; receiptId: string; document: string;
}
interface Draft {
  schemaVersion: 1; scope: 'owned-lab'; serviceUuid: 'FCD2' | 'FEAA';
  groups: BleTrialGroup[]; sources: BleTrialSource[]; trials: BleTrialEntry[];
}

// Copy only exact own data properties. Never invoke getters or toJSON on caller objects.
function data<T>(value: T, keys: readonly string[]): T {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== keys.length) throw new Error('Invalid authoring entry');
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) ||
        (descriptor.value !== null && typeof descriptor.value !== 'string')) throw new Error('Invalid authoring data property');
    if (typeof descriptor.value === 'string' && descriptor.value.length >
        (key === 'document' ? MAX_BLE_PLX_SOURCE_DOCUMENT_CHARACTERS : 128)) throw new Error('Authoring character limit');
    copy[key] = descriptor.value;
  }
  return copy as T;
}
const groupKeys = ['id', 'condition'];
const sourceKeys = ['id', 'platform', 'snapshotId', 'origin'];
const trialKeys = ['id', 'groupId', 'sourceId', 'receiptId', 'document'];

/** Updates either succeed in full or throw without changing the draft. No report on edits. */
export class BleTrialAuthoring {
  #draft: Draft;
  constructor(scope: 'owned-lab', serviceUuid: 'FCD2' | 'FEAA') {
    if (scope !== 'owned-lab' || (serviceUuid !== 'FCD2' && serviceUuid !== 'FEAA')) throw new Error('Explicit owned-lab scope and selected service required');
    this.#draft = { schemaVersion: 1, scope, serviceUuid, groups: [], sources: [], trials: [] };
  }
  /** Isolated copy for UI rendering, not a validated export. Inner documents remain exact. */
  snapshot(): Draft { return JSON.parse(JSON.stringify(this.#draft)) as Draft; }
  #commit(candidate: Draft): void {
    readBleDifferentialDocument(JSON.stringify(candidate), true);
    this.#draft = candidate;
  }
  #edit<K extends 'groups' | 'sources' | 'trials'>(key: K, entry: Draft[K][number], replace: boolean): void {
    const candidate = this.snapshot();
    const rows = candidate[key] as { id: string }[];
    const index = rows.findIndex(row => row.id === entry.id);
    if (replace && index < 0) throw new Error('Unknown authoring reference');
    if (!replace && index >= 0) throw new Error('Duplicate authoring reference');
    if (replace) rows[index] = entry; else rows.push(entry);
    this.#commit(candidate);
  }
  addGroup(group: BleTrialGroup): void { this.#edit('groups', data(group, groupKeys), false); }
  replaceGroup(group: BleTrialGroup): void { this.#edit('groups', data(group, groupKeys), true); }
  addSource(source: BleTrialSource): void { this.#edit('sources', data(source, sourceKeys), false); }
  replaceSource(source: BleTrialSource): void { this.#edit('sources', data(source, sourceKeys), true); }
  addTrial(trial: BleTrialEntry): void { this.#edit('trials', data(trial, trialKeys), false); }
  replaceTrial(trial: BleTrialEntry): void { this.#edit('trials', data(trial, trialKeys), true); }
  remove(kind: 'groups' | 'sources' | 'trials', id: string): void {
    if (!['groups', 'sources', 'trials'].includes(kind) || typeof id !== 'string') throw new Error('Invalid authoring reference');
    const candidate = this.snapshot();
    const index = candidate[kind].findIndex(row => row.id === id);
    if (index < 0) throw new Error('Unknown authoring reference');
    candidate[kind].splice(index, 1);
    this.#commit(candidate); // Referenced groups/sources fail closed; never cascade.
  }
  /** Explicit validation/export only; no cached report, persistence, or receipt creation. */
  build() {
    const document = JSON.stringify(this.#draft);
    const report = analyzeBleDifferential(document);
    return { document, report };
  }
}
