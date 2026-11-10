import { parseBoundedJson } from './bounded-json.ts';

export const PAIRED_LIMIT = 65_536;
export const PAIRED_CAVEAT = 'Imported declarations and clock estimates are not authenticated measurements. Classification describes this dataset only; it does not identify a transmitter, decode a waveform or establish causality.';
type Split = 'discovery' | 'calibration' | 'holdout';
type Condition = 'signal' | 'control' | 'sham';
export interface PairedRow {
  id: string; session: string; split: Split; condition: Condition; label: string | null;
  ble: { tMs: number; rssi: number } | null; range: { tMs: number; metres: number } | null;
}
export interface PairedDataset {
  schema: 'apex.paired-observations.v1'; origin: 'synthetic' | 'operator-import';
  phone: string; reference: string; permission: 'operator-declared';
  clock: { offsetMs: number; uncertaintyMs: number; validFromMs: number; validToMs: number; basis: 'independent-calibration' | 'unknown' };
  rows: PairedRow[];
}
function record(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('Invalid paired observation fields');
  return value as Record<string, unknown>;
}
function num(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Paired observation number outside bounds');
  return value;
}
function name(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(value)) throw new Error('Use a bounded identifier for phone, reference, session and label');
  return value;
}
export function readPairedDataset(document: string): PairedDataset {
  const input = record(parseBoundedJson(document, PAIRED_LIMIT, 5), ['schema', 'origin', 'phone', 'reference', 'permission', 'clock', 'rows']);
  if (input.schema !== 'apex.paired-observations.v1' || !['synthetic', 'operator-import'].includes(String(input.origin)) || input.permission !== 'operator-declared') throw new Error('Unsupported observation schema/provenance');
  const c = record(input.clock, ['offsetMs', 'uncertaintyMs', 'validFromMs', 'validToMs', 'basis']);
  if (c.basis !== 'independent-calibration' && c.basis !== 'unknown') throw new Error('Unknown clock basis');
  const clock: PairedDataset['clock'] = { offsetMs: num(c.offsetMs, -60000, 60000), uncertaintyMs: num(c.uncertaintyMs, 0, 60000), validFromMs: num(c.validFromMs, 0, 1e12), validToMs: num(c.validToMs, 0, 1e12), basis: c.basis };
  if (clock.validFromMs > clock.validToMs) throw new Error('Invalid calibration window');
  if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 128) throw new Error('Expected 1 to 128 paired rows');
  const ids = new Set<string>(), sessions = new Map<string, Split>(), times = new Map<string, number>();
  const rows = input.rows.map(value => {
    const r = record(value, ['id', 'session', 'split', 'condition', 'label', 'ble', 'range']);
    const id = name(r.id), session = name(r.session);
    if (ids.has(id)) throw new Error('Duplicate measurement identifier'); ids.add(id);
    if (!['discovery', 'calibration', 'holdout'].includes(String(r.split)) || !['signal', 'control', 'sham'].includes(String(r.condition))) throw new Error('Unknown partition or control condition');
    const split = r.split as Split;
    if (sessions.has(session) && sessions.get(session) !== split) throw new Error('A session cannot leak across dataset partitions');
    sessions.set(session, split);
    const ble = r.ble === null ? null : record(r.ble, ['tMs', 'rssi']);
    const range = r.range === null ? null : record(r.range, ['tMs', 'metres']);
    const row = { id, session, split, condition: r.condition as Condition, label: r.label === null ? null : name(r.label),
      ble: ble && { tMs: num(ble.tMs, 0, 1e12), rssi: num(ble.rssi, -127, 20) },
      range: range && { tMs: num(range.tMs, 0, 1e12), metres: num(range.metres, 0.05, 10000) } };
    for (const stream of ['ble', 'range'] as const) {
      const reading = row[stream]; if (!reading) continue;
      const key = `${session}/${stream}`, before = times.get(key);
      if (before !== undefined && reading.tMs <= before) throw new Error('Stream timestamps must increase within each session');
      times.set(key, reading.tMs);
    }
    return row;
  });
  return { schema: input.schema, origin: input.origin as PairedDataset['origin'], phone: name(input.phone), reference: name(input.reference), permission: input.permission, clock, rows };
}
export type PairResult = { id: string; session: string; split: Split; condition: Condition; label: string | null; status: 'paired' | 'abstain'; reason: string; features: [number, number] | null };
export function replayPairedObservations(document: string) {
  const dataset = readPairedDataset(document);
  const rows: PairResult[] = dataset.rows.map(row => {
    let reason = '';
    if (!row.ble || !row.range) reason = 'Missing observation; no imputation';
    else if (dataset.clock.basis !== 'independent-calibration') reason = 'Independent clock calibration unavailable';
    else if (row.ble.tMs < dataset.clock.validFromMs || row.ble.tMs > dataset.clock.validToMs || row.range.tMs + dataset.clock.offsetMs < dataset.clock.validFromMs || row.range.tMs + dataset.clock.offsetMs > dataset.clock.validToMs) reason = 'Clock calibration expired/outside validity window';
    else if (Math.abs(row.ble.tMs - (row.range.tMs + dataset.clock.offsetMs)) + dataset.clock.uncertaintyMs > 50) reason = 'Timing uncertainty exceeds the 50 ms pairing bound';
    return { id: row.id, session: row.session, split: row.split, condition: row.condition, label: row.label,
      status: reason ? 'abstain' : 'paired', reason: reason || 'Within declared timing bounds',
      // A fixed, auditable feature map. No interpretation as calibrated RF power.
      features: reason ? null : [row.ble!.rssi / 6, Math.log10(row.range!.metres) / 0.25] };
  });
  return { schema: 'apex.paired-replay.v1' as const, origin: dataset.origin, phone: dataset.phone, reference: dataset.reference,
    counts: { total: rows.length, paired: rows.filter(r => r.status === 'paired').length, abstained: rows.filter(r => r.status === 'abstain').length,
      missingBle: dataset.rows.filter(r => !r.ble).length, missingRange: dataset.rows.filter(r => !r.range).length }, rows, caveat: PAIRED_CAVEAT };
}
type Class = { label: string; centre: [number, number]; radius: number };
export interface PairedProfile {
  schema: 'apex.paired-profile.v1'; algorithm: 'bounded-two-centroid-v1'; origin: PairedDataset['origin'];
  phone: string; reference: string; sourceSha256: string; sessions: string[]; measurementIds: string[]; classes: Class[];
  acceptance: 'declared-dataset-only';
}
function distance(a: [number, number], b: [number, number]) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function classify(classes: Class[], features: [number, number] | null): string | null {
  if (!features) return null;
  const matches = classes.filter(c => distance(c.centre, features) <= c.radius);
  return matches.length === 1 ? matches[0]!.label : null;
}
/** Selection uses discovery only. Calibration and holdout cannot retune the model. */
export function learnPairedProfile(document: string, sourceSha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error('Expected source digest');
  const dataset = readPairedDataset(document), replay = replayPairedObservations(document);
  const discovery = replay.rows.filter(row => row.split === 'discovery' && row.features && row.label !== null);
  const labels = [...new Set(discovery.map(row => row.label!))].sort();
  const failures: string[] = [];
  if (labels.length !== 2) failures.push('Discovery needs exactly two labelled classes');
  const classes: Class[] = labels.slice(0, 2).map(label => {
    const rows = discovery.filter(row => row.label === label);
    if (rows.length < 3 || new Set(rows.map(r => r.session)).size < 2) failures.push(`Discovery class ${label} needs three readings across two sessions`);
    const centre: [number, number] = [0, 1].map(i => rows.reduce((sum, row) => sum + row.features![i]!, 0) / rows.length) as [number, number];
    const radius = Math.max(0.25, ...rows.map(row => distance(centre, row.features!))) + 0.25;
    if (radius > 3) failures.push(`Discovery class ${label} is too dispersed`);
    return { label, centre, radius };
  });
  if (classes.length === 2 && distance(classes[0]!.centre, classes[1]!.centre) <= classes[0]!.radius + classes[1]!.radius) failures.push('Class acceptance regions overlap');
  const results = replay.rows.map(row => ({ id: row.id, split: row.split, expected: row.label, predicted: classify(classes, row.features), paired: row.status === 'paired' }));
  for (const split of ['calibration', 'holdout'] as const) {
    const rows = replay.rows.filter(row => row.split === split);
    for (const label of labels) if (rows.filter(r => r.label === label).length < 3) failures.push(`${split} needs three readings of ${label}`);
    if (new Set(rows.map(r => r.session)).size < 2) failures.push(`${split} needs two independent session identifiers`);
    if (!rows.some(r => r.condition === 'control') || !rows.some(r => r.condition === 'sham')) failures.push(`${split} needs control and sham observations`);
    if (rows.filter(r => r.label === null).length < 2) failures.push(`${split} needs at least two labelled unknown/negative observations`);
    if (results.some(r => r.split === split && (!r.paired || r.predicted !== r.expected))) failures.push(`${split} contains unavailable, incorrect or unrecognised measurements`);
  }
  if (results.some(r => r.split === 'discovery' && (!r.paired || r.predicted !== r.expected))) failures.push('Discovery contains unavailable, incorrect or unrecognised measurements');
  const profile: PairedProfile | null = failures.length ? null : {
    schema: 'apex.paired-profile.v1', algorithm: 'bounded-two-centroid-v1', origin: dataset.origin,
    phone: dataset.phone, reference: dataset.reference, sourceSha256, sessions: [...new Set(dataset.rows.map(r => r.session))], measurementIds: dataset.rows.map(r => r.id), classes, acceptance: 'declared-dataset-only',
  };
  return { schema: 'apex.paired-learning.v1' as const, status: profile ? 'accepted-for-declared-dataset' : 'abstain', failures, results, profile, caveat: PAIRED_CAVEAT };
}
export function readPairedProfile(document: string): PairedProfile {
  const p = record(parseBoundedJson(document, 16384, 5), ['schema', 'algorithm', 'origin', 'phone', 'reference', 'sourceSha256', 'sessions', 'measurementIds', 'classes', 'acceptance']);
  if (p.schema !== 'apex.paired-profile.v1' || p.algorithm !== 'bounded-two-centroid-v1' || p.acceptance !== 'declared-dataset-only' || !['synthetic', 'operator-import'].includes(String(p.origin)) || typeof p.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(p.sourceSha256)) throw new Error('Invalid profile envelope');
  function ids(value: unknown) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 128) throw new Error('Invalid profile identifiers');
    const names = value.map(name); if (new Set(names).size !== names.length) throw new Error('Duplicate profile identifier'); return names;
  }
  if (!Array.isArray(p.classes) || p.classes.length !== 2) throw new Error('Expected two profile classes');
  const classes = p.classes.map(value => {
    const c = record(value, ['label', 'centre', 'radius']);
    if (!Array.isArray(c.centre) || c.centre.length !== 2) throw new Error('Invalid profile centre');
    return { label: name(c.label), centre: c.centre.map(v => num(v, -100, 100)) as [number, number], radius: num(c.radius, 0.25, 3) };
  });
  if (classes[0]!.label === classes[1]!.label || distance(classes[0]!.centre, classes[1]!.centre) <= classes[0]!.radius + classes[1]!.radius) throw new Error('Invalid overlapping profile classes');
  return { schema: p.schema, algorithm: p.algorithm, origin: p.origin as PairedDataset['origin'], phone: name(p.phone), reference: name(p.reference), sourceSha256: p.sourceSha256, sessions: ids(p.sessions), measurementIds: ids(p.measurementIds), classes, acceptance: p.acceptance };
}
export function applyPairedProfile(profileDocument: string, observations: string) {
  const profile = readPairedProfile(profileDocument), dataset = readPairedDataset(observations);
  if (profile.phone !== dataset.phone || profile.reference !== dataset.reference || profile.origin !== dataset.origin) throw new Error('Profile scope does not match this source');
  if (dataset.rows.some(r => profile.sessions.includes(r.session) || profile.measurementIds.includes(r.id))) throw new Error('Profile reuse requires unseen sessions and measurement identifiers');
  return { schema: 'apex.profile-application.v1', rows: replayPairedObservations(observations).rows.map(row => ({ id: row.id, predicted: classify(profile.classes, row.features), pairing: row.status })), caveat: PAIRED_CAVEAT };
}
