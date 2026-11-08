/** Offline descriptive byte comparison only. Never identifies devices or infers fields. */
import { parseBoundedJson } from './bounded-json.ts';
import { readBlePlxSourceEvidencePayload } from './ble-plx-source-evidence.ts';

export const MAX_DIFFERENTIAL_CHARACTERS = 196608;
export const MAX_DIFFERENTIAL_TRIALS = 32;
export const MAX_DIFFERENTIAL_GROUPS = 8;
export const MAX_DIFFERENTIAL_SOURCES = 8;
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) throw new Error('Invalid differential schema');
  return value as Record<string, unknown>;
}
function label(value: unknown): string {
  if (typeof value !== 'string' || !/^[\x20-\x7e]{1,128}$/.test(value) || !value.trim()) throw new Error('Invalid differential label');
  return value;
}
function rows(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error('Differential count limit');
  return value;
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length) throw new Error('Duplicate differential reference');
}

/** Shared strict reader. Incomplete drafts relax only minimum counts and cross-group coverage.
 * All present entries, references, source evidence and payload eligibility remain validated. */
export function readBleDifferentialDocument(document: string, allowIncomplete = false) {
  const input = object(parseBoundedJson(document, MAX_DIFFERENTIAL_CHARACTERS, 4),
    ['schemaVersion', 'scope', 'serviceUuid', 'groups', 'sources', 'trials']);
  if (input.schemaVersion !== 1 || input.scope !== 'owned-lab' ||
      (input.serviceUuid !== 'FCD2' && input.serviceUuid !== 'FEAA')) throw new Error('Unsupported differential scope/version/service');
  const uuid = `0000${input.serviceUuid.toLowerCase()}-0000-1000-8000-00805f9b34fb`;
  const groups = rows(input.groups, allowIncomplete ? 0 : 2, MAX_DIFFERENTIAL_GROUPS).map(value => {
    const row = object(value, ['id', 'condition']);
    return { id: label(row.id), condition: label(row.condition) };
  });
  const sources = rows(input.sources, allowIncomplete ? 0 : 1, MAX_DIFFERENTIAL_SOURCES).map(value => {
    const row = object(value, ['id', 'platform', 'snapshotId', 'origin']);
    if ((row.platform !== 'android' && row.platform !== 'ios') ||
        (row.origin !== 'synthetic-fixture' && row.origin !== 'recorded-import') ||
        (row.snapshotId !== null && (typeof row.snapshotId !== 'string' || row.snapshotId.length > 128))) throw new Error('Invalid declared source');
    return { id: label(row.id), platform: row.platform, snapshotId: row.snapshotId, origin: row.origin };
  });
  unique(groups.map(row => row.id)); unique(sources.map(row => row.id));
  const trials = rows(input.trials, allowIncomplete ? 0 : 2, MAX_DIFFERENTIAL_TRIALS).map(value => {
    const row = object(value, ['id', 'groupId', 'sourceId', 'receiptId', 'document']);
    const id = label(row.id); const groupId = label(row.groupId); const sourceId = label(row.sourceId);
    const receiptId = label(row.receiptId);
    if (!groups.some(group => group.id === groupId)) throw new Error('Unknown trial group');
    const source = sources.find(source => source.id === sourceId);
    if (!source) throw new Error('Unknown trial source');
    const prepared = readBlePlxSourceEvidencePayload({ schemaVersion: 1, format: 'BLE-PLX-selected-source-document', document: row.document });
    if (source.platform !== prepared.platform || source.snapshotId !== prepared.snapshot.id || source.origin !== prepared.provenance.origin) throw new Error('Declared source mismatch');
    const observation = prepared.observation;
    if (!observation) throw new Error('Android raw bytes unavailable');
    if (observation.rawAdvertising && observation.rawAdvertising.status !== 'parsed') throw new Error('Malformed Android advertising bytes');
    const fields = observation.rawAdvertising
      ? observation.rawAdvertising.elements.flatMap(field => field.value.kind === 'service-data' ? [{ ...field.value, adOffset: field.offset }] : [])
      : observation.normalizedFields!.serviceData.map(field => ({ ...field, adOffset: null }));
    const matches = fields.filter(field => field.uuid === uuid);
    if (matches.length !== 1) throw new Error('Expected exactly one selected service payload');
    const selected = matches[0]!;
    const encrypted = input.serviceUuid === 'FCD2' && selected.payloadHex.length >= 2 && (parseInt(selected.payloadHex.slice(0, 2), 16) & 1) !== 0;
    return { id, groupId, sourceId, receiptId, document: row.document as string,
      platform: prepared.platform, representation: prepared.representation, provenance: prepared.provenance,
      snapshotId: prepared.snapshot.id, adOffset: selected.adOffset, payloadHex: selected.payloadHex,
      interpretation: encrypted ? 'opaque-encrypted-bthome' : 'byte-comparison-only' };
  });
  unique(trials.map(row => row.id)); unique(trials.map(row => row.receiptId));
  if (!allowIncomplete && sources.some(source => groups.some(group =>
      !trials.some(trial => trial.sourceId === source.id && trial.groupId === group.id)))) {
    throw new Error('Every declared source needs a trial in every group');
  }
  return { serviceUuid: input.serviceUuid, groups, sources, trials };
}

/** String-only boundary: duplicate keys, depth, length and every nested source are validated. */
export function analyzeBleDifferential(document: string) {
  const { serviceUuid, groups, sources, trials } = readBleDifferentialDocument(document);
  // Separate platform/source strata; never pool identifiers or normalize away provenance.
  const comparisons = sources.map(source => {
    const selected = trials.filter(trial => trial.sourceId === source.id);
    const members = groups.map(group => ({ groupId: group.id, trials: selected.filter(trial => trial.groupId === group.id) }));
    const width = Math.max(...selected.map(trial => trial.payloadHex.length / 2));
    const matrix = Array.from({ length: width }, (_, offset) => {
      const cells = members.map(group => {
        const values = group.trials.map(trial => offset * 2 < trial.payloadHex.length ? trial.payloadHex.slice(offset * 2, offset * 2 + 2) : null);
        const distinct = [...new Set(values)];
        return { groupId: group.groupId, values, counts: distinct.map(value => ({ value, count: values.filter(other => other === value).length })),
          runCount: values.filter((value, index) => index === 0 || value !== values[index - 1]).length };
      });
      return { offset, changed: new Set(cells.flatMap(cell => cell.values)).size > 1,
        stableWithinEachGroup: cells.every(cell => cell.counts.length === 1), cells };
    });
    return { sourceId: source.id, groups: members.map(group => ({ groupId: group.groupId, trialIds: group.trials.map(trial => trial.id) })),
      payloadLengths: selected.map(trial => ({ trialId: trial.id, bytes: trial.payloadHex.length / 2 })),
      changedOffsets: matrix.filter(row => row.changed).map(row => row.offset), matrix };
  });
  return { schemaVersion: 1, analysis: 'offline-byte-differential', serviceUuid, groups, sources, trials, comparisons,
    limitations: [ 'Owned/lab scope, groups, conditions, identifiers, receipt references and source timestamps are user declarations, not verified identity, reception, chronology or experimental control.',
      'Offsets are zero-based within the service payload, excluding UUID and AD headers. Null means absent, never zero. Byte positions are not aligned after insertion/deletion.',
      'Counts and runs describe listed trial order within each source/group, not time, independence, significance, causality or sensor mappings.',
      'Android uses raw AD bytes only; iOS uses normalized service fields only and retains opaque rawScanRecord without interpreting it.',
      'Encrypted BTHome remains opaque. No plaintext field inference, decryption, command generation, device control or automatic action.' ] };
}
