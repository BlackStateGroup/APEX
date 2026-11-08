import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('restored ESP32 transport: actual C under bounded host fault injection', () => {
  const manifest = JSON.parse(readFileSync('docs/ESP32S3_RESTORATION_MANIFEST.json', 'utf8'));
  for (const entry of manifest.files) {
    const bytes = readFileSync(entry.path);
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
    assert.equal(createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'), entry.git_blob_sha1, entry.path);
  }
  const directory = mkdtempSync(join(tmpdir(), 'apex-esp32-host-'));
  try {
    const binary = join(directory, 'harness');
    const compiler = spawnSync('gcc', [
      '-std=c11', '-Wall', '-Wextra', '-Werror', '-Wno-misleading-indentation',
      '-DESP_PLATFORM', '-Itests/esp32-host/fakes', '-Ifirmware/core',
      'tests/esp32-host/harness.c', 'firmware/core/apex.c', '-o', binary,
    ], { encoding: 'utf8', timeout: 30000 });
    assert.equal(compiler.status, 0, compiler.error?.message ?? compiler.stderr);
    const run = spawnSync(binary, [], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.error?.message ?? run.stderr);
    assert.match(run.stdout, /RESULT 17 scenarios passed/);
    // These are intentionally failing desired safety requirements, NOT regressions fixed.
    for (const [flag, assertion] of [
      ['--require-safe-overflow', '!subscribed'],
      ['--require-safe-retry', 'tx_timer.pending||!subscribed'],
    ] as const) {
      const reproduction = spawnSync(binary, [flag], { encoding: 'utf8', timeout: 10000 });
      assert.equal(reproduction.status, 1, reproduction.stderr);
      assert.ok(reproduction.stderr.includes(assertion), reproduction.stderr);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
