/** Synthetic controller checks only. No browser, device, file picker or native runtime acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { IqController } from '../src/iq-workbench.ts';
import type { IqFile, IqSide } from '../src/iq-workbench.ts';
import { pair, nodeDigest, deferred } from './iq-app-review-fixture.ts';
const now='2026-11-08T06:00:00.000Z';
function file(bytes:Uint8Array,name='fixture'):IqFile{return {name,size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer};}
function stage(c:IqController,p=pair()){for(const side of ['metadata','data'] as const)c.stageFile(side,file(p[side]),c.lease,c.state);}
const run=(c:IqController)=>c.inspect(c.lease,c.state);
const currentReport=(c:IqController)=>c.state.report;
function frozen(value:unknown){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));Object.values(value).forEach(frozen);}}

test('independent five-await lifecycle matrix retains one slot across replacement, clear, background and repeat invalidation',async()=>{
 for(const boundary of [0,1,2,3,4])for(const action of ['clear','replace','exit','repeated'] as const)for(const rejects of [false,true]){
  const p=pair(1024,true),gate=deferred<any>(),started=deferred<void>();let step=0,reads=0,hashes=0;
  async function pause<T>(value:T):Promise<T>{const current=step++;if(current===boundary){started.resolve();return gate.promise;}return value;}
  const c=new IqController(true,{digest:async(a,b)=>{hashes++;return pause(await nodeDigest(a,b));}},()=>now);
  for(const side of ['metadata','data'] as const)c.stageFile(side,{name:side,size:p[side].length,arrayBuffer:()=>{reads++;return pause(p[side].slice().buffer);}},c.lease,c.state);
  const oldLease=c.lease,oldState=c.state,job=run(c);await started.promise;
  if(action==='clear')c.clear(c.lease,c.state);
  if(action==='exit'||action==='repeated'){c.deactivate();const inactive=c.state;c.example(c.lease,c.state);c.stageFile('data',file(p.data),c.lease,c.state);await run(c);assert.equal(c.state,inactive);c.activate();}
  c.example(c.lease,c.state);
  for(let i=0;i<32;i++){if(action==='repeated'){c.deactivate();c.activate();c.example(c.lease,c.state);}await run(c);}
  assert.equal(c.state.busy,true);assert.equal(c.state.pending,false);assert.equal(step,boundary+1);assert.equal(reads,Math.min(boundary+1,2));assert.equal(hashes,Math.max(0,boundary-1));
  const label=c.state.metadata,origin=c.state.origin,message=c.state.message;
  if(rejects)gate.reject(Error('private read/hash exception'));else gate.resolve(boundary<2?p[boundary===0?'metadata':'data'].slice().buffer:'a'.repeat(boundary===4?128:64));
  await job;assert.equal(c.state.busy,false);assert.equal(c.state.report,null);assert.equal(c.state.metadata,label);assert.equal(c.state.origin,origin);assert.equal(c.state.message,message);assert.equal(step,boundary+1);
  await c.inspect(oldLease,oldState);assert.equal(step,boundary+1);await run(c);assert.equal(currentReport(c)?.origin,'synthetic-fixture');assert.equal(currentReport(c)?.statistics.sampleCount,1024);
 }
});

test('independent numerical tone, exact SHA256/SHA512 and immutable full pagination',async()=>{
 const p=pair(1024,true);const c=new IqController(true,{digest:nodeDigest},()=>now);stage(c,p);await run(c);const report=c.state.report!;
 assert.equal(report.metadataSha256,await nodeDigest('SHA-256',p.metadata));assert.equal(report.dataSha256,await nodeDigest('SHA-256',p.data));assert.equal(report.sha512Status,'byte-match-only');assert.equal(report.importedAt,now);assert.equal(report.origin,'external-file');
 assert.equal(report.spectrum?.fftSize,1024);assert.equal(report.spectrum?.startSample,0);assert.equal(report.spectrum?.window,'periodic Hann');assert.equal(report.spectrum?.peakBin?.signedBin,16);assert.ok(Math.abs(report.spectrum!.peakBin!.amplitude-0.25)<0.00002);frozen(c.state);
 const pages=[];for(let i=0;i<128;i++){c.page(i,c.lease,c.state);frozen(c.state);assert.equal(c.state.bins.length,8);pages.push(...c.state.bins);}
 assert.deepEqual(pages.map(b=>b.signedBin),Array.from({length:1024},(_,i)=>i-512));const prior=c.state;assert.throws(()=>{(prior.bins[0] as any).amplitude=99;});c.clear(c.lease,c.state);assert.equal(prior.report,report);assert.equal(prior.bins.length,8);assert.equal(c.state.report,null);
 for(const count of [1,255,256,512,1023]){stage(c,pair(count));await run(c);assert.equal(currentReport(c)?.statistics.sampleCount,count);assert.equal(currentReport(c)?.spectrum,null);assert.equal(c.state.bins.length,0);assert.equal(c.state.pageCount,0);}
});

test('independent mutable hasher input cannot alter exact source or later analysis',async()=>{
 const p=pair(1024,true);const seen:Uint8Array[]=[];const c=new IqController(true,{digest:async(a,b)=>{const hash=await nodeDigest(a,b);seen.push(b);b.fill(0);return hash;}},()=>now);stage(c,p);await run(c);
 assert.equal(seen.length,3);assert.equal(currentReport(c)?.metadataSha256,await nodeDigest('SHA-256',p.metadata));assert.equal(currentReport(c)?.dataSha256,await nodeDigest('SHA-256',p.data));assert.equal(currentReport(c)?.spectrum?.peakBin?.signedBin,16);assert.equal(currentReport(c)?.sha512Status,'byte-match-only');assert.notEqual(seen[1],seen[2]);
});

test('independent malformed pair sizes never read either handle, read failures do not hash',async()=>{
 for(const side of ['metadata','data'] as const)for(const size of [-1,0,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER,side==='metadata'?65537:262148,...(side==='data'?[1,2,3,5,262143]:[])]){
  let reads=0;const p=pair(),c=new IqController(true,{digest:async()=>assert.fail('No hashing')});
  for(const key of ['metadata','data'] as const)c.stageFile(key,{name:key,size:key===side?size:p[key].length,arrayBuffer:async()=>{reads++;throw Error();}},c.lease,c.state);
  await run(c);assert.equal(reads,0);assert.equal(c.state.report,null);
 }
 for(const side of ['metadata','data'] as const){let reads=0;const p=pair(),c=new IqController(true,{digest:async()=>assert.fail('No hashing')});stage(c,p);c.stageFile(side,{name:'throw',size:p[side].length,arrayBuffer:async()=>{reads++;throw Error('do not publish');}},c.lease,c.state);await run(c);assert.equal(reads,1);assert.equal(c.state.busy,false);assert.equal(c.state.report,null);assert.doesNotMatch(JSON.stringify(c.state),/do not publish/);}
});
