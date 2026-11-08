import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createOutput, executeStage, offlineEnv, plan, root, runStages } from '../tools/verify-offline-checkpoint.mjs';

async function temporary(t: { after: (callback: () => Promise<void>) => void }) {
  const dir = await mkdtemp(join(tmpdir(), 'apex-checkpoint-'));
  t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}
const synthetic = (id: string, script: string, timeoutMs = 5000) => ({ id, command: process.execPath,
  args: ['-e', script], cwd: root, timeoutMs });

test('actual read-only plan CLI lists fixed commands without execution', async () => {
  const result = JSON.parse(execFileSync(process.execPath, ['tools/verify-offline-checkpoint.mjs', '--plan'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...offlineEnv }, timeout: 10000 }));
  assert.equal(result.stages.length, 9);
  assert.deepEqual(result.stages.find((s: { id: string }) => s.id === 'playwright-list').args,
    ['node_modules/@playwright/test/cli.js', 'test', '--list']);
  assert.ok(result.stages.every((s: { timeoutMs: number }) => s.timeoutMs > 0 && s.timeoutMs <= 600000));
  assert.ok(result.unrunGates.includes('physical-device'));
  const stages = await plan();
  assert.ok(stages[1]!.args.includes('tests/offline-checkpoint.test.ts'));
});

test('exclusive output refuses existing directories, symlinks and symlink ancestors', async t => {
  const dir = await temporary(t);
  await assert.rejects(createOutput(dir), { code: 'EEXIST' });
  const link = join(dir, 'link'); await symlink(dir, link);
  await assert.rejects(createOutput(link), { code: 'EEXIST' });
  await assert.rejects(createOutput(join(link, 'new')), /not a real directory/);
  assert.throws(() => execFileSync(process.execPath, ['tools/verify-offline-checkpoint.mjs', '--output', dir],
    { cwd: root, env: { ...process.env, ...offlineEnv }, stdio: 'pipe', timeout: 10000 }), /Command failed/);
  await assert.rejects(access(join(dir, 'manifest.json')));
});

test('synthetic real commands retain failure logs and do not run later stages', async t => {
  const output = await temporary(t);
  const result = await runStages([synthetic('failure', 'console.error("expected failure"); process.exit(7)'),
    synthetic('later', 'process.exit(0)')], { output, signal: undefined, source: { head: 'fixture', dirty: true } });
  assert.equal(result.status, 'failed'); assert.equal(result.stages[0].code, 7);
  assert.equal(result.stages[1].status, 'not-run');
  assert.match(await readFile(join(output, 'failure.stderr.log'), 'utf8'), /expected failure/);
  assert.equal(JSON.parse(await readFile(join(output, 'result.json'), 'utf8')).status, 'failed');
});

test('real executor forces offline flags and logs successful output', async t => {
  const output = await temporary(t);
  const result = await executeStage(synthetic('environment', `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(Object.keys(offlineEnv))}.map(k => [k, process.env[k]]))))`), { output, signal: undefined });
  assert.equal(result.status, 'succeeded'); assert.equal(result.cleanup, 'settled');
  const env = JSON.parse(await readFile(join(output, 'environment.stdout.log'), 'utf8'));
  for (const [key, value] of Object.entries(offlineEnv)) assert.equal(env[key], value);
});

test('timeout terminates a synthetic child and records bounded failure', async t => {
  const output = await temporary(t);
  const result = await executeStage(synthetic('timeout', 'setInterval(() => {}, 1000)', 100), { output, signal: undefined });
  assert.equal(result.status, 'timed-out'); assert.equal(result.cleanup, 'settled');
  assert.throws(() => process.kill(-result.processGroup, 0), { code: 'ESRCH' });
});

test('cancellation settles a synthetic child and leaves later stages not-run', async t => {
  const output = await temporary(t), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150);
  t.after(() => clearTimeout(timer));
  const result = await runStages([synthetic('cancel', 'setInterval(() => {}, 1000)'), synthetic('later', '')],
    { output, signal: controller.signal, source: { head: 'fixture' } });
  assert.equal(result.status, 'cancelled'); assert.equal(result.stages[0].cleanup, 'settled');
  assert.equal(result.stages[1].status, 'not-run');
});

test('uncertain cleanup never publishes a final result', async t => {
  const output = await temporary(t);
  const result = await runStages([synthetic('fixture', ''), synthetic('later', '')], { output, signal: undefined, source: {},
    executor: async () => ({ status: 'failed', cleanup: 'uncertain' }) });
  assert.equal(result.status, 'cleanup-uncertain'); assert.equal(result.stages[1].status, 'not-run');
  await assert.rejects(access(join(output, 'result.json')));
  assert.equal(JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')).status, 'cleanup-uncertain');
});

test('already cancelled runner does not invoke its executor', async t => {
  const output = await temporary(t), controller = new AbortController(); controller.abort();
  const result = await runStages([synthetic('fixture', '')], { output, source: {}, signal: controller.signal,
    executor: async () => assert.fail('must not execute') });
  assert.equal(result.status, 'cancelled'); assert.equal(result.stages[0].status, 'not-run');
});

test('excessive output is capped, marked truncated, and fails without advancing', async t => {
  const output = await temporary(t);
  const result = await executeStage(synthetic('large-log', 'process.stdout.write(Buffer.alloc(20 * 1024 * 1024, 120))'), { output, signal: undefined });
  assert.equal(result.status, 'log-limit-exceeded'); assert.equal(result.cleanup, 'settled');
  assert.equal(result.logTruncated, true);
  assert.equal((await readFile(join(output, 'large-log.stdout.log'))).length, result.maxLogBytes);
});

test('TERM-resistant synthetic child is killed before result is settled', async t => {
  const output = await temporary(t);
  const result = await executeStage(synthetic('resistant', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)", 250), { output, signal: undefined });
  assert.equal(result.status, 'timed-out'); assert.equal(result.cleanup, 'settled');
  assert.equal(result.signal, 'SIGKILL');
});

test('successful synthetic checkpoint has a settled success result', async t => {
  const output = await temporary(t);
  const result = await runStages([synthetic('success', 'console.log("synthetic success")')],
    { output, signal: undefined, source: { head: 'fixture', dirty: false } });
  assert.equal(result.status, 'succeeded');
  assert.equal(JSON.parse(await readFile(join(output, 'result.json'), 'utf8')).status, 'succeeded');
});

test('missing existing executable fails without installation or fallback', async t => {
  const output = await temporary(t);
  const result = await executeStage({ ...synthetic('missing', ''), command: join(output, 'does-not-exist') },
    { output, signal: undefined });
  assert.equal(result.status, 'failed'); assert.equal(result.cleanup, 'settled');
  assert.match(result.spawnError, /ENOENT/);
});

test('surviving-group cleanup preserves TERM grace before escalating', async t => {
  const output = await temporary(t);
  const signals: Array<{ signal: string | number | undefined; at: number }> = [];
  let probes = 0;
  const result = await executeStage(synthetic('grace', ''), { output, signal: undefined }, {
    signalGroup: (_pid: number, signal: string | number | undefined) => { signals.push({ signal, at: Date.now() }); return true; },
    groupWait: async () => {
      if (++probes === 1) throw new Error('Synthetic surviving group');
      // There is no real surviving child: simulate the probe while exercising
      // the actual escalation timer, without leaving orphan zombies in tests.
      await new Promise(resolve => setTimeout(resolve, 1150));
    },
  });
  assert.equal(result.status, 'lingering-process-group'); assert.equal(result.cleanup, 'settled');
  assert.deepEqual(signals.map(row => row.signal), ['SIGTERM', 'SIGKILL']);
  assert.ok(signals[1]!.at - signals[0]!.at >= 950, 'TERM must receive its grace period');
});


test('final publication refuses an unexpected existing result atomically', async t => {
  const output = await temporary(t);
  const sentinel = '{"status":"preexisting-unrelated-result"}\n';
  await writeFile(join(output, 'result.json'), sentinel, { flag: 'wx' });
  await assert.rejects(runStages([synthetic('success', '')], { output, signal: undefined, source: {},
    executor: async () => ({ status: 'succeeded', cleanup: 'settled' }) }), { code: 'EEXIST' });
  assert.equal(await readFile(join(output, 'result.json'), 'utf8'), sentinel);
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'publication-failed');
  assert.match(manifest.publicationError, /EEXIST/);
});
