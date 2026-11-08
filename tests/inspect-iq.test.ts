import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectIqCli, readBoundedRegularFile } from '../tools/inspect-iq.ts';

test('synthetic CLI requires two bounded regular files and retains external-file origin', async () => {
  const dir=await mkdtemp(join(tmpdir(),'apex-iq-test-'));
  try {
    const metadata=join(dir,'synthetic.sigmf-meta'), data=join(dir,'synthetic.sigmf-data');
    await writeFile(metadata,JSON.stringify({global:{'core:datatype':'ci16_le','core:version':'1.2.6','core:sample_rate':1024,'core:description':'synthetic fixture; live/native/verified claim is not proof'},captures:[{'core:sample_start':0,'core:frequency':1e6}],annotations:[]}));
    await writeFile(data,new Uint8Array(1024));
    const report=JSON.parse(await inspectIqCli([metadata,data,'--fft-size','256']));
    assert.equal(report.context.origin,'external-file'); assert.equal(report.acquisition,'offline import; acquisition not verified');
    assert.equal(report.dataLength,1024); assert.equal(report.dataSha256,'5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef');
    for (const args of [[],[metadata],[metadata,data,'extra'],[metadata,data,'--fft-size','256','--fft-size','256'],[metadata,data,'--start-sample','-1'],[metadata,data,'--fft-size','123'],[metadata,data,'--start-sample','9999999999999999999']]) await assert.rejects(inspectIqCli(args));
    await assert.rejects(readBoundedRegularFile(dir,10)); await assert.rejects(readBoundedRegularFile(data,100));
    const link=join(dir,'link'); await symlink(data,link); await assert.rejects(readBoundedRegularFile(link,2048));
    const empty=join(dir,'empty'); await writeFile(empty,''); await assert.rejects(readBoundedRegularFile(empty,10));
    await assert.rejects(readBoundedRegularFile(data,NaN)); await assert.rejects(readBoundedRegularFile(data,262145));
    assert.equal((await readBoundedRegularFile(data,1024)).length,1024);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
