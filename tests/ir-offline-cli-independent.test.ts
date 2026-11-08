/** Trusted test-only preloads inject final-stage failures; production remains unchanged. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readBoundedRegularFile } from '../tools/inspect-iq.ts';
import { IR_LIMITS } from '../packages/core/ir-offline.ts';
const source = 'Filetype: IR signals file\nVersion: 1\nname: x\ntype: parsed\nprotocol: NEC\naddress: 00 00 00 00\ncommand: 00 00 00 00\n';
const rejection = 'Offline IR inspection rejected input; see docs/IR_OFFLINE.md for the accepted subset.';
function run(path: string, directory: string, preload = '') {
  return spawnSync(process.execPath, ['--permission', `--allow-fs-read=${resolve('.')}`, `--allow-fs-read=${directory}`,
    '--import', `data:text/javascript,${encodeURIComponent(preload)}`,
    'tools/inspect-ir-offline.ts', path, '--provenance', 'synthetic-fixture'], { encoding: 'utf8', maxBuffer: IR_LIMITS.output + 8192 });
}
for (const mode of ['serialization', 'output-budget', 'sha256'] as const) {
  test(`actual CLI ${mode} failure is atomic under denied writes`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ir-cli-stage-'));
    try {
      const path = join(directory, 'valid.ir'); await writeFile(path, source);
      // Verify write denial in the same process in which the failure is injected.
      const permissionProbe = `import {writeFileSync} from 'node:fs';
        try {writeFileSync(${JSON.stringify(join(directory, 'must-not-exist'))}, 'x'); throw Error('WRITE_UNEXPECTEDLY_ALLOWED');}
        catch (e) {if (e.code !== 'ERR_ACCESS_DENIED') throw e; process.stderr.write('WRITE_DENIED\\n');}`;
      const stage = mode === 'sha256'
        ? `Object.defineProperty(globalThis.crypto.subtle, 'digest', {value: async function(algorithm, bytes) {
             if (algorithm !== 'SHA-256' || bytes.byteLength !== ${Buffer.byteLength(source)}) throw Error('WRONG_DIGEST_TARGET');
             process.stderr.write('TARGET_SHA256\\n'); throw Error('INJECTED_SHA256_FAILURE');
           }});`
        : `const originalStringify = JSON.stringify;
           JSON.stringify = function(value, ...args) {
             if (value && value.kind === 'offline-ir-file') {
               if (value.originalSource !== ${JSON.stringify(source)} || !/^[a-f0-9]{64}$/.test(value.sha256)) throw Error('WRONG_SERIALIZATION_TARGET');
               process.stderr.write('TARGET_${mode.toUpperCase()}\\n');
               ${mode === 'serialization' ? "throw Error('INJECTED_SERIALIZATION_FAILURE');" : `return 'x'.repeat(${IR_LIMITS.output});`}
             }
             return originalStringify.call(this, value, ...args);
           };`;
      const result = run(path, directory, permissionProbe + stage);
      assert.equal(result.error, undefined); assert.equal(result.signal, null);
      assert.equal(result.status, 1, result.stderr); assert.equal(result.stdout, '');
      assert.equal(result.stderr, `WRITE_DENIED\nTARGET_${mode.toUpperCase()}\n${rejection}\n`);
      // The output probe returns exactly the byte cap, which must fail because CLI adds LF.
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}
test('shared reader rejects final symlinks but permits symlinked ancestor directories', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ir-cli-symlink-'));
  try {
    const real = join(directory, 'real'), alias = join(directory, 'ancestor-alias');
    await mkdir(real); const path = join(real, 'source.ir'); await writeFile(path, source);
    await symlink(real, alias, 'dir');
    const finalAlias = join(directory, 'final-alias.ir'); await symlink(path, finalAlias);
    const throughAncestor = join(alias, 'source.ir');
    assert.equal(Buffer.from(await readBoundedRegularFile(throughAncestor, IR_LIMITS.bytes)).toString(), source);
    await assert.rejects(readBoundedRegularFile(finalAlias, IR_LIMITS.bytes), /not a symlink/);
    const ancestorResult = run(throughAncestor, directory);
    assert.equal(ancestorResult.status, 0, ancestorResult.stderr);
    assert.equal(JSON.parse(ancestorResult.stdout).originalSource, source);
    const finalResult = run(finalAlias, directory);
    assert.equal(finalResult.status, 1, finalResult.stderr); assert.equal(finalResult.stdout, '');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
