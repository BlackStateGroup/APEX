import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IqController} from '../src/iq-workbench.ts';
import type {IqActivityField} from '../src/iq-workbench.ts';
function fixture(pairs:readonly (readonly [number,number])[],sha=false){
 const data=new Uint8Array(pairs.length*4),v=new DataView(data.buffer); pairs.forEach(([i,q],k)=>{v.setInt16(k*4,i,true);v.setInt16(k*4+2,q,true);});
 const metadata=new TextEncoder().encode(JSON.stringify({global:{'core:datatype':'ci16_le','core:version':'1.2.6','core:sample_rate':8,...(sha?{'core:sha512':createHash('sha512').update(data).digest('hex')}:{})},captures:[{'core:sample_start':0,'core:frequency':0}],annotations:[]}));
 let reads=0,hashes=0;const c=new IqController(true,{digest:async(a,b)=>{hashes++;return createHash(a==='SHA-256'?'sha256':'sha512').update(b).digest('hex');}});
 for(const side of ['metadata','data'] as const){const b={metadata,data}[side];c.stageFile(side,{name:side,size:b.length,arrayBuffer:async()=>{reads++;return b.slice().buffer;}},c.lease,c.state);}
 c.windowMode('activity',c.lease,c.state);const set=(field:IqActivityField,t:string)=>c.activitySetting(field,t,c.lease,c.state);set('windowSamples','1');set('hopSamples','1');set('frameCount',String(pairs.length));
 return {c,set,data,metadata,counts:()=>({reads,hashes})};
}
test('activity exact integer/rational arithmetic and full-source hashes remain separate from spectra',async()=>{
 const f=fixture([[-32768,-32768],[32767,32767],[3,-4],[0,0]],true);await f.c.inspect(f.c.lease,f.c.state);
 assert.deepEqual(f.c.state.activityFrames.map(f=>f.sumSquaredCounts),['2147483648','2147352578','25','0']);
 assert.deepEqual(f.c.state.activityFrames.map(f=>f.aboveThreshold),[true,true,true,false]);
 assert.equal(f.c.state.report,null);assert.equal(f.c.state.timeFrequencyReport,null);assert.deepEqual(f.c.state.bins,[]);
 assert.equal(f.c.state.activityReport!.dataSha256,createHash('sha256').update(f.data).digest('hex'));assert.equal(f.c.state.activityReport!.metadataSha256,createHash('sha256').update(f.metadata).digest('hex'));assert.equal(f.c.state.activityReport!.sha512Status,'byte-match-only');assert.deepEqual(f.counts(),{reads:2,hashes:3});
 const before=f.c.state;f.c.showPeakPage(f.c.lease,before);assert.equal(f.c.state,before);
 f.set('startSample','2');f.set('frameCount','1');const denominator='1'+'0'.repeat(98),equal='25'+'0'.repeat(98);
 f.set('thresholdDenominator',denominator);
 for(const [numerator,above] of [[(BigInt(equal)-1n).toString(),true],[equal,false],[(BigInt(equal)+1n).toString(),false]] as const){f.set('thresholdNumerator',numerator);await f.c.inspect(f.c.lease,f.c.state);assert.equal(f.c.state.activityFrames[0]!.aboveThreshold,above);assert.equal(f.c.state.activityReport!.options.thresholdNumerator,numerator);}
 const half=fixture([[1,0],[0,0]]);half.set('windowSamples','2');half.set('frameCount','1');await half.c.inspect(half.c.lease,half.c.state);assert.deepEqual(half.c.state.activityFrames[0]!.meanSquaredCounts,{numerator:'1',denominator:'2'});
});
test('activity accepts arbitrary window lengths, selected geometry, and resets separate settings',async()=>{
 const f=fixture(Array.from({length:12},()=>[3,-4] as const));f.set('startSample','1');f.set('windowSamples','3');f.set('frameCount','3');
 for(const [hop,relationship,intervals] of [['2','overlapping',[[1,8]]],['3','contiguous',[[1,10]]],['4','gapped',[[1,4],[5,8],[9,12]]]] as const){f.set('hopSamples',hop);await f.c.inspect(f.c.lease,f.c.state);assert.equal(f.c.state.activityReport!.windowRelationship,relationship);assert.deepEqual(f.c.state.activityIntervals.map(i=>[i.startSample,i.endSampleExclusive]),intervals);}
 const before=f.counts();f.set('startSample','2');await f.c.inspect(f.c.lease,f.c.state);assert.equal(f.c.state.activityReport,null);assert.deepEqual(f.counts(),before);
 f.set('windowSamples','bad');f.c.windowMode('default',f.c.lease,f.c.state);await f.c.inspect(f.c.lease,f.c.state);assert.ok(f.c.state.report);
 f.c.example(f.c.lease,f.c.state);assert.equal(f.c.state.windowMode,'default');assert.deepEqual(f.c.state.activitySettings,{startSample:'0',windowSamples:'1024',hopSamples:'1024',frameCount:'1',thresholdNumerator:'0',thresholdDenominator:'1'});
});
test('activity rejects entire malformed input without retention before reading',async()=>{
 for(const field of ['startSample','windowSamples','hopSamples','frameCount','thresholdNumerator','thresholdDenominator'] as const){for(const bad of ['','-1','+1',' 1','1 ','1\n','1\r','1\u2028','１','1e2','1'.repeat(129),null,{},5]){const f=fixture([[3,-4]]);f.set(field,bad as string);assert.equal(f.c.state.activitySettings[field],'');await f.c.inspect(f.c.lease,f.c.state);assert.equal(f.c.state.activityReport,null);assert.deepEqual(f.counts(),{reads:0,hashes:0});}}
});
test('activity cells and frame ceilings validate before reads',async()=>{
 const f=fixture(Array.from({length:4096},()=>[0,0] as const));f.set('windowSamples','4096');f.set('hopSamples','1');f.set('frameCount','65');await f.c.inspect(f.c.lease,f.c.state);assert.deepEqual(f.counts(),{reads:0,hashes:0});
 const g=fixture(Array.from({length:256},()=>[3,-4] as const));await g.c.inspect(g.c.lease,g.c.state);assert.equal(g.c.state.activityReport!.options.frameCount,256);assert.equal(g.c.state.activityFramePageCount,64);assert.equal(g.c.state.selectedActivityRun!.frameCount,256);assert.ok(Object.isFrozen(g.c.state.activityFrames[0]!.meanSquaredCounts));
 const stale=g.c.state;g.c.activityFramePage(63,g.c.lease,g.c.state);assert.equal(g.c.state.activityFrames[3]!.index,255);g.c.activityFramePage(0,g.c.lease,stale);assert.equal(g.c.state.activityFramePage,63);assert.deepEqual(g.counts(),{reads:2,hashes:2});
});
