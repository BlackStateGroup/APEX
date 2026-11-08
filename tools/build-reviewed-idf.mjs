import { spawn } from 'node:child_process';
import { mkdir, lstat, realpath, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { waitForProcessGroup } from './native-process-group.mjs';

export const IDF = 'fff9895c82d744c7237be8847347bdd1b07c6643';
export const NIMBLE = '139cada0ae932957fa06ba37d17e3c9c2c95c773';
export const maxOutputBytes = 8 * 1024 * 1024;
const target = 'firmware/esp32s3-reviewed';
const option = 'CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function parseArgs(args) {
  const result = { mode: 'default-off' };
  for (let i = 0; i < args.length; i += 2) {
    const key = { '--output': 'output', '--sdk': 'sdk', '--mode': 'mode' }[args[i]];
    if (!key || !args[i + 1] || (key !== 'mode' && result[key])) throw new Error('Only --output NEW_DIR --sdk EXISTING_IDF [--mode default-off|explicit-on] accepted; no install, flash, monitor, run or extra commands');
    if (key === 'mode' && args.slice(0, i).includes('--mode')) throw new Error('Duplicate mode');
    result[key] = args[i + 1];
  }
  if (!result.output || !result.sdk || !['default-off', 'explicit-on'].includes(result.mode)) throw new Error('Missing paths or invalid mode');
  return result;
}

// POSIX process-group cleanup, not a sandbox: escaped descendants, SIGKILL of
// this supervisor, malicious build scripts and hostile filesystem races remain
// outside the contract. No commands are passed through a shell.
export async function runCommand(command, args, { cwd, env, timeoutMs = 30 * 60 * 1000, onSpawn = async () => {} } = {}) {
  if (process.platform === 'win32') throw new Error('POSIX builder required');
  const result = { command, args, cwd, status: 'failed', exitCode: null, signal: null, cleanup: 'unrun', stdout: '', stderr: '' };
  const chunks = { stdout: [], stderr: [] };
  result.maxOutputBytes = maxOutputBytes;
  result.output = Object.fromEntries(['stdout', 'stderr'].map(name => [name, { observedBytes: 0, retainedBytes: 0, truncated: false }]));
  let child, timer, killTimer, failure, metadata;
  const signal = name => { if (child?.pid) try { process.kill(-child.pid, name); } catch (e) { if (e.code !== 'ESRCH') failure = e.message; } };
  const stop = reason => { failure ??= reason; signal('SIGTERM'); killTimer ??= setTimeout(() => signal('SIGKILL'), 250); };
  const handlers = Object.fromEntries(['SIGINT', 'SIGTERM', 'SIGHUP'].map(s => [s, () => stop(`Interrupted ${s}`)]));
  for (const [s, fn] of Object.entries(handlers)) process.on(s, fn);
  try {
    await new Promise(done => {
      child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      result.pid = child.pid ?? null; result.processGroup = child.pid ?? null;
      metadata = Promise.resolve().then(() => onSpawn({ pid: result.pid, processGroup: result.processGroup })).catch(error => stop('Ownership recording failed: ' + error.message));
      timer = setTimeout(() => stop('Timeout'), timeoutMs);
      for (const stream of ['stdout', 'stderr']) child[stream].on('data', bytes => {
        const capture = result.output[stream];
        capture.observedBytes += bytes.length;
        const kept = bytes.subarray(0, Math.max(0, maxOutputBytes - capture.retainedBytes));
        if (kept.length) chunks[stream].push(Buffer.from(kept));
        capture.retainedBytes += kept.length;
        if (kept.length !== bytes.length) { capture.truncated = true; stop('Output limit'); }
      });
      child.on('error', e => { failure = e.message; });
      child.on('exit', () => { signal('SIGTERM'); killTimer ??= setTimeout(() => signal('SIGKILL'), 250); });
      child.on('close', (code, sig) => { result.exitCode = code; result.signal = sig; done(); });
    });
    await metadata;
    if (child.pid) await waitForProcessGroup(child.pid, { timeoutMs: 6000 });
    result.cleanup = 'succeeded';
  } catch (e) { failure = e.message; result.cleanup = 'failed'; }
  finally { clearTimeout(timer); clearTimeout(killTimer); for (const [s, fn] of Object.entries(handlers)) process.off(s, fn); }
  for (const stream of ['stdout', 'stderr']) {
    const raw = Buffer.concat(chunks[stream], result.output[stream].retainedBytes);
    result.output[stream].rawBase64 = raw.toString('base64');
    // Decode once after concatenation, never per chunk. Raw bytes are canonical;
    // malformed UTF-8 is replaced only in this bounded diagnostic text view.
    const rendered = Buffer.from(raw.toString('utf8'));
    result[stream] = new TextDecoder().decode(rendered.subarray(0, maxOutputBytes), { stream: true });
    result.output[stream].textTruncated = rendered.length > maxOutputBytes;
    result.output[stream].textBytes = Buffer.byteLength(result[stream]);
  }
  result.status = !failure && result.exitCode === 0 && result.cleanup === 'succeeded' ? 'succeeded' : 'failed';
  if (failure) result.error = failure;
  return result;
}

async function noAliases(path) {
  const absolute = resolve(path);
  if (/[;\r\n]/.test(absolute)) throw new Error('CMake list/newline path refused');
  let cursor = absolute;
  while (true) {
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error(`Symlink refused: ${cursor}`);
    if (dirname(cursor) === cursor) break;
    cursor = dirname(cursor);
  }
  if (await realpath(absolute) !== absolute) throw new Error('Path alias refused');
  return absolute;
}
const inside = (path, parent) => path === parent || path.startsWith(parent + sep);
async function files(path, prefix = '') {
  const out = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = join(prefix, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error(`Nonregular artifact: ${name}`);
    if (entry.isDirectory()) out.push(...await files(join(path, entry.name), name));
    else out.push(name);
  }
  return out.sort();
}
export async function buildReviewed({ output, sdk, mode = 'default-off', root = resolve(dirname(fileURLToPath(import.meta.url)), '..') }, run = runCommand) {
  if (!['default-off', 'explicit-on'].includes(mode)) throw new Error('Invalid mode');
  root = await noAliases(root); sdk = await noAliases(sdk);
  output = resolve(output);
  if (/[;\r\n]/.test(output)) throw new Error('CMake list/newline path refused');
  await noAliases(dirname(output));
  if (inside(output, root) || inside(output, sdk) || inside(root, output) || inside(sdk, output)) throw new Error('Output must be outside source and SDK');
  await mkdir(output, { mode: 0o700 }); // exclusive; never reuse/delete prior evidence
  await writeFile(join(output, 'owner.json'), JSON.stringify({ supervisorPid: process.pid, root, sdk, mode, target, started: new Date().toISOString(), note: 'Missing result.json means interrupted/incomplete. Inspect command records and processes; never automatically reclaim output.' }, null, 2), { flag: 'wx' });
  await mkdir(join(output, 'commands'));
  const report = { schema: 1, mode, target, status: 'failed', stages: { provenance: 'unrun', snapshot: 'unrun', configure: 'unrun', compile: 'unrun', evidence: 'unrun' }, commands: [], requested: { [option]: mode === 'explicit-on', CONFIG_IDF_TARGET: 'esp32s3', CONFIG_BT_NIMBLE_USE_ESP_TIMER: true }, imageBindingVerified: false, sourceReview: 'open; separate gate', deviceExecution: 'unrun', artifacts: [] };
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'IDF_TOOLS_PATH', 'IDF_PYTHON_ENV_PATH'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, { IDF_PATH: sdk, IDF_TARGET: 'esp32s3', IDF_COMPONENT_MANAGER: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' });
  // Existing provisioned tool PATH is inherited but never recorded. No export,
  // install, dependency acquisition or device command is performed here.
  const command = async (exe, args, cwd) => {
    const prefix = join(output, 'commands', String(report.commands.length).padStart(4, '0'));
    await writeFile(prefix + '.started.json', JSON.stringify({ stage, command: exe, args, cwd, status: 'started', supervisorPid: process.pid }, null, 2), { flag: 'wx' });
    const result = await run(exe, args, { cwd, env, onSpawn: async owner => { await writeFile(prefix + '.spawned.json', JSON.stringify(owner, null, 2), { flag: 'wx' }); } });
    await writeFile(prefix + '.finished.json', JSON.stringify(result, null, 2), { flag: 'wx' });
    report.commands.push(result);
    if (result.status !== 'succeeded' || result.cleanup !== 'succeeded') throw new Error(`Command failed: ${exe}`);
    return result.stdout.trim();
  };
  let stage = 'provenance';
  try {
    const git = (path, ...args) => command('git', ['-C', path, ...args], root);
    const identity = async path => {
      await noAliases(path);
      if (await git(path, 'rev-parse', '--show-toplevel') !== path) throw new Error('Not exact Git worktree: ' + path);
      return { head: await git(path, 'rev-parse', 'HEAD'), status: await git(path, 'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none') };
    };
    report.identities = { source: await identity(root), sdk: await identity(sdk), nimble: await identity(join(sdk, 'components/bt/host/nimble/nimble')) };
    if (Object.values(report.identities).some(x => x.status !== '') || report.identities.sdk.head !== IDF || report.identities.nimble.head !== NIMBLE) throw new Error('Dirty source/SDK or provenance mismatch');
    const gitlink = await git(sdk, 'ls-tree', 'HEAD', '--', 'components/bt/host/nimble/nimble');
    if (gitlink !== `160000 commit ${NIMBLE}\tcomponents/bt/host/nimble/nimble`) throw new Error('SDK NimBLE gitlink mismatch');
    report.submodules = await git(sdk, 'submodule', 'status', '--recursive');
    if (!report.submodules || report.submodules.split('\n').some(line => /^[+\-U]/.test(line))) throw new Error('SDK submodule missing/mismatched');
    await noAliases(join(sdk, 'tools/idf.py'));
    report.stages.provenance = 'succeeded'; stage = 'snapshot';
    const list = (await git(root, 'ls-files', '-z', '--', 'firmware/core', 'firmware/esp32s3', target)).split('\0').filter(Boolean);
    if (!list.includes(`${target}/CMakeLists.txt`)) throw new Error('Derivative target missing');
    report.sources = [];
    for (const path of list) {
      if (path.endsWith('/sdkconfig') || path.includes('/build/') || path.includes('/managed_components/')) throw new Error('Generated source/config refused');
      const from = join(root, path); await noAliases(from);
      if (!(await lstat(from)).isFile()) throw new Error('Nonregular source');
      const bytes = await readFile(from); report.sources.push({ path, sha256: hash(bytes) });
      const to = join(output, 'source', path); await mkdir(dirname(to), { recursive: true }); await writeFile(to, bytes, { flag: 'wx' });
    }
    report.stages.snapshot = 'succeeded'; stage = 'configure';
    const project = join(output, 'source', target), config = join(output, 'sdkconfig');
    const defaults = join(output, 'sdkconfig.defaults');
    await writeFile(defaults, (await readFile(join(project, 'sdkconfig.defaults'), 'utf8')) + `\n${mode === 'explicit-on' ? option + '=y' : '# ' + option + ' is not set'}\nCONFIG_BT_NIMBLE_USE_ESP_TIMER=y\n`, { flag: 'wx' });
    const args = [join(sdk, 'tools/idf.py'), '-C', project, '-B', join(output, 'build'), '-D', `SDKCONFIG=${config}`, '-D', `SDKCONFIG_DEFAULTS=${defaults}`, '-D', 'IDF_TARGET=esp32s3'];
    await command('python3', [...args, 'reconfigure'], project);
    const effective = await readFile(config, 'utf8');
    report.effective = Object.fromEntries([option, 'CONFIG_IDF_TARGET', 'CONFIG_BT_ENABLED', 'CONFIG_BT_NIMBLE_ENABLED', 'CONFIG_BT_NIMBLE_USE_ESP_TIMER'].map(key => [key, effective.split('\n').find(line => line.startsWith(key + '=') || line === '# ' + key + ' is not set') ?? null]));
    const expected = { [option]: mode === 'explicit-on' ? `${option}=y` : `# ${option} is not set`, CONFIG_IDF_TARGET: 'CONFIG_IDF_TARGET="esp32s3"', CONFIG_BT_ENABLED: 'CONFIG_BT_ENABLED=y', CONFIG_BT_NIMBLE_ENABLED: 'CONFIG_BT_NIMBLE_ENABLED=y', CONFIG_BT_NIMBLE_USE_ESP_TIMER: 'CONFIG_BT_NIMBLE_USE_ESP_TIMER=y' };
    if (Object.entries(expected).some(([key, value]) => report.effective[key] !== value || effective.split('\n').filter(line => line.startsWith(key + '=') || line === '# ' + key + ' is not set').length !== 1)) throw new Error('Effective configuration mismatch');
    report.stages.configure = 'succeeded'; stage = 'compile';
    await command('python3', [...args, 'build'], project);
    report.stages.compile = 'succeeded'; stage = 'evidence';
    if (await readFile(config, 'utf8') !== effective) throw new Error('Configuration changed during build');
    const header = await readFile(join(output, 'build/config/sdkconfig.h'), 'utf8');
    report.effectiveHeader = {};
    for (const [key, value] of Object.entries(expected)) {
      const lines = header.split('\n').filter(line => new RegExp('^#\\s*(?:define|undef)\\s+' + key + '(?:\\s|$)').test(line));
      const wanted = value.startsWith('# ') ? [] : [`#define ${key} ${key === 'CONFIG_IDF_TARGET' ? '"esp32s3"' : '1'}`];
      report.effectiveHeader[key] = lines;
      if (JSON.stringify(lines) !== JSON.stringify(wanted)) throw new Error('Generated header mismatch: ' + key);
    }
    const artifacts = await files(join(output, 'build')); 
    for (const required of ['apex_accessory_reviewed.elf', 'apex_accessory_reviewed.bin', 'apex_accessory_reviewed.map', 'config/sdkconfig.h']) if (!artifacts.includes(required) || (await lstat(join(output, 'build', required))).size === 0) throw new Error(`Missing/empty artifact ${required}`);
    // Check source and SDK cleanliness/identity again, rather than assuming a
    // build did not modify its inputs. Snapshot bytes are checked below too.
    for (const [key, path] of [['source', root], ['sdk', sdk], ['nimble', join(sdk, 'components/bt/host/nimble/nimble')]]) {
      if (JSON.stringify(await identity(path)) !== JSON.stringify(report.identities[key])) throw new Error(`Identity changed: ${key}`);
    }
    for (const entry of report.sources) if (hash(await readFile(join(output, 'source', entry.path))) !== entry.sha256) throw new Error('Snapshot changed');
    report.stages.evidence = 'succeeded'; report.status = 'succeeded';
  } catch (error) { report.stages[stage] = 'failed'; report.error = error.message; }
  // Preserve failed partial outputs too. No cleanup deletes build evidence.
  try { for (const path of await files(output)) report.artifacts.push({ path, sha256: hash(await readFile(join(output, path))) }); }
  catch (error) { report.status = 'failed'; report.artifactError = error.message; report.stages.evidence = 'failed'; }
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await buildReviewed(parseArgs(process.argv.slice(2))); console.log(`Build-only ${result.status}: ${resolve(process.argv.slice(2)[process.argv.slice(2).indexOf('--output') + 1])}/result.json`); if (result.status !== 'succeeded') process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
