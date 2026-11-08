import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectIqTimeFrequencyCli } from '../tools/inspect-iq-time-frequency.ts';

test('time-frequency CLI explicit options, source and actual malformed/size/nonregular refusals', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'apex-iq-time-'));
  try {
    const meta = join(dir, 'meta'), data = join(dir, 'data');
    const metadata = JSON.stringify({ global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024 }, captures: [{ 'core:sample_start': 0, 'core:frequency': 1e6 }], annotations: [] });
    const flags = ['--fft-size', '256', '--start-sample', '0', '--hop-samples', '256', '--frame-count', '2'];
    await writeFile(meta, metadata); await writeFile(data, new Uint8Array(2048));
    const report = JSON.parse(await inspectIqTimeFrequencyCli([meta, data, ...flags]));
    assert.equal(report.frames.length, 2); assert.equal(report.cellCount, 512);
    assert.equal(report.source.context.origin, 'external-file');
    assert.equal(report.source.acquisition, 'offline import; acquisition not verified');
    assert.equal(report.source.dataLength, 2048);
    for (const args of [[], [meta], [meta, data], [meta, data, ...flags, 'extra'], [meta, data, ...flags.slice(0, 6), '--fft-size', '256'],
      [meta, data, ...flags.slice(0, 6), '--frame-count', '-1'], [meta, data, ...flags.slice(0, 6), '--frame-count', '65'],
      [meta, data, ...flags.slice(0, 6), '--frame-count', '3']]) await assert.rejects(inspectIqTimeFrequencyCli(args));
    await assert.rejects(inspectIqTimeFrequencyCli([dir, data, ...flags]));
    const link = join(dir, 'link'); await symlink(data, link);
    await assert.rejects(inspectIqTimeFrequencyCli([meta, link, ...flags]));
    await writeFile(meta, new Uint8Array([0xff]));
    await assert.rejects(inspectIqTimeFrequencyCli([meta, data, ...flags]));
    await writeFile(meta, new Uint8Array(65537));
    await assert.rejects(inspectIqTimeFrequencyCli([meta, data, ...flags]));
    await writeFile(meta, metadata); await writeFile(data, new Uint8Array(262145));
    await assert.rejects(inspectIqTimeFrequencyCli([meta, data, ...flags]));
    await writeFile(data, new Uint8Array(0));
    await assert.rejects(inspectIqTimeFrequencyCli([meta, data, ...flags]));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
