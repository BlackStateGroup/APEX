/** Synthetic byte/provider tests. No RF acquisition or physical device acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IqController, type IqFile } from '../src/iq-workbench.ts';
import { nativeIqPair, NativeIqPickerSession, IQ_READ_CHUNK, type NativeIqAsset, type NativeIqPickResult } from '../src/native-iq-files.ts';
import { deferred, nodeDigest } from './iq-app-review-fixture.ts';
const ascii=(s:string)=>Uint8Array.from(s,c=>c.charCodeAt(0));
const sidecar=()=>ascii('sample_rate=1024\ncenter_frequency=433920000\nformat=c8 (signed int8 I,Q)\n');
const digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const report=(c:IqController)=>c.state.report;
const now=()=> '2026-11-09T06:00:00.000Z';
function file(name:string,bytes:Uint8Array,read=()=>Promise.resolve(bytes.slice().buffer)):IqFile { return {name,size:bytes.length,arrayBuffer:read}; }
function controller(data=new Uint8Array(2048),metadata=sidecar()) {
 let reads=0,hashes=0;
 const c=new IqController(true,{digest:async(a,b)=>{hashes++;return nodeDigest(a,b);}},now);
 c.inputProfile('mayhem-c8',c.lease,c.state);
 c.stageFile('metadata',file('selected.txt',metadata,async()=>{reads++;return metadata.slice().buffer;}),c.lease,c.state);
 c.stageFile('data',file('selected.c8',data,async()=>{reads++;return data.slice().buffer;}),c.lease,c.state);
 return {c,get reads(){return reads;},get hashes(){return hashes;}};
}
function assets(metadata=sidecar().length,data=2048):NativeIqAsset[]{return[
 {name:'supplied.txt',uri:'file:///private/supplied-text',size:metadata},
 {name:'supplied.c8',uri:'content://provider/supplied-data',size:data},
];}
const neverOpen=()=>{throw Error('must not read before Inspect');};

test('C8 staging is inert; Inspect preserves source/derived hashes and exact signed sample values',async()=>{
 const data=Uint8Array.from([128,127,255,1,0,0]), original=sidecar(), f=controller(data,original),c=f.c;
 assert.equal(f.reads,0);assert.equal(f.hashes,0);assert.equal(c.state.report,null);
 await c.inspect(c.lease,c.state);const r=c.state.report!;
 assert.equal(f.reads,2);assert.equal(f.hashes,4);assert.equal(r.statistics.sampleCount,3);
 assert.equal(r.origin,'external-file');assert.equal(r.producerTime,null);assert.equal(r.importedAt,now());
 assert.equal(r.c8Import!.original.dataSha256,digest(data));assert.equal(r.c8Import!.original.sidecarSha256,digest(original));
 const expected=Uint8Array.from([0,128,0,127,0,255,0,1,0,0,0,0]);
 assert.equal(r.dataSha256,digest(expected));assert.equal(r.dataLength,12);assert.notEqual(r.dataSha256,r.c8Import!.original.dataSha256);
 assert.deepEqual(r.c8Import!.verification,{acquisitionVerified:false,producerVerified:false,authenticityVerified:false});
 assert.equal(r.statistics.railHits.iNegative,1);assert.equal(r.statistics.railHits.qPositive,0);
 assert.match(r.warnings.join(' '),/not describe original int8 clipping/);
 assert.ok(Object.isFrozen(r.c8Import!.original));assert.equal('getOriginalDataBytes' in r.c8Import!,false);
 await c.inspect(c.lease,c.state);assert.equal(f.reads,4);assert.equal(f.hashes,8);
});

for(const mode of ['explicit','time-frequency','activity'] as const)test(`C8 ${mode} windows use two source bytes per sample and retain source provenance`,async()=>{
 const f=controller(new Uint8Array(512)),c=f.c;c.windowMode(mode,c.lease,c.state);
 c.fftSize(256,c.lease,c.state);
 if(mode==='activity')c.activitySetting('windowSamples','256',c.lease,c.state);
 await c.inspect(c.lease,c.state);const r=c.state.report??c.state.timeFrequencyReport??c.state.activityReport;
 assert.ok(r?.c8Import);assert.equal(f.reads,2);assert.equal(r.c8Import.original.dataLength,512);
 assert.equal(r.dataLength,1024);assert.match(r.warnings.join(' '),/Offline conversion only/);
});

for(const mode of ['explicit','time-frequency','activity'] as const)test(`invalid C8 ${mode} geometry is rejected before either read`,async()=>{
 const f=controller(new Uint8Array(510)),c=f.c;c.windowMode(mode,c.lease,c.state);c.fftSize(256,c.lease,c.state);
 if(mode==='activity')c.activitySetting('windowSamples','256',c.lease,c.state);
 await c.inspect(c.lease,c.state);assert.equal(f.reads,0);assert.equal(f.hashes,0);assert.match(c.state.message,/No reads started/);
});

test('C8 byte limits reject invalid source sizes before any source read',async()=>{
 for(const [m,d] of [[0,2],[4097,2],[10,0],[10,1],[10,3],[10,131073],[10,131074],[NaN,2],[10,Infinity]]){
  const f=controller(),c=f.c;
  c.stageFile('metadata',{name:'x.txt',size:m!,arrayBuffer:async()=>{assert.fail('metadata read');}},c.lease,c.state);
  c.stageFile('data',{name:'x.c8',size:d!,arrayBuffer:async()=>{assert.fail('data read');}},c.lease,c.state);
  await c.inspect(c.lease,c.state);assert.equal(f.hashes,0);assert.equal(c.state.report,null);assert.match(c.state.message,/No reads started/);
 }
});

test('C8 maximum data remains bounded after conversion and works without TextEncoder',async()=>{
 const f=controller(new Uint8Array(131072)),c=f.c;
 const encoder=globalThis.TextEncoder;
 try {
  Object.assign(globalThis,{TextEncoder:undefined});
  await c.inspect(c.lease,c.state);
 } finally {Object.assign(globalThis,{TextEncoder:encoder});}
 assert.equal(c.state.report?.statistics.sampleCount,65536);assert.equal(c.state.report?.dataLength,262144);
});

test('wrong sidecar profile and mismatched read lengths publish no provenance or report',async()=>{
 for(const metadata of [ascii('sample_rate=1\ncenter_frequency=0\n'),ascii('sample_rate=1\ncenter_frequency=0\nformat=cu8\n'),new Uint8Array([255]),ascii('{"global":{}}')]){
  const f=controller(new Uint8Array(2),metadata);await f.c.inspect(f.c.lease,f.c.state);assert.equal(f.c.state.report,null);assert.equal(f.hashes,0);
 }
 const f=controller();f.c.stageFile('data',file('mismatch.c8',new Uint8Array(2048),async()=>new ArrayBuffer(2046)),f.c.lease,f.c.state);
 await f.c.inspect(f.c.lease,f.c.state);assert.equal(f.c.state.report,null);assert.equal(f.hashes,0);
});

test('profile changes atomically release handles/report and reject stale events or wrong native pairs',async()=>{
 const f=controller(),c=f.c;await c.inspect(c.lease,c.state);assert.ok(c.state.report?.c8Import);
 const state=c.state,lease=c.lease,revision=state.inputRevision;c.inputProfile('sigmf',lease,state);
 assert.equal(c.state.metadata,null);assert.equal(c.state.data,null);assert.equal(c.state.report,null);assert.equal(c.state.inputRevision,revision+1);
 const current=c.state;c.inputProfile('mayhem-c8',lease,state);assert.equal(c.state,current);
 c.stagePair(nativeIqPair(assets(),neverOpen,'mayhem-c8'),c.lease,c.state);assert.equal(c.state.data,null);
 c.inputProfile('mayhem-c8',c.lease,c.state);c.example(c.lease,c.state);assert.equal(c.state.inputProfile,'sigmf');
 await c.inspect(c.lease,c.state);assert.equal(report(c)?.c8Import,undefined);assert.equal(report(c)?.origin,'synthetic-fixture');
});

for(const boundary of [1,2,3,4])test(`profile change during C8 digest ${boundary} fences later digests, report and new jobs until drain`,async()=>{
 const wait=deferred<string>();let calls=0;
 const c=new IqController(true,{digest:async(a,b)=>++calls===boundary?wait.promise:nodeDigest(a,b)},now);
 c.inputProfile('mayhem-c8',c.lease,c.state);
 c.stagePair(nativeIqPair(assets(),uri=>{const b=uri.startsWith('file:')?sidecar():new Uint8Array(2048);let offset=0;return{size:b.length,readBytes:async n=>{const next=b.slice(offset,offset+n);offset+=next.length;return next;},close(){}};},'mayhem-c8'),c.lease,c.state);
 const pending=c.inspect(c.lease,c.state);
 while(calls<boundary)await new Promise(r=>setTimeout(r,0));
 c.inputProfile('sigmf',c.lease,c.state);c.example(c.lease,c.state);await c.inspect(c.lease,c.state);
 assert.equal(calls,boundary);assert.equal(c.state.busy,true);wait.resolve('0'.repeat(64));await pending;
 assert.equal(c.state.report,null);assert.equal(c.state.busy,false);assert.equal(c.state.inputProfile,'sigmf');assert.equal(calls,boundary);
 await c.inspect(c.lease,c.state);assert.ok(c.state.report);assert.equal(report(c)?.c8Import,undefined);
});

test('background while C8 source read is pending drains without reading other source or republishing',async()=>{
 const wait=deferred<ArrayBuffer>();let reads=0;const f=controller(),c=f.c;
 c.stageFile('metadata',file('x.txt',sidecar(),()=>{reads++;return wait.promise;}),c.lease,c.state);
 const pending=c.inspect(c.lease,c.state);c.deactivate();c.activate();wait.resolve(sidecar().buffer);await pending;
 assert.equal(reads,1);assert.equal(f.reads,0);assert.equal(c.state.report,null);assert.equal(c.state.metadata,null);assert.equal(c.state.busy,false);
});

test('native C8 pairing validates both known sizes, roles and local URIs before open',()=>{
 const pair=nativeIqPair(assets().reverse(),neverOpen,'mayhem-c8');assert.equal(pair.profile,'mayhem-c8');
 for(const [m,d]of [[0,2],[4097,2],[1,0],[1,1],[1,3],[1,131074]])assert.throws(()=>nativeIqPair(assets(m,d),neverOpen,'mayhem-c8'));
 assert.ok(nativeIqPair(assets(4096,131072),neverOpen,'mayhem-c8'));
 assert.throws(()=>nativeIqPair(assets(),neverOpen));
 for(const change of [{name:'wrong.sigmf-meta'},{name:'wrong.TXT'},{uri:'https://host.test/a'},{size:undefined}]){
  const a=assets();a[0]={...a[0]!,...change};assert.throws(()=>nativeIqPair(a,neverOpen,'mayhem-c8'));
 }
});

test('native C8 reader uses bounded chunks, one EOF check, closes and rejects provider growth',async()=>{
 for(const grow of [false,true]){
  const bytes=new Uint8Array(131072+(grow?1:0));let offset=0,closed=0;const requests:number[]=[];
  const pair=nativeIqPair(assets(sidecar().length,131072),()=>({size:131072,readBytes:async n=>{requests.push(n);const chunk=bytes.slice(offset,offset+n);offset+=chunk.length;return chunk;},close(){closed++;}}),'mayhem-c8');
  if(grow)await assert.rejects(pair.data.arrayBuffer());else assert.equal((await pair.data.arrayBuffer()).byteLength,131072);
  assert.ok(requests.every(n=>n<=IQ_READ_CHUNK));assert.equal(requests.at(-1),1);assert.equal(closed,1);
 }
});

test('picker profile change invalidates pending and settled C8 candidates without freeing active picker',async()=>{
 const wait=deferred<NativeIqPickResult>();let picks=0;const session=new NativeIqPickerSession(()=>{picks++;return wait.promise;},neverOpen);
 session.attach(true);session.setProfile('mayhem-c8');const pending=session.choose();session.setProfile('sigmf');await session.choose();assert.equal(picks,1);
 wait.resolve({canceled:false,assets:assets()});await pending;assert.equal(session.state.candidate,null);assert.equal(session.takePair(),null);
 session.setProfile('mayhem-c8');await session.choose();assert.ok(session.state.candidate);session.setProfile('sigmf');assert.equal(session.state.candidate,null);
 session.setProfile('mayhem-c8');await session.choose();const pair=session.takePair();assert.equal(pair?.profile,'mayhem-c8');
});
