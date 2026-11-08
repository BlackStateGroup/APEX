import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { analyzeIq, fftComplexForward } from '../packages/core/iq-analysis.ts';
import type { IqAnalysisOptions } from '../packages/core/iq-analysis.ts';
import { prepareIq } from '../packages/core/iq-offline.ts';

// Every sample in this file is synthetic mathematical test data, never RF capture.
type Pair = [number, number];
function pack(pairs: Pair[]) {
  const bytes = new Uint8Array(pairs.length * 4), view = new DataView(bytes.buffer);
  pairs.forEach(([i, q], k) => { view.setInt16(k * 4, i, true); view.setInt16(k * 4 + 2, q, true); });
  return bytes;
}
async function synthetic(pairs: Pair[]) {
  const metadata = new TextEncoder().encode(JSON.stringify({ global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024 }, captures: [{ 'core:sample_start': 0, 'core:frequency': 1000000 }], annotations: [] }));
  return prepareIq(metadata, pack(pairs), { schemaVersion: 1, origin: 'synthetic-fixture', importedAt: '2026-11-07T00:00:00.000Z' }, {
    digest: async (algorithm, bytes) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(bytes).digest('hex'),
  });
}
function near(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}
function directDft(re: Float64Array, im: Float64Array) {
  return Array.from({ length: re.length }, (_, k) => {
    let real = 0, imaginary = 0;
    for (let j = 0; j < re.length; j++) {
      const phase = -2 * Math.PI * k * j / re.length;
      real += re[j]! * Math.cos(phase) - im[j]! * Math.sin(phase);
      imaginary += re[j]! * Math.sin(phase) + im[j]! * Math.cos(phase);
    }
    return { real, imaginary };
  });
}
const positive: Pair[] = [[16384, 0], [0, 16384], [-16384, 0], [0, -16384]];
const fixture = (pattern: Pair[], count = 256) => Array.from({ length: count }, (_, k) => pattern[k % pattern.length]!);

test('synthetic acceptance hashes, zero spectrum and exact DC statistics', async () => {
  const cases: [Pair[], string][] = [
    [fixture([[0, 0]]), '5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef'],
    [fixture([[8192, -4096]]), '0ead4bcc84b62039f7a3f621dfe52e0818941dc999c126726a2a4cd77296cbe7'],
    [fixture(positive), 'fad75c6c2877cf3970eae5004f7d6f38680fe00f2788b2b677fb918a3056eb2d'],
    [fixture(positive.map(([i, q]) => [i, -q])), '8495409a722b372dd13ea66e992e144f5761878d51df7b6bf66d5e8a67bbd883'],
  ];
  for (const [pairs, hash] of cases) assert.equal(createHash('sha256').update(pack(pairs)).digest('hex'), hash);
  const zero = analyzeIq((await synthetic(cases[0]![0])), { fftSize: 256 });
  assert.equal(zero.spectrum!.peakBin, null);
  for (const bin of zero.spectrum!.bins) { assert.equal(bin.amplitude, 0); assert.equal(bin.dbRelativeToUnitAmplitude, null); assert.equal(bin.displayDb, -160); }
  assert.equal(zero.statistics.rmsComplexMagnitude, 0); assert.equal(zero.statistics.railHits.complexPairFraction, 0);
  const dc = analyzeIq((await synthetic(cases[1]![0])), { fftSize: 256 });
  assert.equal(dc.statistics.meanI, 0.25); assert.equal(dc.statistics.meanQ, -0.125);
  near(dc.statistics.dcMagnitude, Math.sqrt(5) / 8); near(dc.statistics.rmsComplexMagnitude, Math.sqrt(5) / 8);
  assert.equal(dc.statistics.acRmsComplexMagnitude, 0);
  near(dc.spectrum!.bins[128]!.amplitude, Math.sqrt(5) / 8);
  near(dc.spectrum!.bins[127]!.amplitude, Math.sqrt(5) / 16);
  near(dc.spectrum!.bins[129]!.amplitude, Math.sqrt(5) / 16);
  assert.equal(dc.statistics.nominalDurationSeconds, 0.25); assert.equal(dc.statistics.lastSampleTimeSeconds, 255 / 1024);
});

test('synthetic signed complex tones, periodic Hann neighbors and all FFT sizes', async () => {
  for (const fftSize of [256, 512, 1024, 2048, 4096] as const) {
    for (const sign of [1, -1]) {
      const recording = (await synthetic(fixture(positive.map(([i, q]) => [i, q * sign]), fftSize)));
      const result = analyzeIq(recording, { fftSize });
      assert.equal(result.statistics.meanI, 0); assert.equal(result.statistics.meanQ, 0);
      near(result.statistics.peakComplexMagnitude, 0.5); near(result.statistics.rmsComplexMagnitude, 0.5);
      near(result.statistics.acRmsComplexMagnitude, 0.5);
      const s = result.spectrum!, peak = s.peakBin!;
      assert.equal(peak.signedBin, sign * fftSize / 4); assert.equal(peak.offsetHz, sign * 256);
      assert.equal(peak.rawIndex, sign === 1 ? fftSize / 4 : fftSize * 3 / 4);
      near(peak.amplitude, 0.5); near(peak.dbRelativeToUnitAmplitude!, -6.020599913279624);
      near(s.bins[peak.signedBin + fftSize / 2 - 1]!.amplitude, 0.25);
      near(s.bins[peak.signedBin + fftSize / 2 + 1]!.amplitude, 0.25);
      assert.equal(s.binSpacingHz, 1024 / fftSize); assert.equal(s.windowDurationSeconds, fftSize / 1024);
      assert.equal(s.bins[0]!.signedBin, -fftSize / 2); assert.equal(s.bins.at(-1)!.signedBin, fftSize / 2 - 1);
    }
  }
  const nyquist = analyzeIq((await synthetic(fixture([[16384, 0], [-16384, 0]]))), { fftSize: 256 });
  assert.equal(nyquist.spectrum!.peakBin!.signedBin, -128);
});

test('synthetic rails, greater-than-one complex magnitude and endian sentinel', async () => {
  const rails = analyzeIq((await synthetic([[-32768, 0], [32767, 0], [0, -32768], [0, 32767]])));
  assert.equal(rails.spectrum, null); assert.ok(rails.warnings.includes('Insufficient samples for default FFT'));
  assert.deepEqual(rails.statistics.railHits, { label: 'rail hits (possible clipping)', iNegative: 1, iPositive: 1, qNegative: 1, qPositive: 1, complexPairCount: 4, complexPairFraction: 1 });
  assert.equal(rails.statistics.meanI, -1 / 131072); assert.equal(rails.statistics.meanQ, -1 / 131072);
  near(analyzeIq((await synthetic([[-32768, -32768]]))).statistics.peakComplexMagnitude, Math.SQRT2);
  const endian = analyzeIq((await synthetic([[1, -2]]))).statistics;
  assert.deepEqual(endian.rawI, { minimum: 1, maximum: 1 }); assert.equal(endian.meanQ, -2 / 32768);
});

test('synthetic selected windows, default fallback and explicit rejection', async () => {
  const recording = (await synthetic([...fixture([[0, 0]]), ...fixture(positive)]));
  assert.equal(analyzeIq(recording).spectrum, null);
  assert.equal(analyzeIq(recording, { fftSize: 256 }).spectrum!.peakBin, null);
  const selected = analyzeIq(recording, { fftSize: 256, startSample: 256 }).spectrum!;
  near(selected.peakBin!.amplitude, 0.5); assert.equal(selected.startSample, 256); assert.equal(selected.endSampleExclusive, 512);
  for (const options of [{ fftSize: 128 }, { fftSize: 257 }, { fftSize: 8192 }, { fftSize: 256, startSample: 257 },
    { startSample: 0 }, { fftSize: 256, startSample: -1 }, { fftSize: 256, startSample: 0.5 },
    { startSample: Number.MAX_SAFE_INTEGER + 1 }, { startSample: Infinity }, { fftSize: NaN },
    { fftSize: undefined }, { startSample: undefined }, { window: 'rectangular' }, null, []]) {
    assert.throws(() => analyzeIq(recording, options as unknown as IqAnalysisOptions));
  }
});

test('synthetic independent direct DFT: deterministic integers and nonzero impulse', async () => {
  for (const impulse of [false, true]) {
    const re = Float64Array.from({ length: 256 }, (_, k) => impulse ? (k === 37 ? 0.5 : 0) : ((k * 137 % 1001) - 500) / 32768);
    const im = Float64Array.from({ length: 256 }, (_, k) => impulse ? (k === 37 ? -0.25 : 0) : ((k * 163 % 977) - 488) / 32768);
    const savedRe = re.slice(), savedIm = im.slice();
    const fft = fftComplexForward(re, im), dft = directDft(re, im);
    for (let k = 0; k < 256; k++) {
      near(fft.real[k]!, dft[k]!.real, 1e-9 * (1 + Math.abs(dft[k]!.real)));
      near(fft.imaginary[k]!, dft[k]!.imaginary, 1e-9 * (1 + Math.abs(dft[k]!.imaginary)));
    }
    assert.deepEqual(re, savedRe); assert.deepEqual(im, savedIm);
  }
});

test('synthetic quantized off-bin and two-tone amplitudes match independent windowed DFT', async () => {
  for (const twoTone of [false, true]) {
    // Math.round uses ties toward positive infinity; these are digitally synthesized samples.
    const pairs: Pair[] = Array.from({ length: 256 }, (_, k) => {
      const a = 2 * Math.PI * 16.5 * k / 256, b = -2 * Math.PI * 37 * k / 256;
      return [Math.round(8192 * Math.cos(a) + (twoTone ? 4096 * Math.cos(b) : 0)),
        Math.round(8192 * Math.sin(a) + (twoTone ? 4096 * Math.sin(b) : 0))];
    });
    const re = Float64Array.from(pairs, ([i], k) => i / 32768 * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / 256)));
    const im = Float64Array.from(pairs, ([, q], k) => q / 32768 * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / 256)));
    const dft = directDft(re, im), report = analyzeIq((await synthetic(pairs)), { fftSize: 256 });
    for (const bin of report.spectrum!.bins) near(bin.amplitude, Math.hypot(dft[bin.rawIndex]!.real, dft[bin.rawIndex]!.imaginary) / 128, 1e-9);
    assert.equal(Object.hasOwn(report, 'modulation'), false); assert.equal(Object.hasOwn(report, 'identity'), false);
    assert.ok(!JSON.stringify(report).includes('Infinity'));
  }
});

test('FFT helper rejects unbounded, nonfinite or inconsistent inputs', async () => {
  assert.throws(() => fftComplexForward(new Float64Array(4), new Float64Array(4)));
  assert.throws(() => fftComplexForward(new Float64Array(256), new Float64Array(512)));
  assert.throws(() => fftComplexForward(new Float64Array(256).fill(NaN), new Float64Array(256)));
  assert.throws(() => fftComplexForward(new Float64Array(256).fill(Number.MAX_VALUE), new Float64Array(256)));
  assert.throws(() => fftComplexForward(Array(256).fill(0) as never, new Float64Array(256)));
});

test('analysis rejects forged prepared summaries and scans all samples outside FFT range', async () => {
  assert.throws(() => analyzeIq({ getDataBytes: () => new Uint8Array(4), sampleCount: 1, sampleRate: 1024, centerFrequency: 0 } as unknown as Parameters<typeof analyzeIq>[0]));
  const recording = await synthetic([...fixture([[0, 0]]), ...fixture([[8192, 0]])]);
  const report = analyzeIq(recording, { fftSize: 256 });
  assert.equal(report.spectrum!.peakBin, null);
  assert.equal(report.statistics.meanI, 0.125);
  near(report.statistics.rmsComplexMagnitude, Math.sqrt(0.5) / 4);
  assert.equal(report.statistics.sampleCount, 512);
});

test('synthetic nonzero-location impulse passes independent windowed DFT', async () => {
  const pairs = fixture([[0, 0]]); pairs[37] = [16384, -8192];
  const report = analyzeIq(await synthetic(pairs), { fftSize: 256 });
  const re = Float64Array.from(pairs, ([i], k) => i / 32768 * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / 256)));
  const im = Float64Array.from(pairs, ([, q], k) => q / 32768 * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / 256)));
  const expected = directDft(re, im);
  for (const bin of report.spectrum!.bins) near(bin.amplitude, Math.hypot(expected[bin.rawIndex]!.real, expected[bin.rawIndex]!.imaginary) / 128, 1e-9);
});
