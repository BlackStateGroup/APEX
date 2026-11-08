/** One operator-supplied candidate over recognized public formats; no discovery or fitting. */
import { parseBoundedJson } from './bounded-json.ts';
import { analyzeBleDifferential } from './ble-differential.ts';
import { interpretBleServiceData, MAX_AD_BYTES } from './ble-advertisements.ts';

export const MAX_FIELD_HYPOTHESIS_CHARACTERS = 262144;
export const FIELD_HYPOTHESIS_CAVEAT = 'Operator-designated subsets and expected readings are declarations, not verified blinding, independent samples, sensor truth, calibration, identity or causality. Agreement does not discover or validate a protocol/layout.';
export const FIELD_HYPOTHESIS_ELIGIBILITY = 'Only complete format-matched unencrypted BTHome-v2 or Eddystone-TLM-v0; format matching is not authenticity or physical truth.';
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) throw new Error('Invalid field hypothesis schema');
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) throw new Error('Field hypothesis integer bound');
  return value;
}
type Rational = { n: bigint; d: bigint };
function decimal(value: unknown): Rational {
  // Canonical fixed decimal: no plus, exponent, leading zeros, trailing fractional zeros, or negative zero.
  if (typeof value !== 'string' || !/^-?(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{0,8}[1-9])?$/.test(value) || value === '-0') throw new Error('Invalid bounded canonical decimal');
  const [whole, fraction = ''] = value.split('.');
  return { n: BigInt(whole! + fraction), d: 10n ** BigInt(fraction.length) };
}
function absolute(n: bigint) { return n < 0n ? -n : n; }
function serialize(value: Rational) {
  let a = absolute(value.n); let b = value.d;
  while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
  return { numerator: (value.n / a).toString(), denominator: (value.d / a).toString(), approximate: Number(value.n) / Number(value.d) };
}

export function validateBleFieldHypothesis(document: string) {
  const input = object(parseBoundedJson(document, MAX_FIELD_HYPOTHESIS_CHARACTERS, 3), ['schemaVersion', 'dataset', 'candidate', 'tolerance', 'assignments']);
  if (input.schemaVersion !== 1 || typeof input.dataset !== 'string') throw new Error('Unsupported field hypothesis version/dataset');
  const rawCandidate = object(input.candidate, ['byteOffset', 'width', 'byteOrder', 'signed', 'divisor', 'valueOffset']);
  const candidate = {
    byteOffset: integer(rawCandidate.byteOffset, 0, MAX_AD_BYTES - 1), width: integer(rawCandidate.width, 1, 4),
    byteOrder: rawCandidate.byteOrder, signed: rawCandidate.signed,
    divisor: integer(rawCandidate.divisor, 1, 1_000_000_000), valueOffset: integer(rawCandidate.valueOffset, -1_000_000_000, 1_000_000_000),
  };
  if ((candidate.byteOrder !== 'little' && candidate.byteOrder !== 'big') || typeof candidate.signed !== 'boolean') throw new Error('Invalid byte order/signedness');
  const tolerance = decimal(input.tolerance);
  if (tolerance.n < 0n) throw new Error('Tolerance must be nonnegative');
  const dataset = analyzeBleDifferential(input.dataset);
  if (!Array.isArray(input.assignments) || input.assignments.length < 2 || input.assignments.length > 32) throw new Error('Assignment count limit');
  const assigned = new Set<string>();
  const results = input.assignments.map(value => {
    const row = object(value, ['trialId', 'subset', 'expected']);
    if (typeof row.trialId !== 'string' || assigned.has(row.trialId)) throw new Error('Duplicate or invalid selected trial');
    assigned.add(row.trialId);
    const trial = dataset.trials.find(trial => trial.id === row.trialId);
    if (!trial) throw new Error('Unknown selected trial');
    if (row.subset !== 'discovery' && row.subset !== 'held-out') throw new Error('Invalid designated subset');
    const expected = decimal(row.expected);
    const format = interpretBleServiceData(dataset.serviceUuid as string, trial.payloadHex);
    if (format.status !== 'format-match' || (format.format !== 'BTHome-v2' && format.format !== 'Eddystone-TLM-v0')) throw new Error(`Ineligible public format for trial ${trial.id}`);
    const common = { trialId: trial.id, sourceId: trial.sourceId, groupId: trial.groupId, receiptId: trial.receiptId,
      subset: row.subset, expected: row.expected as string, eligibility: FIELD_HYPOTHESIS_ELIGIBILITY, matchedFormat: format.format, caveat: FIELD_HYPOTHESIS_CAVEAT };
    if (candidate.byteOffset + candidate.width > trial.payloadHex.length / 2) return { ...common, status: 'incomplete', fieldHex: null, rawInteger: null, value: null, residual: null, withinTolerance: null };
    const fieldHex = trial.payloadHex.slice(candidate.byteOffset * 2, (candidate.byteOffset + candidate.width) * 2);
    const bytes = fieldHex.match(/../g)!;
    if (candidate.byteOrder === 'little') bytes.reverse();
    let rawInteger = BigInt(`0x${bytes.join('')}`);
    const range = 1n << BigInt(candidate.width * 8);
    if (candidate.signed && rawInteger >= range / 2n) rawInteger -= range;
    const divisor = BigInt(candidate.divisor);
    const decoded = { n: rawInteger + BigInt(candidate.valueOffset) * divisor, d: divisor };
    const residual = { n: decoded.n * expected.d - expected.n * decoded.d, d: decoded.d * expected.d };
    const withinTolerance = absolute(residual.n) * tolerance.d <= tolerance.n * residual.d;
    return { ...common, status: withinTolerance ? 'within-tolerance' : 'outside-tolerance', fieldHex, rawInteger: rawInteger.toString(), value: serialize(decoded), residual: serialize(residual), withinTolerance };
  });
  const sources = dataset.sources.filter(source => results.some(row => row.sourceId === source.id)).map(source => {
    const subsets = (['discovery', 'held-out'] as const).map(subset => {
      const rows = results.filter(row => row.sourceId === source.id && row.subset === subset);
      if (!rows.length) throw new Error('Both designated subsets required for every selected source');
      return { subset, trialIds: rows.map(row => row.trialId), count: rows.length,
        withinTolerance: rows.filter(row => row.withinTolerance === true).length,
        outsideTolerance: rows.filter(row => row.withinTolerance === false).length,
        incomplete: rows.filter(row => row.status === 'incomplete').length,
        allWithinTolerance: rows.every(row => row.withinTolerance === true),
        eligibility: FIELD_HYPOTHESIS_ELIGIBILITY, caveat: FIELD_HYPOTHESIS_CAVEAT };
    });
    return { sourceId: source.id, subsets };
  });
  return { schemaVersion: 1, analysis: 'offline-declared-field-hypothesis', document, datasetDocument: input.dataset, dataset,
    candidate, tolerance: input.tolerance as string, results, sources,
    unselectedTrialIds: dataset.trials.filter(trial => !assigned.has(trial.id)).map(trial => trial.id),
    eligibility: FIELD_HYPOTHESIS_ELIGIBILITY, caveat: FIELD_HYPOTHESIS_CAVEAT,
    limitations: ['value = rawInteger / divisor + valueOffset; residual = value - declared expected. Exact rational strings determine inclusive tolerance; approximate numbers are display only.',
      'Offsets exclude UUID and AD headers. Missing field bytes are incomplete, never zero or a match. Known format eligibility is checked before candidate extraction.',
      'No fitting, candidate search, pooling between sources, statistical significance, decryption, device commands, network or native actions. Repeated manual candidate selection can overfit designated held-out data.',
      'Candidate bytes may cross fields or select headers or unavailable sentinels. Numeric agreement does not establish field meaning or override protocol semantics.',
      'All source, receipt, expected-reading and subset declarations remain unverified. Full original inputs are retained and may contain private identifiers; keep this report local.'] };
}
