import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pairedExample } from '../src/fixtures/paired-example.ts';
function fixture(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'apex-paired-cli-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const run = (mode: string, path: string) => spawnSync(process.execPath, ['tools/inspect-paired-observations.ts', mode, path], { encoding: 'utf8', timeout: 10000, maxBuffer: 131072 });
test('offline CLI replays the dataset and binds a learned profile to its exact bytes', () => fixture(dir => {
  const path = join(dir, 'dataset.json'), text = pairedExample(); writeFileSync(path, text);
  const replay = run('replay', path); assert.equal(replay.status, 0, replay.stderr); assert.equal(JSON.parse(replay.stdout).counts.paired, 24);
  const learned = run('learn', path); assert.equal(learned.status, 0, learned.stderr);
  assert.equal(JSON.parse(learned.stdout).profile.sourceSha256, createHash('sha256').update(text).digest('hex'));
}));
test('offline CLI rejects oversized, invalid UTF-8 and non-regular sources without returning a result', () => fixture(dir => {
  for (const [name, bytes] of [['over-limit', Buffer.alloc(65537)], ['invalid-utf8', Buffer.from([0xff, 0xfe])]] as const) {
    const path = join(dir, name); writeFileSync(path, bytes); const result = run('learn', path);
    assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.signal, null);
  }
  const directory = run('replay', dir); assert.notEqual(directory.status, 0); assert.equal(directory.stdout, '');
  const unknown = run('unknown-mode', join(dir, 'absent')); assert.notEqual(unknown.status, 0); assert.match(unknown.stderr, /Usage/);
}));
