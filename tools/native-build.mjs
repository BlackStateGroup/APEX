import { inspect } from 'node:util';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { mkdir, rename, rmdir, lstat, writeFile, unlink, readdir } from 'node:fs/promises';
import { basename, dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForProcessGroup } from './native-process-group.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2];
if (!['ios', 'android'].includes(platform)) throw new Error('Expected ios or android');
const source = join(root, 'research/upstream-sources');
// A fixed, exclusive directory also makes abrupt-termination leftovers discoverable.
// Never reclaim it automatically: its owner or parked sources may still be live.
const parking = join(dirname(root), `.${basename(root)}-native-build.lock`);
const parkedSource = join(parking, 'upstream-sources');
let parked = false;
let child;
let processGroup;
let groupUncertain = false;
let owner;
let interrupted;
let interruptDeadline;
let killTimer;
async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function signalChild(signal) {
  if (!child && !processGroup) return;
  try {
    // On POSIX, include prebuild's descendants before putting sources back.
    if (process.platform !== 'win32') process.kill(-processGroup, signal);
    else child.kill(signal);
  } catch (error) { if (error.code !== 'ESRCH') console.error(error); }
}
function interrupt(signal) {
  if (!interrupted) { interrupted = signal; interruptDeadline = performance.now() + 6000; }
  signalChild(signal);
  if ((child || processGroup) && !killTimer) killTimer = setTimeout(() => signalChild('SIGKILL'), 5000);
}
const handlers = Object.fromEntries(['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => [signal, () => interrupt(signal)]));
async function run(args) {
  if (interrupted) throw new Error(`Native build interrupted by ${interrupted}`);
  const done = new Promise(resolve => {
    child = spawn(process.execPath, [join(root, 'node_modules/expo/bin/cli'), ...args], {
      cwd: root, stdio: 'inherit', detached: process.platform !== 'win32',
    });
    processGroup = process.platform !== 'win32' ? child.pid : undefined;
    groupUncertain = processGroup !== undefined;
    let spawnError;
    child.on('error', error => { spawnError = error; });
    // Inherited stdio does NOT make close wait for grandchildren.
    child.on('close', (code, signal) => {
      child = undefined;
      resolve(spawnError ?? (interrupted ? new Error(`Native build interrupted by ${interrupted}`)
        : code !== 0 ? new Error(`Expo exited ${code ?? signal}`) : undefined));
    });
  });
  let metadataError;
  try {
    owner = { ...owner, childPid: child.pid, processGroup, command: args };
    await writeFile(join(parking, 'owner.json'), JSON.stringify(owner, null, 2));
  } catch (error) { metadataError = error; interrupt('SIGTERM'); }
  const commandError = await done;
  let quiescenceError;
  if (processGroup !== undefined) {
    try {
      await waitForProcessGroup(processGroup, { deadlineExtension: () => interruptDeadline });
      groupUncertain = false;
    } catch (error) { quiescenceError = error; }
  }
  clearTimeout(killTimer); killTimer = undefined;
  // Keep the recorded group for recovery when absence could not be established.
  if (!groupUncertain) processGroup = undefined;
  const errors = [metadataError, commandError, quiescenceError].filter(Boolean);
  if (errors.length) throw new AggregateError(errors, 'Native command or process-group safety check failed');
}
try { await mkdir(parking, { mode: 0o700 }); }
catch (error) {
  throw new Error(`Cannot acquire native-build lock ${parking}. Another build or an interrupted build may own it. Inspect it and any upstream-sources inside before manual recovery; do not remove it while a build is running.`, { cause: error });
}
for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler);
let failure;
try {
  owner = { pid: process.pid, root, source, parkedSource };
  await writeFile(join(parking, 'owner.json'), JSON.stringify(owner, null, 2));
  // Expo prebuild recursively renames app.json fixtures. Keep the corpus outside
  // the app until prebuild has stopped. Only a missing source is optional.
  if (await exists(source)) {
    if (process.platform === 'win32') throw new Error('Source parking on Windows is unsupported: process-group containment cannot be verified. Use a POSIX build host or manually arrange corpus isolation before building.');
    await rename(source, parkedSource); parked = true;
  }
  await run(['prebuild', '--platform', platform, '--no-install']);
} catch (error) { failure = error; }
try {
  if (groupUncertain) throw new Error(`Process group ${processGroup} may still have writers. Sources and lock retained; inspect owner.json and stop all build processes before manual recovery.`);
  if (parked) {
    if (await exists(source)) throw new Error(`Restore destination already exists: ${source}`);
    await rename(parkedSource, source);
    parked = false;
  }
  if (!failure) {
    if (!process.argv.includes('--prebuild-only')) await run([`run:${platform}`]);
    else if (interrupted) throw new Error(`Native build interrupted by ${interrupted}`);
  }
} catch (error) {
  failure = failure ? new AggregateError([failure, error], 'Native build failed and restoration or run also failed') : error;
} finally {
  // Keep ambiguous leftovers and their ownership record, even after a failed
  // restore. Never recursively delete this directory or the reference corpus.
  if (!parked && !groupUncertain) {
    try {
      const entries = await readdir(parking);
      if (entries.some(entry => entry !== 'owner.json')) throw new Error(`Unexpected lock contents at ${parking}; ownership record retained for inspection`);
      await unlink(join(parking, 'owner.json'));
      try { await rmdir(parking); }
      catch (error) {
        // If contents appeared during cleanup, restore metadata without replacing anything.
        try { await writeFile(join(parking, 'owner.json'), JSON.stringify(owner, null, 2), { flag: 'wx' }); } catch (metadataError) {
          throw new AggregateError([error, metadataError], 'Lock cleanup failed and ownership record could not be restored');
        }
        throw error;
      }
    } catch (error) { failure = failure ? new AggregateError([failure, error], 'Native build and lock cleanup failed') : error; }
  }
  for (const [signal, handler] of Object.entries(handlers)) process.off(signal, handler);
  clearTimeout(killTimer);
}
if (parked) console.error(`Sources preserved at ${parkedSource}. Stop all build processes, inspect both locations, then manually restore to ${source}. Lock retained at ${parking}.`);
if (interrupted && !failure) failure = new Error(`Native build interrupted by ${interrupted}`);
if (failure) { console.error(inspect(failure, { depth: null })); process.exitCode = interrupted ? { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[interrupted] : 1; }
