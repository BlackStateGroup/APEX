import { assertPreparedIq } from './iq-offline.ts';
import type { PreparedIq } from './iq-offline.ts';

export const IQ_PHASE_INCREMENT_VERSION = 'apex-iq-phase-increment-v1';
export interface IqPhaseIncrementOptions {
  startSample: number;
  lag: number;
  step: number;
  count: number;
}

/** Individual digital phase differences, never a carrier estimate or phase unwrap.
 * Returns a fresh caller-owned report; nested source provenance remains frozen.
 * Later option/report mutations cannot change the recording or subsequent reports.
 */
export function analyzeIqPhaseIncrement(recording: PreparedIq, options: IqPhaseIncrementOptions) {
  assertPreparedIq(recording);
  const keys = ['startSample', 'lag', 'step', 'count'];
  if (options === null || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype ||
      Reflect.ownKeys(options).length !== keys.length ||
      keys.some(key => !Object.hasOwn(options, key) || !('value' in Object.getOwnPropertyDescriptor(options, key)!))) {
    throw new Error('Expected exactly four explicit phase-increment options');
  }
  const { startSample, lag, step, count } = options;
  if (!Number.isSafeInteger(startSample) || startSample < 0 || !Number.isSafeInteger(lag) || lag < 1 ||
      !Number.isSafeInteger(step) || step < 1 || !Number.isSafeInteger(count) || count < 1 || count > 512) {
    throw new Error('Invalid phase-increment start, lag, step or count');
  }
  const end = BigInt(startSample) + BigInt(count - 1) * BigInt(step) + BigInt(lag) + 1n;
  if (end > BigInt(recording.sampleCount)) throw new Error('Requested phase-increment pairs exceed sample range');
  const bytes = recording.getDataBytes(), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const aliasSpacingHz = recording.sampleRate / lag;
  const pairs = Array.from({ length: count }, (_, index) => {
    const leftSample = startSample + index * step, rightSample = leftSample + lag;
    const li = BigInt(view.getInt16(leftSample * 4, true)), lq = BigInt(view.getInt16(leftSample * 4 + 2, true));
    const ri = BigInt(view.getInt16(rightSample * 4, true)), rq = BigInt(view.getInt16(rightSample * 4 + 2, true));
    const real = ri * li + rq * lq, imaginary = rq * li - ri * lq;
    const leftEnergy = li * li + lq * lq, rightEnergy = ri * ri + rq * rq;
    // Integer zero is unsigned: choose +pi on the negative real axis, +0 on positive.
    const phase = imaginary === 0n ? (real < 0n ? Math.PI : 0) : Math.atan2(Number(imaginary), Number(real));
    const phaseAndFrequency = leftEnergy === 0n || rightEnergy === 0n
      ? { status: 'unavailable' as const, reason: 'zero-energy endpoint' as const }
      : { status: 'available' as const, principalPhaseRadians: phase,
          nominalPrincipalFrequencyOffsetHz: phase / (2 * Math.PI) * aliasSpacingHz };
    return {
      index, leftSample, rightSample, intervalStartSample: leftSample, intervalEndSample: rightSample,
      sampleSpanEndExclusive: rightSample + 1,
      nominalLeftSeconds: leftSample / recording.sampleRate, nominalRightSeconds: rightSample / recording.sampleRate,
      complexProduct: { real: real.toString(), imaginary: imaginary.toString() },
      leftEnergy: leftEnergy.toString(), rightEnergy: rightEnergy.toString(), phaseAndFrequency,
    };
  });
  const { getDataBytes: _data, getMetadataBytes: _metadata, ...source } = recording;
  return {
    analysisVersion: IQ_PHASE_INCREMENT_VERSION, source, options: { startSample, lag, step, count },
    limits: { maxPairs: 512 }, nominalIntervalSeconds: lag / recording.sampleRate, aliasSpacingHz,
    nominalPrincipalFrequencyIntervalHz: { lowerExclusive: -aliasSpacingHz / 2, upperInclusive: aliasSpacingHz / 2 },
    definition: 'right * conjugate(left); principal phase atan2(imaginary, real) in (-pi, pi], negative real axis maps to +pi, positive real axis to +0',
    frequencyDefinition: 'principal phase * declared sample rate / (2*pi*lag); aliases differ by integer multiples of declared sample rate / lag',
    pairs,
    warnings: [
      'Offline import; acquisition not verified. Hashes cover all original bytes, not only selected pairs.',
      'Digital phase-derived offsets use the declared sample rate; they are not physical or calibrated RF measurements or actual carrier frequencies.',
      'Supplier center frequency is a declaration only and is not added to the reported offsets.',
      'No phase unwrapping, automatic period selection, threshold fitting, symbol recovery, protocol/modulation detection or identity inference is performed.',
      'Pairs can overlap or reuse endpoints; geometry does not imply independent measurements. No smoothing, DC removal or noise correction is performed.',
      'Integer products and energies are exact raw-count decimal strings; phase and nominal times/frequencies are floating-point approximations. Zero-energy endpoints have unavailable phase and frequency.',
    ],
  };
}
