#!/usr/bin/env node
/** Fixed local checks only. Offline flags are not a network sandbox. */
import { spawn, execFileSync } from 'node:child_process';
import { writeSync } from 'node:fs';
import { open, mkdir, writeFile, rename, link, unlink, readdir, lstat } from 'node:fs/promises';
import { resolve, dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { waitForProcessGroup } from './native-process-group.mjs';

export const maxLogBytes = 16 * 1024 * 1024; // Per stream, per stage.
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const offlineEnv = Object.freeze({ CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1',
  npm_config_update_notifier: 'false', npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' });
export const unrunGates = Object.freeze(['browser-execution', 'native-prebuild-and-build', 'physical-device',
  'provider-network-actions', 'rea-engine-readiness']);
export async function plan(output = '<OUTPUT>') {
  const tests = (await readdir(join(root, 'tests'))).filter(name => name.endsWith('.test.ts')).sort();
  const stage = (id, command, args, timeoutMs) => ({ id, command, args, cwd: root, timeoutMs });
  const node = (id, args, timeoutMs = 120000) => stage(id, process.execPath, args, timeoutMs);
  return [stage('portable-firmware', 'python3', ['tools/build_firmware.py'], 120000),
    node('node-tests', ['--test', '--test-concurrency=2', ...tests.map(name => `tests/${name}`)], 600000),
    node('typecheck', ['node_modules/typescript/bin/tsc', '--noEmit'], 180000),
    stage('source-archives', 'python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_source_archives.py'], 120000),
    node('rea-preflight-tests', ['--test', 'tools/reverse-engineering/preflight.test.mjs']),
    node('npm-inventory', ['tools/npm-inventory.mjs', '--check']),
    node('playwright-list', ['node_modules/@playwright/test/cli.js', 'test', '--list']),
    node('expo-js-export', ['node_modules/expo/bin/cli', 'export', '--platform', 'ios', '--platform', 'android', '--platform', 'web', '--output-dir', join(output, 'expo-export')], 600000),
    node('synthetic-lab', ['tools/demo-offline-lab.ts'])];
}

// No recursive mkdir: an existing target (including symlinks) is never reused.
export async function createOutput(output) {
  const target = resolve(output);
  let cursor = dirname(target);
  while (true) {
    const info = await lstat(cursor);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Output ancestor is not a real directory: ${cursor}`);
    if (cursor === parse(cursor).root) break;
    cursor = dirname(cursor);
  }
  await mkdir(target, { mode: 0o700 });
  return target;
}

// Probe/signal hooks support deterministic lifecycle tests without orphaning processes.
// They are never configurable through the CLI.
export async function executeStage(stage, { output, signal }, { groupWait = waitForProcessGroup, signalGroup = process.kill } = {}) {
  if (process.platform === 'win32') throw new Error('POSIX process-group verification required');
  if (signal?.aborted) return { status: 'cancelled', cleanup: 'settled' };
  const stdout = await open(join(output, `${stage.id}.stdout.log`), 'wx', 0o600);
  let stderr;
  try { stderr = await open(join(output, `${stage.id}.stderr.log`), 'wx', 0o600); }
  catch (error) { await stdout.close(); throw error; }
  let child, reason, timer, escalation, group, spawnError, signalError, logError;
  const logBytes = { stdout: 0, stderr: 0 };
  let logTruncated = false;
  let settleStop;
  const stopped = new Promise(done => { settleStop = () => done(null); });
  const kill = sig => {
    if (!group) return;
    try { signalGroup(-group, sig); }
    catch (error) { if (error.code !== 'ESRCH') signalError = error.message; }
  };
  const stop = why => {
    reason ??= why;
    settleStop();
    kill('SIGTERM');
    escalation ??= setTimeout(() => kill('SIGKILL'), 1000);
  };
  const abort = () => stop('cancelled');
  try {
    child = spawn(stage.command, stage.args, { cwd: stage.cwd, env: { ...process.env, ...offlineEnv },
      shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const [name, file] of [['stdout', stdout], ['stderr', stderr]]) {
      child[name].on('error', error => { logError = error.message; stop('log-read-failed'); });
      child[name].on('data', chunk => {
        const remaining = maxLogBytes - logBytes[name];
        const kept = chunk.subarray(0, Math.max(0, remaining));
        try {
          let offset = 0;
          while (offset < kept.length) offset += writeSync(file.fd, kept, offset, kept.length - offset);
          logBytes[name] += kept.length;
        } catch (error) { logError = error.message; stop('log-write-failed'); }
        if (chunk.length > remaining) { logTruncated = true; stop('log-limit-exceeded'); }
      });
    }
    group = child.pid;
    const closed = new Promise(done => {
      child.once('error', error => { spawnError = error.message; });
      child.once('close', (code, sig) => done({ code, signal: sig }));
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    // Stop-triggered settlement does not depend on an OS close notification.
    timer = setTimeout(() => stop('timed-out'), stage.timeoutMs);
    let result = await Promise.race([closed, stopped]);
    if (!result) result = await Promise.race([closed, delay(2500).then(() => null)]);
    if (result?.code !== 0 || reason || spawnError) stop(reason ?? 'failed');
    let cleanup = 'settled', cleanupError;
    if (group) {
      try { await groupWait(group, { timeoutMs: 1500 }); }
      catch {
        stop(reason ?? 'lingering-process-group');
        // Preserve stop()'s TERM grace; its existing timer escalates after 1s.
        try { await groupWait(group, { timeoutMs: 6000 }); }
        catch (error) { cleanup = 'uncertain'; cleanupError = error.message; }
      }
    }
    if (!result) { cleanup = 'uncertain'; cleanupError ??= 'Child close was not observed'; }
    return { status: reason ?? (spawnError || cleanup !== 'settled' ? 'failed' : 'succeeded'),
      cleanup, cleanupError, spawnError, signalError, logError, logBytes, logTruncated, maxLogBytes, pid: child.pid, processGroup: group, ...result };
  } finally {
    clearTimeout(timer); clearTimeout(escalation);
    child?.stdout?.destroy(); child?.stderr?.destroy();
    signal?.removeEventListener('abort', abort);
    await Promise.all([stdout.close(), stderr.close()]);
  }
}

async function atomicJSON(output, name, value, replace = true) {
  const temporary = join(output, `${name}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  if (replace) await rename(temporary, join(output, name));
  else {
    // Same-directory hard-link publication is atomic and fails if target exists.
    // Retain the temporary file if publication fails for diagnosis.
    await link(temporary, join(output, name));
    await unlink(temporary);
  }
}

// Executor injection is for local unit tests, never exposed as CLI configuration.
export async function runStages(stages, { output, source, signal, executor = executeStage }) {
  const manifest = { schemaVersion: 1, status: 'running', startedAt: new Date().toISOString(), source,
    runtime: { node: process.version, executable: process.execPath, platform: process.platform, arch: process.arch },
    environment: offlineEnv, gates: unrunGates.map(id => ({ id, status: 'not-run' })),
    stages: stages.map(stage => ({ ...stage, status: 'not-run' })) };
  await atomicJSON(output, 'manifest.json', manifest);
  for (const stage of manifest.stages) {
    if (signal?.aborted) { manifest.status = 'cancelled'; break; }
    stage.status = 'running'; stage.startedAt = new Date().toISOString();
    await atomicJSON(output, 'manifest.json', manifest);
    try { Object.assign(stage, await executor(stage, { output, signal })); }
    catch (error) { Object.assign(stage, { status: 'failed', cleanup: 'uncertain', error: error.message }); }
    stage.finishedAt = new Date().toISOString();
    await atomicJSON(output, 'manifest.json', manifest);
    if (stage.status !== 'succeeded' || stage.cleanup !== 'settled') {
      manifest.status = stage.status === 'cancelled' ? 'cancelled' : 'failed'; break;
    }
  }
  if (manifest.status === 'running') manifest.status = 'succeeded';
  if (manifest.stages.some(stage => stage.cleanup === 'uncertain')) manifest.status = 'cleanup-uncertain';
  manifest.finishedAt = new Date().toISOString();
  await atomicJSON(output, 'manifest.json', manifest);
  if (manifest.status !== 'cleanup-uncertain') {
    try { await atomicJSON(output, 'result.json', manifest, false); }
    catch (error) {
      manifest.status = 'publication-failed';
      manifest.publicationError = error.message;
      await atomicJSON(output, 'manifest.json', manifest);
      throw error;
    }
  }
  return manifest;
}

async function main(args) {
  if (args.length === 1 && ['--plan', '--list'].includes(args[0])) {
    console.log(JSON.stringify({ stages: await plan(), environment: offlineEnv, unrunGates }, null, 2)); return;
  }
  if (args.length !== 2 || args[0] !== '--output' || !args[1]) throw new Error('Usage: node tools/verify-offline-checkpoint.mjs --plan | --output NEW_DIRECTORY');
  if (process.platform === 'win32') throw new Error('POSIX host required');
  const git = args => execFileSync('git', args, { cwd: root, env: { ...process.env, ...offlineEnv }, encoding: 'utf8', timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
  const source = { root, head: git(['rev-parse', 'HEAD']).trim(), statusPorcelain: git(['status', '--porcelain=v1', '--untracked-files=all']) };
  source.dirty = source.statusPorcelain.length !== 0;
  const output = await createOutput(args[1]);
  const controller = new AbortController();
  const handlers = Object.fromEntries(['SIGINT', 'SIGTERM', 'SIGHUP'].map(sig => [sig, () => controller.abort(sig)]));
  for (const [sig, handler] of Object.entries(handlers)) process.on(sig, handler);
  try {
    const result = await runStages(await plan(output), { output, source, signal: controller.signal });
    console.log(`${result.status}: ${output}`);
    process.exitCode = result.status === 'succeeded' ? 0 : 1;
  } finally { for (const [sig, handler] of Object.entries(handlers)) process.removeListener(sig, handler); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
