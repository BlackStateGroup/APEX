import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareIq } from '../packages/core/iq-offline.ts';
import type { PreparedIq } from '../packages/core/iq-offline.ts';
import { analyzeIqActivity } from '../packages/core/iq-activity.ts';
import type { IqActivityOptions } from '../packages/core/iq-activity.ts';
type Pair = [number, number];
const options: IqActivityOptions = { windowSamples: 2, startSample: 0, hopSamples: 2, frameCount: 2, thresholdNumerator: '0', thresholdDenominator: '1' };
async function synthetic(pairs: Pair[]) {
  const bytes = new Uint8Array(pairs.length * 4), view = new DataView(bytes.buffer);
  pairs.forEach(([i, q], k) => { view.setInt16(k * 4, i, true); view.setInt16(k * 4 + 2, q, true); });
  return prepareIq(new TextEncoder().encode(JSON.stringify({
    global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024 },
    captures: [{ 'core:sample_start': 0, 'core:frequency': 1e6 }], annotations: [],
  })), bytes, { schemaVersion: 1, origin: 'synthetic-fixture', importedAt: '2026-11-08T00:00:00.000Z' },
  { digest: async (algorithm, b) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(b).digest('hex') });
}

test('exact extrema, zero, DC and strict rational boundaries beyond float precision', async () => {
  const recording = await synthetic([[-32768, -32768], [32767, 32767], [0, 0], [3, -4]]);
  const report = analyzeIqActivity(recording, { ...options, windowSamples: 1, hopSamples: 1, frameCount: 4 });
  assert.deepEqual(report.frames.map(f => f.sumSquaredCounts), ['2147483648', '2147352578', '0', '25']);
  assert.deepEqual(report.frames.map(f => f.aboveThreshold), [true, true, false, true]);
  const dc = await synthetic([[3, -4], [3, -4], [3, -4], [3, -4]]);
  const equal = analyzeIqActivity(dc, { ...options, thresholdNumerator: '75', thresholdDenominator: '3' });
  assert.deepEqual(equal.frames.map(f => f.meanSquaredCounts), Array(2).fill({ numerator: '50', denominator: '2' }));
  assert.equal(equal.runs.length, 0);
  const d = 10n ** 100n;
  for (const delta of [-1n, 0n, 1n]) {
    const result = analyzeIqActivity(dc, { ...options, thresholdNumerator: (25n * d + delta).toString(), thresholdDenominator: d.toString() });
    assert.equal(result.frames[0]!.aboveThreshold, delta < 0n);
  }
  const fractional = await synthetic([[0, 0], [1, 0], [0, 0], [0, 0]]);
  assert.equal(analyzeIqActivity(fractional, { ...options, thresholdNumerator: '1', thresholdDenominator: '2' }).frames[0]!.aboveThreshold, false);
});

test('independent direct-loop BigInt oracle for deterministic signed samples, overlapping and gapped windows', async () => {
  const pairs: Pair[] = Array.from({ length: 1000 }, (_, k) => [(k * 7919 % 65536) - 32768, (k * 127 % 65536) - 32768]);
  const recording = await synthetic(pairs);
  for (const hop of [3, 17, 31]) {
    const opts = { ...options, startSample: 7, windowSamples: 17, hopSamples: hop, frameCount: 27, thresholdNumerator: '234567891234567891', thresholdDenominator: '987654321' };
    const report = analyzeIqActivity(recording, opts);
    for (const frame of report.frames) {
      let expected = 0n;
      for (const pair of pairs.slice(frame.startSample, frame.endSampleExclusive)) for (const component of pair) expected += BigInt(component) ** 2n;
      assert.equal(frame.sumSquaredCounts, String(expected));
      assert.deepEqual(frame.meanSquaredCounts, { numerator: String(expected), denominator: '17' });
      assert.equal(frame.aboveThreshold, expected * BigInt(opts.thresholdDenominator) > BigInt(opts.thresholdNumerator) * 17n);
      assert.equal(frame.nominalStartSeconds, frame.startSample / 1024);
      assert.equal(frame.nominalEndExclusiveSeconds, frame.endSampleExclusive / 1024);
    }
    assert.equal(report.windowRelationship, hop < 17 ? 'overlapping' : hop === 17 ? 'contiguous' : 'gapped');
    assert.doesNotThrow(() => JSON.stringify(report));
  }
});

test('runs follow selected indices, merge coverage only where windows touch, never bridge gaps', async () => {
  const recording = await synthetic(Array.from({ length: 30 }, () => [1, 0]));
  for (const hop of [1, 2, 4]) {
    const report = analyzeIqActivity(recording, { ...options, hopSamples: hop, frameCount: 3 });
    assert.equal(report.runs.length, 1);
    const run = report.runs[0]!;
    assert.equal(run.firstFrameIndex, 0); assert.equal(run.lastFrameIndex, 2); assert.equal(run.frameCount, 3);
    assert.deepEqual(run.measuredSampleIntervals, hop <= 2 ? [{ startSample: 0, endSampleExclusive: 2 + 2 * hop }] :
      [{ startSample: 0, endSampleExclusive: 2 }, { startSample: 4, endSampleExclusive: 6 }, { startSample: 8, endSampleExclusive: 10 }]);
  }
  const alternating = await synthetic([[1, 0], [0, 0], [1, 0], [1, 0], [0, 0], [1, 0]]);
  const report = analyzeIqActivity(alternating, { ...options, windowSamples: 1, hopSamples: 1, frameCount: 6 });
  assert.deepEqual(report.runs.map(r => [r.firstFrameIndex, r.lastFrameIndex]), [[0, 0], [2, 3], [5, 5]]);
  assert.equal(analyzeIqActivity(recording, { ...options, frameCount: 1 }).windowRelationship, 'single-window');
  assert.equal(analyzeIqActivity(await synthetic([[0, 0], [0, 0], [0, 0], [0, 0]]), options).runs.length, 0);
});

test('original source hashes/context and input/output isolation', async () => {
  const recording = await synthetic([[1, 2], [3, 4], [5, 6], [7, 8]]);
  const data = recording.getDataBytes(), metadata = recording.getMetadataBytes();
  const opts = Object.freeze({ ...options });
  const report = analyzeIqActivity(recording, opts);
  assert.equal(report.source.dataSha256, createHash('sha256').update(data).digest('hex'));
  assert.equal(report.source.metadataSha256, createHash('sha256').update(metadata).digest('hex'));
  assert.deepEqual(report.source.context, recording.context);
  assert.deepEqual(report.source.supplierClaim, recording.supplierClaim);
  assert.equal(report.source.acquisition, 'offline import; acquisition not verified');
  const original = JSON.stringify(report);
  report.frames[0]!.sumSquaredCounts = '999'; report.runs[0]!.measuredSampleIntervals[0]!.startSample = 99;
  report.options.startSample = 99;
  assert.equal(JSON.stringify(analyzeIqActivity(recording, opts)), original);
  assert.deepEqual(recording.getDataBytes(), data); assert.deepEqual(recording.getMetadataBytes(), metadata);
  assert.deepEqual(opts, options);
});

test('explicit options, branding, complete range and bounded work refusals', async () => {
  const recording = await synthetic(Array.from({ length: 65536 }, () => [0, 0]));
  const invalid: unknown[] = [null, undefined, [], {}, { ...options, extra: 1 }, { ...options, [Symbol('extra')]: 1 }, Object.create(options)];
  for (const key of Object.keys(options)) { const missing = { ...options } as Record<string, unknown>; delete missing[key]; invalid.push(missing); }
  for (const key of ['startSample', 'windowSamples', 'hopSamples', 'frameCount']) {
    for (const value of [undefined, NaN, Infinity, -1, 1.1, '1', Number.MAX_SAFE_INTEGER + 1]) invalid.push({ ...options, [key]: value });
  }
  for (const [key, value] of [['windowSamples', 0], ['windowSamples', 4097], ['hopSamples', 0], ['hopSamples', 65537], ['frameCount', 0], ['frameCount', 257], ['startSample', 65533], ['startSample', Number.MAX_SAFE_INTEGER]] as const) invalid.push({ ...options, [key]: value });
  for (const key of ['thresholdNumerator', 'thresholdDenominator']) {
    for (const value of ['', '1.0', '1e3', '-1', '+1', ' 1', '1\n', '9'.repeat(129), 1, 1n, undefined]) invalid.push({ ...options, [key]: value });
  }
  invalid.push({ ...options, thresholdDenominator: '000' }, { ...options, windowSamples: 4096, frameCount: 65, hopSamples: 1 });
  let getterCalls = 0;
  invalid.push(Object.defineProperty({ ...options }, 'windowSamples', { get() { getterCalls++; return 2; } }));
  for (const opts of invalid) assert.throws(() => analyzeIqActivity(recording, opts as IqActivityOptions));
  assert.equal(getterCalls, 0);
  assert.throws(() => analyzeIqActivity({ ...recording } as PreparedIq, options));
  const maximum = analyzeIqActivity(recording, { ...options, windowSamples: 4096, hopSamples: 1, frameCount: 64 });
  assert.equal(maximum.processedCells, 262144);
  assert.equal(analyzeIqActivity(recording, { ...options, windowSamples: 1, hopSamples: 1, frameCount: 256 }).frames.length, 256);
  assert.equal(analyzeIqActivity(recording, { ...options, startSample: 65532 }).frames.at(-1)!.endSampleExclusive, 65536);
});
