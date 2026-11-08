import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareIq } from '../packages/core/iq-offline.ts';
import { analyzeIq, analyzeIqTimeFrequency } from '../packages/core/iq-analysis.ts';
import type { IqTimeFrequencyOptions } from '../packages/core/iq-analysis.ts';
type Pair = [number, number];
const options: IqTimeFrequencyOptions = { fftSize: 256, startSample: 0, hopSamples: 256, frameCount: 2 };
async function synthetic(pairs: Pair[]) {
  const bytes = new Uint8Array(pairs.length * 4), view = new DataView(bytes.buffer);
  pairs.forEach(([i, q], k) => { view.setInt16(k * 4, i, true); view.setInt16(k * 4 + 2, q, true); });
  return prepareIq(new TextEncoder().encode(JSON.stringify({
    global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024 },
    captures: [{ 'core:sample_start': 0, 'core:frequency': 1e6 }], annotations: [],
  })), bytes, { schemaVersion: 1, origin: 'synthetic-fixture', importedAt: '2026-11-08T00:00:00.000Z' },
  { digest: async (algorithm, b) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(b).digest('hex') });
}
const zero = (n: number): Pair[] => Array.from({ length: n }, () => [0, 0]);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-10, a + ' != ' + b);

test('changing signed tones, phase rotation, axes, exact times and untouched source', async () => {
  const pairs: Pair[] = Array.from({ length: 768 }, (_, k) => {
    const phase = (k < 256 ? 1 : -1) * 2 * Math.PI * k / 4 + Math.PI / 2;
    return [Math.round(16384 * Math.cos(phase)), Math.round(16384 * Math.sin(phase))];
  });
  const recording = await synthetic(pairs), before = recording.getDataBytes(), meta = recording.getMetadataBytes();
  const opts = Object.freeze({ ...options });
  const report = analyzeIqTimeFrequency(recording, opts);
  assert.deepEqual(report.options, opts);
  assert.deepEqual(report.frames.map(f => f.peakSignedBin), [64, -64]);
  for (const [index, frame] of report.frames.entries()) {
    near(frame.amplitude[frame.peakSignedBin! + 128]!, 0.5);
    near(frame.dbRelativeToUnitAmplitude[frame.peakSignedBin! + 128]!, -6.020599913279624);
    assert.equal(frame.nominalStartSeconds, index / 4);
    assert.equal(frame.nominalCenterSeconds, index / 4 + 0.125);
    assert.equal(frame.nominalEndExclusiveSeconds, index / 4 + 0.25);
    const single = analyzeIq(recording, { fftSize: 256, startSample: index * 256 }).spectrum!;
    assert.deepEqual(frame.amplitude, single.bins.map(b => b.amplitude));
  }
  assert.equal(report.axis[0]!.offsetHz, -512);
  assert.equal(report.axis[0]!.declaredRfHz, 999488);
  assert.equal(report.axis[255]!.offsetHz, 508);
  assert.equal(report.source.dataLength, 768 * 4);
  assert.equal(report.source.dataSha256, createHash('sha256').update(before).digest('hex'));
  assert.equal(report.source.metadataSha256, createHash('sha256').update(meta).digest('hex'));
  assert.equal(report.source.context.origin, 'synthetic-fixture');
  report.frames[0]!.amplitude[0] = 123;
  assert.deepEqual(recording.getDataBytes(), before);
  assert.deepEqual(recording.getMetadataBytes(), meta);
  assert.deepEqual(opts, options);
});

test('zero sentinels, DC and Nyquist orientation', async () => {
  const allZero = analyzeIqTimeFrequency(await synthetic(zero(512)), options);
  for (const frame of allZero.frames) {
    assert.equal(frame.peakSignedBin, null);
    assert.ok(frame.amplitude.every(a => a === 0));
    assert.ok(frame.dbRelativeToUnitAmplitude.every(a => a === null));
    assert.ok(frame.displayDb.every(a => a === -160));
  }
  const pairs: Pair[] = Array.from({ length: 512 }, (_, k) => k < 256 ? [8192, -4096] : [k % 2 ? -16384 : 16384, 0]);
  const report = analyzeIqTimeFrequency(await synthetic(pairs), options);
  assert.deepEqual(report.frames.map(f => f.peakSignedBin), [0, -128]);
  near(report.frames[0]!.amplitude[128]!, Math.sqrt(5) / 8);
  near(report.frames[0]!.amplitude[127]!, Math.sqrt(5) / 16);
  near(report.frames[1]!.amplitude[0]!, 0.5);
});

test('independent windowed negative-exponent DFT for overlapping nonzero-start off-bin frames', async () => {
  const pairs: Pair[] = Array.from({ length: 640 }, (_, k) => {
    const a = 2 * Math.PI * 16.5 * k / 256, b = -2 * Math.PI * 37 * k / 256 + 0.4;
    return [Math.round(8192 * Math.cos(a) + 4096 * Math.cos(b)), Math.round(8192 * Math.sin(a) + 4096 * Math.sin(b))];
  });
  const report = analyzeIqTimeFrequency(await synthetic(pairs), { ...options, startSample: 17, hopSamples: 127, frameCount: 3 });
  for (const frame of report.frames) {
    for (let bin = 0; bin < 256; bin++) {
      const raw = report.axis[bin]!.rawIndex;
      let re = 0, im = 0, sum = 0;
      for (let j = 0; j < 256; j++) {
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / 256), phase = -2 * Math.PI * raw * j / 256;
        const [i, q] = pairs[frame.startSample + j]!;
        re += w * (i * Math.cos(phase) - q * Math.sin(phase)) / 32768;
        im += w * (i * Math.sin(phase) + q * Math.cos(phase)) / 32768;
        sum += w;
      }
      near(frame.amplitude[bin]!, Math.hypot(re, im) / sum);
    }
  }
});

test('exact frame/cell/range/hop boundaries and refusal without truncation', async () => {
  const recording = await synthetic(zero(65536));
  for (const fftSize of [256, 512, 1024, 2048, 4096] as const) {
    const report = analyzeIqTimeFrequency(recording, { fftSize, startSample: 0, hopSamples: fftSize, frameCount: 16384 / fftSize });
    assert.equal(report.cellCount, 16384);
    assert.equal(report.frames.length, 16384 / fftSize);
    assert.throws(() => analyzeIqTimeFrequency(recording, { ...report.options, frameCount: 16384 / fftSize + 1 }));
  }
  const last = analyzeIqTimeFrequency(recording, { ...options, startSample: 65536 - 257, hopSamples: 1 });
  assert.equal(last.frames[1]!.endSampleExclusive, 65536);
  assert.throws(() => analyzeIqTimeFrequency(recording, { ...last.options, startSample: last.options.startSample + 1 }));
  assert.equal(analyzeIqTimeFrequency(recording, { ...options, hopSamples: 65536, frameCount: 1 }).frames.length, 1);
  assert.throws(() => analyzeIqTimeFrequency(recording, { ...options, hopSamples: 65537, frameCount: 1 }));
  const gap = analyzeIqTimeFrequency(recording, { ...options, hopSamples: 65280 });
  assert.equal(gap.frames[1]!.endSampleExclusive, 65536);
  assert.throws(() => analyzeIqTimeFrequency(recording, { ...options, hopSamples: 65281 }));
});

test('invalid options, accessors and forged recording reject', async () => {
  const recording = await synthetic(zero(512));
  const bad: unknown[] = [undefined, null, [], {}, Object.create(options), { ...options, extra: 1 }, { ...options, [Symbol('extra')]: 1 }];
  for (const key of Object.keys(options)) {
    for (const value of [undefined, null, NaN, Infinity, -1, 0.5, '256', Number.MAX_SAFE_INTEGER + 1]) bad.push({ ...options, [key]: value });
    const missing = { ...options } as Record<string, unknown>; delete missing[key]; bad.push(missing);
  }
  for (const value of [0, 65]) bad.push({ ...options, frameCount: value });
  bad.push({ ...options, hopSamples: 0 }, { ...options, fftSize: 128 }, { ...options, startSample: Number.MAX_SAFE_INTEGER });
  let called = false;
  bad.push({ ...options, get hopSamples() { called = true; return 256; } });
  for (const opt of bad) assert.throws(() => analyzeIqTimeFrequency(recording, opt as IqTimeFrequencyOptions));
  assert.equal(called, false);
  assert.throws(() => analyzeIqTimeFrequency({ ...recording }, options));
});

test('Hann zero-weight endpoint sentinel and raw dB remain separate from display floor', async () => {
  const pairs = zero(512); pairs[0] = [16384, -8192]; pairs[257] = [1, 0];
  const report = analyzeIqTimeFrequency(await synthetic(pairs), options);
  assert.equal(report.frames[0]!.peakSignedBin, null);
  assert.ok(report.frames[0]!.amplitude.every(a => a === 0));
  assert.ok(report.frames[1]!.amplitude.every(a => a > 0));
  assert.ok(report.frames[1]!.dbRelativeToUnitAmplitude.every(a => a !== null && a < -160));
  assert.ok(report.frames[1]!.displayDb.every(a => a === -160));
});
