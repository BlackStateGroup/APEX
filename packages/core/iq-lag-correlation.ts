import { assertPreparedIq } from './iq-offline.ts';
import type { PreparedIq } from './iq-offline.ts';

export const IQ_LAG_CORRELATION_VERSION = 'apex-iq-lag-correlation-v1';
export interface IqLagCorrelationOptions {
  startSample: number;
  windowSamples: number;
  firstLag: number;
  lagStep: number;
  lagCount: number;
}

/** Bounded offline comparison of selected positive lags, in exact raw integer counts. */
export function analyzeIqLagCorrelation(recording: PreparedIq, options: IqLagCorrelationOptions) {
  assertPreparedIq(recording);
  const keys = ['startSample', 'windowSamples', 'firstLag', 'lagStep', 'lagCount'];
  if (options === null || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype ||
      Reflect.ownKeys(options).length !== keys.length ||
      keys.some(key => !Object.hasOwn(options, key) || !('value' in Object.getOwnPropertyDescriptor(options, key)!))) {
    throw new Error('Expected exactly five explicit lag-correlation options');
  }
  const { startSample: start, windowSamples: n, firstLag, lagStep, lagCount } = options;
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(n) || n < 1 || n > 4096 ||
      !Number.isSafeInteger(firstLag) || firstLag < 1 || !Number.isSafeInteger(lagStep) || lagStep < 1 ||
      !Number.isSafeInteger(lagCount) || lagCount < 1 || lagCount > 256) {
    throw new Error('Invalid lag-correlation start, window, first lag, step or count');
  }
  if (n * lagCount > 262144) throw new Error('Lag-correlation compared-cell budget exceeds 262144');
  // Calculate the extent exactly before any floating-point multiplication/addition.
  const lastLag = BigInt(firstLag) + BigInt(lagCount - 1) * BigInt(lagStep);
  const end = BigInt(start) + lastLag + BigInt(n);
  if (end > BigInt(recording.sampleCount)) {
    throw new Error('Requested lag-correlation windows exceed sample range');
  }
  const bytes = recording.getDataBytes(), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lags = Array.from({ length: lagCount }, (_, index) => {
    const lag = firstLag + index * lagStep;
    let re = 0n, im = 0n, leftEnergy = 0n, rightEnergy = 0n;
    for (let k = 0; k < n; k++) {
      const a = (start + k) * 4, b = (start + lag + k) * 4;
      const li = BigInt(view.getInt16(a, true)), lq = BigInt(view.getInt16(a + 2, true));
      const ri = BigInt(view.getInt16(b, true)), rq = BigInt(view.getInt16(b + 2, true));
      re += ri * li + rq * lq;
      im += rq * li - ri * lq;
      leftEnergy += li * li + lq * lq;
      rightEnergy += ri * ri + rq * rq;
    }
    const numerator = (re * re + im * im).toString(), denominator = (leftEnergy * rightEnergy).toString();
    const normalizedSquaredMagnitude = denominator === '0'
      ? { status: 'unavailable' as const, reason: 'zero-energy denominator' as const, numerator, denominator }
      : { status: 'available' as const, numerator, denominator };
    return {
      index, lagSamples: lag, nominalLagSeconds: lag / recording.sampleRate,
      leftStartSample: start, leftEndSampleExclusive: start + n,
      rightStartSample: start + lag, rightEndSampleExclusive: start + lag + n,
      overlappingSampleCount: Math.max(0, n - lag),
      complexSum: { real: re.toString(), imaginary: im.toString() },
      leftEnergy: leftEnergy.toString(), rightEnergy: rightEnergy.toString(), normalizedSquaredMagnitude,
    };
  });
  const { getDataBytes: _data, getMetadataBytes: _metadata, ...source } = recording;
  return {
    analysisVersion: IQ_LAG_CORRELATION_VERSION, source,
    options: { startSample: start, windowSamples: n, firstLag, lagStep, lagCount },
    limits: { maxWindowSamples: 4096, maxLags: 256, maxComparedCells: 262144 },
    comparedCells: n * lagCount,
    definition: 'sum right * conjugate(left); normalized squared magnitude = (real² + imaginary²) / (leftEnergy * rightEnergy); exact unreduced integer rational',
    timeBasis: 'nominal lag samples / declared sample rate; not RF timestamps',
    lags,
    warnings: [
      'Offline import; acquisition not verified. Source hashes cover all original bytes, not only compared samples.',
      'DC offsets and constant tones can correlate at all lags; correlation does not establish a repetition period.',
      'Overlapping samples are correlated; comparisons also reuse the same left window. Overlap count describes geometry only, not independent trials.',
      'Selected lags are not exhaustive. No best period, transmitter, modulation, protocol or unlock is inferred.',
      'No DC removal, tapering or noise-floor estimate is performed.',
      'Raw digital counts are not volts, dBm or calibrated power.',
      'All windows must fit without padding or truncation; zero-energy normalization is explicitly unavailable.',
    ],
  };
}
