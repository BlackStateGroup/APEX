import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectMayhemC8Cli } from '../tools/inspect-mayhem-c8.ts';
import { MAYHEM_C8_LIMITS } from '../packages/core/mayhem-c8-import.ts';

const sidecar = 'sample_rate=1024\ncenter_frequency=433920000\nformat=c8 (signed int8 I,Q)\n';

test('CLI converts explicitly selected synthetic file bytes, reports unverified import, and writes no output files', async () => {
  const dir=await mkdtemp(join(tmpdir(),'apex-mayhem-c8-'));
  try {
    const data=join(dir,'synthetic.c8'),meta=join(dir,'synthetic.txt');
    await writeFile(data,new Uint8Array([128,127,0,255]));await writeFile(meta,sidecar);
    const before=await readdir(dir),r=JSON.parse(await inspectMayhemC8Cli([data,meta]));
    assert.equal(r.kind,'mayhem-c8-import-report');assert.equal(r.sourceProfile,'mayhem-c8-text-v1');
    assert.equal(r.recording.context.origin,'external-file');assert.equal(r.recording.sampleCount,2);
    assert.equal(r.verification.acquisitionVerified,false);assert.equal(r.verification.producerVerified,false);
    assert.equal(r.original.dataLength,4);assert.equal(r.recording.dataLength,8);
    assert.deepEqual(r.analysis.statistics.rawI,{minimum:-32768,maximum:0});
    assert.deepEqual(r.analysis.statistics.rawQ,{minimum:-256,maximum:32512});
    assert.deepEqual(await readdir(dir),before);
    assert.equal('getOriginalDataBytes' in r,false);assert.equal('getDataBytes' in r.recording,false);
    const process=spawnSync(globalThis.process.execPath,['tools/inspect-mayhem-c8.ts',data,meta],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:10000});
    assert.equal(process.status,0,process.stderr);assert.equal(JSON.parse(process.stdout).kind,'mayhem-c8-import-report');
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('CLI requires exactly two explicit paths and rejects discovery/options', async () => {
  for (const args of [[],['a'],['a','b','c'],['--help','b'],['a','--scan'],['','b']]) await assert.rejects(inspectMayhemC8Cli(args),/Usage/);
});

test('CLI rejects directories, symlinks, absent, oversized, malformed and partial files', async () => {
  const dir=await mkdtemp(join(tmpdir(),'apex-mayhem-c8-invalid-'));
  try {
    const data=join(dir,'test.c8'),meta=join(dir,'test.txt'),link=join(dir,'link.c8');
    await writeFile(data,new Uint8Array([0,0]));await writeFile(meta,sidecar);await symlink(data,link);
    for (const path of [dir,link,join(dir,'missing.c8')]) await assert.rejects(inspectMayhemC8Cli([path,meta]));
    await writeFile(data,new Uint8Array(MAYHEM_C8_LIMITS.dataBytes+2));await assert.rejects(inspectMayhemC8Cli([data,meta]));
    await writeFile(data,new Uint8Array([0,0,0]));await assert.rejects(inspectMayhemC8Cli([data,meta]),/partial I\/Q/);
    await writeFile(data,new Uint8Array([0,0]));await writeFile(meta,sidecar+'verified=true\n');await assert.rejects(inspectMayhemC8Cli([data,meta]));
    await writeFile(meta,'x'.repeat(MAYHEM_C8_LIMITS.sidecarBytes+1));await assert.rejects(inspectMayhemC8Cli([data,meta]));
    const process=spawnSync(globalThis.process.execPath,['tools/inspect-mayhem-c8.ts',data,meta],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:10000});
    assert.equal(process.status,1);assert.equal(process.stdout,'');assert.match(process.stderr,/bounded/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
