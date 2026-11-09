/** Independent integer/Buffer oracle. Run from any directory with Node 24. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fitBleLearn } from '../../../packages/core/ble-learn.ts';
import { prepareBlePlxSourceEvidenceInput } from '../../../packages/core/ble-plx-source-evidence.ts';

const reviewedCoreSha256 = '215056766a5d7751b70792cde120c5af167fc1c408845c0b626ed895e213b8ec';
const coreSha256 = createHash('sha256')
  .update(readFileSync(new URL('../../../packages/core/ble-learn.ts', import.meta.url)))
  .digest('hex');
console.log(`Node: ${process.version}`);
console.log(`Core SHA-256: ${coreSha256}`);
console.log(`Matches originally reviewed core: ${coreSha256 === reviewedCoreSha256}`);

// Each payload has complete BTHome fields of widths 1, 2, 3, and 4. Values
// deliberately cover zero, unsigned maxima, sign thresholds, and endian flips.
const values = [
  0, 0xffffffff, 0x80000000, 0x7fffffff, 0x01020304, 0x12345678,
  0x00008000, 0x800000, 0x80, 0xff, 0xffff, 0xffffff,
];
const packets = values.map(value => {
  const bytes = Buffer.from([0x40, 1, 0, 2, 0, 0, 4, 0, 0, 0, 0x3e, 0, 0, 0, 0]);
  bytes.writeUInt8(value % 256, 2);
  bytes.writeUInt16LE(value % 65536, 4);
  bytes.writeUIntLE(value % 16777216, 7, 3);
  bytes.writeUInt32LE(value, 11);
  return bytes;
});
const dataset = {
  schemaVersion: 1,
  scope: 'owned-lab',
  serviceUuid: 'FCD2',
  groups: [{ id: 'a', condition: 'first' }, { id: 'b', condition: 'others' }],
  sources: [{ id: 'source', platform: 'android', snapshotId: 'source', origin: 'synthetic-fixture' }],
  trials: packets.map((payload, index) => ({
    id: `trial-${index}`,
    groupId: index ? 'b' : 'a',
    sourceId: 'source',
    receiptId: `receipt-${index}`,
    document: prepareBlePlxSourceEvidenceInput('android', {
      id: 'source',
      rawScanRecord: Buffer.concat([
        Buffer.from([payload.length + 3, 0x16, 0xd2, 0xfc]), payload,
      ]).toString('base64'),
      serviceData: { FCD2: payload.toString('base64') },
    }, {
      origin: 'synthetic-fixture',
      label: 'Independent edge oracle',
      capturedAt: null,
    }).payload.document,
  })),
};
const document = JSON.stringify({
  schemaVersion: 1,
  kind: 'apex-learn-synthetic-discovery',
  dataset: JSON.stringify(dataset),
  // Extreme references are intentional. Inspect all candidate evaluations,
  // including rejected candidates, without relying on the winning candidate.
  measurements: packets.map((_, index) => ({
    trialId: `trial-${index}`,
    readingMilliUnits: index % 2 ? 1_000_000_000 : -1_000_000_000 + index,
  })),
  toleranceMilliUnits: 1_000_000,
  search: {
    byteOffsets: [2, 4, 7, 11],
    widths: [1, 2, 3, 4],
    divisors: [1, 3, 100, 1_000_000],
  },
});
const fit = fitBleLearn(document);
assert.equal(fit.searchSize, 56);
assert.equal(fit.evaluations.length, 56);
let comparisons = 0;
for (const evaluation of fit.evaluations) {
  const candidate = evaluation.candidate;
  evaluation.rows.forEach((row, index) => {
    // Native Buffer decoding is independent of Learn's BigInt byte-string
    // decoder. The same source parser is used only to construct admissible input.
    const method = `read${candidate.signed ? 'Int' : 'UInt'}${candidate.byteOrder === 'little' ? 'LE' : 'BE'}`;
    const expectedRaw = BigInt(packets[index][method](candidate.byteOffset, candidate.width));
    const divisor = BigInt(candidate.divisor);
    assert.equal(
      BigInt(row.value.numerator) * divisor,
      expectedRaw * BigInt(row.value.denominator),
      `Prediction: ${candidate.id}, row ${index}`,
    );
    const residualNumerator = expectedRaw * 1000n - BigInt(row.readingMilliUnits) * divisor;
    assert.equal(
      BigInt(row.residual.numerator) * divisor * 1000n,
      residualNumerator * BigInt(row.residual.denominator),
      `Residual: ${candidate.id}, row ${index}`,
    );
    const absoluteResidual = residualNumerator < 0n ? -residualNumerator : residualNumerator;
    assert.equal(
      row.withinTolerance,
      absoluteResidual <= BigInt(fit.toleranceMilliUnits) * divisor,
      `Tolerance: ${candidate.id}, row ${index}`,
    );
    assert.ok(Number.isFinite(row.value.approximate));
    assert.ok(Number.isFinite(row.residual.approximate));
    comparisons++;
  });
}
assert.equal(comparisons, 672);
console.log(`PASS: ${comparisons} independent Buffer predictions and exact residual/tolerance checks across ${fit.searchSize} candidates.`);
console.log('Covered widths 1/2/3/4, signed/unsigned, both byte orders where applicable, zero/extrema, divisors 1/3/100/1000000.');
console.log('This is a deterministic numeric regression check, not an independent physical or general-accuracy benchmark.');
