// Additional original cases deliberately test near-tied peak selection, not
// only tone/zero examples. All bytes are synthetic, never acquired RF data.
import { sizes, packPairs } from './proof-codec.mjs';
export function extraFixtures() {
  const result = [];
  const add = (name, pairs, n) => result.push({ name, data: packPairs(pairs), fftSize: n,
    startSample: 0, hopSamples: n, frameCount: 1, sampleRate: 8192, centerFrequency: 1000000 });
  for (const n of sizes) {
    for (const at of [1, 37, n / 2]) {
      const pairs = Array.from({ length: n }, () => [0, 0]);
      pairs[at] = [16384, -8192]; add(`impulse-${n}-${at}`, pairs, n);
    }
    let state = 0x8a7e37c1;
    const sample = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return (state >>> 16) - 32768; };
    add(`seeded-full-range-${n}`, Array.from({ length: n }, () => [sample(), sample()]), n);
  }
  return result;
}
