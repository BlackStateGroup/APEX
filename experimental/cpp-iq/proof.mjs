#!/usr/bin/env node
// Original C++ proof runner; reusable synthetic codec/reference originated in
// the adjacent APEX Rust experiment. No installation, network or device access.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { cpus, platform, arch, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { encodeRequest, decodeResponse, compareNumerics, fixtures, maxResponse } from './proof-codec.mjs';
import { prepareReference, runReference, directWindowDft } from './reference.mjs';
import { extraFixtures } from './extra-fixtures.mjs';

const cwd = fileURLToPath(new URL('.', import.meta.url));
const mode = process.argv[2] ?? 'verify';
const variant = process.argv[3] ?? 'baseline';
if (!['verify', 'benchmark', 'sanitize'].includes(mode) || !['baseline', 'frozen'].includes(variant) || process.argv.length > 4) throw new Error('Use verify|benchmark|sanitize [baseline|frozen]');
const runName = `${variant}-${mode}`;
const out = join(cwd, 'proof-results'); mkdirSync(out, { recursive: true });
const flags = ['-std=c++17', mode === 'sanitize' ? '-O1' : '-O3', '-fno-fast-math', '-ffp-contract=off', '-Wall', '-Wextra', '-Wpedantic', '-Wconversion', '-Werror'];
if (mode === 'sanitize') flags.push('-g', '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie');
if (variant === 'frozen') flags.push('-DAPEX_FROZEN_COEFFICIENTS');
const executable = join(cwd, `proof-host-${runName}`);
const report = { schemaVersion: 1, mode, variant, startedAt: new Date().toISOString(), status: 'RUNNING',
  sourceCommit: '63f530d1f6f8f943d4fd2c1016904f3259daf77a', syntheticOnly: true, appIntegrated: false,
  mobileAcceptance: 'NOT RUN', environment: { platform: platform(), arch: arch(), release: release(), node: process.version, cpu: cpus()[0]?.model ?? 'unknown' },
  precision: { scalar: 'IEEE-754 binary64', amplitudeTolerance: '1e-12 * (1 + abs(reference))',
    meaningfulRawDbTolerance: '1e-6 * (1 + abs(reference)), amplitude >= 1e-10', displayDbTolerance: '1e-8 * (1 + abs(reference))',
    semantics: 'Peak signed index and exact-zero/null classification must match. Low-amplitude dB discrepancies are counted, never hidden.' },
  sourceSha256: {}, stages: [] };
for (const file of ['src/iq.hpp', 'src/iq.cpp', 'src/host.cpp', 'generate-coefficients.mjs', 'src/coefficients.hpp', 'proof.mjs', 'extra-fixtures.mjs', 'proof-codec.mjs', 'proof-codec.test.mjs', 'reference.mjs',
  'packages/core/iq-analysis.ts', 'packages/core/iq-offline.ts', 'packages/core/bounded-json.ts'])
  report.sourceSha256[file] = createHash('sha256').update(readFileSync(join(cwd, file))).digest('hex');
function command(executable, args, options = {}) {
  return spawnSync(executable, args, { cwd, timeout: 120000, maxBuffer: 8 * 1024 * 1024, shell: false,
    env: { ...process.env, ASAN_OPTIONS: 'detect_leaks=0:abort_on_error=1', UBSAN_OPTIONS: 'halt_on_error=1:print_stacktrace=1' }, ...options });
}
function stage(name, detail = {}) { report.stages.push({ name, status: 'PASS', ...detail }); }
function requireCommand(name, program, args) {
  const result = command(program, args);
  writeFileSync(join(out, `${runName}-${name}.txt`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  assert.equal(result.error, undefined, `${name}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  stage(name, { command: [program, ...args] }); return result;
}
function nativeCall(request) {
  const result = command(executable, [], { input: request, maxBuffer: maxResponse + 65536 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr?.toString());
  assert.equal(result.stderr.length, 0, 'no incidental diagnostics on success');
  return decodeResponse(result.stdout);
}
function negatives() {
  const valid = encodeRequest(fixtures()[0]);
  const cases = [Buffer.alloc(0), valid.subarray(0, 47), valid.subarray(0, valid.length - 1), Buffer.concat([valid, Buffer.from([0])]), Buffer.alloc(262144 + 49)];
  for (const offset of [0, 4, 5, 6, 7]) { const bytes = Buffer.from(valid); bytes[offset] ^= 2; cases.push(bytes); }
  for (const [offset, values] of [[8, [0, 1, 262148, 0xffffffff]], [12, [0, 128, 257, 8192]], [16, [1, 0xffffffff]], [20, [0, 65537]], [24, [0, 65]], [28, [0, 1001]]]) {
    for (const value of values) { const bytes = Buffer.from(valid); bytes.writeUInt32LE(value, offset); cases.push(bytes); }
  }
  for (const [offset, values] of [[32, [0, -1, 1e9 + 1, Infinity, NaN]], [40, [1e12 + 1, -1e12 - 1, Infinity, NaN]]]) {
    for (const value of values) { const bytes = Buffer.from(valid); bytes.writeDoubleLE(value, offset); cases.push(bytes); }
  }
  // Each individually legal but combination exceeds cell/range bounds.
  for (const [offset, value] of [[12, 4096], [20, 65536], [24, 64]]) {
    const bytes = Buffer.from(valid); bytes.writeUInt32LE(value, offset);
    if (offset === 20) bytes.writeUInt32LE(2, 24);
    cases.push(bytes);
  }
  for (const bytes of cases) {
    const result = command(executable, [], { input: bytes, maxBuffer: maxResponse + 65536 });
    assert.equal(result.error, undefined); assert.equal(result.status, 2, `negative: ${result.stderr}`);
    assert.equal(result.stdout.length, 0, 'no partial output');
    assert.equal(result.stderr.toString(), 'apex-cpp-iq-proof: rejected input\n');
  }
  const args = command(executable, ['unexpected']);
  assert.equal(args.status, 2); assert.equal(args.stdout.length, 0);
  stage('negative-host-inputs', { cases: cases.length + 1 });
}
async function differential(cases = fixtures(), stageName = 'cpp-typescript-differential') {
  let count = 0, bins = 0, lowAmplitudeDbDifferences = 0, maxAmplitudeAbsoluteError = 0, maxDisplayDbAbsoluteError = 0, maxLowAmplitudeRawDbAbsoluteError = 0;
  const details = [], strictFailures = [];
  for (const fixture of cases) {
    const reference = runReference(await prepareReference(fixture), fixture);
    const native = nativeCall(encodeRequest(fixture));
    let observed;
    try { observed = compareNumerics(native, reference); }
    catch (error) {
      strictFailures.push({ fixture: fixture.name, reason: error.message, zeroClassificationDifferences: [],
        nativePeakSignedBins: native.frames.map(f => f.peakIndex === null ? null : f.bins[f.peakIndex].signedBin),
        typescriptPeakSignedBins: reference.frames.map(f => f.peakSignedBin) });
      observed = { lowAmplitudeDbDifferences: 0, strictComparison: 'FAIL' };
    }
    observed.lowAmplitudeDbDifferences = 0;
    for (const [i, frame] of native.frames.entries()) for (const [j, bin] of frame.bins.entries()) {
      const r = reference.frames[i]; bins++;
      if ((bin.dbRelativeToUnitAmplitude === null) !== (r.dbRelativeToUnitAmplitude[j] === null))
        strictFailures.at(-1).zeroClassificationDifferences.push({ frame: i, signedBin: bin.signedBin, nativeAmplitude: bin.amplitude, typescriptAmplitude: r.amplitude[j] });
      maxAmplitudeAbsoluteError = Math.max(maxAmplitudeAbsoluteError, Math.abs(bin.amplitude - r.amplitude[j]));
      maxDisplayDbAbsoluteError = Math.max(maxDisplayDbAbsoluteError, Math.abs(bin.displayDb - r.displayDb[j]));
      if (bin.dbRelativeToUnitAmplitude !== null && r.dbRelativeToUnitAmplitude[j] !== null && Math.max(bin.amplitude, r.amplitude[j]) < 1e-10) {
        const delta = Math.abs(bin.dbRelativeToUnitAmplitude - r.dbRelativeToUnitAmplitude[j]);
        maxLowAmplitudeRawDbAbsoluteError = Math.max(maxLowAmplitudeRawDbAbsoluteError, delta);
        if (delta > 1e-6) { lowAmplitudeDbDifferences++; observed.lowAmplitudeDbDifferences++; }
      }
    }
    details.push({ name: fixture.name, dataSha256: createHash('sha256').update(fixture.data).digest('hex'), ...observed }); count++;
  }
  stage(stageName, { status: strictFailures.length ? 'FAIL' : 'PASS', cases: count, strictPassedCases: count - strictFailures.length,
    strictFailures, bins, lowAmplitudeDbDifferences, maxAmplitudeAbsoluteError,
    maxDisplayDbAbsoluteError, maxLowAmplitudeRawDbAbsoluteError, fixtures: details });
}
async function independentDft() {
  let cases = 0, comparedBins = 0, maxAbsoluteError = 0;
  for (const fixture of [...fixtures(), ...extraFixtures()].filter(f => f.fftSize === 256 && f.frameCount === 1)) {
    const native = nativeCall(encodeRequest(fixture)), dft = directWindowDft(fixture);
    for (const [j, bin] of native.frames[0].bins.entries()) {
      const delta = Math.abs(bin.amplitude - dft[j]);
      assert.ok(delta <= 1e-9 * (1 + Math.abs(dft[j])), `independent DFT: ${fixture.name} / ${j}`);
      maxAbsoluteError = Math.max(maxAbsoluteError, delta); comparedBins++;
    }
    cases++;
  }
  stage('cpp-independent-direct-dft', { cases, comparedBins, maxAbsoluteError, tolerance: '1e-9 * (1 + abs(DFT))' });
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
async function benchmark() {
  const iterations = 25, batches = 7, results = [], parityFailures = [];
  const selected = fixtures().filter(f => ['integer-mix-4096', 'selection-256-64-1-0', 'selection-4096-4-4096-37'].includes(f.name));
  for (const fixture of selected) {
    const prepared = await prepareReference(fixture), cpp = [], typescript = [], nativeRoundtrip = [];
    const expected = runReference(prepared, fixture);
    for (let batch = 0; batch < batches; ++batch) {
      const cppBatch = () => {
        const input = encodeRequest(fixture, iterations), start = process.hrtime.bigint();
        const result = nativeCall(input);
        nativeRoundtrip.push(Number(process.hrtime.bigint() - start) / 1e6);
        // Preserve strict parity failure separately. Timing a rejected candidate
        // is diagnostic only; it never converts a failed gate into acceptance.
        try { compareNumerics(result, expected); }
        catch (error) { parityFailures.push({ fixture: fixture.name, batch, reason: error.message }); }
        cpp.push(Number(result.elapsedNs) / 1e6 / iterations);
      };
      const tsBatch = () => {
        for (let j = 0; j < 3; ++j) runReference(prepared, fixture);
        let result;
        const start = process.hrtime.bigint();
        for (let j = 0; j < iterations; ++j) result = runReference(prepared, fixture);
        typescript.push(Number(process.hrtime.bigint() - start) / 1e6 / iterations);
        assert.equal(result.frames.length, fixture.frameCount);
      };
      if (batch % 2) { cppBatch(); tsBatch(); } else { tsBatch(); cppBatch(); }
    }
    results.push({ name: fixture.name, sampleCount: fixture.data.length / 4, fftSize: fixture.fftSize, frameCount: fixture.frameCount,
      cppMsPerCall: cpp, typescriptMsPerCall: typescript, nativeRoundtripMsPerBatch: nativeRoundtrip,
      cppMedianMs: median(cpp), typescriptMedianMs: median(typescript), nativeRoundtripMedianMs: median(nativeRoundtrip) });
  }
  stage('host-warm-compute-benchmark', { status: parityFailures.length ? 'FAIL' : 'PASS', parityFailures,
    timingMeasurementsOnly: true, iterations, batches, warmupCallsPerBatch: 3, order: 'alternates TS first and C++ first', results,
    limits: [
      'Single shared Linux x86-64 host, no core pinning, possible concurrent workloads; descriptive medians, not inferential statistical claims.',
      'Compute timers exclude process startup, framing, IPC, serialization, hashing, import preparation and UI. Cold single-call performance is NOT measured.',
      'Native roundtrip is per 25-call batch, includes 3 warmups, process creation, IPC, serialization and strict JS decode; it is not a mobile bridge or per-call latency.',
      'Both allocate numerical results. TS also snapshots the prepared bytes and constructs provenance/warnings/full metadata; C++ repeats per-frame axes and lacks that metadata. GC and native destruction differ.',
      'Not a language-isolated or equal-end-to-end speedup; no mobile speed, battery, RF throughput, calibration, or production readiness is established.',
    ] });
}
try {
  requireCommand('coefficient-snapshot-check', process.execPath, ['generate-coefficients.mjs', '--check']);
  report.environment.compiler = requireCommand('compiler-version', 'g++', ['--version']).stdout.toString().trim();
  requireCommand('compile', 'g++', [...flags, 'src/iq.cpp', 'src/host.cpp', '-o', executable]);
  report.executableSha256 = createHash('sha256').update(readFileSync(executable)).digest('hex');
  requireCommand('codec-tests', process.execPath, ['--test', 'proof-codec.test.mjs']);
  await differential(); await differential(extraFixtures(), 'supplementary-strict-differential'); await independentDft(); negatives();
  if (mode === 'sanitize') stage('address-and-undefined-behavior-sanitizers', { qualification: 'No ASan/UBSan diagnostics in all native calls; numerical compatibility failures remain failures.', leakChecking: 'UNAVAILABLE: LeakSanitizer aborts under environment ptrace. See preserved initial-leak-sanitizer-failure.json; leak detection is disabled, not passed.' });
  if (mode === 'benchmark') await benchmark();
  report.status = report.stages.some(stage => stage.status === 'FAIL') ? 'FAIL' : 'PASS';
  report.conclusion = report.status === 'FAIL' ? 'REJECTED as a drop-in numerical replacement; any timing measurements are diagnostic only.' : 'Passed this finite host test set only; not mobile or production acceptance.';
  if (report.status === 'FAIL') process.exitCode = 1;
} catch (error) {
  report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(out, `${runName}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
