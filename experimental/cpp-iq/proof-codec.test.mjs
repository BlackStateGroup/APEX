import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeRequest, decodeResponse, compareNumerics, fixtures, maxResponse } from './proof-codec.mjs';
import { prepareReference, runReference, directWindowDft } from './reference.mjs';

// Test-only response writer from the actual TypeScript report. It tests the
// harness codec and assertions, NEVER executes Rust or establishes Rust parity.
function syntheticResponse(reference) {
  const n = reference.options.fftSize;
  const bytes = Buffer.alloc(40 + reference.frames.length * (24 + n * 56));
  bytes.write('AXIR'); bytes.writeUInt16LE(1, 4);
  bytes.writeUInt32LE(n, 8); bytes.writeUInt32LE(reference.frames.length, 12);
  bytes.writeBigUInt64LE(123n, 16); bytes.writeDoubleLE(reference.binSpacingHz, 24); bytes.writeDoubleLE(reference.windowDurationSeconds, 32);
  let at = 40;
  for (const frame of reference.frames) {
    bytes.writeUInt32LE(frame.startSample, at); bytes.writeUInt32LE(frame.endSampleExclusive, at + 4);
    bytes.writeInt32LE(frame.peakSignedBin === null ? -1 : frame.peakSignedBin + n / 2, at + 8);
    let windowSum = 0;
    for (let j = 0; j < n; j++) windowSum += 0.5 - 0.5 * Math.cos(2 * Math.PI * j / n);
    bytes.writeDoubleLE(windowSum, at + 16); at += 24;
    for (let k = 0; k < n; k++, at += 56) {
      const axis = reference.axis[k];
      bytes.writeInt32LE(axis.signedBin, at); bytes.writeUInt32LE(axis.rawIndex, at + 4);
      bytes.writeDoubleLE(axis.offsetHz, at + 8); bytes.writeDoubleLE(axis.declaredRfHz, at + 16);
      bytes.writeDoubleLE(frame.amplitude[k], at + 24);
      bytes[at + 32] = frame.dbRelativeToUnitAmplitude[k] === null ? 0 : 1;
      bytes.writeDoubleLE(frame.dbRelativeToUnitAmplitude[k] ?? 0, at + 40);
      bytes.writeDoubleLE(frame.displayDb[k], at + 48);
    }
  }
  return bytes;
}

test('request codec has explicit endian layout, exact lengths and an owned byte copy', () => {
  const fixture = fixtures()[0], original = Buffer.from(fixture.data), bytes = encodeRequest(fixture, 7);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '4158495101000100');
  for (const [at, expected] of [[8, 1024], [12, 256], [16, 0], [20, 256], [24, 1], [28, 7]]) assert.equal(bytes.readUInt32LE(at), expected);
  assert.equal(bytes.readDoubleLE(32), 8192); assert.equal(bytes.readDoubleLE(40), 1000000);
  assert.equal(bytes.length, 48 + fixture.data.length);
  fixture.data.fill(1); assert.deepEqual(bytes.subarray(48), original);
});

test('request codec refuses invalid input rather than coercion, padding or fallback', () => {
  const fixture = fixtures()[0];
  const invalid = [
    { data: [] }, { data: Buffer.alloc(0) }, { data: Buffer.alloc(3) }, { data: Buffer.alloc(262148) },
    { sampleRate: 0 }, { sampleRate: Infinity }, { sampleRate: NaN }, { centerFrequency: 1e12 + 1 },
    { fftSize: 128 }, { fftSize: '256' }, { startSample: 0.5 }, { startSample: -1 }, { startSample: 1 },
    { hopSamples: 0 }, { hopSamples: 65537 }, { frameCount: 0 }, { frameCount: 65 }, { frameCount: 2 },
  ];
  for (const change of invalid) assert.throws(() => encodeRequest({ ...fixture, ...change }));
  for (const iterations of [0, -1, 1.5, 1001, Infinity]) assert.throws(() => encodeRequest(fixture, iterations));
});

test('all synthetic TS cases roundtrip through test-only response writer and strict decoder', async () => {
  const cases = fixtures(); assert.equal(cases.length, 41);
  for (const fixture of cases) {
    const ref = runReference(await prepareReference(fixture), fixture);
    const encoded = syntheticResponse(ref); assert.ok(encoded.length <= maxResponse);
    const decoded = decodeResponse(encoded);
    assert.equal(decoded.elapsedNs, 123n);
    assert.deepEqual(compareNumerics(decoded, ref), { lowAmplitudeDbDifferences: 0 });
  }
});

test('response codec rejects structural, nonfinite, dB, peak and reserved-byte mutations', async () => {
  const fixture = fixtures()[0], ref = runReference(await prepareReference(fixture), fixture), valid = syntheticResponse(ref);
  for (const end of [...Array(40).keys(), valid.length - 1]) assert.throws(() => decodeResponse(valid.subarray(0, end)));
  assert.throws(() => decodeResponse(Buffer.concat([valid, Buffer.from([0])])));
  assert.throws(() => decodeResponse(Buffer.alloc(maxResponse + 1)));
  const mutate = operation => { const bytes = Buffer.from(valid); operation(bytes); assert.throws(() => decodeResponse(bytes)); };
  for (const at of [0, 4, 5, 6, 7, 52, 64 + 33]) mutate(bytes => { bytes[at] ^= 2; });
  mutate(bytes => bytes.writeUInt32LE(128, 8)); mutate(bytes => bytes.writeUInt32LE(0, 12));
  mutate(bytes => bytes.writeUInt32LE(65536, 40)); mutate(bytes => bytes.writeInt32LE(0, 48));
  for (const at of [24, 32, 56, 64 + 8, 64 + 16, 64 + 24, 64 + 40, 64 + 48]) mutate(bytes => bytes.writeDoubleLE(NaN, at));
  mutate(bytes => bytes.writeDoubleLE(-1, 64 + 24)); mutate(bytes => { bytes[64 + 32] = 1; });
  mutate(bytes => bytes.writeDoubleLE(-159, 64 + 48));
  mutate(bytes => bytes.writeInt32LE(0, 64)); mutate(bytes => bytes.writeUInt32LE(0, 64 + 4));
});

test('comparison rejects peak, amplitude, zero/null and geometry disagreements', async () => {
  const fixture = fixtures().find(f => f.name === 'quarter-1-256');
  const ref = runReference(await prepareReference(fixture), fixture);
  const good = decodeResponse(syntheticResponse(ref));
  for (const operation of [
    native => { native.frames[0].peakIndex = 0; },
    native => { native.frames[0].bins[192].amplitude += 0.1; },
    native => { native.frames[0].bins[192].dbRelativeToUnitAmplitude = null; },
    native => { native.frames[0].startSample = 1; },
    native => { native.frames[0].bins[0].signedBin = 0; },
  ]) { const changed = structuredClone(good); operation(changed); assert.throws(() => compareNumerics(changed, ref)); }
});

test('independent quadratic DFT agrees with reference mixed, off-bin, rail and impulse cases', async () => {
  const chosen = fixtures().filter(f => ['integer-mix-256', 'off-bin-two-tone', 'endian-rails'].includes(f.name));
  const impulse = { ...fixtures()[0], name: 'impulse-37', data: Buffer.alloc(1024) };
  impulse.data.writeInt16LE(16384, 37 * 4); impulse.data.writeInt16LE(-8192, 37 * 4 + 2); chosen.push(impulse);
  for (const fixture of chosen) {
    const reference = runReference(await prepareReference(fixture), fixture), dft = directWindowDft(fixture);
    for (let k = 0; k < 256; k++) assert.ok(Math.abs(reference.frames[0].amplitude[k] - dft[k]) <= 1e-9 * (1 + Math.abs(dft[k])));
  }
});

test('independently known quarter-cycle and zero fixture hashes and peaks stay exact', async () => {
  const expected = {
    'zero-256': ['5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef', null],
    'quarter-1-256': ['fad75c6c2877cf3970eae5004f7d6f38680fe00f2788b2b677fb918a3056eb2d', 64],
    'quarter--1-256': ['8495409a722b372dd13ea66e992e144f5761878d51df7b6bf66d5e8a67bbd883', -64],
  };
  for (const fixture of fixtures().filter(f => Object.hasOwn(expected, f.name))) {
    const [hash, peak] = expected[fixture.name];
    assert.equal(createHash('sha256').update(fixture.data).digest('hex'), hash);
    const ref = runReference(await prepareReference(fixture), fixture);
    assert.equal(ref.frames[0].peakSignedBin, peak);
    if (peak !== null) assert.ok(Math.abs(ref.frames[0].amplitude[peak + 128] - 0.5) <= 1e-12);
  }
});
