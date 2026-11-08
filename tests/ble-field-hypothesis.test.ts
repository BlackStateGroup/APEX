import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateBleFieldHypothesis, MAX_FIELD_HYPOTHESIS_CHARACTERS } from '../packages/core/ble-field-hypothesis.ts';
import { prepareBlePlxSourceEvidenceInput } from '../packages/core/ble-plx-source-evidence.ts';
const fixture = readFileSync(new URL('./fixtures/ble-field-hypothesis.json', import.meta.url), 'utf8');
function altered(change: (input: any) => void) { const input = JSON.parse(fixture); change(input); return JSON.stringify(input); }
function datasetChange(input: any, change: (data: any) => void) { const data = JSON.parse(input.dataset); change(data); input.dataset = JSON.stringify(data); }
function payloads(input: any, hex: string, uuid = 'FCD2') {
  datasetChange(input, data => {
    data.serviceUuid = uuid;
    for (const trial of data.trials) {
      const raw = Buffer.from(`${(hex.length / 2 + 3).toString(16).padStart(2, '0')}16${uuid.slice(2)}${uuid.slice(0, 2)}${hex}`, 'hex').toString('base64');
      trial.document = prepareBlePlxSourceEvidenceInput(trial.sourceId, { id: trial.sourceId, rawScanRecord: raw, serviceData: { [uuid]: Buffer.from(hex, 'hex').toString('base64') } }, { origin: 'synthetic-fixture', label: 'Synthetic candidate tests', capturedAt: null }).payload.document;
    }
  });
}
function single(hex: string, expected: string, candidate: object = {}, tolerance = '0') {
  return validateBleFieldHypothesis(altered(input => {
    payloads(input, hex); Object.assign(input.candidate, candidate); input.tolerance = tolerance;
    for (const row of input.assignments) row.expected = expected;
  }));
}
test('golden synthetic fixture retains exact inputs and independently matches 2000/100 and 1844/100', () => {
  const result = validateBleFieldHypothesis(fixture);
  assert.deepEqual(result, validateBleFieldHypothesis(fixture));
  assert.equal(result.document, fixture); assert.equal(result.datasetDocument, JSON.parse(fixture).dataset);
  assert.equal(result.results.length, 8); assert.equal(result.sources.length, 2);
  assert.ok(result.results.every(row => row.withinTolerance && row.eligibility.includes('unencrypted') && row.caveat.includes('blinding')));
  assert.deepEqual(result.results[0]!.value, { numerator: '20', denominator: '1', approximate: 20 });
  assert.deepEqual(result.results[2]!.value, { numerator: '461', denominator: '25', approximate: 18.44 });
  assert.equal(result.results[0]!.receiptId, 'synthetic-android-baseline-1');
  assert.equal(result.dataset.trials[4]!.adOffset, null);
});
test('all integer widths, byte orders and signed extrema use exact independent golden integers', () => {
  const vectors = [
    ['4057ff', 1, true, '-1'], ['4009ff', 1, false, '255'],
    ['40020080', 2, true, '-32768'], ['4003ffff', 2, false, '65535'],
    ['400affffff', 3, false, '16777215'], ['400a000080', 3, true, '-8388608'],
    ['405b00000080', 4, true, '-2147483648'], ['403effffffff', 4, false, '4294967295'],
    ['405bffffff7f', 4, true, '2147483647'],
  ] as const;
  for (const [hex, width, signed, expected] of vectors) {
    const result = single(hex, expected, { width, signed, divisor: 1 });
    assert.equal(result.results[0]!.rawInteger, expected); assert.ok(result.results.every(row => row.withinTolerance));
  }
  const big = single('403e01020304', '16909060', { width: 4, signed: false, divisor: 1, byteOrder: 'big' });
  assert.equal(big.results[0]!.rawInteger, '16909060');
  assert.ok(big.results.every(row => row.withinTolerance));
});
test('rational residuals, decimal negatives and inclusive tolerance never use floating comparison', () => {
  const boundary = single('400901', '0.3', { width: 1, signed: false, divisor: 10, valueOffset: 0 }, '0.2');
  assert.equal(boundary.results[0]!.withinTolerance, true);
  assert.deepEqual(boundary.results[0]!.residual, { numerator: '-1', denominator: '5', approximate: -0.2 });
  assert.equal(single('400901', '0.3', { width: 1, divisor: 10 }, '0.199999999').results[0]!.withinTolerance, false);
  const third = single('400901', '-0.666666667', { width: 1, divisor: 3, valueOffset: -1 }, '0.000000001');
  assert.deepEqual(third.results[0]!.residual, { numerator: '1', denominator: '3000000000', approximate: 1 / 3000000000 });
  assert.equal(third.results[0]!.withinTolerance, true);
  assert.doesNotThrow(() => JSON.stringify(third));
});
test('designated held-out changes do not affect discovery, sources remain separate, unselected explicit', () => {
  const baseline = validateBleFieldHypothesis(fixture);
  const changed = validateBleFieldHypothesis(altered(input => { input.assignments[1].expected = '999'; }));
  assert.deepEqual(changed.sources[0]!.subsets[0], baseline.sources[0]!.subsets[0]);
  assert.deepEqual(changed.sources[1], baseline.sources[1]);
  assert.equal(changed.sources[0]!.subsets[1]!.allWithinTolerance, false);
  assert.deepEqual(changed.candidate, baseline.candidate);
  const selected = validateBleFieldHypothesis(altered(input => { input.assignments.splice(2, 2); }));
  assert.equal(selected.unselectedTrialIds.length, 2); assert.equal(selected.results.length, 6);
});
test('missing candidate bytes are incomplete while malformed format truncation rejects', () => {
  for (const byteOffset of [3, 1649]) {
    const result = validateBleFieldHypothesis(altered(input => { input.candidate.byteOffset = byteOffset; }));
    assert.ok(result.results.every(row => row.status === 'incomplete' && row.withinTolerance === null && row.rawInteger === null));
    assert.ok(result.sources.every(source => source.subsets.every(subset => !subset.allWithinTolerance)));
  }
  assert.throws(() => single('4002d0', '0'), /Ineligible/);
  assert.equal(single('4002d007', '20').results[0]!.withinTolerance, true);
});
test('eligibility rejects encrypted, unknown, partial, identity and unsupported public formats', () => {
  for (const hex of ['4102d007', '0102d007', 'ff02d007', '0002d007', '4202d007', '4002d007ff', '', '40']) assert.throws(() => single(hex, '20'), /Ineligible/);
  for (const hex of ['2001' + '00'.repeat(16), '30' + '00'.repeat(9), '00ec' + '00'.repeat(18), '10ec0061', 'ff', '2000']) {
    assert.throws(() => validateBleFieldHypothesis(altered(input => { payloads(input, hex, 'FEAA'); })), /Ineligible/);
  }
  const tlm = validateBleFieldHypothesis(altered(input => {
    payloads(input, '20000bb819800000000100000002', 'FEAA');
    Object.assign(input.candidate, { byteOffset: 4, byteOrder: 'big', divisor: 256 });
    for (const row of input.assignments) row.expected = '25.5';
  }));
  assert.ok(tlm.results.every(row => row.matchedFormat === 'Eddystone-TLM-v0' && row.withinTolerance));
  // One ineligible selected trial refuses the entire report; unselected bytes remain explicit evidence only.
  const bad = altered(input => datasetChange(input, data => { const doc = JSON.parse(data.trials[4].document); doc.snapshot.serviceData.FCD2 = 'QQLQBw=='; data.trials[4].document = JSON.stringify(doc); }));
  assert.throws(() => validateBleFieldHypothesis(bad), /Ineligible/);
});
test('strict schema, declarations, decimals, candidate and assignment bounds reject', () => {
  const changes = [
    (x: any) => { x.extra = true; }, (x: any) => { x.schemaVersion = 2; },
    (x: any) => { x.assignments[1].trialId = x.assignments[0].trialId; },
    (x: any) => { x.assignments[0].trialId = 'missing'; },
    (x: any) => { x.assignments.forEach((r: any) => { r.subset = 'discovery'; }); },
    (x: any) => { x.assignments[0].subset = 'validation'; },
    (x: any) => { x.assignments = []; }, (x: any) => { x.assignments = Array(33).fill(x.assignments[0]); },
    (x: any) => datasetChange(x, d => { d.sources[0].snapshotId = 'mismatch'; }),
    (x: any) => datasetChange(x, d => { d.sources[0].origin = 'recorded-import'; }),
    (x: any) => datasetChange(x, d => { d.sources[0].platform = 'ios'; }),
  ];
  for (const change of changes) assert.throws(() => validateBleFieldHypothesis(altered(change)));
  for (const [key, bad] of Object.entries({ byteOffset: [-1, 1650, 0.5], width: [0, 5], divisor: [0, -1, 1000000001], valueOffset: [-1000000001, 1000000001], signed: [0, 'true'], byteOrder: ['LE', null] })) {
    for (const value of bad) assert.throws(() => validateBleFieldHypothesis(altered(x => { x.candidate[key] = value; })));
  }
  for (const value of ['-0', '01', '+1', '1e2', '1.0', '0.0000000001', '1000000000000000', '.1', '1.', 1, null]) {
    assert.throws(() => validateBleFieldHypothesis(altered(x => { x.tolerance = value; })));
    assert.throws(() => validateBleFieldHypothesis(altered(x => { x.assignments[0].expected = value; })));
  }
  assert.throws(() => validateBleFieldHypothesis(altered(x => { x.tolerance = '-1'; })));
  assert.throws(() => validateBleFieldHypothesis(fixture.replace('"schemaVersion":', '"schemaVersion":1,"schemaVersion":')), /Duplicate/);
  assert.throws(() => validateBleFieldHypothesis('{"a":'.repeat(4) + '0' + '}'.repeat(4)), /depth/);
  assert.equal(validateBleFieldHypothesis(fixture.padEnd(MAX_FIELD_HYPOTHESIS_CHARACTERS)).results.length, 8);
  assert.throws(() => validateBleFieldHypothesis(fixture.padEnd(MAX_FIELD_HYPOTHESIS_CHARACTERS + 1)), /character limit/);
  assert.doesNotThrow(() => single('403effffffff', '999999999999999.999999999', { width: 4, divisor: 1000000000, valueOffset: 1000000000 }, '999999999999999.999999999'));
});
test('32 selected trials and explicit source omission remain bounded and transparent', () => {
  const result = validateBleFieldHypothesis(altered(input => {
    const data = JSON.parse(input.dataset); const original = data.trials;
    data.trials = Array.from({ length: 32 }, (_, i) => ({ ...original[i % 8], id: `trial-${i}`, receiptId: `receipt-${i}` }));
    input.dataset = JSON.stringify(data);
    input.assignments = data.trials.map((row: any, i: number) => ({ trialId: row.id, subset: i % 2 ? 'held-out' : 'discovery', expected: row.groupId === 'baseline' ? '20' : '18.44' }));
  }));
  assert.equal(result.results.length, 32); assert.ok(result.results.every(row => row.withinTolerance));
  const oneSource = validateBleFieldHypothesis(altered(input => { input.assignments = input.assignments.slice(0, 4); }));
  assert.equal(oneSource.sources.length, 1); assert.equal(oneSource.unselectedTrialIds.length, 4);
  assert.equal(single('400901', '-999999999', { width: 1, divisor: 1, valueOffset: -1000000000 }).results[0]!.withinTolerance, true);
  assert.equal(single('400901', '0.000000001', { width: 1, divisor: 1000000000 }).results[0]!.withinTolerance, true);
});
test('CLI bounded regular file, symlink, malformed, UTF-8, byte-limit and FIFO paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apex-field-'));
  function run(path: string) { const result = spawnSync(process.execPath, ['tools/validate-ble-field-hypothesis.ts', path], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 5000 }); assert.equal(result.error, undefined); return result; }
  function fails(path: string) { const result = run(path); assert.equal(result.status, 1); assert.equal(result.stdout, ''); }
  try {
    const good = join(dir, 'good.json'); writeFileSync(good, fixture); assert.equal(run(good).status, 0);
    assert.throws(() => validateBleFieldHypothesis('\uFEFF' + fixture), /Invalid JSON/);
    const bom = join(dir, 'bom.json'); writeFileSync(bom, '\uFEFF' + fixture); fails(bom);
    fails(dir); const bad = join(dir, 'bad.json'); writeFileSync(bad, '{}'); fails(bad);
    writeFileSync(bad, Buffer.from([255])); fails(bad);
    writeFileSync(bad, Buffer.alloc(MAX_FIELD_HYPOTHESIS_CHARACTERS * 4 + 1, 32)); fails(bad);
    if (process.platform !== 'win32') {
      const link = join(dir, 'link'); symlinkSync(good, link); assert.equal(run(link).status, 0);
      const fifo = join(dir, 'fifo'); const made = spawnSync('mkfifo', [fifo], { timeout: 5000 }); assert.equal(made.status, 0); fails(fifo);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
