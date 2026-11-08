import assert from 'node:assert/strict';

export const sizes = [256, 512, 1024, 2048, 4096];
export const requestHeader = 48;
export const maxData = 262144;
export const maxResponse = 40 + 64 * 24 + 16384 * 56;

function integer(value, minimum, maximum) {
  assert.ok(Number.isSafeInteger(value) && value >= minimum && value <= maximum, 'integer bound');
}
export function encodeRequest({ data, sampleRate, centerFrequency, fftSize, startSample, hopSamples, frameCount }, iterations = 1) {
  assert.ok(data instanceof Uint8Array && data.length >= 4 && data.length <= maxData && data.length % 4 === 0, 'data bound');
  assert.ok(Number.isFinite(sampleRate) && sampleRate >= 1 && sampleRate <= 1e9, 'sample-rate bound');
  assert.ok(Number.isFinite(centerFrequency) && Math.abs(centerFrequency) <= 1e12, 'center-frequency bound');
  assert.ok(sizes.includes(fftSize), 'FFT size');
  integer(startSample, 0, 65535); integer(hopSamples, 1, 65536); integer(frameCount, 1, 64);
  integer(iterations, 1, 1000);
  assert.ok(fftSize * frameCount <= 16384 && startSample + (frameCount - 1) * hopSamples + fftSize <= data.length / 4, 'window bounds');
  const bytes = Buffer.alloc(requestHeader + data.length);
  bytes.write('AXIQ', 0, 'ascii'); bytes.writeUInt16LE(1, 4); bytes.writeUInt16LE(1, 6);
  for (const [offset, value] of [[8, data.length], [12, fftSize], [16, startSample], [20, hopSamples], [24, frameCount], [28, iterations]]) bytes.writeUInt32LE(value, offset);
  bytes.writeDoubleLE(sampleRate, 32); bytes.writeDoubleLE(centerFrequency, 40);
  bytes.set(data, requestHeader);
  return bytes;
}

/** Strict test-harness decoder, not an app bridge or a trusted-evidence parser. */
export function decodeResponse(input) {
  assert.ok(Buffer.isBuffer(input) && input.length >= 40 && input.length <= maxResponse, 'response bound');
  assert.equal(input.subarray(0, 4).toString('ascii'), 'AXIR');
  assert.equal(input.readUInt16LE(4), 1); assert.equal(input.readUInt16LE(6), 0);
  const fftSize = input.readUInt32LE(8), frameCount = input.readUInt32LE(12);
  assert.ok(sizes.includes(fftSize)); integer(frameCount, 1, 64);
  assert.ok(fftSize * frameCount <= 16384);
  assert.equal(input.length, 40 + frameCount * (24 + fftSize * 56));
  const elapsedNs = input.readBigUInt64LE(16);
  function finite(offset) { const value = input.readDoubleLE(offset); assert.ok(Number.isFinite(value), 'finite result'); return value; }
  const binSpacingHz = finite(24), windowDurationSeconds = finite(32), frames = [];
  assert.ok(binSpacingHz > 0 && windowDurationSeconds > 0);
  let offset = 40;
  for (let index = 0; index < frameCount; index++) {
    const startSample = input.readUInt32LE(offset), endSampleExclusive = input.readUInt32LE(offset + 4);
    const peakIndex = input.readInt32LE(offset + 8);
    integer(startSample, 0, 65535); assert.equal(endSampleExclusive, startSample + fftSize); assert.ok(endSampleExclusive <= 65536);
    integer(peakIndex, -1, fftSize - 1); assert.equal(input.readUInt32LE(offset + 12), 0);
    const windowSum = finite(offset + 16); assert.ok(windowSum > 0);
    offset += 24;
    const bins = [];
    let expectedPeak = -1, peakAmplitude = 0;
    for (let k = 0; k < fftSize; k++, offset += 56) {
      const signedBin = input.readInt32LE(offset), rawIndex = input.readUInt32LE(offset + 4);
      assert.equal(signedBin, k - fftSize / 2); assert.equal(rawIndex, (k + fftSize / 2) % fftSize);
      const offsetHz = finite(offset + 8), declaredRfHz = finite(offset + 16), amplitude = finite(offset + 24);
      assert.ok(amplitude >= 0);
      const hasDb = input.readUInt8(offset + 32); assert.ok(hasDb === 0 || hasDb === 1);
      for (let j = 33; j < 40; j++) assert.equal(input[offset + j], 0);
      const rawDb = finite(offset + 40), displayDb = finite(offset + 48);
      assert.equal(hasDb === 0, amplitude === 0);
      if (!hasDb) { assert.equal(rawDb, 0); assert.equal(displayDb, -160); }
      else {
        assert.ok(Math.abs(rawDb - 20 * Math.log10(amplitude)) <= 1e-10, 'dB matches its amplitude');
        assert.ok(Math.abs(displayDb - Math.max(-160, rawDb)) <= 1e-10, 'display clamp');
      }
      if (amplitude > peakAmplitude) { peakAmplitude = amplitude; expectedPeak = k; }
      bins.push({ signedBin, rawIndex, offsetHz, declaredRfHz, amplitude, dbRelativeToUnitAmplitude: hasDb ? rawDb : null, displayDb });
    }
    assert.equal(peakIndex, expectedPeak, 'first strict maximum / all-zero peak');
    frames.push({ startSample, endSampleExclusive, peakIndex: peakIndex === -1 ? null : peakIndex, windowSum, bins });
  }
  return { fftSize, frameCount, elapsedNs, binSpacingHz, windowDurationSeconds, frames };
}

export function packPairs(pairs) {
  const bytes = Buffer.alloc(pairs.length * 4);
  pairs.forEach(([i, q], k) => { integer(i, -32768, 32767); integer(q, -32768, 32767); bytes.writeInt16LE(i, k * 4); bytes.writeInt16LE(q, k * 4 + 2); });
  return bytes;
}

// All cases are independently generated digital examples, never RF recordings.
export function fixtures() {
  const cases = [];
  function add(name, pairs, fftSize, overrides = {}) {
    cases.push({ name, data: packPairs(pairs), fftSize, startSample: 0, hopSamples: fftSize, frameCount: 1,
      sampleRate: 8192, centerFrequency: 1000000, ...overrides });
  }
  const quarter = [[16384, 0], [0, 16384], [-16384, 0], [0, -16384]];
  for (const n of sizes) {
    add(`zero-${n}`, Array.from({ length: n }, () => [0, 0]), n);
    add(`dc-${n}`, Array.from({ length: n }, () => [8192, -4096]), n);
    for (const sign of [-1, 1]) add(`quarter-${sign}-${n}`, Array.from({ length: n }, (_, k) => [quarter[k % 4][0], quarter[k % 4][1] * sign]), n);
    add(`nyquist-${n}`, Array.from({ length: n }, (_, k) => [k % 2 ? -16384 : 16384, 0]), n);
    add(`integer-mix-${n}`, Array.from({ length: n }, (_, k) => [(k * 137 % 65536) - 32768, (k * 163 % 65536) - 32768]), n);
    const endpoint = Array.from({ length: n }, () => [0, 0]); endpoint[0] = [32767, -32768]; add(`hann-zero-${n}`, endpoint, n);
    // A nonzero-location impulse has mathematically equal spectral magnitudes.
    // Finite-precision hypot/libm can select different strict maxima; these
    // cases must expose that difference rather than allowing a silent waiver.
    for (const position of [1, 37, n / 2]) {
      const impulse = Array.from({ length: n }, () => [0, 0]);
      impulse[position] = [16384, -8192];
      add(`impulse-${n}-${position}`, impulse, n);
    }
  }
  const mixed = Array.from({ length: 65536 }, (_, k) => [(k * 137 % 65536) - 32768, (k * 163 % 65536) - 32768]);
  for (const [fftSize, frameCount, hopSamples, startSample] of [[256, 64, 1, 0], [256, 64, 1024, 0], [4096, 4, 4096, 37], [256, 1, 65536, 65280]]) {
    add(`selection-${fftSize}-${frameCount}-${hopSamples}-${startSample}`, mixed, fftSize, { frameCount, hopSamples, startSample });
  }
  add('endian-rails', Array.from({ length: 256 }, (_, k) => [[1, -2], [32767, -32768], [-32768, 32767]][k % 3]), 256, { sampleRate: 1, centerFrequency: -1e12 });
  add('off-bin-two-tone', Array.from({ length: 256 }, (_, k) => [
    Math.round(8192 * Math.cos(2 * Math.PI * 16.5 * k / 256) + 4096 * Math.cos(-2 * Math.PI * 37 * k / 256)),
    Math.round(8192 * Math.sin(2 * Math.PI * 16.5 * k / 256) + 4096 * Math.sin(-2 * Math.PI * 37 * k / 256)),
  ]), 256, { sampleRate: 1e9, centerFrequency: 1e12 });
  return cases;
}

export function compareNumerics(native, reference) {
  const near = (actual, expected, label, tolerance = 1e-12) => {
    assert.ok(Math.abs(actual - expected) <= tolerance * (1 + Math.abs(expected)), `${label}: ${actual} != ${expected}`);
  };
  assert.equal(native.fftSize, reference.options.fftSize);
  assert.equal(native.frameCount, reference.frames.length);
  near(native.binSpacingHz, reference.binSpacingHz, 'spacing'); near(native.windowDurationSeconds, reference.windowDurationSeconds, 'duration');
  let lowAmplitudeDbDifferences = 0;
  for (const [index, frame] of native.frames.entries()) {
    const expected = reference.frames[index];
    assert.equal(frame.startSample, expected.startSample); assert.equal(frame.endSampleExclusive, expected.endSampleExclusive);
    near(frame.windowSum, native.fftSize / 2, 'Hann sum');
    // A peak disagreement fails even for near-tied bins. Do not silently relax
    // visible selection semantics merely to make a numerical comparison pass.
    assert.equal(frame.peakIndex === null ? null : frame.bins[frame.peakIndex].signedBin, expected.peakSignedBin, 'peak selection');
    for (const [k, bin] of frame.bins.entries()) {
      const axis = reference.axis[k];
      assert.equal(bin.signedBin, axis.signedBin); assert.equal(bin.rawIndex, axis.rawIndex);
      near(bin.offsetHz, axis.offsetHz, 'offset'); near(bin.declaredRfHz, axis.declaredRfHz, 'declared RF');
      near(bin.amplitude, expected.amplitude[k], 'amplitude');
      assert.equal(bin.dbRelativeToUnitAmplitude === null, expected.dbRelativeToUnitAmplitude[k] === null, 'exact-zero/null dB classification');
      near(bin.displayDb, expected.displayDb[k], 'display dB', 1e-8);
      if (bin.dbRelativeToUnitAmplitude !== null) {
        if (Math.max(bin.amplitude, expected.amplitude[k]) >= 1e-10) near(bin.dbRelativeToUnitAmplitude, expected.dbRelativeToUnitAmplitude[k], 'raw dB', 1e-6);
        else if (Math.abs(bin.dbRelativeToUnitAmplitude - expected.dbRelativeToUnitAmplitude[k]) > 1e-6) lowAmplitudeDbDifferences++;
      }
    }
  }
  return { lowAmplitudeDbDifferences };
}
