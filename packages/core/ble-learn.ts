/** A bounded, synthetic-only experiment loop. No provider, radio, hardware or code generation. */
import { parseBoundedJson } from './bounded-json.ts';
import { readBleDifferentialDocument } from './ble-differential.ts';
import { interpretBleServiceData } from './ble-advertisements.ts';

export const LEARN_VERSION = 'apex-learn-synthetic-v1';
export const MAX_LEARN_CHARACTERS = 240_000;
export const MAX_ARTIFACT_CHARACTERS = 1_200_000;
export const LEARN_LIMITATIONS = [
  'Synthetic BTHome fixtures only; this is candidate elimination, not unknown-protocol discovery, physical testing or a connected AI provider.',
  'Version-space size is uncertainty within the declared finite candidate family, not a calibrated probability or proof of uniqueness outside that family.',
  'Source, control, reference readings and split declarations are not independent sensor truth, device identity, causality or verified blinding.',
  'Held-out data is not used for selection. Reusing an exposed holdout across revised experiments can still overfit; use a fresh holdout for real research.',
  'Artifacts contain exact local evidence. Replay detects inconsistent edits, not coordinated forgery or authenticity. No device commands or executable code are emitted.',
];

type Candidate = { id: string; byteOffset: number; width: number; byteOrder: 'little' | 'big'; signed: boolean; divisor: number };
type Rational = { numerator: string; denominator: string; approximate: number };
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) throw new Error('Invalid Learn schema');
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) throw new Error('Invalid Learn integer bounds');
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w.:-]{1,80}$/.test(value)) throw new Error('Invalid Learn identifier');
  return value;
}
function boundedList(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error('Invalid Learn list bound');
  return value;
}
function numberSet(value: unknown, max: number, minValue: number, maxValue: number): number[] {
  const values = boundedList(value, 1, max).map(item => integer(item, minValue, maxValue));
  if (new Set(values).size !== values.length) throw new Error('Duplicate Learn search value');
  return values.sort((a, b) => a - b);
}
function layout(payloadHex: string) {
  const reading = interpretBleServiceData('FCD2', payloadHex);
  if (reading.status !== 'format-match' || reading.format !== 'BTHome-v2') throw new Error('Learn requires complete unencrypted BTHome-v2');
  return { signature: JSON.stringify([reading.deviceInfo, reading.objects.map(object => [object.offset, object.objectId, object.rawHex.length / 2 - 1])]),
    fields: reading.objects.map(object => ({ byteOffset: object.offset + 1, width: object.rawHex.length / 2 - 1 })) };
}
function raw(candidate: Candidate, payloadHex: string): bigint {
  if (candidate.byteOffset + candidate.width > payloadHex.length / 2) throw new Error('Incomplete Learn field');
  const bytes = payloadHex.slice(candidate.byteOffset * 2, (candidate.byteOffset + candidate.width) * 2).match(/../g)!;
  if (candidate.byteOrder === 'little') bytes.reverse();
  let value = BigInt(`0x${bytes.join('')}`);
  const modulus = 1n << BigInt(candidate.width * 8);
  if (candidate.signed && value >= modulus / 2n) value -= modulus;
  return value;
}
function absolute(value: bigint) { return value < 0n ? -value : value; }
function rational(n: bigint, d: bigint): Rational {
  let a = absolute(n); let b = d;
  while (b) { const r = a % b; a = b; b = r; }
  return { numerator: (n / a).toString(), denominator: (d / a).toString(), approximate: Number(n) / Number(d) };
}
function prediction(candidate: Candidate, payloadHex: string) { return rational(raw(candidate, payloadHex), BigInt(candidate.divisor)); }
function compare(candidate: Candidate, payloadHex: string, readingMilliUnits: number, toleranceMilliUnits: number) {
  const numerator = raw(candidate, payloadHex) * 1000n - BigInt(readingMilliUnits) * BigInt(candidate.divisor);
  return { value: prediction(candidate, payloadHex), residual: rational(numerator, BigInt(candidate.divisor) * 1000n),
    withinTolerance: absolute(numerator) <= BigInt(toleranceMilliUnits) * BigInt(candidate.divisor) };
}
function readMeasurements(document: string, kind: 'discovery' | 'held-out') {
  const keys = ['schemaVersion', 'kind', 'dataset', 'measurements'];
  if (kind === 'discovery') keys.push('toleranceMilliUnits', 'search');
  const input = record(parseBoundedJson(document, MAX_LEARN_CHARACTERS, 4), keys);
  if (input.schemaVersion !== 1 || input.kind !== `apex-learn-synthetic-${kind}` || typeof input.dataset !== 'string') throw new Error('Invalid Learn version/kind');
  const dataset = readBleDifferentialDocument(input.dataset);
  if (dataset.serviceUuid !== 'FCD2' || dataset.sources.length !== 1 || dataset.sources[0]!.origin !== 'synthetic-fixture' || dataset.trials.length > 16) throw new Error('Learn requires one synthetic BTHome source and at most 16 trials');
  const seen = new Set<string>();
  const measurements = boundedList(input.measurements, kind === 'discovery' ? 2 : 3, 16).map(value => {
    const row = record(value, ['trialId', 'readingMilliUnits']);
    const trialId = identifier(row.trialId);
    if (seen.has(trialId)) throw new Error('Duplicate Learn measurement');
    seen.add(trialId);
    const trial = dataset.trials.find(item => item.id === trialId);
    if (!trial) throw new Error('Unknown Learn trial');
    return { ...trial, readingMilliUnits: integer(row.readingMilliUnits, -1_000_000_000, 1_000_000_000) };
  });
  if (measurements.length !== dataset.trials.length) throw new Error('Every Learn trial requires one measurement');
  const layouts = measurements.map(row => layout(row.payloadHex));
  if (layouts.some(row => row.signature !== layouts[0]!.signature)) throw new Error('Mixed Learn packet layouts');
  if (new Set(measurements.map(row => row.readingMilliUnits)).size < (kind === 'discovery' ? 2 : 3)) throw new Error('Learn needs varied reference readings');
  if (new Set(measurements.map(row => row.payloadHex)).size !== measurements.length) throw new Error('Duplicate Learn payload; repeated packets are not new evidence');
  return { input, dataset, measurements, layout: layouts[0]! };
}
function searchCandidates(searchValue: unknown, fields: { byteOffset: number; width: number }[]): Candidate[] {
  const search = record(searchValue, ['byteOffsets', 'widths', 'divisors']);
  const offsets = numberSet(search.byteOffsets, 8, 0, 63);
  const widths = numberSet(search.widths, 4, 1, 4);
  const divisors = numberSet(search.divisors, 4, 1, 1_000_000);
  const candidates: Candidate[] = [];
  for (const byteOffset of offsets) for (const width of widths) {
    if (!fields.some(field => field.byteOffset === byteOffset && field.width === width)) continue;
    for (const byteOrder of width === 1 ? ['little'] as const : ['little', 'big'] as const) for (const signed of [false, true]) for (const divisor of divisors) {
      candidates.push({ id: `o${byteOffset}-w${width}-${byteOrder}-${signed ? 's' : 'u'}-d${divisor}`, byteOffset, width, byteOrder, signed, divisor });
    }
  }
  if (!candidates.length || candidates.length > 512) throw new Error('Learn candidate family is empty or too large');
  return candidates;
}

/** This boundary cannot accept held-out data. All exact-residual selection uses discovery only. */
export function fitBleLearn(discoveryDocument: string) {
  const data = readMeasurements(discoveryDocument, 'discovery');
  const toleranceMilliUnits = integer(data.input.toleranceMilliUnits, 0, 1_000_000);
  const candidates = searchCandidates(data.input.search, data.layout.fields);
  const evaluations = candidates.map(candidate => {
    const rows = data.measurements.map(row => ({ trialId: row.id, receiptId: row.receiptId, readingMilliUnits: row.readingMilliUnits,
      ...compare(candidate, row.payloadHex, row.readingMilliUnits, toleranceMilliUnits) }));
    return { candidate, matches: rows.filter(row => row.withinTolerance).length, survives: rows.every(row => row.withinTolerance), rows };
  });
  const surviving = evaluations.filter(row => row.survives).map(row => row.candidate);
  return { version: LEARN_VERSION, status: surviving.length === 0 ? 'abstain-no-candidate' : surviving.length > 1 ? 'abstain-ambiguous' : 'awaiting-held-out',
    source: data.dataset.sources[0]!, layout: data.layout.signature, toleranceMilliUnits, searchSize: candidates.length,
    discoveryCount: data.measurements.length, surviving, evaluations, limitations: LEARN_LIMITATIONS };
}

/** Pool-based active query selection. Pool has packet bytes but no reference readings. */
export function selectBleLearnQuery(discoveryDocument: string, poolDocument: string) {
  const fit = fitBleLearn(discoveryDocument);
  const discovery = readMeasurements(discoveryDocument, 'discovery');
  const input = record(parseBoundedJson(poolDocument, 32768, 3), ['schemaVersion', 'kind', 'sourceId', 'probes']);
  if (input.schemaVersion !== 1 || input.kind !== 'apex-learn-synthetic-query-pool' || input.sourceId !== fit.source.id) throw new Error('Invalid Learn query pool');
  const ids = new Set<string>(); const payloads = new Set<string>();
  const probes = boundedList(input.probes, 1, 16).map(value => {
    const row = record(value, ['id', 'intervention', 'payloadHex']);
    const id = identifier(row.id);
    if (ids.has(id) || discovery.measurements.some(trial => trial.id === id)) throw new Error('Duplicate Learn query ID');
    ids.add(id);
    if (typeof row.intervention !== 'string' || !/^[\x20-\x7e]{1,160}$/.test(row.intervention) || typeof row.payloadHex !== 'string') throw new Error('Invalid Learn query');
    const payloadHex = row.payloadHex.toLowerCase();
    if (layout(payloadHex).signature !== fit.layout) throw new Error('Learn query layout mismatch');
    if (payloads.has(payloadHex) || discovery.measurements.some(trial => trial.payloadHex === payloadHex)) throw new Error('Learn query reuses a packet');
    payloads.add(payloadHex);
    const predictions = fit.surviving.map(candidate => ({ candidateId: candidate.id, value: prediction(candidate, payloadHex) }));
    // With bounded reference noise, exact distinct outputs can overlap. Count guaranteed
    // pair separations only when prediction distance is strictly greater than 2*tolerance.
    let separatedPairs = 0;
    for (let a = 0; a < predictions.length; a++) for (let b = a + 1; b < predictions.length; b++) {
      const x = predictions[a]!.value; const y = predictions[b]!.value;
      const delta = absolute(BigInt(x.numerator) * BigInt(y.denominator) - BigInt(y.numerator) * BigInt(x.denominator));
      if (delta * 1000n > 2n * BigInt(fit.toleranceMilliUnits) * BigInt(x.denominator) * BigInt(y.denominator)) separatedPairs++;
    }
    return { id, intervention: row.intervention, payloadHex, separatedPairs, predictions };
  }).sort((a, b) => b.separatedPairs - a.separatedPairs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const selected = fit.surviving.length > 1 && probes[0]!.separatedPairs > 0 ? probes[0]! : null;
  return { version: LEARN_VERSION, status: selected ? 'request-reference-measurement' : 'abstain-no-informative-query',
    uncertainty: { survivingCandidates: fit.surviving.length, calibratedProbability: null }, selected, probes,
    limitation: 'Selects an unlabeled synthetic packet for reference measurement; not autonomous physical experiment planning or a promise of information gain.' };
}

/** Freezes a discovery-only winner, then checks a separately supplied holdout. No reranking. */
export function validateBleLearn(discoveryDocument: string, heldOutDocument: string) {
  const fit = fitBleLearn(discoveryDocument);
  if (fit.surviving.length !== 1) return { version: LEARN_VERSION, status: fit.status, fit, heldOut: null, artifactDocument: null };
  const discovery = readMeasurements(discoveryDocument, 'discovery');
  const heldOut = readMeasurements(heldOutDocument, 'held-out');
  if (JSON.stringify(heldOut.dataset.sources[0]) !== JSON.stringify(fit.source) || heldOut.layout.signature !== fit.layout) throw new Error('Learn holdout source/layout mismatch');
  if (heldOut.measurements.some(row => discovery.measurements.some(old => row.id === old.id || row.receiptId === old.receiptId || row.payloadHex === old.payloadHex))) throw new Error('Learn split leakage: repeated trial, receipt or payload');
  const candidate = fit.surviving[0]!;
  const rows = heldOut.measurements.map(row => ({ trialId: row.id, receiptId: row.receiptId, readingMilliUnits: row.readingMilliUnits,
    ...compare(candidate, row.payloadHex, row.readingMilliUnits, fit.toleranceMilliUnits) }));
  const passed = rows.every(row => row.withinTolerance);
  return { version: LEARN_VERSION, status: passed ? 'synthetic-validated' : 'abstain-held-out-failure', fit,
    heldOut: { count: rows.length, matches: rows.filter(row => row.withinTolerance).length, rows },
    artifactDocument: passed ? JSON.stringify({ schemaVersion: 1, kind: 'apex-learn-synthetic-decoder', version: LEARN_VERSION,
      candidateId: candidate.id, discoveryDocument, heldOutDocument }) : null };
}

/** Data-only artifact replay. There is no eval, generated code or device action. */
export function decodeBleLearnArtifact(artifactDocument: string, sampleDocument: string) {
  const artifact = record(parseBoundedJson(artifactDocument, MAX_ARTIFACT_CHARACTERS, 1), ['schemaVersion', 'kind', 'version', 'candidateId', 'discoveryDocument', 'heldOutDocument']);
  if (artifact.schemaVersion !== 1 || artifact.kind !== 'apex-learn-synthetic-decoder' || artifact.version !== LEARN_VERSION || typeof artifact.discoveryDocument !== 'string' || typeof artifact.heldOutDocument !== 'string') throw new Error('Invalid Learn artifact');
  const validation = validateBleLearn(artifact.discoveryDocument, artifact.heldOutDocument);
  if (validation.status !== 'synthetic-validated' || validation.fit.surviving[0]!.id !== artifact.candidateId) throw new Error('Learn artifact failed evidence replay');
  const sample = record(parseBoundedJson(sampleDocument, 8192, 1), ['schemaVersion', 'origin', 'sourceId', 'serviceUuid', 'payloadHex']);
  if (sample.schemaVersion !== 1 || sample.origin !== 'synthetic-fixture' || sample.sourceId !== validation.fit.source.id || sample.serviceUuid !== 'FCD2' || typeof sample.payloadHex !== 'string') throw new Error('Learn decoder source/scope mismatch');
  if (layout(sample.payloadHex).signature !== validation.fit.layout) throw new Error('Learn decoder layout mismatch');
  const candidate = validation.fit.surviving[0]!;
  const value = prediction(candidate, sample.payloadHex);
  const training = readMeasurements(artifact.discoveryDocument, 'discovery');
  const heldOut = readMeasurements(artifact.heldOutDocument, 'held-out');
  // Reference values can differ from valid predictions within tolerance. Bound by
  // replayed packet predictions so a validated endpoint never rejects itself.
  const observed = [...training.measurements, ...heldOut.measurements].map(row => raw(candidate, row.payloadHex));
  const minimum = observed.reduce((a, b) => a < b ? a : b);
  const maximum = observed.reduce((a, b) => a > b ? a : b);
  const sampleRaw = raw(candidate, sample.payloadHex);
  const extrapolated = sampleRaw < minimum || sampleRaw > maximum;
  return { version: LEARN_VERSION, status: extrapolated ? 'abstain-outside-tested-range' : 'synthetic-decoded',
    value: extrapolated ? null : value, candidateId: candidate.id, unit: 'operator-declared reference units',
    testedRange: { basis: 'replayed-packet-predictions', minimum: rational(minimum, BigInt(candidate.divisor)), maximum: rational(maximum, BigInt(candidate.divisor)) },
    authenticated: false, limitations: LEARN_LIMITATIONS };
}
