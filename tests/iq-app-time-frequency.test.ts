/** Controller tests use synthetic bytes only. No browser, files, devices or native builds. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IqController, IQ_FFT_SIZES } from '../src/iq-workbench.ts';
import type { IqState, IqFftSize } from '../src/iq-workbench.ts';
const meta=Buffer.from('{"global":{"core:datatype":"ci16_le","core:version":"1.2.6","core:sample_rate":8192},"captures":[{"core:sample_start":0,"core:frequency":123456,"core:datetime":"<untrusted>"}],"annotations":[]}');
const digest=async(a:'SHA-256'|'SHA-512',b:Uint8Array)=>createHash(a==='SHA-256'?'sha256':'sha512').update(b).digest('hex');
const inspect=(c:IqController)=>c.inspect(c.lease,c.state);
function geometry(c:IqController,n:IqFftSize=256,start='0',hop='256',count='4') {c.windowMode('time-frequency',c.lease,c.state);c.fftSize(n,c.lease,c.state);c.startSample(start,c.lease,c.state);c.hopSamples(hop,c.lease,c.state);c.frameCount(count,c.lease,c.state);}
function pair(c:IqController,bytes:Uint8Array,onRead=()=>{}) {for(const side of ['metadata','data'] as const){const data=side==='metadata'?meta:bytes;c.stageFile(side,{name:side,size:data.length,arrayBuffer:async()=>{onRead();return Uint8Array.from(data).buffer;}},c.lease,c.state);}}
function gate<T>() {let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function frozen(value:unknown) {if(value!==null&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const v of Object.values(value))frozen(v);}}

test('TF every size reaches exact 16384 cells and final fit, maximum frames, rereads and hashes exactly once per source',async()=>{
 for(const n of IQ_FFT_SIZES){let reads=0,hashes=0;const c=new IqController(true,{digest:async(a,b)=>{hashes++;return digest(a,b);}},()=> '2026-11-08T12:00:00.000Z');pair(c,new Uint8Array(65536*4),()=>reads++);const count=16384/n;geometry(c,n,String(65536-16384),String(n),String(count));assert.equal(reads+hashes,0);
 await inspect(c);assert.equal(reads,2);assert.equal(hashes,2);assert.equal(c.state.report,null);const r=c.state.timeFrequencyReport!;assert.equal(r.cellCount,16384);assert.equal(r.geometry.frameCount,count);assert.equal(r.importedAt,'2026-11-08T12:00:00.000Z');assert.equal(r.producerTime,'<untrusted>');assert.equal(r.metadataSha256,await digest('SHA-256',meta));assert.equal(r.dataSha256,await digest('SHA-256',new Uint8Array(65536*4)));assert.equal(Object.hasOwn(r,'statistics'),false);assert.equal(Object.hasOwn(r,'source'),false);assert.equal(Object.hasOwn(r,'supplierClaim'),false);c.selectFrame(count-1,c.lease,c.state);assert.equal(c.state.selectedFrame!.endSampleExclusive,65536);await inspect(c);assert.equal(reads,4);assert.equal(hashes,4);
 c.startSample(String(65536-16384+1),c.lease,c.state);await inspect(c);assert.equal(c.state.timeFrequencyReport,null);assert.equal(reads,4);assert.match(c.state.message,/No reads started/);
 }
});
test('TF rejects oversized cells, invalid geometry, strict whole edits before reads; allows overlap and gaps',async()=>{
 let reads=0;const c=new IqController(true,{digest});pair(c,new Uint8Array(65536*4),()=>reads++);
 for(const [n,count] of [[512,33],[1024,17],[2048,9],[4096,5]] as const){geometry(c,n,'0','1',String(count));await inspect(c);assert.equal(reads,0);assert.equal(c.state.timeFrequencyReport,null);}
 const bad=['',' ',' 1','1 ','1\n','1\r','1\u2028','+1','-1','1.0','1e1','0x10','１２','١','0'.repeat(100000),1,null,{}];
 for(const field of ['hopSamples','frameCount'] as const)for(const value of [...bad,'0',field==='hopSamples'?'65537':'65',field==='hopSamples'?'000001':'001']){geometry(c);c[field](value as string,c.lease,c.state);assert.equal(c.state[field],null);assert.equal(c.state[field==='hopSamples'?'hopText':'frameCountText'],'');await inspect(c);assert.equal(reads,0);assert.equal(c.state.timeFrequencyReport,null);}
 for(const [hop,spacing,gap] of [[1,'overlap',0],[256,'contiguous',0],[1024,'gaps',768]] as const){geometry(c,256,'0',String(hop),'4');await inspect(c);assert.equal(c.state.timeFrequencyReport!.spacing,spacing);assert.equal(c.state.timeFrequencyReport!.gapSamples,gap);assert.deepEqual(c.state.frames.map(f=>f.startSample),[0,hop,2*hop,3*hop]);}
 geometry(c,256,'0','65536','1');await inspect(c);assert.equal(c.state.timeFrequencyReport!.geometry.hopSamples,65536); // Explicit single frame permits any bounded hop.
});
test('TF every frame and bin page has exact unique immutable rows, selected navigation does not read/hash',async()=>{
 let hashes=0;const c=new IqController(true,{digest:async(a,b)=>{hashes++;return digest(a,b);}});pair(c,new Uint8Array(16384*4));geometry(c,256,'0','256','64');await inspect(c);assert.equal(c.state.framePageCount,16);const old=c.state,frames:number[]=[];
 for(let page=0;page<16;page++){c.framePage(page,c.lease,c.state);assert.equal(c.state.frames.length,4);frames.push(...c.state.frames.map(f=>f.index));frozen(c.state);}
 assert.deepEqual(frames,Array.from({length:64},(_,k)=>k));
 for(let frame=0;frame<64;frame++){c.selectFrame(frame,c.lease,c.state);assert.equal(c.state.selectedFrame!.index,frame);assert.equal(c.state.page,0);assert.equal(c.state.pageCount,32);const bins:number[]=[];for(let page=0;page<32;page++){c.page(page,c.lease,c.state);assert.equal(c.state.bins.length,8);bins.push(...c.state.bins.map(b=>b.signedBin));for(const b of c.state.bins){assert.equal(b.amplitude,0);assert.equal(b.dbRelativeToUnitAmplitude,null);assert.equal(b.displayDb,-160);assert.equal(b.declaredRfHz,123456+b.offsetHz);}}assert.deepEqual(bins,Array.from({length:256},(_,k)=>k-128));}
 assert.equal(hashes,2);assert.equal(old.selectedFrame!.index,0);assert.equal(old.framePage,0);assert.equal(old.bins[0]!.signedBin,-128);assert.throws(()=>{(old.frames as any).push({});},TypeError);assert.throws(()=>{(old.timeFrequencyReport!.geometry as any).fftSize=4096;},TypeError);
 const current=c.state;for(const invalid of [-1,64,NaN,Infinity,1.2])c.selectFrame(invalid,c.lease,c.state);assert.equal(c.state,current);c.framePage(0,c.lease,old);c.page(0,c.lease,old);c.selectFrame(0,c.lease,old);assert.equal(c.state,current);
});
test('TF exact quarter-cycle transitions, gapped summaries and zero including nonzero Hann-zero endpoint',async()=>{
 const c=new IqController(true,{digest});c.toneExample(c.lease,c.state);geometry(c,1024,'0','1024','8');await inspect(c);
 for(let k=0;k<8;k++){c.selectFrame(k,c.lease,c.state);const f=c.state.selectedFrame!;assert.equal(f.peakSignedBin,k<4?256:-256);assert.equal(f.nominalStartSeconds,k/8);assert.equal(f.nominalCenterSeconds,(k+0.5)/8);assert.equal(f.nominalEndExclusiveSeconds,(k+1)/8);const bin=f.peakSignedBin!+512;c.page(Math.floor(bin/8),c.lease,c.state);assert.ok(Math.abs(c.state.bins[bin%8]!.amplitude-0.5)<1e-12);}
 geometry(c,256,'3840','512','2');await inspect(c);assert.equal(c.state.timeFrequencyReport!.gapSamples,256);assert.deepEqual(c.state.frames.map(f=>[f.startSample,f.endSampleExclusive,f.peakSignedBin]),[[3840,4096,64],[4352,4608,-64]]);
 const endpoint=new Uint8Array(256*4);new DataView(endpoint.buffer).setInt16(0,16384,true);pair(c,endpoint);geometry(c,256,'0','256','1');await inspect(c);assert.equal(c.state.selectedFrame!.peakSignedBin,null);for(let p=0;p<32;p++){c.page(p,c.lease,c.state);for(const b of c.state.bins){assert.equal(b.amplitude,0);assert.equal(b.dbRelativeToUnitAmplitude,null);assert.equal(b.displayDb,-160);}}
});
test('TF every setting at each actual read/hash boundary fences success and rejection without freeing slot',async()=>{
 for(const boundary of ['metadata','data','hash1','hash2'])for(const fail of [false,true])for(const edit of ['mode','size','start','hop','count','clear','replace','exit']){
  const g=gate<any>();let reads=0,hashes=0;const c=new IqController(true,{digest:async(a,b)=>{hashes++;return boundary===`hash${hashes}`?g.promise:digest(a,b);}});
  for(const side of ['metadata','data'] as const){const bytes=side==='metadata'?meta:new Uint8Array(8192*4);c.stageFile(side,{name:side,size:bytes.length,arrayBuffer:async()=>{reads++;return boundary===side?g.promise:Uint8Array.from(bytes).buffer;}},c.lease,c.state);}
  geometry(c);const job=inspect(c);for(let i=0;i<20;i++)await Promise.resolve();assert.equal(c.state.busy,true);
  switch(edit){case'mode':c.windowMode('explicit',c.lease,c.state);break;case'size':c.fftSize(512,c.lease,c.state);break;case'start':c.startSample('1',c.lease,c.state);break;case'hop':c.hopSamples('128',c.lease,c.state);break;case'count':c.frameCount('2',c.lease,c.state);break;case'clear':c.clear(c.lease,c.state);break;case'replace':c.example(c.lease,c.state);break;case'exit':c.deactivate();c.activate();break;}
  const before=[reads,hashes];await inspect(c);assert.deepEqual([reads,hashes],before);assert.equal(c.state.busy,true);assert.equal(c.state.pending,false);assert.equal(c.state.timeFrequencyReport,null);assert.equal(c.state.selectedFrame,null);assert.deepEqual(c.state.frames,[]);
  if(fail)g.reject(new Error('synthetic failure'));else g.resolve(boundary.startsWith('hash')?'a'.repeat(64):Uint8Array.from(boundary==='metadata'?meta:new Uint8Array(8192*4)).buffer);
  await job;assert.equal(c.state.busy,false);assert.equal(c.state.timeFrequencyReport,null);assert.deepEqual([reads,hashes],before);
 }
});
test('TF synchronous observers see atomic settings, cannot replace captured geometry and cannot strand ownership',async()=>{
 for(const action of ['inspect','clear','replace','exit','throw']){const c=new IqController(true,{digest});c.toneExample(c.lease,c.state);geometry(c);let once=true,job:Promise<void>|undefined;c.subscribe(()=>{if(!once)return;once=false;assert.equal(c.state.hopSamples,512);assert.equal(c.state.timeFrequencyReport,null);if(action==='inspect')job=inspect(c);else if(action==='clear')c.clear(c.lease,c.state);else if(action==='replace')c.example(c.lease,c.state);else if(action==='exit')c.deactivate();else throw new Error('observer');});c.hopSamples('512',c.lease,c.state);if(job)await job;
  if(action==='inspect')assert.deepEqual(c.state.timeFrequencyReport!.geometry,{fftSize:256,startSample:0,hopSamples:512,frameCount:4});else assert.equal(c.state.timeFrequencyReport,null);assert.equal(c.state.busy,false);
 }
 const c=new IqController(true,{digest});c.toneExample(c.lease,c.state);geometry(c);let once=true;c.subscribe(()=>{if(once&&c.state.busy){once=false;c.frameCount('2',c.lease,c.state);void inspect(c);}});await inspect(c);assert.equal(c.state.timeFrequencyReport,null);assert.equal(c.state.frameCount,2);assert.equal(c.state.busy,false);await inspect(c);assert.equal(c.state.timeFrequencyReport!.geometry.frameCount,2);
});
test('TF edits and navigation snapshots fence old callbacks; clear/examples/background reset all settings',async()=>{
 const c=new IqController(true,{digest});c.toneExample(c.lease,c.state);geometry(c);await inspect(c);const old=c.state;const oldLease=c.lease;c.hopSamples('128',c.lease,c.state);const updated=c.state;c.frameCount('2',oldLease,old);c.windowMode('default',oldLease,old);c.selectFrame(1,oldLease,old);await c.inspect(oldLease,old);assert.equal(c.state,updated);assert.equal(c.state.report,null);assert.equal(c.state.timeFrequencyReport,null);assert.equal(c.state.pageCount,0);assert.equal(c.state.framePageCount,0);
 for(const reset of ['clear','zero','tone','exit']){geometry(c,512,'1','2','3');if(reset==='clear')c.clear(c.lease,c.state);if(reset==='zero')c.example(c.lease,c.state);if(reset==='tone')c.toneExample(c.lease,c.state);if(reset==='exit'){c.deactivate();c.activate();}assert.deepEqual([c.state.windowMode,c.state.fftSize,c.state.startSample,c.state.hopSamples,c.state.frameCount],['default',1024,0,1024,1]);assert.deepEqual([c.state.startText,c.state.hopText,c.state.frameCountText],['0','1024','1']);assert.equal(c.state.timeFrequencyReport,null);}
});
