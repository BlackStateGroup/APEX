import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReviewed, parseArgs, runCommand, IDF, NIMBLE } from '../tools/build-reviewed-idf.mjs';

// All SDK and Git responses below are synthetic fixtures. No SDK discovery,
// native build, compiler, device, or actual Git command runs in these tests.
async function fixture({ mismatch = false, fail = '', cleanup = 'succeeded', wrongConfig = false } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'apex-idf-FIXTURE-'));
  const root = join(base, 'repo'), sdk = join(base, 'sdk');
  const project = 'firmware/esp32s3-reviewed';
  await mkdir(join(root, project), { recursive: true });
  await mkdir(join(sdk, 'tools'), { recursive: true });
  await mkdir(join(sdk, 'components/bt/host/nimble/nimble'), { recursive: true });
  await writeFile(join(sdk, 'tools/idf.py'), '# SYNTHETIC NONEXECUTABLE FIXTURE\n');
  await writeFile(join(root, project, 'CMakeLists.txt'), '# SYNTHETIC FIXTURE\n');
  await writeFile(join(root, project, 'sdkconfig.defaults'), '# SYNTHETIC FIXTURE\n');
  const calls = [];
  const run = async (command, args, { cwd }) => {
    calls.push({ command, args, cwd });
    let stdout = '';
    if (command === 'git') {
      if (args.includes('rev-parse')) stdout = args[1] === root ? 'synthetic-source-identity' : args[1] === sdk ? (mismatch ? 'wrong' : IDF) : NIMBLE;
      if (args.includes('--show-toplevel')) stdout = args[1];
      if (args.includes('ls-tree')) stdout = `160000 commit ${NIMBLE}\tcomponents/bt/host/nimble/nimble`;
      if (args.includes('submodule')) stdout = ` ${NIMBLE} components/bt/host/nimble/nimble (SYNTHETIC)`;
      if (args.includes('ls-files')) stdout = `${project}/CMakeLists.txt\0${project}/sdkconfig.defaults\0`;
    } else {
      assert.equal(command, 'python3'); assert.equal(args[0], join(sdk, 'tools/idf.py'));
      assert.equal(args[2], cwd); assert.match(cwd, /source\/firmware\/esp32s3-reviewed$/);
      assert.ok(['build', 'reconfigure'].includes(args.at(-1)));
      const config = args.find(a => a.startsWith('SDKCONFIG=')).slice(10);
      const defaults = args.find(a => a.startsWith('SDKCONFIG_DEFAULTS=')).slice(19);
      const build = args[args.indexOf('-B') + 1];
      if (args.at(-1) === 'reconfigure') {
        const input = await readFile(defaults, 'utf8');
        const on = input.includes('\nCONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=y\n');
        await writeFile(config, `${on !== wrongConfig ? 'CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=y' : '# CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN is not set'}\nCONFIG_IDF_TARGET="esp32s3"\nCONFIG_BT_ENABLED=y\nCONFIG_BT_NIMBLE_ENABLED=y\nCONFIG_BT_NIMBLE_USE_ESP_TIMER=y\n`);
      } else {
        await mkdir(join(build, 'config'), { recursive: true });
        const text = await readFile(config, 'utf8');
        await writeFile(join(build, 'config/sdkconfig.h'), text.split('\n').filter(line => line.startsWith('CONFIG_')).map(line => { const [key, value] = line.split('='); return `#define ${key} ${value === 'y' ? '1' : value}`; }).join('\n'));
        for (const name of ['apex_accessory_reviewed.elf', 'apex_accessory_reviewed.bin', 'apex_accessory_reviewed.map']) await writeFile(join(build, name), 'SYNTHETIC FIXTURE, NOT BUILD EVIDENCE\n');
      }
    }
    const failed = args.at(-1) === fail;
    return { command, args, cwd, status: failed || cleanup !== 'succeeded' ? 'failed' : 'succeeded', exitCode: failed ? 7 : 0, cleanup, stdout, stderr: 'SYNTHETIC FIXTURE' };
  };
  return { root, sdk, output: join(base, 'new-result'), run, calls, base };
}

test('closed command grammar and default-off', () => {
  assert.equal(parseArgs(['--output', '/new', '--sdk', '/sdk']).mode, 'default-off');
  for (const word of ['install', 'flash', 'monitor', 'run', 'set-target', '--', '--command', 'prebuild']) assert.throws(() => parseArgs(['--output', '/new', '--sdk', '/sdk', word, 'x']));
  assert.throws(() => parseArgs(['--output', '/a', '--output', '/b', '--sdk', '/sdk']));
  assert.throws(() => parseArgs(['--output', '/a', '--sdk', '/sdk', '--mode', 'on']));
});

test('separate default-off and explicit-on configs target only derivative, preserve hashes', async () => {
  const f = await fixture();
  for (const mode of ['default-off', 'explicit-on']) {
    const output = join(f.base, mode);
    const report = await buildReviewed({ ...f, output, mode }, f.run);
    assert.equal(report.status, 'succeeded');
    assert.equal(report.deviceExecution, 'unrun');
    assert.equal(report.sourceReview, 'open; separate gate');
    assert.equal(report.requested.CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN, mode === 'explicit-on');
    assert.equal(report.artifacts.find(a => a.path === 'build/apex_accessory_reviewed.map').sha256.length, 64);
    assert.equal(JSON.parse(await readFile(join(output, 'result.json'))).status, 'succeeded');
  }
  assert.equal(f.calls.filter(c => c.command === 'python3').length, 4);
});

test('existing output and symlink aliases refused without commands', async () => {
  const f = await fixture(); await mkdir(f.output);
  await writeFile(join(f.output, 'keep'), 'prior evidence');
  await assert.rejects(buildReviewed(f, f.run), /EEXIST/);
  assert.equal(await readFile(join(f.output, 'keep'), 'utf8'), 'prior evidence');
  const alias = join(f.base, 'alias'); await symlink(f.sdk, alias);
  await assert.rejects(buildReviewed({ ...f, sdk: alias }, f.run), /Symlink/);
  await assert.rejects(buildReviewed({ ...f, output: join(f.root, 'out') }, f.run), /outside/);
  assert.equal(f.calls.length, 0);
});

test('provenance mismatch leaves honest report with build unrun', async () => {
  const f = await fixture({ mismatch: true }); const report = await buildReviewed(f, f.run);
  assert.equal(report.status, 'failed'); assert.equal(report.stages.provenance, 'failed');
  assert.equal(report.stages.configure, 'unrun'); assert.equal(report.stages.compile, 'unrun');
  assert.equal(f.calls.some(c => c.command === 'python3'), false);
});

test('failed configure, effective mismatch, partial compile preserve evidence', async () => {
  for (const opts of [{ fail: 'reconfigure' }, { wrongConfig: true }, { fail: 'build' }, { cleanup: 'failed' }]) {
    const f = await fixture(opts); const report = await buildReviewed(f, f.run);
    assert.equal(report.status, 'failed');
    assert.equal(report.stages.compile, opts.fail === 'build' ? 'failed' : 'unrun');
    assert.equal(report.stages.evidence, 'unrun');
    assert.equal(JSON.parse(await readFile(join(f.output, 'result.json'))).status, 'failed');
    if (opts.fail === 'build') assert.ok(report.artifacts.some(a => a.path.endsWith('.map')));
  }
});

test('bounded synthetic subprocess success, failure, spawn failure and timeout cleanup', async () => {
  for (const [script, expected] of [["console.log('SYNTHETIC FIXTURE')", 'succeeded'], ['process.exit(7)', 'failed'], ['setInterval(() => {}, 100)', 'failed']]) {
    const result = await runCommand(process.execPath, ['-e', script], { timeoutMs: 200 });
    assert.equal(result.status, expected); assert.equal(result.cleanup, 'succeeded');
  }
  const absent = await runCommand('/definitely-absent-apex-fixture', [], { timeoutMs: 200 });
  assert.equal(absent.status, 'failed'); assert.equal(absent.cleanup, 'succeeded');
});

test('raw byte budget bounds multibyte output and reports exact retained prefix', async () => {
  const cap = 8 * 1024 * 1024;
  const result = await runCommand(process.execPath, ['-e', `const b = Buffer.from('😀'.repeat(${cap / 4 + 1})); process.stdout.write(b);`], { timeoutMs: 10000 });
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'Output limit');
  assert.equal(result.output.stdout.retainedBytes, cap);
  assert.ok(result.output.stdout.observedBytes > cap);
  assert.equal(result.output.stdout.truncated, true);
  const raw = Buffer.from(result.output.stdout.rawBase64, 'base64');
  assert.equal(raw.length, cap);
  assert.equal(raw.toString(), '😀'.repeat(cap / 4));
});

test('UTF-8 split across subprocess writes is decoded once without replacement', async () => {
  const script = `const fs = require('node:fs'); fs.writeSync(1, Buffer.from([0xf0, 0x9f])); setTimeout(() => fs.writeSync(1, Buffer.from([0x98, 0x80])), 50);`;
  const result = await runCommand(process.execPath, ['-e', script], { timeoutMs: 2000 });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.stdout, '😀');
  assert.equal(result.output.stdout.retainedBytes, 4);
  assert.equal(result.output.stdout.truncated, false);
  assert.equal(Buffer.from(result.output.stdout.rawBase64, 'base64').toString(), '😀');
});

test('exact multibyte byte limit succeeds; malformed output preserves canonical bytes', async () => {
  const cap = 8 * 1024 * 1024;
  const exact = await runCommand(process.execPath, ['-e', `process.stdout.write(Buffer.from('😀'.repeat(${cap / 4})))`], { timeoutMs: 10000 });
  assert.equal(exact.status, 'succeeded');
  assert.equal(exact.output.stdout.retainedBytes, cap);
  assert.equal(exact.output.stdout.truncated, false);
  assert.equal(Buffer.byteLength(exact.stdout), cap);
  const malformed = await runCommand(process.execPath, ['-e', `process.stderr.write(Buffer.alloc(${cap}, 255))`], { timeoutMs: 10000 });
  assert.equal(malformed.status, 'succeeded');
  assert.equal(Buffer.from(malformed.output.stderr.rawBase64, 'base64').length, cap);
  assert.equal(malformed.output.stderr.truncated, false);
  assert.equal(malformed.output.stderr.textTruncated, true);
  assert.ok(Buffer.byteLength(malformed.stderr) <= cap);
});
