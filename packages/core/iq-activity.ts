import { assertPreparedIq } from './iq-offline.ts';
import type { PreparedIq } from './iq-offline.ts';

export const IQ_ACTIVITY_VERSION = 'apex-iq-activity-v1';
export interface IqActivityOptions {
  startSample: number;
  windowSamples: number;
  hopSamples: number;
  frameCount: number;
  /** Unsigned decimal integers, at most 128 digits each. Denominator must be positive. */
  thresholdNumerator: string;
  thresholdDenominator: string;
}

/** Exact, unweighted raw ADC-count energy. No DC removal, FFT, or acquisition. */
export function analyzeIqActivity(recording: PreparedIq, options: IqActivityOptions) {
  assertPreparedIq(recording);
  const keys = ['startSample', 'windowSamples', 'hopSamples', 'frameCount', 'thresholdNumerator', 'thresholdDenominator'];
  if (options === null || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype ||
      Reflect.ownKeys(options).length !== keys.length ||
      keys.some(key => !Object.hasOwn(options, key) || !('value' in Object.getOwnPropertyDescriptor(options, key)!))) {
    throw new Error('Expected exactly six explicit activity options');
  }
  const { startSample: start, windowSamples: n, hopSamples: hop, frameCount: count, thresholdNumerator, thresholdDenominator } = options;
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(n) || n < 1 || n > 4096 ||
      !Number.isSafeInteger(hop) || hop < 1 || hop > 65536 || !Number.isSafeInteger(count) || count < 1 || count > 256) {
    throw new Error('Invalid activity start, window, hop or frame count');
  }
  if (count * n > 262144) throw new Error('Activity processed-cell budget exceeds 262144');
  const integerText = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{1,128}$/.test(value);
  if (!integerText(thresholdNumerator) || !integerText(thresholdDenominator) || BigInt(thresholdDenominator) === 0n) {
    throw new Error('Threshold requires bounded nonnegative integer numerator and positive integer denominator');
  }
  const numerator = BigInt(thresholdNumerator), denominator = BigInt(thresholdDenominator);
  const end = start + (count - 1) * hop + n;
  if (!Number.isSafeInteger(end) || end > recording.sampleCount) throw new Error('Requested activity windows exceed sample range');
  const bytes = recording.getDataBytes(), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const relationship = count === 1 ? 'single-window' : hop < n ? 'overlapping' : hop === n ? 'contiguous' : 'gapped';
  const frames = Array.from({ length: count }, (_, index) => {
    const frameStart = start + index * hop;
    let sum = 0n;
    for (let k = frameStart; k < frameStart + n; k++) {
      const i = BigInt(view.getInt16(k * 4, true)), q = BigInt(view.getInt16(k * 4 + 2, true));
      sum += i * i + q * q;
    }
    return {
      index, startSample: frameStart, endSampleExclusive: frameStart + n,
      nominalStartSeconds: frameStart / recording.sampleRate,
      nominalEndExclusiveSeconds: (frameStart + n) / recording.sampleRate,
      sumSquaredCounts: sum.toString(),
      meanSquaredCounts: { numerator: sum.toString(), denominator: n.toString() },
      aboveThreshold: sum * denominator > numerator * BigInt(n),
    };
  });
  type Interval = { startSample: number; endSampleExclusive: number };
  const runs: { firstFrameIndex: number; lastFrameIndex: number; frameCount: number; measuredSampleIntervals: Interval[] }[] = [];
  for (const frame of frames) {
    if (!frame.aboveThreshold) continue;
    let run = runs.at(-1);
    if (!run || run.lastFrameIndex !== frame.index - 1) {
      run = { firstFrameIndex: frame.index, lastFrameIndex: frame.index, frameCount: 0, measuredSampleIntervals: [] };
      runs.push(run);
    }
    run.lastFrameIndex = frame.index; run.frameCount++;
    const previous = run.measuredSampleIntervals.at(-1);
    if (previous && frame.startSample <= previous.endSampleExclusive) previous.endSampleExclusive = frame.endSampleExclusive;
    else run.measuredSampleIntervals.push({ startSample: frame.startSample, endSampleExclusive: frame.endSampleExclusive });
  }
  const { getDataBytes: _data, getMetadataBytes: _metadata, ...source } = recording;
  return {
    analysisVersion: IQ_ACTIVITY_VERSION, source,
    options: { startSample: start, windowSamples: n, hopSamples: hop, frameCount: count,
      thresholdNumerator: numerator.toString(), thresholdDenominator: denominator.toString() },
    limits: { maxWindowSamples: 4096, maxFrames: 256, maxProcessedCells: 262144, maxThresholdDigits: 128 },
    processedCells: count * n, windowRelationship: relationship,
    units: 'raw ADC-count-squared; exact unweighted sum(I² + Q²) and sum/windowSamples mean',
    comparison: 'strictly greater than operator threshold; equality is not above threshold; exact BigInt cross-multiplication',
    timeBasis: 'nominal sample positions / declared sample rate; half-open windows; not RF timestamps',
    runMeaning: 'consecutive selected above-threshold window indices, not physical burst boundaries; intervals are window coverage, not proof of continuous activity',
    frames, runs,
    warnings: [
      'Offline import; acquisition not verified. Source hashes cover all original bytes, not just selected windows.',
      'Raw digital counts are not volts, dBm, calibrated power or a physical noise floor.',
      'DC offsets, receiver gain, clipping and noise affect energy; no DC removal, gain correction or noise-floor inference is performed.',
      'The operator supplies the threshold; exceeding it does not establish a signal, transmitter identity or modulation.',
      'Overlapping windows reuse samples and are correlated; processed cells count repeated samples.',
      'Gaps between selected windows are unmeasured. A run never bridges gaps in its measuredSampleIntervals.',
      'Window-average threshold crossings do not establish per-sample activity, continuous activity or physical burst boundaries.',
    ],
  };
}
