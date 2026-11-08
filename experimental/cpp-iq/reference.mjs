import { createHash } from 'node:crypto';
import { prepareIq } from './packages/core/iq-offline.ts';
import { analyzeIqTimeFrequency } from './packages/core/iq-analysis.ts';

export async function prepareReference(fixture) {
  const metadata = Buffer.from(JSON.stringify({ global: {
    'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': fixture.sampleRate,
  }, captures: [{ 'core:sample_start': 0, 'core:frequency': fixture.centerFrequency }], annotations: [] }));
  return prepareIq(metadata, fixture.data, { schemaVersion: 1, origin: 'synthetic-fixture', importedAt: '2026-11-08T00:00:00.000Z' }, {
    digest: async (algorithm, bytes) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(bytes).digest('hex'),
  });
}
export function referenceOptions(fixture) {
  return { fftSize: fixture.fftSize, startSample: fixture.startSample, hopSamples: fixture.hopSamples, frameCount: fixture.frameCount };
}
export function runReference(recording, fixture) { return analyzeIqTimeFrequency(recording, referenceOptions(fixture)); }

/** Quadratic DFT, intentionally independent of either radix-2 FFT implementation. */
export function directWindowDft(fixture) {
  const n = fixture.fftSize, re = [], im = [];
  let sum = 0;
  for (let j = 0; j < n; j++) {
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / n);
    sum += window;
    const at = (fixture.startSample + j) * 4;
    re.push(fixture.data.readInt16LE(at) / 32768 * window);
    im.push(fixture.data.readInt16LE(at + 2) / 32768 * window);
  }
  return Array.from({ length: n }, (_, shifted) => {
    const k = (shifted + n / 2) % n;
    let r = 0, i = 0;
    for (let j = 0; j < n; j++) {
      const angle = -2 * Math.PI * k * j / n;
      r += re[j] * Math.cos(angle) - im[j] * Math.sin(angle);
      i += re[j] * Math.sin(angle) + im[j] * Math.cos(angle);
    }
    return Math.hypot(r, i) / sum;
  });
}
