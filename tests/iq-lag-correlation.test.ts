import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareIq } from '../packages/core/iq-offline.ts';
import type { PreparedIq } from '../packages/core/iq-offline.ts';
import { analyzeIqLagCorrelation } from '../packages/core/iq-lag-correlation.ts';
import type { IqLagCorrelationOptions } from '../packages/core/iq-lag-correlation.ts';
type Pair = [number, number];
const options: IqLagCorrelationOptions = { startSample: 0, windowSamples: 2, firstLag: 1, lagStep: 1, lagCount: 2 };
async function synthetic(pairs: Pair[]) {
  const bytes = new Uint8Array(pairs.length * 4), view = new DataView(bytes.buffer);
  pairs.forEach(([i, q], k) => { view.setInt16(k * 4, i, true); view.setInt16(k * 4 + 2, q, true); });
  return prepareIq(new TextEncoder().encode(JSON.stringify({
    global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024 },
    captures: [{ 'core:sample_start': 0, 'core:frequency': 1e6 }], annotations: [],
  })), bytes, { schemaVersion: 1, origin: 'synthetic-fixture', importedAt: '2026-11-08T00:00:00.000Z' },
  { digest: async (algorithm, b) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(b).digest('hex') });
}

test('independent integer oracle, signed extrema, exact rational and Cauchy bound', async () => {
  const pairs: Pair[] = [[-32768, -32768], [32767, 32767], ...Array.from({ length: 1000 }, (_, k): Pair => [(k * 7919 % 65536) - 32768, (k * 127 % 65536) - 32768])];
  const recording = await synthetic(pairs);
  for (const step of [1, 17, 31]) {
    const report = analyzeIqLagCorrelation(recording, { ...options, startSample: step === 1 ? 0 : 7, windowSamples: 19, lagStep: step, lagCount: 27 });
    for (const result of report.lags) {
      const left = pairs.slice(result.leftStartSample, result.leftEndSampleExclusive).map(p => p.map(BigInt));
      const right = pairs.slice(result.rightStartSample, result.rightEndSampleExclusive).map(p => p.map(BigInt));
      const energy = (p: bigint[][]) => p.flat().reduce((s, v) => s + v ** 2n, 0n);
      const re = left.reduce((s, p, k) => s + p[0]! * right[k]![0]! + p[1]! * right[k]![1]!, 0n);
      const im = left.reduce((s, p, k) => s + p[0]! * right[k]![1]! - p[1]! * right[k]![0]!, 0n);
      assert.deepEqual(result.complexSum, { real: String(re), imaginary: String(im) });
      assert.equal(result.leftEnergy, String(energy(left))); assert.equal(result.rightEnergy, String(energy(right)));
      assert.deepEqual(result.normalizedSquaredMagnitude, { status: 'available', numerator: String(re ** 2n + im ** 2n), denominator: String(energy(left) * energy(right)) });
      assert.ok(re ** 2n + im ** 2n <= energy(left) * energy(right));
      assert.equal(result.nominalLagSeconds, result.lagSamples / 1024);
      assert.equal(result.overlappingSampleCount, Math.max(0, 19 - result.lagSamples));
    }
    assert.doesNotThrow(() => JSON.stringify(report));
  }
});

test('complex orientation, zero on either side, DC, tone and known synthetic repetition', async () => {
  const one = { ...options, windowSamples: 1, lagCount: 1 };
  const orientation = analyzeIqLagCorrelation(await synthetic([[1, 2], [3, 4]]), one).lags[0]!;
  assert.deepEqual(orientation.complexSum, { real: '11', imaginary: '-2' });
  for (const pairs of [[[0, 0], [0, 0]], [[1, 2], [0, 0]], [[0, 0], [1, 2]]] as Pair[][]) {
    assert.deepEqual(analyzeIqLagCorrelation(await synthetic(pairs), one).lags[0]!.normalizedSquaredMagnitude,
      { status: 'unavailable', reason: 'zero-energy denominator', numerator: '0', denominator: '0' });
  }
  const dc: Pair[] = Array.from({ length: 20 }, () => [3, -4]);
  const toneBase: Pair[] = [[5, 0], [0, 5], [-5, 0], [0, -5]];
  for (const pairs of [dc, Array.from({ length: 20 }, (_, k) => toneBase[k % 4]!)]) {
    const results = analyzeIqLagCorrelation(await synthetic(pairs), { ...options, windowSamples: 8, lagCount: 8 }).lags;
    for (const r of results) assert.equal(r.normalizedSquaredMagnitude.numerator, r.normalizedSquaredMagnitude.denominator);
  }
  const pattern: Pair[] = [[1, 3], [-5, 2], [4, -7]];
  const repeated = await synthetic(Array.from({ length: 20 }, (_, k) => pattern[k % 3]!));
  const report = analyzeIqLagCorrelation(repeated, { ...options, windowSamples: 6, lagCount: 6 });
  for (const r of report.lags) {
    const ratio = r.normalizedSquaredMagnitude;
    assert.equal(ratio.numerator === ratio.denominator, r.lagSamples % 3 === 0);
  }
});

test('full original hashes/context and mutation isolation', async () => {
  const recording = await synthetic([[1, 2], [3, 4], [5, 6], [7, 8]]);
  const data = recording.getDataBytes(), metadata = recording.getMetadataBytes();
  const opts = Object.freeze({ ...options });
  const report = analyzeIqLagCorrelation(recording, opts), original = JSON.stringify(report);
  assert.equal(report.source.dataSha256, createHash('sha256').update(data).digest('hex'));
  assert.equal(report.source.metadataSha256, createHash('sha256').update(metadata).digest('hex'));
  assert.deepEqual(report.source.context, recording.context); assert.deepEqual(report.source.supplierClaim, recording.supplierClaim);
  assert.equal(report.source.acquisition, 'offline import; acquisition not verified');
  report.lags[0]!.complexSum.real = '999'; report.lags[0]!.normalizedSquaredMagnitude.numerator = '999';
  report.options.startSample = 99; report.warnings[0] = 'changed'; data.fill(0); metadata.fill(0);
  assert.equal(JSON.stringify(analyzeIqLagCorrelation(recording, opts)), original);
  assert.deepEqual(opts, options);
  assert.throws(() => { (report.source.context as { origin: string }).origin = 'changed'; });
});

test('strict explicit options, getter refusal, safe ranges and exact bounded work', async () => {
  const recording = await synthetic(Array.from({ length: 65536 }, () => [0, 0]));
  const invalid: unknown[] = [null, undefined, [], {}, { ...options, extra: 1 }, { ...options, [Symbol('extra')]: 1 }, Object.create(options)];
  for (const key of Object.keys(options)) {
    const missing = { ...options } as Record<string, unknown>; delete missing[key]; invalid.push(missing);
    for (const value of [undefined, NaN, Infinity, -1, 1.1, '1', Number.MAX_SAFE_INTEGER + 1]) invalid.push({ ...options, [key]: value });
  }
  for (const [key, value] of [['windowSamples', 0], ['windowSamples', 4097], ['firstLag', 0], ['lagStep', 0], ['lagCount', 0], ['lagCount', 257], ['firstLag', 65536], ['startSample', 65533], ['startSample', Number.MAX_SAFE_INTEGER], ['firstLag', Number.MAX_SAFE_INTEGER], ['lagStep', Number.MAX_SAFE_INTEGER]] as const) invalid.push({ ...options, [key]: value });
  invalid.push({ ...options, windowSamples: 4096, lagCount: 65 });
  let getterCalls = 0;
  invalid.push(Object.defineProperty({ ...options }, 'windowSamples', { get() { getterCalls++; return 2; } }));
  for (const opts of invalid) assert.throws(() => analyzeIqLagCorrelation(recording, opts as IqLagCorrelationOptions));
  assert.equal(getterCalls, 0);
  assert.throws(() => analyzeIqLagCorrelation({ ...recording } as PreparedIq, options));
  assert.equal(analyzeIqLagCorrelation(recording, { ...options, windowSamples: 4096, lagCount: 64 }).comparedCells, 262144);
  assert.equal(analyzeIqLagCorrelation(recording, { ...options, lagCount: 256 }).lags.length, 256);
  assert.equal(analyzeIqLagCorrelation(recording, { ...options, startSample: 65532 }).lags.at(-1)!.rightEndSampleExclusive, 65536);
  assert.equal(analyzeIqLagCorrelation(recording, { ...options, windowSamples: 1, firstLag: 65535, lagCount: 1 }).lags[0]!.rightEndSampleExclusive, 65536);
  assert.doesNotThrow(() => analyzeIqLagCorrelation(recording, { ...options, lagStep: Number.MAX_SAFE_INTEGER, lagCount: 1 }));
});
