// Original host-only hybrid proof. Numerical semantics stay in the calling JS
// runtime. C++ receives bounded owned byte and coefficient snapshots only.
import assert from 'node:assert/strict';
export const sizes = Object.freeze([256, 512, 1024, 2048, 4096]);
export const maxRequest = 32 + 262144 + (3 * 4096 - 2) * 8;
export const maxResponse = 24 + 2 * 16384 * 8;
const contexts = new WeakMap();
const plans = new Map();
const integer = (x, low, high) => assert.ok(Number.isSafeInteger(x) && x >= low && x <= high, 'integer bound');
function plan(n) {
  if (plans.has(n)) return plans.get(n);
  const hann = new Float64Array(n), cosine = new Float64Array(n - 1), sine = new Float64Array(n - 1);
  let windowSum = 0;
  for (let k = 0; k < n; k++) {
    hann[k] = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / n);
    windowSum += hann[k];
  }
  for (let size = 2; size <= n; size *= 2) for (let j = 0; j < size / 2; j++) {
    const angle = -2 * Math.PI * j / size;
    cosine[size / 2 - 1 + j] = Math.cos(angle); sine[size / 2 - 1 + j] = Math.sin(angle);
  }
  const result = { hann, cosine, sine, windowSum };
  plans.set(n, result); return result;
}
export function encodeRequest(fixture, iterations = 1) {
  const { data, sampleRate, centerFrequency, fftSize: n, startSample, hopSamples, frameCount } = fixture;
  assert.ok(data instanceof Uint8Array && data.length >= 4 && data.length <= 262144 && data.length % 4 === 0);
  assert.ok(Number.isFinite(sampleRate) && sampleRate >= 1 && sampleRate <= 1e9);
  assert.ok(Number.isFinite(centerFrequency) && Math.abs(centerFrequency) <= 1e12);
  assert.ok(sizes.includes(n)); integer(startSample, 0, 65535); integer(hopSamples, 1, 65536);
  integer(frameCount, 1, 64); integer(iterations, 1, 1000);
  assert.ok(n * frameCount <= 16384 && startSample + (frameCount - 1) * hopSamples + n <= data.length / 4);
  const p = plan(n), input = Buffer.alloc(32 + data.length + (3 * n - 2) * 8);
  input.write('AXHF'); input.writeUInt16LE(1, 4);
  for (const [at, value] of [[8, data.length], [12, n], [16, startSample], [20, hopSamples], [24, frameCount], [28, iterations]]) input.writeUInt32LE(value, at);
  input.set(data, 32);
  let at = 32 + data.length;
  for (const array of [p.hann, p.cosine, p.sine]) for (const value of array) { input.writeDoubleLE(value, at); at += 8; }
  const context = Object.freeze({});
  contexts.set(context, Object.freeze({ n, startSample, hopSamples, frameCount, sampleRate, centerFrequency, windowSum: p.windowSum }));
  return { input, context };
}
export function decodeComplex(input, context) {
  const expected = contexts.get(context); assert.ok(expected, 'owned request context required');
  const { n, frameCount } = expected;
  assert.ok(Buffer.isBuffer(input) && input.length === 24 + frameCount * n * 16 && input.length <= maxResponse, 'response size');
  assert.equal(input.subarray(0, 8).toString('hex'), '4158485201000000', 'header');
  assert.equal(input.readUInt32LE(8), n); assert.equal(input.readUInt32LE(12), frameCount);
  const frames = []; let at = 24;
  for (let index = 0; index < frameCount; index++) {
    const real = new Float64Array(n), imaginary = new Float64Array(n);
    for (const array of [real, imaginary]) for (let k = 0; k < n; k++) {
      const value = input.readDoubleLE(at); at += 8;
      assert.ok(Number.isFinite(value) && Math.abs(value) <= 2 * n, 'bounded finite FFT result');
      array[k] = value;
    }
    frames.push({ real, imaginary });
  }
  return { elapsedNs: input.readBigUInt64LE(16), frames };
}
// Never uses native magnitude, native logs, or native peak selection. All
// observable projection arithmetic is executed by the same JS runtime as v1.
export function projectResponse(input, context) {
  const transformed = decodeComplex(input, context);
  const { n, frameCount, startSample, hopSamples, sampleRate: fs, centerFrequency: fc, windowSum } = contexts.get(context);
  const frames = transformed.frames.map(({ real, imaginary }, index) => {
    const start = startSample + index * hopSamples;
    const amplitude = [], dbRelativeToUnitAmplitude = [], displayDb = [];
    let peakIndex = 0;
    for (let k = 0; k < n; k++) {
      const rawIndex = (k + n / 2) % n;
      const value = Math.hypot(real[rawIndex], imaginary[rawIndex]) / windowSum;
      const db = value === 0 ? null : 20 * Math.log10(value);
      amplitude.push(value); dbRelativeToUnitAmplitude.push(db); displayDb.push(db === null ? -160 : Math.max(-160, db));
      if (value > amplitude[peakIndex]) peakIndex = k;
    }
    return { index, startSample: start, endSampleExclusive: start + n,
      nominalStartSeconds: start / fs, nominalCenterSeconds: (start + n / 2) / fs,
      nominalEndExclusiveSeconds: (start + n) / fs,
      amplitude, dbRelativeToUnitAmplitude, displayDb,
      peakSignedBin: amplitude[peakIndex] > 0 ? peakIndex - n / 2 : null };
  });
  return { fftSize: n, frameCount, cellCount: n * frameCount,
    windowDurationSeconds: n / fs, binSpacingHz: fs / n,
    axis: Array.from({ length: n }, (_, index) => {
      const signedBin = index - n / 2, offsetHz = signedBin * fs / n;
      return { signedBin, rawIndex: (signedBin + n) % n, offsetHz, declaredRfHz: fc + offsetHz };
    }), frames };
}
