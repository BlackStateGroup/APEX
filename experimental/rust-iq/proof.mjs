#!/usr/bin/env node
// This runner never installs tools, accesses devices, or updates the main app.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { cpus, platform, arch, release } from 'node:os';
import { encodeRequest, decodeResponse, compareNumerics, fixtures, maxResponse } from './proof-codec.mjs';
import { prepareReference, runReference, directWindowDft } from './reference.mjs';

const cwd = fileURLToPath(new URL('.', import.meta.url));
const mode = process.argv[2];
if (process.argv.length !== 3 || !['oracle', 'verify', 'benchmark'].includes(mode)) {
  console.error('Usage: node experimental/rust-iq/proof.mjs oracle|verify|benchmark'); process.exit(2);
}
const out = join(cwd, 'proof-results'); mkdirSync(out, { recursive: true });
const report = {
  schemaVersion: 1, mode, startedAt: new Date().toISOString(), status: 'RUNNING',
  syntheticOnly: true, appIntegrated: false, mobileAcceptance: 'NOT RUN',
  environment: { platform: platform(), arch: arch(), release: release(), node: process.version, cpu: cpus()[0]?.model ?? 'unknown' },
  sourceSha256: {}, stages: [],
};
for (const file of ['Cargo.toml', 'Cargo.lock', 'src/lib.rs', 'src/wire.rs', 'src/main.rs', 'proof.mjs', 'proof-codec.mjs', 'reference.mjs', 'proof-codec.test.mjs', '../../packages/core/iq-analysis.ts', '../../packages/core/iq-offline.ts']) {
  report.sourceSha256[file] = createHash('sha256').update(readFileSync(join(cwd, file))).digest('hex');
}
function stage(name, status, detail = {}) { report.stages.push({ name, status, ...detail }); }
function save() { report.finishedAt = new Date().toISOString(); writeFileSync(join(out, `${mode}.json`), JSON.stringify(report, null, 2) + '\n'); }
function command(executable, args, { input, timeout = 120000, maxBuffer = 8 * 1024 * 1024 } = {}) {
  return spawnSync(executable, args, { cwd, input, timeout, maxBuffer, encoding: input ? undefined : 'utf8', shell: false });
}
function requireCommand(name, executable, args) {
  const result = command(executable, args);
  writeFileSync(join(out, `${name}.txt`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (result.error || result.status !== 0) {
    const absent = result.error?.code === 'ENOENT';
    stage(name, absent ? 'BLOCKED' : 'FAIL', { command: [executable, ...args], reason: absent ? `${executable} is not installed or not on PATH` : result.error?.message ?? `exit ${result.status}` });
    throw Object.assign(new Error(`${name} ${absent ? 'blocked' : 'failed'}`), { blocked: absent });
  }
  stage(name, 'PASS', { command: [executable, ...args] }); return result;
}

async function oracle() {
  let checks = 0;
  for (const fixture of fixtures().filter(f => f.fftSize === 256 && f.frameCount === 1)) {
    const reference = runReference(await prepareReference(fixture), fixture);
    const expected = directWindowDft(fixture);
    for (const [k, amplitude] of reference.frames[0].amplitude.entries()) {
      assert.ok(Math.abs(amplitude - expected[k]) <= 1e-9 * (1 + Math.abs(expected[k])), `DFT ${fixture.name} bin ${k}`); checks++;
    }
    if (fixture.name.startsWith('zero-') || fixture.name.startsWith('hann-zero-')) {
      assert.equal(reference.frames[0].peakSignedBin, null);
      assert.ok(reference.frames[0].amplitude.every(value => value === 0));
      assert.ok(reference.frames[0].dbRelativeToUnitAmplitude.every(value => value === null));
    }
  }
  stage('typescript-independent-dft', 'PASS', { comparedBins: checks, rustExecuted: false });
}

let executable;
function nativeCall(request) {
  const result = command(executable, [], { input: request, timeout: 30000, maxBuffer: maxResponse + 65536 });
  if (result.error || result.status !== 0) throw new Error(`Rust host process failed: ${result.error?.message ?? `exit ${result.status}`}`);
  assert.equal(result.stderr.length, 0, 'no incidental diagnostics on success');
  return decodeResponse(result.stdout);
}
async function differential() {
  let count = 0, lowAmplitudeDbDifferences = 0;
  for (const fixture of fixtures()) {
    const reference = runReference(await prepareReference(fixture), fixture);
    const native = nativeCall(encodeRequest(fixture));
    try { lowAmplitudeDbDifferences += compareNumerics(native, reference).lowAmplitudeDbDifferences; }
    catch (error) { throw new Error(`Differential ${fixture.name}: ${error.message}`); }
    count++;
  }
  stage('rust-typescript-differential', 'PASS', { cases: count, lowAmplitudeDbDifferences,
    qualification: 'Linear amplitudes use 1e-12 absolute/relative tolerance. Low-amplitude raw-dB differences are counted, not claimed bit-identical. Peak indices and null classification must match exactly.' });
}
function negativeRequests() {
  const valid = encodeRequest(fixtures()[0]);
  const cases = [Buffer.alloc(0), valid.subarray(0, 47), valid.subarray(0, valid.length - 1), Buffer.concat([valid, Buffer.from([0])]), Buffer.alloc(262144 + 49)];
  const excessiveCells = encodeRequest(fixtures().find(f => f.name === 'selection-4096-4-4096-37'));
  excessiveCells.writeUInt32LE(5, 24); cases.push(excessiveCells);
  for (const offset of [0, 4, 5, 6, 7]) { const bytes = Buffer.from(valid); bytes[offset] ^= 2; cases.push(bytes); }
  for (const [offset, values] of [[8, [0, 1, 262148, 0xffffffff]], [12, [0, 128, 257, 8192]], [16, [1, 0xffffffff]], [20, [0, 65537]], [24, [0, 65]], [28, [0, 1001]]]) {
    for (const value of values) { const bytes = Buffer.from(valid); bytes.writeUInt32LE(value, offset); cases.push(bytes); }
  }
  for (const [offset, values] of [[32, [0, -1, 1e9 + 1, Infinity, NaN]], [40, [1e12 + 1, -1e12 - 1, Infinity, NaN]]]) {
    for (const value of values) { const bytes = Buffer.from(valid); bytes.writeDoubleLE(value, offset); cases.push(bytes); }
  }
  for (const bytes of cases) {
    const result = command(executable, [], { input: bytes, timeout: 5000, maxBuffer: maxResponse + 65536 });
    assert.equal(result.error, undefined); assert.equal(result.status, 2, 'explicit rejection exit');
    assert.equal(result.stdout.length, 0, 'no partial report on rejected input');
    assert.match(result.stderr.toString(), /^apex-iq-proof: (rejected input|invalid bounded input)\n$/);
  }
  stage('rust-host-negative-input', 'PASS', { cases: cases.length });
}
async function benchmark() {
  const iterations = 25, batches = 7;
  const selected = fixtures().filter(f => ['integer-mix-4096', 'selection-256-64-1-0', 'selection-4096-4-4096-37'].includes(f.name));
  const results = [];
  for (const fixture of selected) {
    const prepared = await prepareReference(fixture), rust = [], typescript = [];
    let observed;
    for (let batch = 0; batch < batches; batch++) {
      // Alternate order to reduce a simple systematic first-run bias.
      const rustBatch = () => { const response = nativeCall(encodeRequest(fixture, iterations)); compareNumerics(response, runReference(prepared, fixture)); rust.push(Number(response.elapsedNs) / 1e6 / iterations); };
      const tsBatch = () => {
        for (let i = 0; i < 3; i++) runReference(prepared, fixture);
        const start = process.hrtime.bigint();
        for (let i = 0; i < iterations; i++) observed = runReference(prepared, fixture);
        typescript.push(Number(process.hrtime.bigint() - start) / 1e6 / iterations);
        assert.equal(observed.frames.length, fixture.frameCount);
      };
      if (batch % 2) { rustBatch(); tsBatch(); } else { tsBatch(); rustBatch(); }
    }
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    results.push({ name: fixture.name, sampleCount: fixture.data.length / 4, fftSize: fixture.fftSize, frameCount: fixture.frameCount,
      rustMsPerCall: rust, typescriptMsPerCall: typescript, rustMedianMs: median(rust), typescriptMedianMs: median(typescript) });
  }
  stage('host-benchmark', 'PASS', { iterations, batches, warmupPerBatch: 3, results,
    limits: [
      'Synthetic single-host measurements, not mobile speed, battery, responsiveness, sustained RF throughput or a hard-real-time guarantee.',
      'Timers exclude process startup/transport/serialization and initial preparation/hashing. Both include numerical result allocation.',
      'Existing TypeScript includes its private data snapshot and full result metadata; Rust computes numerical output only and repeats axes per frame. Allocation layouts differ.',
      'Rust destroys previous results deterministically; JavaScript garbage collection is runtime-dependent. Timings do not isolate allocation or collector effects.',
      'This is a measured baseline/prototype comparison, not an isolated language-only speedup claim. No ratio or release acceptance is inferred.',
    ] });
}

try {
  requireCommand('codec-and-oracle-contract-tests', process.execPath, ['--test', 'proof-codec.test.mjs']);
  await oracle();
  if (mode !== 'oracle') {
    const cargo = requireCommand('cargo-presence', 'cargo', ['--version']); report.environment.cargo = cargo.stdout.trim();
    const rustc = requireCommand('rustc-presence', 'rustc', ['--version', '--verbose']); report.environment.rustc = rustc.stdout.trim();
    requireCommand('rust-unit-tests', 'cargo', ['test', '--offline', '--locked']);
    requireCommand('rust-release-build', 'cargo', ['build', '--offline', '--locked', '--release']);
    executable = join(cwd, 'target', 'release', process.platform === 'win32' ? 'apex-iq-proof.exe' : 'apex-iq-proof');
    report.executableSha256 = createHash('sha256').update(readFileSync(executable)).digest('hex');
    await differential(); negativeRequests();
    if (mode === 'benchmark') await benchmark();
  } else {
    stage('rust-compilation-and-execution', 'NOT RUN', { reason: 'oracle mode deliberately runs no Rust and must not be cited as Rust acceptance' });
  }
  report.status = 'PASS'; save(); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.status = error.blocked ? 'BLOCKED' : 'FAIL'; report.error = error.message;
  save(); console.error(JSON.stringify(report, null, 2)); process.exitCode = error.blocked ? 2 : 1;
}
