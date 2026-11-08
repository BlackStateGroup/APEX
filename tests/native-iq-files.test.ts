/** Synthetic provider/OS mocks only. No physical-device verification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nativeIqPair, NativeIqPickerSession, IQ_READ_CHUNK } from '../src/native-iq-files.ts';
import type { NativeIqAsset, NativeIqReadHandle, NativeIqPickResult } from '../src/native-iq-files.ts';
import { IqController } from '../src/iq-workbench.ts';
import { pair, deferred, nodeDigest } from './iq-app-review-fixture.ts';
const assets = (metadata = 4, data = 8): NativeIqAsset[] => [
 {name:'selected.sigmf-meta',uri:'file:///private/user-selected-meta',size:metadata},
 {name:'selected.sigmf-data',uri:'content://provider/selected-data',size:data},
];
function provider(bytes: Uint8Array, options: {size?:number|null;partial?:number;throwRead?:boolean;throwClose?:boolean;oversize?:boolean} = {}) {
 let offset=0,closed=0; const requests:number[]=[];
 const handle:NativeIqReadHandle={size:options.size === undefined ? bytes.length : options.size,
  async readBytes(length) { requests.push(length); if(options.throwRead)throw Error('private URI must not leak');
   if(options.oversize)return new Uint8Array(length+1);
   const next=bytes.slice(offset,offset+Math.min(length,options.partial??length));offset+=next.length;return next;
  },close(){closed++;if(options.throwClose)throw Error('close failed');}};
 return {handle,requests,get closed(){return closed;}};
}
const cannotOpen = () => { throw Error('Selection must not open files'); };

test('native pair accepts reversed user selection without opening; captures labels, sizes and URI privately',async()=>{
 const a=assets(), p=provider(Uint8Array.from([1,2,3,4])); let opened='';
 const selected=nativeIqPair(a.reverse(),uri=>{opened=uri;return p.handle;});
 Object.assign(a[1]!,{name:'mutated',uri:'https://bad.invalid',size:999});
 assert.deepEqual(Object.keys(selected.metadata),['name','size','arrayBuffer']);assert.equal(opened,'');
 assert.deepEqual(new Uint8Array(await selected.metadata.arrayBuffer()),new Uint8Array([1,2,3,4]));
 assert.equal(opened,'file:///private/user-selected-meta');assert.equal(selected.metadata.name,'selected.sigmf-meta');assert.equal(p.closed,1);
});

test('native pair refuses missing, duplicate, oversized, unknown and nonlocal selections before open',()=>{
 for(const bad of [undefined,null,[],[assets()[0]!],[...assets(),assets()[0]!],[assets()[0]!,assets()[0]!]])assert.throws(()=>nativeIqPair(bad,cannotOpen));
 for(const size of [undefined,0,-1,NaN,Infinity,1.5,65537,Number.MAX_SAFE_INTEGER+1]) {
  const a=assets();a[0]={...a[0]!,size};assert.throws(()=>nativeIqPair(a,cannotOpen));
 }
 for(const size of [0,1,3,5,262148]) {const a=assets();a[1]={...a[1]!,size};assert.throws(()=>nativeIqPair(a,cannotOpen));}
 for(const uri of ['https://example.test/data','data:x','file://server/path','content://provider','content://provider/\nsecret','file:///x\u0000', 'file:///'+ 'x'.repeat(8192)]) {
  const a=assets();a[0]={...a[0]!,uri};assert.throws(()=>nativeIqPair(a,cannotOpen));
 }
 for(const name of ['x.json','x.SIGMF-META','x'.repeat(257)+'.sigmf-meta']) {const a=assets();a[0]={...a[0]!,name};assert.throws(()=>nativeIqPair(a,cannotOpen));}
 assert.ok(nativeIqPair(assets(65536,262144),cannotOpen));
});

test('native reader reads maximum data in bounded chunks plus one EOF byte; tolerates partial reads',async()=>{
 const bytes=Uint8Array.from({length:262144},(_,i)=>i%251), p=provider(bytes,{partial:5000});
 const selected=nativeIqPair(assets(4,bytes.length),()=>p.handle);
 assert.deepEqual(new Uint8Array(await selected.data.arrayBuffer()),bytes);
 assert.ok(p.requests.every(n=>n>=1&&n<=IQ_READ_CHUNK));assert.equal(p.requests.at(-1),1);assert.equal(p.closed,1);
});

test('native reader closes on size mismatch, unknown size, short reads, growth, read failures and oversized chunks',async()=>{
 for(const p of [provider(new Uint8Array(8),{size:9}),provider(new Uint8Array(8),{size:null}),provider(new Uint8Array(7),{size:8}),provider(new Uint8Array(9),{size:8}),provider(new Uint8Array(8),{throwRead:true}),provider(new Uint8Array(8),{oversize:true}),provider(new Uint8Array(8),{throwClose:true})]){
  await assert.rejects(nativeIqPair(assets(),()=>p.handle).data.arrayBuffer());assert.equal(p.closed,1);
 }
 const p=provider(new Uint8Array(8),{size:900000000});await assert.rejects(nativeIqPair(assets(),()=>p.handle).data.arrayBuffer());assert.equal(p.requests.length,0);
});

test('native reader reopens on each Inspect and refuses changed post-read size',async()=>{
 let size=8,closes=0,reads=0;const h:NativeIqReadHandle={get size(){return size;},async readBytes(n){reads++;if(reads===1)return new Uint8Array(8);size=12;return new Uint8Array();},close(){closes++;}};
 await assert.rejects(nativeIqPair(assets(),()=>h).data.arrayBuffer());assert.equal(closes,1);
 let opens=0;const file=nativeIqPair(assets(),()=>{opens++;return provider(new Uint8Array(8)).handle;}).data;
 await file.arrayBuffer();await file.arrayBuffer();assert.equal(opens,2);
});

test('one actual picker slot survives reset/unmount; late selection never stages or reads',async()=>{
 const pending=deferred<NativeIqPickResult>();let picks=0;
 const session=new NativeIqPickerSession(async()=>{picks++;return pending.promise;},cannotOpen);session.attach(true);
 const run=session.choose();await session.choose();assert.equal(picks,1);assert.equal(session.state.picking,true);
 session.detach();session.attach(true);await session.choose();assert.equal(picks,1);
 pending.resolve({canceled:false,assets:assets()});await run;
 assert.equal(session.state.picking,false);assert.equal(session.state.candidate,null);assert.equal(session.takePair(),null);
});

test('system picker background clears no analysed bytes; returned pair requires a fresh foreground Stage',async()=>{
 const pending=deferred<NativeIqPickResult>();const session=new NativeIqPickerSession(()=>pending.promise,cannotOpen);session.attach(true);
 const run=session.choose();session.foreground(false);pending.resolve({canceled:false,assets:assets()});await run;
 assert.ok(session.state.candidate);assert.equal(session.takePair(),null);
 session.foreground(true);assert.ok(session.takePair());assert.equal(session.takePair(),null);
 await session.choose();assert.ok(session.state.candidate);session.foreground(false);assert.equal(session.state.candidate,null);
});

test('cancel, invalid pair, thrown provider errors and throwing observers release picker ownership without URI leakage',async()=>{
 for(const pick of [async()=>({canceled:true}),async()=>({canceled:false,assets:assets(0)}),async()=>{throw Error('file:///private/account');}]) {
  const session=new NativeIqPickerSession(pick,cannotOpen);session.attach(true);session.subscribe(()=>{throw Error('observer');});
  await session.choose();assert.equal(session.state.picking,false);assert.equal(session.state.candidate,null);assert.doesNotMatch(session.state.message,/private|account/);
 }
});

test('reentrant reset before invocation prevents picker, and lazy-load guard fences navigation',async()=>{
 let picks=0;const session=new NativeIqPickerSession(async()=>{picks++;return {canceled:true};},cannotOpen);session.attach(true);
 session.subscribe(()=>{if(session.state.picking)session.reset();});await session.choose();assert.equal(picks,0);assert.equal(session.state.picking,false);
 const wait=deferred<void>();let opened=0;const lazy=new NativeIqPickerSession(async current=>{await wait.promise;if(!current())return {canceled:true};opened++;return {canceled:false,assets:assets()};},cannotOpen);
 lazy.attach(true);const operation=lazy.choose();lazy.detach();wait.resolve();await operation;assert.equal(opened,0);assert.equal(lazy.state.candidate,null);
});

test('explicit Clear/reset discards in-flight results and settled candidate; state never contains URI',async()=>{
 const pending=deferred<NativeIqPickResult>();const session=new NativeIqPickerSession(()=>pending.promise,cannotOpen);session.attach(true);
 const run=session.choose();session.reset();pending.resolve({canceled:false,assets:assets()});await run;assert.equal(session.state.candidate,null);
 await session.choose();assert.ok(session.state.candidate);assert.doesNotMatch(JSON.stringify(session.state),/file:|content:/);session.reset();assert.equal(session.takePair(),null);
});

test('atomic native staging publishes a complete pair once and only Inspect opens/hashes exact bytes',async()=>{
 const p=pair(1024,true),a=assets(p.metadata.length,p.data.length);let opens=0,closes=0,hashes=0;
 const chosen=nativeIqPair(a,uri=>{opens++;const h=provider(uri.startsWith('file:')?p.metadata:p.data).handle;return {...h,close(){closes++;h.close();}};});
 const c=new IqController(true,{digest:async(algorithm,bytes)=>{hashes++;return nodeDigest(algorithm,bytes);}});
 const observed:boolean[]=[];c.subscribe(()=>observed.push(!!c.state.metadata&&!!c.state.data));
 c.stagePair(chosen,c.lease,c.state);assert.deepEqual(observed,[true]);assert.equal(opens,0);assert.equal(hashes,0);
 await c.inspect(c.lease,c.state);assert.equal(opens,2);assert.equal(closes,2);assert.equal(hashes,3);assert.equal(c.state.report?.sha512Status,'byte-match-only');
 assert.equal(c.state.report?.dataSha256,await nodeDigest('SHA-256',p.data));
 await c.inspect(c.lease,c.state);assert.equal(opens,4);assert.equal(closes,4);
});

test('background releases controller pair without resetting picker intent; user Clear and examples advance input revision',()=>{
 const c=new IqController(true,{digest:nodeDigest});const original=c.state.inputRevision;c.deactivate();assert.equal(c.state.inputRevision,original);c.activate();
 c.clear(c.lease,c.state);assert.equal(c.state.inputRevision,original+1);c.example(c.lease,c.state);assert.equal(c.state.inputRevision,original+2);
 c.deactivate();assert.equal(c.state.metadata,null);assert.equal(c.state.data,null);assert.equal(c.state.inputRevision,original+2);
});

test('native bindings request no cache copy, use read-only opens, and never use unbounded readers or URI persistence',()=>{
 const source=readFileSync(new URL('../src/platform/iq-input.native.tsx',import.meta.url),'utf8');
 assert.match(source,/multiple:true,copyToCacheDirectory:false/);assert.match(source,/open\(FileMode\.ReadOnly\)/);assert.match(source,/if \(!isCurrent\(\)\)/);
 assert.doesNotMatch(source,/requestPermission|takePersistable|readAsString|\.arrayBuffer\(|\.bytes\(|fetch\(|AsyncStorage|\.delete\(/);
 const controller=readFileSync(new URL('../src/IqWorkbench.tsx',import.meta.url),'utf8');assert.match(controller,/controller\.stagePair\(pair,lease,state\)/);assert.match(controller,/resetKey=\{state.inputRevision\}/);
});
