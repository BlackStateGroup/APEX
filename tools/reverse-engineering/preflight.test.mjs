import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectProcessTable, preflight } from './preflight.mjs';
const ok = stdout => ({ status: 0, error: null, stdout, stderr: '' });
test('ownership diagnostic requires current uid and unique pid', () => {
  assert.equal(inspectProcessTable(ok('10 1 10 1000 Sl node'), 10, 1000).ok, true);
  for (const table of ['10 1 10 0 Sl node', '', '10 1 10 1000 Sl node\n10 1 10 1000 Sl node', '10 ? 10 1000 Sl node'])
    assert.equal(inspectProcessTable(ok(table), 10, 1000).ok, false);
});
test('failed ps cannot be treated as success', () => {
  assert.equal(inspectProcessTable({ ...ok('10 1 10 1000 Sl node'), status: 1 }, 10, 1000).ok, false);
});
function fixture({ failedSupervisor = false, healthy = true, version = '6.8.0' } = {}) {
  return preflight({ pid: 10, uid: 1000, nodeVersion: '24.22.1', exists: () => true,
    env: { GHIDRA_INSTALL_DIR: '/engine' }, runner: (cmd, args) => {
      if (cmd === 'ps') return ok('10 1 10 1000 Sl node');
      if (args.includes('list-objdump-architectures')) return ok(JSON.stringify({ provider: { id: 'gnu.objdump' },
        normalized_result: { exit_code: failedSupervisor ? 1 : 0, completion_status: 'complete', output_truncated: false } }));
      if (args.includes('doctor')) return ok(JSON.stringify({ healthy }));
      return ok(args.includes('--version') && cmd === process.execPath ? version : 'tool version');
    } });
}
test('successful probes qualify only for acceptance test', () => {
  const r = fixture(); assert.equal(r.readyForAcceptanceTest, true);
  assert.equal(r.decompilationVerified, false); assert.equal(r.persistenceVerified, false);
});
test('real supervisor failure blocks even if ps diagnostic works', () => {
  const r = fixture({ failedSupervisor: true }); assert.equal(r.readyForAcceptanceTest, false);
  assert.equal(r.checks.some(c => c.name === 'rea-ghidra-doctor'), false);
});
test('unhealthy doctor and version mismatch fail closed', () => {
  assert.equal(fixture({ healthy: false }).readyForAcceptanceTest, false);
  assert.equal(fixture({ version: '6.9.0' }).readyForAcceptanceTest, false);
});
