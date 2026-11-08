import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Diagnostic only. Never changes process-ownership/security controls or installs software.
export const PS_ARGS = ['-axo', 'pid=,ppid=,pgid=,uid=,stat=,command='];
export function run(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8', shell: false,
    timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
  return { status: r.status, error: r.error?.code ?? null,
    stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
export function inspectProcessTable(result, pid, uid) {
  if (result.error || result.status !== 0) return { ok: false, reason: 'process-table-query-failed' };
  const rows = result.stdout.split('\n').map(line => line.trim().split(/\s+/));
  const own = rows.filter(row => Number(row[0]) === pid);
  if (own.length !== 1 || own[0].length < 6 || Number(own[0][3]) !== uid ||
      !own[0].slice(0, 4).every(v => /^\d+$/.test(v))) {
    return { ok: false, reason: 'self-ownership-not-observed' };
  }
  return { ok: true, reason: 'diagnostic-only-not-rea-supervision-proof' };
}
export function preflight({ runner = run, exists = existsSync, env = process.env,
  pid = process.pid, uid = process.getuid?.(), nodeVersion = process.versions.node,
  rea = join(dirname(fileURLToPath(import.meta.url)), 'node_modules/rea-agents/scripts/rea.mjs') } = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const [major, minor, patch] = nodeVersion.split('.').map(Number);
  add('node', major === 24 && (minor > 22 || (minor === 22 && patch >= 1)), nodeVersion);
  const ps = runner('ps', PS_ARGS);
  const ownership = inspectProcessTable(ps, pid, uid);
  // Never store the host-wide process list: commands can contain private data.
  add('process-table', ownership.ok, { reason: ownership.reason, status: ps.status,
    error: ps.error, stderr: ps.stderr.slice(0, 1024) });
  for (const command of ['java', 'javac', 'cc', 'objdump']) {
    const executable = env.JAVA_HOME && ['java', 'javac'].includes(command)
      ? join(env.JAVA_HOME, 'bin', command) : command;
    const r = runner(executable, [command === 'java' || command === 'javac' ? '-version' : '--version']);
    add(command, !r.error && r.status === 0, { status: r.status, error: r.error,
      version: (r.stdout || r.stderr).slice(0, 1024) });
  }
  add('ghidra-configured', Boolean(env.GHIDRA_INSTALL_DIR &&
    exists(join(env.GHIDRA_INSTALL_DIR, 'support/analyzeHeadless'))),
    'Installation/path check only; REA doctor validates version, JDK and native engine.');
  if (!exists(rea)) add('rea-version', false, 'Pinned local REA CLI absent; use lockfile npm ci.');
  else {
    const v = runner(process.execPath, [rea, '--version']);
    const pinned = !v.error && v.status === 0 && v.stdout.trim() === '6.8.0';
    add('rea-version', pinned, { status: v.status, error: v.error, version: v.stdout.trim().slice(0, 100) });
    if (pinned) {
      // Target-free real supervisor check; never substitute a direct objdump success.
      const supervised = runner(process.execPath, [rea, 'list-objdump-architectures', '--json']);
      let evidence; try { evidence = JSON.parse(supervised.stdout); } catch {}
      const observed = evidence?.normalized_result;
      const supervisedOK = !supervised.error && supervised.status === 0 &&
        evidence?.provider?.id === 'gnu.objdump' && observed?.exit_code === 0 &&
        observed?.completion_status === 'complete' && observed?.output_truncated === false;
      add('rea-supervised-objdump', supervisedOK,
        { status: supervised.status, error: supervised.error,
          diagnostic: (!supervisedOK ? supervised.stdout + supervised.stderr : '').slice(0, 4096) });
      if (checks.every(c => c.ok)) {
        const doctor = runner(process.execPath, [rea, 'doctor', '--provider', 'ghidra', '--json']);
        let report; try { report = JSON.parse(doctor.stdout); } catch {}
        add('rea-ghidra-doctor', !doctor.error && doctor.status === 0 && report?.healthy === true,
          { status: doctor.status, error: doctor.error, report: report ?? doctor.stderr.slice(0, 4096) });
      }
    }
  }
  return { schemaVersion: 1, checkedAt: new Date().toISOString(),
    readyForAcceptanceTest: checks.every(c => c.ok), decompilationVerified: false,
    persistenceVerified: false, targetExecuted: false, checks };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = preflight();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.readyForAcceptanceTest ? 0 : 1;
}
