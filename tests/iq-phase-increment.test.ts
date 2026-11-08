import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareIq } from '../packages/core/iq-offline.ts';
import type { PreparedIq } from '../packages/core/iq-offline.ts';
import { analyzeIqPhaseIncrement } from '../packages/core/iq-phase-increment.ts';
import type { IqPhaseIncrementOptions } from '../packages/core/iq-phase-increment.ts';
import { analyzeIqLagCorrelation } from '../packages/core/iq-lag-correlation.ts';
type Pair = [number, number];
async function synthetic(pairs: Pair[]) {
  const bytes = new Uint8Array(pairs.length * 4), view = new DataView(bytes.buffer);
  pairs.forEach(([i, q], k) => { view.setInt16(k * 4, i, true); view.setInt16(k * 4 + 2, q, true); });
  return prepareIq(new TextEncoder().encode(JSON.stringify({
    global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024 },
    captures: [{ 'core:sample_start': 0, 'core:frequency': 1e6 }], annotations: [],
  })), bytes, { schemaVersion: 1, origin: 'synthetic-fixture', importedAt: '2026-11-08T00:00:00.000Z' },
  { digest: async (algorithm, b) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(b).digest('hex') });
}


const options: IqPhaseIncrementOptions = { startSample: 0, lag: 1, step: 1, count: 1 };
test('quarter tones, negative tone, DC, lag alias and half-turn convention', async () => {
  for (const sign of [1, -1]) {
    const base: Pair[] = [[5, 0], [0, sign * 5], [-5, 0], [0, -sign * 5]];
    const recording = await synthetic(Array.from({ length: 12 }, (_, k) => base[k % 4]!));
    const report = analyzeIqPhaseIncrement(recording, { ...options, count: 11 });
    for (const pair of report.pairs) {
      assert.deepEqual(pair.phaseAndFrequency, { status: 'available', principalPhaseRadians: sign * Math.PI / 2, nominalPrincipalFrequencyOffsetHz: sign * 256 });
    }
    const half = analyzeIqPhaseIncrement(recording, { ...options, lag: 2, count: 10 });
    assert.equal(half.aliasSpacingHz, 512);
    assert.deepEqual(half.nominalPrincipalFrequencyIntervalHz, { lowerExclusive: -256, upperInclusive: 256 });
    for (const p of half.pairs) assert.deepEqual(p.phaseAndFrequency, { status: 'available', principalPhaseRadians: Math.PI, nominalPrincipalFrequencyOffsetHz: 256 });
    assert.equal(analyzeIqPhaseIncrement(recording, { ...options, lag: 4 }).pairs[0]!.phaseAndFrequency.principalPhaseRadians, 0);
  }
  const dc = analyzeIqPhaseIncrement(await synthetic([[3, -4], [3, -4]]), options).pairs[0]!;
  assert.equal(dc.phaseAndFrequency.principalPhaseRadians, 0);
  assert.equal(Object.is(dc.phaseAndFrequency.principalPhaseRadians, -0), false);
});

test('zero-energy endpoints never claim phase/frequency', async () => {
  for (const pairs of [[[0, 0], [0, 0]], [[1, 2], [0, 0]], [[0, 0], [1, 2]]] as Pair[][]) {
    const result = analyzeIqPhaseIncrement(await synthetic(pairs), options).pairs[0]!;
    assert.deepEqual(result.phaseAndFrequency, { status: 'unavailable', reason: 'zero-energy endpoint' });
    assert.deepEqual(result.complexProduct, { real: '0', imaginary: '0' });
  }
});

test('integer oracle, rails, irregular geometry, window-one orientation', async () => {
  const pairs: Pair[] = [[-32768, -32768], [32767, -32768], ...Array.from({ length: 1000 }, (_, k): Pair => [(k * 7919 % 65536) - 32768, (k * 127 % 65536) - 32768])];
  const recording = await synthetic(pairs);
  for (const opts of [options, { startSample: 3, lag: 17, step: 7, count: 123 }]) {
    const report = analyzeIqPhaseIncrement(recording, opts);
    for (const r of report.pairs) {
      const left = opts.startSample + r.index * opts.step, right = left + opts.lag;
      const [li, lq] = pairs[left]!.map(BigInt) as [bigint, bigint];
      const [ri, rq] = pairs[right]!.map(BigInt) as [bigint, bigint];
      assert.deepEqual(r.complexProduct, { real: String(ri * li + rq * lq), imaginary: String(rq * li - ri * lq) });
      assert.equal(r.leftEnergy, String(li ** 2n + lq ** 2n)); assert.equal(r.rightEnergy, String(ri ** 2n + rq ** 2n));
      assert.equal(r.leftSample, left); assert.equal(r.rightSample, right);
      assert.equal(r.intervalStartSample, left); assert.equal(r.intervalEndSample, right); assert.equal(r.sampleSpanEndExclusive, right + 1);
      assert.equal(r.nominalLeftSeconds, left / 1024); assert.equal(r.nominalRightSeconds, right / 1024);
      const lag = analyzeIqLagCorrelation(recording, { startSample: left, firstLag: opts.lag, lagStep: 1, lagCount: 1, windowSamples: 1 }).lags[0]!;
      assert.deepEqual(r.complexProduct, lag.complexSum);
    }
    assert.equal(report.nominalIntervalSeconds, opts.lag / 1024);
    assert.doesNotThrow(() => JSON.stringify(report));
  }
});

test('strict explicit parameters, accessor refusal and exact extent bounds', async () => {
  const recording = await synthetic(Array.from({ length: 65536 }, () => [1, 2]));
  const invalid: unknown[] = [null, undefined, [], {}, Object.create(options), { ...options, extra: 1 }, { ...options, [Symbol('extra')]: 1 }];
  for (const key of Object.keys(options)) {
    const missing = { ...options } as Record<string, unknown>; delete missing[key]; invalid.push(missing);
    for (const value of [undefined, NaN, Infinity, -1, 1.1, '1', Number.MAX_SAFE_INTEGER + 1]) invalid.push({ ...options, [key]: value });
  }
  for (const [key, value] of [['lag', 0], ['step', 0], ['count', 0], ['count', 513], ['lag', 65536], ['startSample', 65535], ['startSample', Number.MAX_SAFE_INTEGER], ['lag', Number.MAX_SAFE_INTEGER]] as const) invalid.push({ ...options, [key]: value });
  invalid.push({ ...options, step: Number.MAX_SAFE_INTEGER, count: 2 });
  let calls = 0;
  for (const key of Object.keys(options)) invalid.push(Object.defineProperty({ ...options }, key, { get() { calls++; return 1; } }));
  for (const opts of invalid) assert.throws(() => analyzeIqPhaseIncrement(recording, opts as IqPhaseIncrementOptions));
  assert.equal(calls, 0);
  assert.throws(() => analyzeIqPhaseIncrement({ ...recording } as PreparedIq, options));
  assert.equal(analyzeIqPhaseIncrement(recording, { ...options, count: 512 }).pairs.length, 512);
  assert.equal(analyzeIqPhaseIncrement(recording, { ...options, startSample: 65534 }).pairs[0]!.sampleSpanEndExclusive, 65536);
  assert.doesNotThrow(() => analyzeIqPhaseIncrement(recording, { ...options, step: Number.MAX_SAFE_INTEGER }));
});

test('full original provenance and caller-owned report isolation', async () => {
  const recording = await synthetic([[1, 2], [3, 4], [5, 6]]);
  const opts = { ...options };
  const report = analyzeIqPhaseIncrement(recording, opts), original = JSON.stringify(report);
  assert.equal(report.source.dataSha256, createHash('sha256').update(recording.getDataBytes()).digest('hex'));
  assert.equal(report.source.metadataSha256, createHash('sha256').update(recording.getMetadataBytes()).digest('hex'));
  assert.deepEqual(report.source.context, recording.context); assert.deepEqual(report.source.supplierClaim, recording.supplierClaim);
  assert.equal(report.source.centerFrequency, 1e6); assert.equal(report.source.acquisition, 'offline import; acquisition not verified');
  opts.lag = 2;
  assert.equal(JSON.stringify(report), original);
  report.pairs[0]!.complexProduct.real = '999'; report.options.lag = 99; report.warnings[0] = 'changed';
  recording.getDataBytes().fill(0); recording.getMetadataBytes().fill(0);
  assert.equal(JSON.stringify(analyzeIqPhaseIncrement(recording, options)), original);
  assert.throws(() => { (report.source.context as { origin: string }).origin = 'changed'; });
});
