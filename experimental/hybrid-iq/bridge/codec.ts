/** Experimental, runtime-neutral byte boundary. No Node APIs or platform imports. */
export interface Fixture {
  data: Uint8Array; sampleRate: number; centerFrequency: number;
  fftSize: number; startSample: number; hopSamples: number; frameCount: number;
}
export interface Identity { session: number; request: number }
export const MAX_REQUEST = 48 + 262144 + (3 * 4096 - 2) * 8;
export const MAX_RESPONSE = 32 + 16384 * 16;
const contexts = new WeakMap<object, Fixture & Identity & { windowSum: number }>();
const plans = new Map<number, { hann: Float64Array; cosine: Float64Array; sine: Float64Array; windowSum: number }>();
function requireValue(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(reason); }
function integer(value: number, low: number, high: number) { requireValue(Number.isSafeInteger(value) && value >= low && value <= high, 'Integer outside bridge bounds'); }
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const intrinsic = (key: PropertyKey) => Object.getOwnPropertyDescriptor(typedArrayPrototype, key)!.get!;
const typedTag = intrinsic(Symbol.toStringTag), typedLength = intrinsic('length');
const typedBuffer = intrinsic('buffer'), typedOffset = intrinsic('byteOffset');
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const bufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
function ownedBytes(value: Uint8Array, max: number): Uint8Array {
  // Never trust overrideable .length/.buffer properties or Symbol.toStringTag.
  requireValue(typedTag.call(value) === 'Uint8Array', 'Expected Uint8Array');
  const length: number = typedLength.call(value), buffer: ArrayBuffer = typedBuffer.call(value);
  requireValue(length <= max, 'Input size');
  bufferLength.call(buffer); // Intrinsic rejects SharedArrayBuffer.
  requireValue(!bufferResizable?.call(buffer), 'Resizable buffer refused');
  return new Uint8Array(new Uint8Array(buffer, typedOffset.call(value), length));
}
function plan(n: number) {
  const cached = plans.get(n); if (cached) return cached;
  const hann = new Float64Array(n), cosine = new Float64Array(n - 1), sine = new Float64Array(n - 1);
  let windowSum = 0;
  for (let k = 0; k < n; k++) { hann[k] = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / n); windowSum += hann[k]!; }
  for (let size = 2; size <= n; size *= 2) for (let j = 0; j < size / 2; j++) {
    const angle = -2 * Math.PI * j / size;
    cosine[size / 2 - 1 + j] = Math.cos(angle); sine[size / 2 - 1 + j] = Math.sin(angle);
  }
  const value = { hann, cosine, sine, windowSum }; plans.set(n, value); return value;
}
export function snapshot(input: Fixture): Fixture {
  // Capture metadata once, before any asynchronous boundary.
  const { data, sampleRate, centerFrequency, fftSize, startSample, hopSamples, frameCount } = input;
  const bytes = ownedBytes(data, 262144);
  requireValue(bytes.length >= 4 && bytes.length % 4 === 0, 'Input size');
  requireValue(Number.isFinite(sampleRate) && sampleRate >= 1 && sampleRate <= 1e9, 'Sample rate');
  requireValue(Number.isFinite(centerFrequency) && Math.abs(centerFrequency) <= 1e12, 'Center frequency');
  requireValue([256, 512, 1024, 2048, 4096].includes(fftSize), 'FFT size');
  integer(startSample, 0, 65535); integer(hopSamples, 1, 65536); integer(frameCount, 1, 64);
  requireValue(fftSize * frameCount <= 16384 && startSample + (frameCount - 1) * hopSamples + fftSize <= bytes.length / 4, 'Window geometry');
  return Object.freeze({ data: bytes, sampleRate, centerFrequency, fftSize, startSample, hopSamples, frameCount });
}
export function encode(input: Fixture, identity: Identity) {
  const fixture = snapshot(input), { session, request } = identity;
  integer(session, 1, 0xffffffff); integer(request, 1, 0xffffffff);
  const p = plan(fixture.fftSize), bytes = new Uint8Array(48 + fixture.data.length + (3 * fixture.fftSize - 2) * 8);
  const view = new DataView(bytes.buffer);
  bytes.set([65, 88, 73, 66, 1, 0, 1, 0]);
  for (const [offset, value] of [[8, session], [12, request], [16, fixture.data.length], [20, fixture.fftSize], [24, fixture.startSample], [28, fixture.hopSamples], [32, fixture.frameCount]] as const) view.setUint32(offset, value, true);
  bytes.set(fixture.data, 48); let at = 48 + fixture.data.length;
  for (const values of [p.hann, p.cosine, p.sine]) for (const value of values) { view.setFloat64(at, value, true); at += 8; }
  const context = Object.freeze({});
  contexts.set(context, { ...fixture, session, request, windowSum: p.windowSum });
  return { bytes, context };
}
export function project(response: Uint8Array, context: object) {
  const expected = contexts.get(context); requireValue(expected, 'Owned request context required');
  const { fftSize: n, frameCount, startSample, hopSamples, sampleRate: fs, centerFrequency: fc, windowSum } = expected;
  const bytes = ownedBytes(response, MAX_RESPONSE), view = new DataView(bytes.buffer);
  requireValue(bytes.length === 32 + n * frameCount * 16, 'Response size');
  requireValue([65,88,79,66,1,0,0,0].every((x,k) => bytes[k] === x), 'Response header');
  requireValue(view.getUint32(8,true) === expected.session && view.getUint32(12,true) === expected.request, 'Response identity mismatch');
  requireValue(view.getUint32(16,true) === n && view.getUint32(20,true) === frameCount && view.getUint32(24,true) === n * frameCount * 16 && view.getUint32(28,true) === 0, 'Response geometry');
  let at = 32;
  const frames = [];
  for (let index = 0; index < frameCount; index++) {
    const real = new Float64Array(n), imaginary = new Float64Array(n);
    for (const values of [real, imaginary]) for (let k = 0; k < n; k++) {
      const value = view.getFloat64(at,true); at += 8;
      requireValue(Number.isFinite(value) && Math.abs(value) <= 2 * n, 'FFT result outside bounds'); values[k] = value;
    }
    const amplitude: number[] = [], dbRelativeToUnitAmplitude: (number | null)[] = [], displayDb: number[] = [];
    let peakIndex = 0;
    for (let k = 0; k < n; k++) {
      const rawIndex = (k + n / 2) % n;
      const value = Math.hypot(real[rawIndex]!, imaginary[rawIndex]!) / windowSum;
      const db = value === 0 ? null : 20 * Math.log10(value);
      amplitude.push(value); dbRelativeToUnitAmplitude.push(db); displayDb.push(db === null ? -160 : Math.max(-160, db));
      if (value > amplitude[peakIndex]!) peakIndex = k;
    }
    const start = startSample + index * hopSamples;
    frames.push({ index, startSample: start, endSampleExclusive: start + n,
      nominalStartSeconds: start / fs, nominalCenterSeconds: (start + n / 2) / fs, nominalEndExclusiveSeconds: (start + n) / fs,
      amplitude, dbRelativeToUnitAmplitude, displayDb, peakSignedBin: amplitude[peakIndex]! > 0 ? peakIndex - n / 2 : null });
  }
  return { fftSize: n, frameCount, cellCount: n * frameCount, windowDurationSeconds: n / fs, binSpacingHz: fs / n,
    axis: Array.from({length:n}, (_,index) => { const signedBin = index - n / 2, offsetHz = signedBin * fs / n; return {signedBin, rawIndex:(signedBin+n)%n, offsetHz, declaredRfHz:fc+offsetHz}; }), frames };
}
export type Projection = ReturnType<typeof project>;
