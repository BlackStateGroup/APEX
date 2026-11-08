import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const environment = { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1',
  npm_config_update_notifier: 'false', npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' };
function run(args: string[] = [], preload?: string) {
  return spawnSync(process.execPath, ['--permission', `--allow-fs-read=${fileURLToPath(root)}`, ...(preload ? ['--import', `data:text/javascript,${encodeURIComponent(preload)}`] : []),
    'tools/demo-offline-lab.ts', ...args], { cwd: root, env: environment, encoding: 'utf8', timeout: 10000, maxBuffer: 16384 });
}

test('actual offline lab CLI completes every synthetic stage in one bounded deterministic summary', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(Buffer.byteLength(result.stdout) <= 12288);
  assert.equal(Buffer.byteLength(result.stdout), 8806);
  assert.equal(createHash('sha256').update(result.stdout).digest('hex'),
    'dfe1ae0ab01718192b652df1592af25b4294e64b013716ed26bb4926228b7504');
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'complete');
  assert.equal(report.mode, 'offline-synthetic-lab');
  assert.equal(report.demonstrationTime, '2026-11-08T00:00:00.000Z');
  assert.match(report.timestampMeaning, /Fixed synthetic/);
  for (const stage of ['ble', 'trials', 'ndef', 'evidence', 'iq', 'flipper', 'phase', 'ir', 'hci']) {
    assert.equal(report[stage].origin, 'synthetic-fixture');
    assert.ok(report[stage].limit.length > 20);
  }
  assert.equal(report.ble.exactSelectedDocumentRetained, true);
  assert.equal(report.ble.parseStatus, 'complete');
  assert.equal(report.ble.temperatureCelsius, 20);
  assert.equal(report.ble.authenticatedIdentity, false);
  assert.equal(report.ble.physicalReceptionVerified, false);
  assert.equal(report.trials.count, 8);
  assert.equal(report.trials.sourceCount, 2);
  assert.equal(report.trials.declaredCandidateMatches, 8);
  assert.deepEqual(report.trials.changedPayloadOffsetsBySource, [
    { sourceId: 'android', changedOffsets: [2] }, { sourceId: 'ios', changedOffsets: [2] },
  ]);
  assert.deepEqual(report.trials.values.map((v: { approximate: number }) => v.approximate), [20, 18.44]);
  assert.equal(report.ndef.text, 'Hi');
  assert.equal(report.ndef.authenticated, false);
  assert.equal(report.evidence.storage, 'memory-only');
  assert.equal(report.evidence.savedRecords, 2);
  assert.deepEqual(report.evidence.selectedRecordIds, ['synthetic-demo-2', 'synthetic-demo-1']);
  assert.equal(report.evidence.verifiedPreview, true);
  assert.equal(report.evidence.exactDocumentsRetained, true);
  assert.ok(report.evidence.bundleBytes > 0 && report.evidence.bundleBytes < 8192);
  assert.equal(report.iq.datatype, 'ci16_le');
  assert.equal(report.iq.sampleCount, 512);
  assert.equal(report.iq.fftPeakSignedBin, 64);
  assert.equal(report.iq.fftPeakAmplitude, 0.5);
  assert.deepEqual(report.iq.timeFrequencyPeakBins, [64, 64]);
  assert.deepEqual(report.iq.energySums, ['68719476736', '68719476736']);
  assert.deepEqual(report.iq.strictlyAboveEqualThreshold, [false, false]);
  assert.deepEqual(report.iq.lagSamples, [1, 2, 3, 4]);
  assert.deepEqual(report.iq.normalizedSquaredMagnitudes, [1, 1, 1, 1]);
  assert.equal(report.flipper.provenance, 'synthetic');
  assert.match(report.flipper.fixtureMeaning, /Manually authored/);
  assert.equal(report.flipper.identitySuccessEstablished, false);
  assert.equal(report.flipper.bytesHex, '05c202020801071000c202021002051002c20200');
  assert.equal(report.flipper.sha256, createHash('sha256').update(Buffer.from(report.flipper.bytesHex, 'hex')).digest('hex'));
  assert.deepEqual(report.flipper.frames.map((frame: any) => frame.status), [
    { present: false, effective: 0, observation: 'omitted' },
    { present: true, effective: 0, observation: 'explicit-zero' },
    { present: true, effective: 2, observation: 'nonzero-or-unknown' },
  ]);
  assert.deepEqual(report.flipper.frames.map((frame: any) => [frame.major, frame.minor]), [
    [{ present: true, effective: 1 }, { present: false, effective: 0 }],
    [{ present: false, effective: 0 }, { present: true, effective: 2 }],
    [{ present: false, effective: 0 }, { present: false, effective: 0 }],
  ]);
  for (const frame of report.flipper.frames) {
    assert.equal(frame.kind, 'version');
    assert.deepEqual(frame.commandId, { present: false, effective: 0 });
    assert.deepEqual(frame.hasNext, { present: false, effective: false });
  }
  assert.match(report.phase.hashScope, /All original/);
  assert.match(report.phase.limit, /Zero phase at lag 4 is not zero signal/);
  const data = Buffer.alloc(512 * 4);
  const cycle = [[16384, 0], [0, 16384], [-16384, 0], [0, -16384]];
  for (let n = 0; n < 512; n++) {
    data.writeInt16LE(cycle[n % 4]![0]!, n * 4);
    data.writeInt16LE(cycle[n % 4]![1]!, n * 4 + 2);
  }
  assert.equal(report.phase.sourceHashes.dataSha256, createHash('sha256').update(data).digest('hex'));
  assert.match(report.phase.sourceHashes.metadataSha256, /^[0-9a-f]{64}$/);
  for (const [index, selection] of report.phase.selections.entries()) {
    const lag = [1, 2, 4][index]!;
    assert.deepEqual(selection.options, { startSample: 0, lag, step: 4, count: 2 });
    assert.equal(selection.aliasSpacingHz, 1024 / lag);
    assert.deepEqual(selection.nominalPrincipalFrequencyIntervalHz, { lowerExclusive: -512 / lag, upperInclusive: 512 / lag });
    for (const [pairIndex, pair] of selection.pairs.entries()) {
      assert.equal(pair.leftSample, pairIndex * 4);
      assert.equal(pair.rightSample, pairIndex * 4 + lag);
      assert.deepEqual(pair.complexProduct, [
        { real: '0', imaginary: '268435456' }, { real: '-268435456', imaginary: '0' },
        { real: '268435456', imaginary: '0' },
      ][index]);
      assert.equal(pair.leftEnergy, '268435456');
      assert.equal(pair.rightEnergy, '268435456');
      assert.deepEqual(pair.phaseAndFrequency, { status: 'available',
        principalPhaseRadians: [Math.PI / 2, Math.PI, 0][index], nominalPrincipalFrequencyOffsetHz: index === 2 ? 0 : 256 });
    }
  }
  const repeated = run();
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(repeated.stderr, '');
  assert.equal(repeated.stdout, result.stdout);
});

test('unsupported arguments and late fixture/hash failures never emit partial success', () => {
  const lateFixtureFailure = `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
    const read = fs.readFileSync;
    fs.readFileSync = function(path, ...args) {
      if (String(path).endsWith('/src/fixtures/ndef-text.json')) return '{}';
      return read.call(this, path, ...args);
    }; syncBuiltinESMExports();`;
  const lateBundleFailure = `import crypto from 'node:crypto'; import { syncBuiltinESMExports } from 'node:module';
    const hash = crypto.createHash; let calls = 0;
    crypto.createHash = function(...args) {
      if (++calls === 7) throw new Error('Injected late digest failure');
      return hash.apply(this, args);
    }; syncBuiltinESMExports();`;
  for (const result of [run(['--help']), run(['https://example.invalid']), run([], lateFixtureFailure), run([], lateBundleFailure)]) {
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /no success summary emitted/);
  }
});


test('late phase arithmetic and Flipper presence/status faults keep stdout atomic with writes denied', () => {
  const phaseFailure = `Math.atan2 = () => 0;`;
  const flipperFailure = `const from = Uint8Array.from;
    Uint8Array.from = function(input, ...args) {
      const bytes = from.call(this, input, ...args);
      if (bytes.length === 20 && bytes[1] === 0xc2) bytes[8] = 2;
      return bytes;
    };`;
  for (const preload of [phaseFailure, flipperFailure]) {
    const result = run([], preload);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Offline synthetic walkthrough failed; no success summary emitted. Check fixtures and invariants.\n');
  }
});
