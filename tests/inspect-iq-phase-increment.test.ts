import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { inspectIqPhaseIncrementCli } from '../tools/inspect-iq-phase-increment.ts';

test('phase-increment CLI explicit options, source and actual malformed/size/nonregular refusals', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'apex-iq-phase-increment-'));
  try {
    const meta = join(dir, 'meta'), data = join(dir, 'data');
    const metadata = JSON.stringify({ global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024 }, captures: [{ 'core:sample_start': 0, 'core:frequency': 1e6 }], annotations: [] });
    const flags = ['--start-sample', '0', '--lag', '1', '--step', '1', '--count', '2'];
    await writeFile(meta, metadata); await writeFile(data, new Uint8Array(2048));
    const report = JSON.parse(await inspectIqPhaseIncrementCli([meta, data, ...flags]));
    const cliPath = fileURLToPath(new URL('../tools/inspect-iq-phase-increment.ts', import.meta.url));
    const child = spawnSync(process.execPath, [cliPath, meta, data, ...flags], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).pairs.length, 2);
    const refused = spawnSync(process.execPath, [cliPath, meta, data], { encoding: 'utf8' });
    assert.equal(refused.status, 1); assert.equal(refused.stdout, ''); assert.match(refused.stderr, /Usage:/);
    assert.equal(report.pairs.length, 2); assert.equal(report.aliasSpacingHz, 1024);
    assert.equal(report.source.context.origin, 'external-file');
    assert.equal(report.source.acquisition, 'offline import; acquisition not verified');
    assert.equal(report.source.dataLength, 2048);
    for (const args of [[], [meta], [meta, data], [meta, data, ...flags, 'extra']]) await assert.rejects(inspectIqPhaseIncrementCli(args));
    for (const [index, value] of [[7, '513'], [3, '0'], [5, '-1'], [1, '9007199254740992'], [3, '1.5'], [3, '1e2'], [3, ' 1'], [3, '1\n'], [0, '--unknown'], [7, '9'.repeat(129)], [3, '512']] as const) {
      const invalid = [...flags]; invalid[index] = value;
      await assert.rejects(inspectIqPhaseIncrementCli([meta, data, ...invalid]));
    }
    const duplicate = [...flags]; duplicate[6] = '--lag';
    await assert.rejects(inspectIqPhaseIncrementCli([meta, data, ...duplicate]));
    assert.deepEqual(report.pairs[0].phaseAndFrequency, { status: 'unavailable', reason: 'zero-energy endpoint' });
    await assert.rejects(inspectIqPhaseIncrementCli([join(dir, 'missing'), data, ...flags]));
    await assert.rejects(inspectIqPhaseIncrementCli([dir, data, ...flags]));
    const link = join(dir, 'link'); await symlink(data, link);
    await assert.rejects(inspectIqPhaseIncrementCli([meta, link, ...flags]));
    await writeFile(meta, new Uint8Array([0xff]));
    const malformed = spawnSync(process.execPath, [cliPath, meta, data, ...flags], { encoding: 'utf8' });
    assert.equal(malformed.status, 1); assert.equal(malformed.stdout, ''); assert.notEqual(malformed.stderr, '');
    await assert.rejects(inspectIqPhaseIncrementCli([meta, data, ...flags]));
    await writeFile(meta, new Uint8Array(65537));
    await assert.rejects(inspectIqPhaseIncrementCli([meta, data, ...flags]));
    await writeFile(meta, metadata); await writeFile(data, new Uint8Array(262145));
    await assert.rejects(inspectIqPhaseIncrementCli([meta, data, ...flags]));
    await writeFile(data, new Uint8Array(0));
    await assert.rejects(inspectIqPhaseIncrementCli([meta, data, ...flags]));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
