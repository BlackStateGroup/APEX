import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareIq } from '../../packages/core/iq-offline.ts';
import { analyzeIq as before } from './prior-analysis.ts';
import { analyzeIq as after, analyzeIqTimeFrequency } from '../../packages/core/iq-analysis.ts';
let state = 20261108; const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
let windows = 0;
for (const size of [256, 512, 1024, 2048, 4096] as const) for (let caseIndex=0;caseIndex<10;caseIndex++) {
  const bytes=new Uint8Array((size+31)*4), view=new DataView(bytes.buffer);
  for(let i=0;i<bytes.length/2;i++)view.setInt16(i*2,(random()&65535)-32768,true);
  const metadata=new TextEncoder().encode(JSON.stringify({global:{'core:datatype':'ci16_le','core:version':'1.2.6','core:sample_rate':[1,1024,1000000000][caseIndex%3]},captures:[{'core:sample_start':0,'core:frequency':[-1e12,0,1e12][caseIndex%3]}],annotations:[]}));
  const recording=await prepareIq(metadata,bytes,{schemaVersion:1,origin:'synthetic-fixture',importedAt:'2026-11-08T00:00:00.000Z'},{digest:async(algorithm,data)=>createHash(algorithm==='SHA-256'?'sha256':'sha512').update(data).digest('hex')});
  const start=caseIndex*3;
  const previous=before(recording,{fftSize:size,startSample:start});
  assert.deepEqual(after(recording,{fftSize:size,startSample:start}),previous);
  const frames=analyzeIqTimeFrequency(recording,{fftSize:size,startSample:start,hopSamples:1,frameCount:2});
  for(const frame of frames.frames){
    const single=before(recording,{fftSize:size,startSample:frame.startSample}).spectrum!;
    assert.deepEqual(frame.amplitude,single.bins.map(b=>b.amplitude));
    assert.deepEqual(frame.dbRelativeToUnitAmplitude,single.bins.map(b=>b.dbRelativeToUnitAmplitude));
    assert.deepEqual(frame.displayDb,single.bins.map(b=>b.displayDb));
    windows++;
  }
}
console.log(JSON.stringify({baselineCommit:'7027b8c',singleWindowReportsCompared:50,timeFrequencyWindowsCompared:windows,fftSizes:[256,512,1024,2048,4096],seed:20261108,result:'Exact deep equality for complete pre/post-refactor reports and all frame amplitude/raw-dB/display arrays. This checks refactor parity, not an independent FFT algorithm or physical reception.'},null,2));
