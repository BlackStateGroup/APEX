import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
function run(preload = '') {
  return spawnSync(process.execPath, ['--permission', `--allow-fs-read=${fileURLToPath(root)}`,
    '--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'tools/demo-offline-lab.ts'],
  { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 16384,
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1' } });
}

test('independent oracle covers the complete original metadata, not just digest shape', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const metadata = '{"global":{"core:datatype":"ci16_le","core:version":"1.2.6","core:sample_rate":1024,"core:description":"Synthetic digital tone; not an RF capture"},"captures":[{"core:sample_start":0,"core:frequency":1000000}],"annotations":[]}';
  const report = JSON.parse(result.stdout);
  assert.equal(report.phase.sourceHashes.metadataSha256,
    createHash('sha256').update(metadata).digest('hex'));
  assert.equal(report.phase.selections.length, 3);
  for (const selection of report.phase.selections) assert.equal(selection.pairs.length, 2);
});

test('post-analysis serialization exception and size assertion leave stdout empty', () => {
  for (const body of ["throw new Error('review serialization fault')", "return 'x'.repeat(12288)"]) {
    const result = run(`const stringify = JSON.stringify;
      JSON.stringify = function(value, ...args) {
        if (value?.mode === 'offline-synthetic-lab') { ${body}; }
        return stringify.call(this, value, ...args);
      };`);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Offline synthetic walkthrough failed; no success summary emitted. Check fixtures and invariants.\n');
  }
});

test('walkthrough completes with common network entry points trapped and filesystem writes denied', () => {
  const result = run(`import net from 'node:net'; import http from 'node:http';
    import https from 'node:https'; import dgram from 'node:dgram';
    import { syncBuiltinESMExports } from 'node:module';
    let attempted = false;
    const deny = () => { attempted = true; throw new Error('review network trap'); };
    globalThis.fetch = deny; globalThis.WebSocket = deny;
    net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny;
    http.request = deny; http.get = deny; https.request = deny; https.get = deny;
    dgram.createSocket = deny;
    syncBuiltinESMExports();
    process.on('exit', () => { if (attempted) process.exitCode = 97; });`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).status, 'complete');
});
