import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inspectControlFlow } from '../tools/inspect-control-flow.mjs';
import { digest } from '../tools/reverse-engineering/elf-control-flow.mjs';
const root = resolve(import.meta.dirname, '..');
test('actual pinned REA workflow retains verified reports, cleans snapshot and refuses overwrite', { skip: process.env.APEX_REA_INTEGRATION !== '1' }, () => {
  const temp = mkdtempSync(join(tmpdir(), 'apex-rea-flow-integration-'));
  try {
    const target = join(temp, 'owned.elf'), out = join(temp, 'evidence');
    const compilation = spawnSync('gcc', ['-std=c11', '-O2', '-I', join(root, 'firmware/core'), join(root, 'firmware/core/apex.c'), join(root, 'firmware/host/main.c'), '-o', target], { encoding: 'utf8', timeout: 15000 });
    assert.equal(compilation.status, 0, compilation.stderr);
    const before = digest(readFileSync(target)), summary = inspectControlFlow(target, out);
    assert.equal(summary.artifactSha256, before); assert.equal(summary.targetExecuted, false); assert.equal(digest(readFileSync(target)), before);
    const report = JSON.parse(readFileSync(join(out, 'control-flow.json'), 'utf8'));
    assert.equal(report.functions.length, 6); assert.equal(report.engine.rea, '6.8.0');
    assert.equal(report.targetExecuted, false); assert.equal(report.decompilationPerformed, false);
    assert(!existsSync(report.analysisInput.snapshotPath));
    const manifestBytes = readFileSync(join(out, 'manifest.json'));
    for (const f of JSON.parse(manifestBytes).files) {
      const bytes = readFileSync(join(out, f.file)); assert.equal(digest(bytes), f.sha256); assert.equal(bytes.length, f.bytes);
    }
    assert.throws(() => inspectControlFlow(target, out), /EEXIST/);
    assert.deepEqual(readFileSync(join(out, 'manifest.json')), manifestBytes);
    const stripped = join(temp, 'stripped.elf');
    const stripping = spawnSync('strip', ['--strip-all', '-o', stripped, target], { encoding: 'utf8', timeout: 10000 }); assert.equal(stripping.status, 0);
    assert.throws(() => inspectControlFlow(stripped, join(temp, 'unsupported')), /Stripped/);
    assert(!existsSync(join(temp, 'unsupported')));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
