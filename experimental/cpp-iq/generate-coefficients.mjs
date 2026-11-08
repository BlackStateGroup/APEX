#!/usr/bin/env node
// Build-time mathematical constants only: no recording, device or user data.
// Freeze the exact Node/V8 binary64 Hann and twiddle values used in the APEX
// reference, so a native host libm does not redefine zero/null FFT semantics.
import { writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const values = { hann: [], cosine: [], sine: [] };
for (const n of [256, 512, 1024, 2048, 4096])
  for (let k = 0; k < n; ++k) values.hann.push(0.5 - 0.5 * Math.cos(2 * Math.PI * k / n));
for (let size = 2; size <= 4096; size *= 2)
  for (let j = 0; j < size / 2; ++j) {
    const angle = -2 * Math.PI * j / size;
    values.cosine.push(Math.cos(angle)); values.sine.push(Math.sin(angle));
  }
// C++17 hexadecimal floating constants preserve every bit, including -0.
function hex(value) {
  const b = Buffer.alloc(8); b.writeDoubleLE(value);
  const raw = b.readBigUInt64LE(), sign = raw >> 63n ? '-' : '';
  const exp = Number(raw >> 52n & 0x7ffn), mantissa = raw & 0xfffffffffffffn;
  assert.ok(exp !== 0x7ff);
  if (exp === 0 && mantissa === 0n) return `${sign}0x0p+0`;
  return `${sign}0x${exp === 0 ? '0' : '1'}.${mantissa.toString(16).padStart(13, '0')}p${exp === 0 ? -1022 : exp - 1023}`;
}
const arrays = Object.entries(values).map(([name, array]) => `inline constexpr double ${name}[] = {\n${array.map(hex).map(v => `  ${v},`).join('\n')}\n};`);
const source = `#pragma once\n// Generated mathematical constants by generate-coefficients.mjs under Node ${process.version}.\n// Not third-party DSP code. Review and regenerate intentionally when the reference changes.\nnamespace apex_iq::coefficients {\n${arrays.join('\n')}\n}\n`;
const path = new URL('./src/coefficients.hpp', import.meta.url);
if (process.argv[2] === '--check') assert.equal(readFileSync(path, 'utf8'), source, 'coefficient snapshot drift');
else { assert.equal(process.argv.length, 2); writeFileSync(path, source); }
console.log(`Verified ${values.hann.length} Hann, ${values.cosine.length} cosine and ${values.sine.length} sine coefficients.`);
