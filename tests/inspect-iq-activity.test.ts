import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { inspectIqActivityCli } from '../tools/inspect-iq-activity.ts';

test('activity CLI explicit options, source and actual malformed/size/nonregular refusals', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'apex-iq-activity-'));
  try {
    const meta = join(dir, 'meta'), data = join(dir, 'data');
    const metadata = JSON.stringify({ global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024 }, captures: [{ 'core:sample_start': 0, 'core:frequency': 1e6 }], annotations: [] });
    const flags = ['--window-samples', '256', '--start-sample', '0', '--hop-samples', '256', '--frame-count', '2', '--threshold-numerator', '0', '--threshold-denominator', '1'];
    await writeFile(meta, metadata); await writeFile(data, new Uint8Array(2048));
    const report = JSON.parse(await inspectIqActivityCli([meta, data, ...flags]));
    const cliPath = fileURLToPath(new URL('../tools/inspect-iq-activity.ts', import.meta.url));
    const child = spawnSync(process.execPath, [cliPath, meta, data, ...flags], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).frames.length, 2);
    const refused = spawnSync(process.execPath, [cliPath, meta, data], { encoding: 'utf8' });
    assert.equal(refused.status, 1); assert.equal(refused.stdout, ''); assert.match(refused.stderr, /Usage:/);
    assert.equal(report.frames.length, 2); assert.equal(report.processedCells, 512);
    assert.equal(report.source.context.origin, 'external-file');
    assert.equal(report.source.acquisition, 'offline import; acquisition not verified');
    assert.equal(report.source.dataLength, 2048);
    for (const args of [[], [meta], [meta, data], [meta, data, ...flags, 'extra'], [meta, data, ...flags.slice(0, 6), '--fft-size', '256', ...flags.slice(8)],
      [meta, data, ...flags.slice(0, 6), '--frame-count', '-1', ...flags.slice(8)],
      [meta, data, ...flags.slice(0, 6), '--frame-count', '3', ...flags.slice(8)]]) await assert.rejects(inspectIqActivityCli(args));
    for (const [index, value] of [[1, '4097'], [7, '257'], [9, '-1'], [11, '0'], [9, '9'.repeat(129)], [3, '9007199254740992'], [5, '1.5']] as const) {
      const invalid = [...flags]; invalid[index] = value;
      await assert.rejects(inspectIqActivityCli([meta, data, ...invalid]));
    }
    const duplicate = [...flags]; duplicate[10] = '--threshold-numerator';
    await assert.rejects(inspectIqActivityCli([meta, data, ...duplicate]));
    assert.deepEqual(report.frames[0].meanSquaredCounts, { numerator: '0', denominator: '256' });
    assert.deepEqual(report.runs, []);
    await assert.rejects(inspectIqActivityCli([dir, data, ...flags]));
    const link = join(dir, 'link'); await symlink(data, link);
    await assert.rejects(inspectIqActivityCli([meta, link, ...flags]));
    await writeFile(meta, new Uint8Array([0xff]));
    await assert.rejects(inspectIqActivityCli([meta, data, ...flags]));
    await writeFile(meta, new Uint8Array(65537));
    await assert.rejects(inspectIqActivityCli([meta, data, ...flags]));
    await writeFile(meta, metadata); await writeFile(data, new Uint8Array(262145));
    await assert.rejects(inspectIqActivityCli([meta, data, ...flags]));
    await writeFile(data, new Uint8Array(0));
    await assert.rejects(inspectIqActivityCli([meta, data, ...flags]));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
