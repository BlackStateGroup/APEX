import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IqController, IQ_FFT_SIZES } from '../src/iq-workbench.ts';
const meta=Buffer.from('{"global":{"core:datatype":"ci16_le","core:version":"1.2.6","core:sample_rate":8192},"captures":[{"core:sample_start":0,"core:frequency":0}],"annotations":[]}');
const digest=async(a:'SHA-256'|'SHA-512',b:Uint8Array)=>createHash(a==='SHA-256'?'sha256':'sha512').update(b).digest('hex');
const inspect=(c:IqController)=>c.inspect(c.lease,c.state);
const explicit=(c:IqController,n:typeof IQ_FFT_SIZES[number],s:string)=>{c.windowMode('explicit',c.lease,c.state);c.fftSize(n,c.lease,c.state);c.startSample(s,c.lease,c.state);};
function pair(c:IqController,count:number,onRead=()=>{}) {for(const side of ['metadata','data'] as const){const bytes=side==='metadata'?meta:new Uint8Array(count*4);c.stageFile(side,{name:side,size:bytes.length,arrayBuffer:async()=>{onRead();return Uint8Array.from(bytes).buffer;}},c.lease,c.state);}}
function gate<T>(){let resolve!:(v:T)=>void,reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{resolve,reject,promise};}

test('all window sizes and exact last-valid boundary preflight before either read; every Inspect rereads/rehashes',async()=>{
 for(const n of IQ_FFT_SIZES){let reads=0,hashes=0;const c=new IqController(true,{digest:async(a,b)=>{hashes++;return digest(a,b);}});pair(c,65536,()=>reads++);explicit(c,n,String(65536-n));assert.equal(reads+hashes,0);
 await inspect(c);assert.equal(c.state.report!.spectrum!.endSampleExclusive,65536);assert.equal(c.state.pageCount,n/8);assert.equal(reads,2);assert.equal(hashes,2);
 const bins=c.state.bins;assert.ok(Object.isFrozen(bins));assert.ok(Object.isFrozen(bins[0]));c.page(n/8-1,c.lease,c.state);assert.equal(c.state.bins.length,8);assert.notEqual(c.state.bins,bins);
 await inspect(c);assert.equal(reads,4);assert.equal(hashes,4);c.startSample(String(65537-n),c.lease,c.state);assert.equal(c.state.page,0);assert.equal(c.state.report,null);await inspect(c);assert.equal(reads,4);assert.equal(hashes,4);assert.match(c.state.message,/No reads started/);
 }
});
test('default short inputs preserve statistics-only but explicit windows refuse before IO',async()=>{
 let reads=0;const c=new IqController(true,{digest});pair(c,255,()=>reads++);await inspect(c);assert.equal(c.state.report!.spectrum,null);assert.equal(reads,2);explicit(c,256,'0');await inspect(c);assert.equal(c.state.report,null);assert.equal(reads,2);
});
test('whole input validation rejects every malformed or oversized edit and never retains previous valid settings',async()=>{
 const c=new IqController(true,{digest});c.toneExample(c.lease,c.state);explicit(c,256,'0');
 for(const invalid of ['', ' ', ' 0','0 ','0\n','0\r','0\r\n','0\u2028','0\u2029','+0','-0','1.0','1e2','12x','١','１２','65536','100000','0'.repeat(100000)]){await inspect(c);assert.ok(c.state.report);c.startSample(invalid,c.lease,c.state);assert.equal(c.state.startText,'');assert.equal(c.state.startSample,null);assert.equal(c.state.report,null);assert.equal(c.state.pageCount,0);await inspect(c);assert.equal(c.state.report,null);c.startSample('00000',c.lease,c.state);}
 c.startSample('65535',c.lease,c.state);assert.equal(c.state.startSample,65535);
});
test('exact nonzero example has independently constructed bytes and signed quarter-bin amplitudes in both halves',async()=>{
 let hashes=0;const c=new IqController(true,{digest:async(a,b)=>{hashes++;return digest(a,b);}});const original=globalThis.TextEncoder;
 try{Object.defineProperty(globalThis,'TextEncoder',{configurable:true,writable:true,value:undefined});c.toneExample(c.lease,c.state);}finally{Object.defineProperty(globalThis,'TextEncoder',{configurable:true,writable:true,value:original});}
 assert.equal(hashes,0);const data=Buffer.alloc(32768);const positive=Buffer.from([0,64,0,0,0,0,0,64,0,192,0,0,0,0,0,192]);const negative=Buffer.from([0,64,0,0,0,0,0,192,0,192,0,0,0,0,0,64]);for(let i=0;i<1024;i++){positive.copy(data,i*16);negative.copy(data,16384+i*16);}
 for(const n of IQ_FFT_SIZES)for(const start of [0,4096]){explicit(c,n,String(start));await inspect(c);const r=c.state.report!;assert.equal(r.metadataSha256,await digest('SHA-256',meta));assert.equal(r.dataSha256,await digest('SHA-256',data));assert.equal(r.spectrum!.peakBin!.signedBin,(start===0?1:-1)*n/4);assert.ok(Math.abs(r.spectrum!.peakBin!.amplitude-0.5)<1e-12);assert.equal(r.statistics.rmsComplexMagnitude,0.5);}
});
test('each settings action during held reads or either digest fences success/failure and keeps actual slot until settlement',async()=>{
 for(const boundary of ['metadata','data','hash1','hash2'])for(const fail of [false,true])for(const edit of ['mode','size','start']){
  const g=gate<any>();let reads=0,hashes=0;const c=new IqController(true,{digest:async(a,b)=>{hashes++;if(boundary===`hash${hashes}`)return g.promise;return digest(a,b);}});
  for(const side of ['metadata','data'] as const){const bytes=side==='metadata'?meta:Buffer.alloc(4096);c.stageFile(side,{name:side,size:bytes.length,arrayBuffer:async()=>{reads++;return boundary===side?g.promise:Uint8Array.from(bytes).buffer;}},c.lease,c.state);}
  const job=inspect(c);for(let i=0;i<15;i++)await Promise.resolve();assert.equal(c.state.busy,true);
  if(edit==='mode')c.windowMode('explicit',c.lease,c.state);if(edit==='size')c.fftSize(256,c.lease,c.state);if(edit==='start')c.startSample('1',c.lease,c.state);
  const before=[reads,hashes];await inspect(c);assert.deepEqual([reads,hashes],before);assert.equal(c.state.busy,true);assert.equal(c.state.report,null);
  if(fail)g.reject(new Error('held failure'));else g.resolve(boundary.startsWith('hash')?'a'.repeat(64):Uint8Array.from(boundary==='metadata'?meta:Buffer.alloc(4096)).buffer);
  await job;assert.equal(c.state.busy,false);assert.equal(c.state.report,null);assert.deepEqual([reads,hashes],before);
 }
});
test('settings notification snapshots are atomic against recursive Inspect, clear and replacement',async()=>{
 for(const action of ['inspect','clear','replace']){const c=new IqController(true,{digest});c.toneExample(c.lease,c.state);let once=true;let job:Promise<void>|undefined;c.subscribe(()=>{if(!once)return;once=false;if(action==='inspect')job=inspect(c);else if(action==='clear')c.clear(c.lease,c.state);else c.example(c.lease,c.state);});c.startSample('4096',c.lease,c.state);if(job)await job;
 if(action==='inspect'){assert.equal(c.state.report!.spectrum!.startSample,0);}else{assert.equal(c.state.startSample,0);assert.equal(c.state.windowMode,'default');assert.equal(c.state.report,null);assert.equal(c.state.data?.name,action==='clear'?undefined:'synthetic-zero.sigmf-data');}}
});
