import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fitBleLearn, selectBleLearnQuery, validateBleLearn, decodeBleLearnArtifact, MAX_LEARN_CHARACTERS, MAX_ARTIFACT_CHARACTERS } from '../packages/core/ble-learn.ts';
import { INITIAL_ROWS, QUERY_ROWS, HELD_OUT_ROWS, fixtureDocument, fixturePool, fixtureSample, fixturePayload } from '../tools/ble-learn-fixture.ts';
import { validateBleFieldHypothesis } from '../packages/core/ble-field-hypothesis.ts';
const discovery = fixtureDocument(INITIAL_ROWS);
const refined = fixtureDocument([...INITIAL_ROWS, QUERY_ROWS[1]!]);
const heldOut = fixtureDocument(HELD_OUT_ROWS, 'held-out');
function changed(document: string, change: (value: any) => void) { const value = JSON.parse(document); change(value); return JSON.stringify(value); }
function datasetChange(value: any, change: (data: any) => void) { const data = JSON.parse(value.dataset); change(data); value.dataset = JSON.stringify(data); }
function artifact() { return validateBleLearn(refined, heldOut).artifactDocument!; }

test('independent golden byte vectors fix signed little endian and source payload construction', () => {
  assert.equal(fixturePayload(INITIAL_ROWS[0]!), '4002d00703d007');
  assert.equal(fixturePayload(INITIAL_ROWS[1]!), '4002c40903c409');
  assert.equal(fixturePayload(QUERY_ROWS[1]!), '40021efb03d610');
  assert.equal(fixturePayload(HELD_OUT_ROWS[0]!), '40020cfe031a18');
  const fit = fitBleLearn(refined);
  assert.equal(fit.searchSize, 24); assert.equal(fit.surviving.length, 1);
  assert.equal(fit.surviving[0]!.id, 'o2-w2-little-s-d100');
  const evaluation = fit.evaluations.find(row => row.survives)!;
  assert.deepEqual(evaluation.rows.map(row => row.value), [
    { numerator: '20', denominator: '1', approximate: 20 },
    { numerator: '25', denominator: '1', approximate: 25 },
    { numerator: '-25', denominator: '2', approximate: -12.5 },
  ]);
});

test('independent 8/16/24/32-bit goldens cover signedness, endian order and numeric extremes', () => {
  const vectors = [
    { width: 1, divisor: 1, order: 'little', signed: true, hex: ['405780', '40577f'], expected: [-128000, 127000], tolerance: 0 },
    { width: 2, divisor: 1, order: 'big', signed: true, hex: ['40028001', '40020180'], expected: [-32767000, 384000], tolerance: 0 },
    { width: 3, divisor: 1000, order: 'big', signed: true, hex: ['400a800000', '400a010203'], expected: [-8388608, 66051], tolerance: 0 },
    { width: 4, divisor: 1000000, order: 'big', signed: true, hex: ['405b80000000', '405b01020304'], expected: [-2147484, 16909], tolerance: 1 },
    { width: 4, divisor: 1000000, order: 'big', signed: false, hex: ['403effffffff', '403e12345678'], expected: [4294967, 305420], tolerance: 1 },
  ];
  for (const vector of vectors) {
    const input = changed(discovery, x => {
      x.toleranceMilliUnits = vector.tolerance;
      x.search = { byteOffsets: [2], widths: [vector.width], divisors: [vector.divisor] };
      x.measurements.forEach((row: any, index: number) => row.readingMilliUnits = vector.expected[index]);
      datasetChange(x, d => d.trials.forEach((trial: any, index: number) => {
        trial.document = changed(trial.document, source => {
          const payload = Buffer.from(vector.hex[index]!, 'hex');
          source.snapshot.rawScanRecord = Buffer.concat([Buffer.from([payload.length + 3, 0x16, 0xd2, 0xfc]), payload]).toString('base64');
          source.snapshot.serviceData.FCD2 = payload.toString('base64');
        });
      }));
    });
    const fit = fitBleLearn(input);
    assert.equal(fit.surviving.length, 1, JSON.stringify(vector));
    assert.equal(fit.surviving[0]!.width, vector.width);
    assert.equal(fit.surviving[0]!.byteOrder, vector.order);
    assert.equal(fit.surviving[0]!.signed, vector.signed);
  }
});

test('confounded readings abstain; unlabeled query selects maximum guaranteed pair separation', () => {
  const fit = fitBleLearn(discovery);
  assert.equal(fit.status, 'abstain-ambiguous'); assert.equal(fit.surviving.length, 4);
  const query = selectBleLearnQuery(discovery, fixturePool());
  assert.equal(query.status, 'request-reference-measurement');
  assert.equal(query.selected!.id, 'query-negative'); assert.equal(query.selected!.separatedPairs, 5);
  assert.deepEqual(query.probes.map(row => [row.id, row.separatedPairs]), [['query-negative', 5], ['query-positive', 4], ['query-correlated', 0]]);
  assert.equal(query.uncertainty.calibratedProbability, null);
  assert.deepEqual(query, selectBleLearnQuery(discovery, changed(fixturePool(), x => x.probes.reverse())));
  assert.equal(validateBleLearn(discovery, 'this holdout must not be read yet').artifactDocument, null);
  assert.throws(() => selectBleLearnQuery(discovery, changed(fixturePool(), x => x.probes[0].readingMilliUnits = 23000)), /schema/);
});

test('heldout cannot alter discovery selection, rejects failed winner without choosing a replacement', () => {
  const before = fitBleLearn(refined);
  const good = validateBleLearn(refined, heldOut);
  assert.equal(good.status, 'synthetic-validated'); assert.equal(good.heldOut!.matches, 4);
  const bad = validateBleLearn(refined, changed(heldOut, x => x.measurements[0].readingMilliUnits = 650360));
  assert.equal(bad.status, 'abstain-held-out-failure'); assert.equal(bad.artifactDocument, null);
  assert.deepEqual(bad.fit, before); assert.deepEqual(good.fit, before);
  assert.equal(bad.heldOut!.matches, 3);
  const nonsense = fitBleLearn(changed(refined, x => x.measurements[0].readingMilliUnits = 999999999));
  assert.equal(nonsense.status, 'abstain-no-candidate'); assert.equal(nonsense.surviving.length, 0);
});

test('exact inclusive residuals and tolerance-aware query disagreement use integers', () => {
  const boundary = changed(refined, x => { x.toleranceMilliUnits = 1; x.measurements[0].readingMilliUnits += 1; });
  const fit = fitBleLearn(boundary);
  assert.equal(fit.surviving.length, 1);
  const row = fit.evaluations.find(row => row.survives)!.rows[0]!;
  assert.deepEqual(row.residual, { numerator: '-1', denominator: '1000', approximate: -0.001 });
  assert.equal(row.withinTolerance, true);
  assert.equal(fitBleLearn(changed(boundary, x => x.measurements[0].readingMilliUnits += 1)).surviving.length, 0);
  const close = changed(fixturePool(), x => x.probes = [{ id: 'close', intervention: 'Synthetic channels separated by 0.01', payloadHex: '4002fc0803fd08' }]);
  const tolerant = changed(discovery, x => x.toleranceMilliUnits = 10);
  assert.equal(selectBleLearnQuery(tolerant, close).selected, null);
});

test('no-informative-query paths stay explicit instead of pretending progress', () => {
  const correlated = changed(fixturePool(), x => x.probes = x.probes.filter((row: any) => row.id === 'query-correlated'));
  assert.equal(selectBleLearnQuery(discovery, correlated).status, 'abstain-no-informative-query');
  assert.equal(selectBleLearnQuery(refined, correlated).selected, null);
  assert.equal(selectBleLearnQuery(changed(discovery, x => x.measurements[0].readingMilliUnits = 999999999), fixturePool()).selected, null);
});

test('data-only decoder replays evidence, binds layout/scope and abstains outside tested range', () => {
  const document = artifact();
  const decoded = decodeBleLearnArtifact(document, fixtureSample());
  assert.equal(decoded.status, 'synthetic-decoded');
  assert.deepEqual(decoded.value, { numerator: '45', denominator: '2', approximate: 22.5 });
  assert.equal(decoded.authenticated, false);
  for (const payload of ['4102ca08036e14', '4002ca08', '4002ca08036e', '4001ff02ca08036e14', '4003ca08036e14', '4402ca08036e14']) {
    assert.throws(() => decodeBleLearnArtifact(document, fixtureSample(payload)));
  }
  const outside = decodeBleLearnArtifact(document, fixtureSample('4002a00f036e14'));
  assert.equal(outside.status, 'abstain-outside-tested-range'); assert.equal(outside.value, null);
  for (const [key, value] of [['origin', 'recorded-import'], ['sourceId', 'other'], ['serviceUuid', 'FEAA'], ['schemaVersion', 2]]) {
    assert.throws(() => decodeBleLearnArtifact(document, changed(fixtureSample(), x => x[key!] = value)), /scope/);
  }
  for (const mutate of [
    (x: any) => x.candidateId = 'o5-w2-little-u-d100',
    (x: any) => x.discoveryDocument = discovery,
    (x: any) => x.heldOutDocument = changed(heldOut, h => h.measurements[0].readingMilliUnits = 123),
    (x: any) => x.executableCode = 'ignored code is not permitted',
    (x: any) => x.version = 'future-version',
  ]) assert.throws(() => decodeBleLearnArtifact(changed(document, mutate), fixtureSample()));
});

test('tolerated reference error never makes a validated endpoint reject itself', () => {
  const noisy = changed(refined, x => { x.toleranceMilliUnits = 1; x.measurements[2].readingMilliUnits += 1; });
  const validated = validateBleLearn(noisy, heldOut);
  assert.equal(validated.status, 'synthetic-validated');
  const replay = decodeBleLearnArtifact(validated.artifactDocument!, fixtureSample('40021efb03d610'));
  assert.equal(replay.status, 'synthetic-decoded');
  assert.deepEqual(replay.value, { numerator: '-25', denominator: '2', approximate: -12.5 });
  assert.equal(replay.testedRange.basis, 'replayed-packet-predictions');
  assert.deepEqual(replay.testedRange.minimum, replay.value);
  assert.equal(decodeBleLearnArtifact(validated.artifactDocument!, fixtureSample('40021dfb03d610')).status, 'abstain-outside-tested-range');
});

test('duplicate payloads, trial IDs, receipts, references and reused split evidence reject', () => {
  assert.throws(() => fitBleLearn(fixtureDocument([INITIAL_ROWS[0]!, { ...INITIAL_ROWS[0]!, id: 'repeat' }])), /varied|Duplicate/);
  assert.throws(() => fitBleLearn(changed(discovery, x => x.measurements[1].trialId = x.measurements[0].trialId)), /Duplicate/);
  assert.throws(() => fitBleLearn(changed(discovery, x => x.measurements[1].trialId = 'missing')), /Unknown/);
  assert.throws(() => fitBleLearn(changed(discovery, x => x.measurements.pop())), /bound/);
  for (const field of ['id', 'receiptId']) {
    const tampered = changed(heldOut, x => {
      const first = JSON.parse(JSON.parse(refined).dataset).trials[0];
      datasetChange(x, d => { d.trials[0][field] = first[field]; });
      if (field === 'id') x.measurements[0].trialId = first.id;
    });
    assert.throws(() => validateBleLearn(refined, tampered), /split leakage/);
  }
  const reusedBytes = fixtureDocument([{ ...INITIAL_ROWS[0]!, id: 'renamed-repeat' }, ...HELD_OUT_ROWS], 'held-out');
  assert.throws(() => validateBleLearn(refined, reusedBytes), /split leakage/);
  assert.throws(() => validateBleLearn(refined, changed(heldOut, x => x.measurements.forEach((row: any) => row.readingMilliUnits = 42))), /varied/);
});

test('one source at a time and Android/iOS representation boundaries stay intact', () => {
  const iosDiscovery = fixtureDocument([...INITIAL_ROWS, QUERY_ROWS[1]!], 'discovery', 'ios');
  const iosHeldOut = fixtureDocument(HELD_OUT_ROWS, 'held-out', 'ios');
  assert.equal(validateBleLearn(iosDiscovery, iosHeldOut).status, 'synthetic-validated');
  assert.throws(() => validateBleLearn(refined, iosHeldOut), /source\/layout/);
  for (const document of [discovery, heldOut]) {
    const recorded = changed(document, x => datasetChange(x, d => {
      d.sources[0].origin = 'recorded-import';
      d.trials.forEach((trial: any) => trial.document = changed(trial.document, s => { s.provenance.origin = 'recorded-import'; s.provenance.capturedAt = '2026-11-09T00:00:00.000Z'; }));
    }));
    assert.throws(() => document === discovery ? fitBleLearn(recorded) : validateBleLearn(refined, recorded), /synthetic/);
  }
});

test('Learn winner agrees with the pre-existing independent rational validator', () => {
  const train = JSON.parse(refined); const hold = JSON.parse(heldOut);
  const dataset = JSON.parse(train.dataset); const extra = JSON.parse(hold.dataset);
  dataset.trials.push(...extra.trials);
  const report = validateBleFieldHypothesis(JSON.stringify({ schemaVersion: 1, dataset: JSON.stringify(dataset),
    candidate: { byteOffset: 2, width: 2, byteOrder: 'little', signed: true, divisor: 100, valueOffset: 0 }, tolerance: '0',
    assignments: [...train.measurements.map((row: any) => ({ trialId: row.trialId, subset: 'discovery', expected: String(row.readingMilliUnits / 1000) })),
      ...hold.measurements.map((row: any) => ({ trialId: row.trialId, subset: 'held-out', expected: String(row.readingMilliUnits / 1000) }))] }));
  assert.equal(report.results.length, 7); assert.ok(report.results.every(row => row.withinTolerance));
});

test('strict bounded schemas reject malformed and executable-shaped input', () => {
  for (const mutate of [
    (x: any) => x.extra = true, (x: any) => x.schemaVersion = 2, (x: any) => x.kind = 'real-hardware',
    (x: any) => x.toleranceMilliUnits = -1, (x: any) => x.toleranceMilliUnits = 0.1,
    (x: any) => x.measurements[0].readingMilliUnits = 1.5, (x: any) => x.measurements[0].readingMilliUnits = 1000000001,
    (x: any) => x.search.byteOffsets = [2, 2], (x: any) => x.search.widths = [5],
    (x: any) => x.search.divisors = [0], (x: any) => x.search.byteOffsets = [0],
    (x: any) => x.search.byteOffsets = Array.from({ length: 9 }, (_, i) => i),
    (x: any) => x.measurements = Array(17).fill(x.measurements[0]),
  ]) assert.throws(() => fitBleLearn(changed(discovery, mutate)));
  assert.throws(() => fitBleLearn(discovery.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')), /Duplicate/);
  assert.throws(() => fitBleLearn(discovery.padEnd(MAX_LEARN_CHARACTERS + 1)), /limit/);
  assert.throws(() => fitBleLearn('{"a":'.repeat(5) + '0' + '}'.repeat(5)), /depth/);
  assert.throws(() => decodeBleLearnArtifact(artifact().padEnd(MAX_ARTIFACT_CHARACTERS + 1), fixtureSample()), /limit/);
  assert.throws(() => selectBleLearnQuery(discovery, changed(fixturePool(), x => x.sourceId = 'other')));
  assert.throws(() => selectBleLearnQuery(discovery, changed(fixturePool(), x => x.probes[0].payloadHex = 'ff')));
  assert.throws(() => selectBleLearnQuery(discovery, changed(fixturePool(), x => x.probes[0].payloadHex = fixturePayload(INITIAL_ROWS[0]!))), /reuses/);
  assert.throws(() => selectBleLearnQuery(discovery, changed(fixturePool(), x => x.probes.push(x.probes[0]))), /Duplicate/);
});

test('executable demo is byte-reproducible with independent content and evidence digests', () => {
  const run = () => {
    const result = spawnSync(process.execPath, ['tools/demo-ble-learn.ts'], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  const output = run(); assert.equal(run(), output);
  const report = JSON.parse(output); const { reportContentSha256, ...body } = report;
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  assert.equal(reportContentSha256, hash(JSON.stringify(body)));
  for (const [key, document] of Object.entries(report.inputs)) assert.equal(report.digests[key], hash(document as string));
  assert.equal(report.artifactSha256, hash(report.validation.artifactDocument));
  assert.equal(report.comparison.naiveFirstMatch.heldOutMatches, 3);
  assert.equal(report.comparison.activeQuery.heldOutMatches, 4);
  assert.equal(decodeBleLearnArtifact(report.validation.artifactDocument, report.inputs.sampleDocument).status, 'synthetic-decoded');
});
