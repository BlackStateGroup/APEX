import { assertPreparedIq } from './iq-offline.ts';
import type { PreparedIq } from './iq-offline.ts';

export const IQ_ANALYSIS_VERSION = 'apex-iq-analysis-v1';
export interface IqAnalysisOptions { fftSize?: 256 | 512 | 1024 | 2048 | 4096; startSample?: number; }
const FFT_SIZES = [256, 512, 1024, 2048, 4096];

/** Unnormalized forward complex DFT, negative exponential. Inputs are copied.
 * Public for independent numerical testing, bounded to the supported FFT sizes.
 */
export function fftComplexForward(real: Float64Array, imaginary: Float64Array) {
  if (!(real instanceof Float64Array) || !(imaginary instanceof Float64Array)) throw new Error('Invalid complex FFT array type');
  const n = real.length;
  if (!FFT_SIZES.includes(n) || imaginary.length !== n ||
      !real.every(Number.isFinite) || !imaginary.every(Number.isFinite)) throw new Error('Invalid bounded complex FFT input');
  const re = new Float64Array(real), im = new Float64Array(imaginary);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!]; }
  }
  for (let size = 2; size <= n; size *= 2) {
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < size / 2; j++) {
        const angle = -2 * Math.PI * j / size, c = Math.cos(angle), s = Math.sin(angle);
        const a = start + j, b = a + size / 2;
        const tr = re[b]! * c - im[b]! * s, ti = re[b]! * s + im[b]! * c;
        re[b] = re[a]! - tr; im[b] = im[a]! - ti;
        re[a] = re[a]! + tr; im[a] = im[a]! + ti;
      }
    }
  }
  if (!re.every(Number.isFinite) || !im.every(Number.isFinite)) throw new Error('Complex FFT overflow');
  return { real: re, imaginary: im };
}

export function analyzeIq(recording: PreparedIq, options: IqAnalysisOptions = {}) {
  assertPreparedIq(recording);
  if (options === null || typeof options !== 'object' || Array.isArray(options) || Object.getPrototypeOf(options) !== Object.prototype ||
      Object.keys(options).some(key => key !== 'fftSize' && key !== 'startSample')) throw new Error('Invalid IQ analysis options');
  const explicit = Object.hasOwn(options, 'fftSize') || Object.hasOwn(options, 'startSample');
  const n = Object.hasOwn(options, 'fftSize') ? options.fftSize : 1024;
  const start = Object.hasOwn(options, 'startSample') ? options.startSample : 0;
  if (n === undefined || !FFT_SIZES.includes(n) || start === undefined || !Number.isSafeInteger(start) || start < 0) {
    throw new Error('Unsupported FFT window by APEX profile v1');
  }
  const bytes = recording.getDataBytes();
  const count = bytes.length / 4, fs = recording.sampleRate, fc = recording.centerFrequency;
  if (count < 1 || count > 65536 || !Number.isInteger(count) || count !== recording.sampleCount ||
      !Number.isFinite(fs) || fs < 1 || fs > 1e9 || !Number.isFinite(fc) || Math.abs(fc) > 1e12) throw new Error('Invalid prepared IQ recording');
  if (explicit && start + n > count) throw new Error('Requested FFT window exceeds sample range');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let minI = 32767, maxI = -32768, minQ = 32767, maxQ = -32768;
  let sumI = 0, sumQ = 0, power = 0, peak = 0;
  let iNegative = 0, iPositive = 0, qNegative = 0, qPositive = 0, pairs = 0;
  for (let k = 0; k < count; k++) {
    const ri = view.getInt16(k * 4, true), rq = view.getInt16(k * 4 + 2, true);
    minI = Math.min(minI, ri); maxI = Math.max(maxI, ri); minQ = Math.min(minQ, rq); maxQ = Math.max(maxQ, rq);
    const i = ri / 32768, q = rq / 32768;
    sumI += i; sumQ += q; power += i * i + q * q; peak = Math.max(peak, Math.hypot(i, q));
    if (ri === -32768) iNegative++; if (ri === 32767) iPositive++;
    if (rq === -32768) qNegative++; if (rq === 32767) qPositive++;
    if (ri === -32768 || ri === 32767 || rq === -32768 || rq === 32767) pairs++;
  }
  const meanI = sumI / count, meanQ = sumQ / count;
  let acPower = 0;
  for (let k = 0; k < count; k++) {
    const di = view.getInt16(k * 4, true) / 32768 - meanI, dq = view.getInt16(k * 4 + 2, true) / 32768 - meanQ;
    acPower += di * di + dq * dq;
  }
  const statistics = {
    sampleCount: count, nominalDurationSeconds: count / fs, lastSampleTimeSeconds: (count - 1) / fs,
    rawI: { minimum: minI, maximum: maxI }, rawQ: { minimum: minQ, maximum: maxQ },
    meanI, meanQ, dcMagnitude: Math.hypot(meanI, meanQ), peakComplexMagnitude: peak,
    rmsComplexMagnitude: Math.sqrt(power / count), acRmsComplexMagnitude: Math.sqrt(acPower / count),
    railHits: { label: 'rail hits (possible clipping)', iNegative, iPositive, qNegative, qPositive,
      complexPairCount: pairs, complexPairFraction: pairs / count },
  };
  const warnings = [
    'Offline import; acquisition not verified.',
    'Digital normalized amplitudes are not dBm, volts, calibrated power or physical noise floor.',
    'Rail hits indicate possible clipping; their absence does not prove a clean analog acquisition.',
    'Declared RF axis assumes I+jQ and supplied orientation; spectral inversion and tuning error are not verified.',
    'Largest bins are numerical features, not transmitter identities or modulation classifications.',
  ];
  const base = { analysisVersion: IQ_ANALYSIS_VERSION, options: { fftSize: n, startSample: start, explicitWindow: explicit }, statistics, warnings };
  if (start + n > count) {
    warnings.push('Insufficient samples for default FFT');
    return { ...base, spectrum: null };
  }
  return { ...base, spectrum: windowSpectrum(view, n, start, fs, fc) };
}

// Shared numerical kernel; callers validate size/range before reaching this function.
// Extracted without changing single-window arithmetic, ordering, or normalization.
function windowSpectrum(view: DataView, n: number, start: number, fs: number, fc: number) {
  const re = new Float64Array(n), im = new Float64Array(n);
  let windowSum = 0;
  for (let k = 0; k < n; k++) {
    const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / n); windowSum += w;
    re[k] = view.getInt16((start + k) * 4, true) / 32768 * w;
    im[k] = view.getInt16((start + k) * 4 + 2, true) / 32768 * w;
  }
  const transformed = fftComplexForward(re, im);
  const bins = Array.from({ length: n }, (_, k) => {
    const signedBin = k - n / 2, rawIndex = (signedBin + n) % n;
    const amplitude = Math.hypot(transformed.real[rawIndex]!, transformed.imaginary[rawIndex]!) / windowSum;
    const db = amplitude === 0 ? null : 20 * Math.log10(amplitude);
    const offsetHz = signedBin * fs / n;
    return { signedBin, rawIndex, offsetHz, declaredRfHz: fc + offsetHz, amplitude,
      dbRelativeToUnitAmplitude: db, displayDb: db === null ? -160 : Math.max(-160, db) };
  });
  let peakBin = bins[0]!;
  for (const bin of bins) if (bin.amplitude > peakBin.amplitude) peakBin = bin;
  return {
    fftSize: n, startSample: start, endSampleExclusive: start + n, window: 'periodic Hann', windowSum,
    binSpacingHz: fs / n, windowDurationSeconds: n / fs,
    normalization: 'coherent-gain-normalized complex magnitude; not PSD or bin-integrated power',
    displayFloorDb: -160, displayFloorLabel: 'display floor only; raw linear amplitude unchanged',
    peakBin: peakBin.amplitude > 0 ? peakBin : null, bins,
  };
}

export const IQ_TIME_FREQUENCY_VERSION = 'apex-iq-time-frequency-v1';
export interface IqTimeFrequencyOptions {
  fftSize: 256 | 512 | 1024 | 2048 | 4096;
  startSample: number;
  hopSamples: number;
  frameCount: number;
}

/** Bounded offline windows of the original prepared bytes. No padding or inferred options. */
export function analyzeIqTimeFrequency(recording: PreparedIq, options: IqTimeFrequencyOptions) {
  assertPreparedIq(recording);
  const keys = ['fftSize', 'startSample', 'hopSamples', 'frameCount'];
  if (options === null || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype ||
      Reflect.ownKeys(options).length !== keys.length ||
      keys.some(key => !Object.hasOwn(options, key) || !('value' in Object.getOwnPropertyDescriptor(options, key)!))) {
    throw new Error('Expected exactly four explicit time-frequency options');
  }
  const { fftSize: n, startSample: start, hopSamples: hop, frameCount: count } = options;
  if (!FFT_SIZES.includes(n) || !Number.isSafeInteger(start) || start < 0 ||
      !Number.isSafeInteger(hop) || hop < 1 || hop > 65536 ||
      !Number.isSafeInteger(count) || count < 1 || count > 64) {
    throw new Error('Invalid time-frequency window, start, hop or frame count');
  }
  if (count * n > 16384) throw new Error('Time-frequency cell budget exceeds 16384');
  const end = start + (count - 1) * hop + n;
  if (!Number.isSafeInteger(end) || end > recording.sampleCount) throw new Error('Requested time-frequency windows exceed sample range');
  const bytes = recording.getDataBytes();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fs = recording.sampleRate, fc = recording.centerFrequency;
  const frames = Array.from({ length: count }, (_, index) => {
    const frameStart = start + index * hop;
    const spectrum = windowSpectrum(view, n, frameStart, fs, fc);
    return {
      index, startSample: frameStart, endSampleExclusive: frameStart + n,
      nominalStartSeconds: frameStart / fs,
      nominalCenterSeconds: (frameStart + n / 2) / fs,
      nominalEndExclusiveSeconds: (frameStart + n) / fs,
      amplitude: spectrum.bins.map(bin => bin.amplitude),
      dbRelativeToUnitAmplitude: spectrum.bins.map(bin => bin.dbRelativeToUnitAmplitude),
      displayDb: spectrum.bins.map(bin => bin.displayDb),
      peakSignedBin: spectrum.peakBin?.signedBin ?? null,
    };
  });
  const { getDataBytes: _data, getMetadataBytes: _metadata, ...source } = recording;
  return {
    analysisVersion: IQ_TIME_FREQUENCY_VERSION, kernelVersion: IQ_ANALYSIS_VERSION,
    source,
    options: { fftSize: n, startSample: start, hopSamples: hop, frameCount: count },
    limits: { maxFrames: 64, maxCells: 16384 }, cellCount: count * n,
    window: 'periodic Hann', windowDurationSeconds: n / fs, binSpacingHz: fs / n,
    normalization: 'coherent-gain-normalized complex magnitude; not PSD or bin-integrated power',
    displayFloorDb: -160, displayFloorLabel: 'display floor only; raw linear amplitude unchanged',
    timeBasis: 'nominal sample positions / declared sample rate; center is midpoint of half-open window; not RF timestamps',
    axis: Array.from({ length: n }, (_, index) => {
      const signedBin = index - n / 2;
      const offsetHz = signedBin * fs / n;
      return { signedBin, rawIndex: (signedBin + n) % n, offsetHz, declaredRfHz: fc + offsetHz };
    }),
    frames,
    warnings: [
      'Offline import; acquisition not verified. Full source hashes cover all bytes, not only selected windows.',
      'Declared RF axis assumes I+jQ; spectral inversion, tuning and sample clock accuracy are not verified.',
      'Normalized digital amplitude and relative-unit dB are not volts, dBm, calibrated power or physical noise floor.',
      'Exact zero amplitude has null raw dB and display floor -160; an all-zero window has null peak.',
      'Overlapping frames are correlated; Hann neighbors and off-bin leakage do not establish multiple transmitters.',
      'No physical acquisition, identity, modulation recognition, fitting, smoothing or inference is performed.',
    ],
  };
}
