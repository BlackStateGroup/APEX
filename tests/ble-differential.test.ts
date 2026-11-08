import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeBleDifferential, MAX_DIFFERENTIAL_CHARACTERS } from '../packages/core/ble-differential.ts';
import { prepareBlePlxSourceEvidenceInput } from '../packages/core/ble-plx-source-evidence.ts';
const fixture = readFileSync(new URL('./fixtures/ble-differential.json', import.meta.url), 'utf8');
const provenance = { origin: 'synthetic-fixture' as const, label: 'Synthetic differential test', capturedAt: null };
function source(platform: 'android' | 'ios', payload: string, uuid = 'FCD2', rawOverride?: string) {
  const raw = Buffer.from(`${(payload.length / 2 + 3).toString(16).padStart(2, '0')}16${uuid.slice(2)}${uuid.slice(0, 2)}${payload}`, 'hex').toString('base64');
  return prepareBlePlxSourceEvidenceInput(platform, { id: platform, rawScanRecord: rawOverride ?? raw, serviceData: { [uuid]: Buffer.from(payload, 'hex').toString('base64') } }, provenance).payload.document;
}
function altered(change: (input: any) => void) {
  const input = JSON.parse(fixture); change(input); return JSON.stringify(input);
}

test('synthetic cross-platform fixture is deterministic; counts, byte offsets and runs are exact', () => {
  const result = analyzeBleDifferential(fixture);
  assert.deepEqual(result, analyzeBleDifferential(fixture));
  assert.equal(result.comparisons.length, 2);
  for (const comparison of result.comparisons) {
    assert.deepEqual(comparison.changedOffsets, [2]);
    assert.equal(comparison.matrix[0]!.changed, false);
    assert.equal(comparison.matrix[2]!.stableWithinEachGroup, true);
    assert.deepEqual(comparison.matrix[2]!.cells.map(cell => cell.values), [['d0', 'd0'], ['34', '34']]);
    assert.deepEqual(comparison.matrix[2]!.cells.map(cell => cell.runCount), [1, 1]);
    assert.deepEqual(comparison.matrix[2]!.cells[0]!.counts, [{ value: 'd0', count: 2 }]);
  }
  assert.equal(result.trials[0]!.adOffset, 0);
  assert.equal(result.trials[4]!.adOffset, null);
  assert.deepEqual(result.trials.map(trial => trial.document), JSON.parse(fixture).trials.map((trial: any) => trial.document));
});

test('within-group changes are not field identification; absent byte differs from zero', () => {
  const result = analyzeBleDifferential(altered(input => {
    input.trials[1].document = source('android', '4002340800');
    input.trials[2].document = source('android', '400234');
  }));
  const matrix = result.comparisons[0]!.matrix;
  assert.equal(matrix[2]!.stableWithinEachGroup, false);
  assert.equal(matrix[2]!.cells[0]!.runCount, 2);
  assert.deepEqual(matrix[4]!.cells[0]!.values, [null, '00']);
  assert.equal(matrix[4]!.changed, true);
});

test('encrypted BTHome is opaque, including unknown header versions, without inferred objects', () => {
  for (const header of ['41', '01', 'ff']) {
    const result = analyzeBleDifferential(altered(input => {
      for (const trial of input.trials) trial.document = source(trial.sourceId, `${header}023408`);
    }));
    assert.ok(result.trials.every(trial => trial.interpretation === 'opaque-encrypted-bthome'));
    assert.ok(result.comparisons.every(comparison => comparison.changedOffsets.length === 0));
    assert.equal(Object.hasOwn(result.trials[0]!, 'objects'), false);
  }
});

test('FEAA payloads compare without assuming frame kind or equal payload lengths', () => {
  const result = analyzeBleDifferential(altered(input => {
    input.serviceUuid = 'FEAA';
    for (const trial of input.trials) trial.document = source(trial.sourceId, trial.groupId === 'baseline' ? '20' : '2000', 'FEAA');
  }));
  assert.deepEqual(result.comparisons[0]!.changedOffsets, [1]);
});

test('exact provenance, whitespace and unverified receipt survive; iOS raw bytes stay opaque', () => {
  const result = analyzeBleDifferential(altered(input => {
    input.sources[1].origin = 'recorded-import';
    for (const trial of input.trials.filter((trial: any) => trial.sourceId === 'ios')) {
      const row = JSON.parse(trial.document);
      row.provenance = { origin: 'recorded-import', label: 'Operator claim', capturedAt: '2026-11-07T01:02:03.000Z' };
      row.snapshot.rawScanRecord = Buffer.from('opaque, not AD').toString('base64');
      trial.document = JSON.stringify(row, null, 1) + '\n';
    }
  }));
  assert.equal(result.trials[4]!.provenance.capturedAt, '2026-11-07T01:02:03.000Z');
  assert.ok(result.trials[4]!.document.endsWith('\n'));
  assert.equal(result.trials[4]!.receiptId, 'synthetic-ios-baseline-1');
  assert.equal(result.trials[4]!.payloadHex, '4002d007');
});

test('reject ambiguous selections, missing Android raw bytes and malformed/truncated AD', () => {
  for (const raw of [null, '', Buffer.from('0716d2fc4002d0070716d2fc4002d007', 'hex').toString('base64'), Buffer.from('ff16d2fc40', 'hex').toString('base64')]) {
    assert.throws(() => analyzeBleDifferential(altered(input => {
      const row = JSON.parse(input.trials[0].document); row.snapshot.rawScanRecord = raw;
      input.trials[0].document = JSON.stringify(row);
    })));
  }
  assert.throws(() => analyzeBleDifferential(altered(input => {
    const row = JSON.parse(input.trials[4].document); row.snapshot.serviceData['0000fcd2-0000-1000-8000-00805f9b34fb'] = 'QALQBw==';
    input.trials[4].document = JSON.stringify(row);
  })));
});

test('strict schema, grouping, source declarations and duplicate references fail closed', () => {
  const mutations = [
    (x: any) => { x.extra = true; }, (x: any) => { x.scope = 'nearby-public'; },
    (x: any) => { x.schemaVersion = 2; }, (x: any) => { x.serviceUuid = 'FFFF'; },
    (x: any) => { x.trials[0].groupId = 'missing'; }, (x: any) => { x.trials[0].sourceId = 'missing'; },
    (x: any) => { x.sources[0].platform = 'ios'; }, (x: any) => { x.sources[0].snapshotId = 'wrong'; },
    (x: any) => { x.sources[0].origin = 'recorded-import'; },
    (x: any) => { x.trials[1].id = x.trials[0].id; }, (x: any) => { x.trials[1].receiptId = x.trials[0].receiptId; },
    (x: any) => { x.groups[1].id = x.groups[0].id; }, (x: any) => { x.sources[1].id = x.sources[0].id; },
    (x: any) => { x.trials = x.trials.filter((trial: any) => !(trial.sourceId === 'ios' && trial.groupId === 'changed')); },
    (x: any) => { x.trials[0].document = x.trials[0].document.replace('"sdk":', '"sdk":"bad","sdk":'); },
  ];
  for (const mutation of mutations) assert.throws(() => analyzeBleDifferential(altered(mutation)));
  assert.throws(() => analyzeBleDifferential(fixture.replace('"scope":', '"scope":"owned-lab","scope":')));
  assert.throws(() => analyzeBleDifferential('{"x":'.repeat(20) + '0' + '}'.repeat(20)), /depth/);
});

test('exact character and trial limits; over-limit fails before analysis', () => {
  assert.equal(analyzeBleDifferential(fixture.padEnd(MAX_DIFFERENTIAL_CHARACTERS, ' ')).trials.length, 8);
  assert.throws(() => analyzeBleDifferential(fixture.padEnd(MAX_DIFFERENTIAL_CHARACTERS + 1, ' ')), /character limit/);
  const atLimit = altered(input => {
    const original = input.trials;
    input.trials = Array.from({ length: 32 }, (_, i) => ({ ...original[i % 8], id: `t${i}`, receiptId: `r${i}` }));
  });
  assert.equal(analyzeBleDifferential(atLimit).trials.length, 32);
  const tooMany = JSON.parse(atLimit); tooMany.trials.push({ ...tooMany.trials[0], id: 'extra', receiptId: 'extra' });
  assert.throws(() => analyzeBleDifferential(JSON.stringify(tooMany)), /count limit/);
});

test('CLI synthetic demo succeeds; malformed input produces no partial report', () => {
  const cwd = new URL('../', import.meta.url);
  const good = spawnSync(process.execPath, ['tools/analyze-ble-differential.ts', 'tests/fixtures/ble-differential.json'], { cwd, encoding: 'utf8', timeout: 5000 });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).trials.length, 8);
  const bad = spawnSync(process.execPath, ['tools/analyze-ble-differential.ts', 'package.json'], { cwd, encoding: 'utf8', timeout: 5000 });
  assert.equal(bad.status, 1); assert.equal(bad.stdout, '');
});


test('CLI only reads regular files, follows regular-file symlinks, and rejects invalid UTF-8 and excess bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-differential-cli-'));
  const cwd = new URL('../', import.meta.url);
  function run(path: string) {
    const result = spawnSync(process.execPath, ['tools/analyze-ble-differential.ts', path], { cwd, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.error, undefined, `CLI must terminate within deadline: ${result.error}`);
    return result;
  }
  function rejects(path: string, message: RegExp) {
    const result = run(path);
    assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, message);
  }
  try {
    rejects(directory, /regular file/);
    const regular = join(directory, 'regular.json');
    writeFileSync(regular, fixture);
    if (process.platform !== 'win32') {
      const link = join(directory, 'linked.json');
      symlinkSync(regular, link);
      const result = run(link);
      assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).trials.length, 8);
      const fifo = join(directory, 'input.fifo');
      const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8', timeout: 5000 });
      assert.equal(created.error, undefined); assert.equal(created.status, 0, created.stderr);
      rejects(fifo, /regular file/);
      const fifoLink = join(directory, 'linked.fifo'); symlinkSync(fifo, fifoLink);
      rejects(fifoLink, /regular file/);
    }
    const invalid = join(directory, 'invalid.json'); writeFileSync(invalid, Buffer.from([0xff]));
    rejects(invalid, /encoded data|encoding|UTF-8/i);
    const oversized = join(directory, 'oversized.json');
    writeFileSync(oversized, Buffer.alloc(MAX_DIFFERENTIAL_CHARACTERS * 4 + 1, 32));
    rejects(oversized, /byte limit/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
