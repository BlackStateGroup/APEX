import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { inspectIqLagCorrelationCli } from '../tools/inspect-iq-lag-correlation.ts';

test('lag-correlation CLI explicit options, source and actual malformed/size/nonregular refusals', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'apex-iq-lag-correlation-'));
  try {
    const meta = join(dir, 'meta'), data = join(dir, 'data');
    const metadata = JSON.stringify({ global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024 }, captures: [{ 'core:sample_start': 0, 'core:frequency': 1e6 }], annotations: [] });
    const flags = ['--window-samples', '256', '--start-sample', '0', '--first-lag', '1', '--lag-step', '1', '--lag-count', '2'];
    await writeFile(meta, metadata); await writeFile(data, new Uint8Array(2048));
    const report = JSON.parse(await inspectIqLagCorrelationCli([meta, data, ...flags]));
    const cliPath = fileURLToPath(new URL('../tools/inspect-iq-lag-correlation.ts', import.meta.url));
    const child = spawnSync(process.execPath, [cliPath, meta, data, ...flags], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).lags.length, 2);
    const refused = spawnSync(process.execPath, [cliPath, meta, data], { encoding: 'utf8' });
    assert.equal(refused.status, 1); assert.equal(refused.stdout, ''); assert.match(refused.stderr, /Usage:/);
    assert.equal(report.lags.length, 2); assert.equal(report.comparedCells, 512);
    assert.equal(report.source.context.origin, 'external-file');
    assert.equal(report.source.acquisition, 'offline import; acquisition not verified');
    assert.equal(report.source.dataLength, 2048);
    for (const args of [[], [meta], [meta, data], [meta, data, ...flags, 'extra']]) await assert.rejects(inspectIqLagCorrelationCli(args));
    for (const [index, value] of [[1, '4097'], [9, '257'], [5, '0'], [7, '-1'], [3, '9007199254740992'], [5, '1.5'], [5, '1e2'], [5, ' 1'], [5, '1\n'], [0, '--unknown'], [9, '9'.repeat(129)], [5, '512']] as const) {
      const invalid = [...flags]; invalid[index] = value;
      await assert.rejects(inspectIqLagCorrelationCli([meta, data, ...invalid]));
    }
    const duplicate = [...flags]; duplicate[8] = '--first-lag';
    await assert.rejects(inspectIqLagCorrelationCli([meta, data, ...duplicate]));
    assert.deepEqual(report.lags[0].normalizedSquaredMagnitude, { status: 'unavailable', reason: 'zero-energy denominator', numerator: '0', denominator: '0' });
    await assert.rejects(inspectIqLagCorrelationCli([join(dir, 'missing'), data, ...flags]));
    await assert.rejects(inspectIqLagCorrelationCli([dir, data, ...flags]));
    const link = join(dir, 'link'); await symlink(data, link);
    await assert.rejects(inspectIqLagCorrelationCli([meta, link, ...flags]));
    await writeFile(meta, new Uint8Array([0xff]));
    await assert.rejects(inspectIqLagCorrelationCli([meta, data, ...flags]));
    await writeFile(meta, new Uint8Array(65537));
    await assert.rejects(inspectIqLagCorrelationCli([meta, data, ...flags]));
    await writeFile(meta, metadata); await writeFile(data, new Uint8Array(262145));
    await assert.rejects(inspectIqLagCorrelationCli([meta, data, ...flags]));
    await writeFile(data, new Uint8Array(0));
    await assert.rejects(inspectIqLagCorrelationCli([meta, data, ...flags]));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
