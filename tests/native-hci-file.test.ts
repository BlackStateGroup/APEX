/** Synthetic picker/provider lifecycle tests; no device acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NativeHciFileSession, NativeHciBusyError, nativeHciSingleFlight } from '../src/native-hci-file.ts';
import type { NativeHciPickResult } from '../src/native-hci-file.ts';
import { NativeLocalFileCloseError } from '../src/native-local-file.ts';
import { HciWorkbenchController, HCI_EXAMPLE, decodeHciHex } from '../src/hci-workbench.ts';
const bytes=()=>decodeHciHex(HCI_EXAMPLE);
const result=(): NativeHciPickResult=>({canceled:false,assets:[{name:'selected.btsnoop',uri:'content://provider/selected',size:bytes().length}]});
const noRead=async()=>{throw Error('must not read');};
function deferred<T>() {let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('HCI selection is handle-only, source labels bounded, and explicit load yields exact bytes once',async()=>{
 let reads=0;const session=new NativeHciFileSession(async()=>result(),async()=>{reads++;return bytes();});session.attach(true);
 await session.choose();assert.equal(reads,0);assert.deepEqual(session.state.candidate,{name:'selected.btsnoop',size:bytes().length});
 assert.doesNotMatch(JSON.stringify(session.state),/content:|provider/);
 assert.deepEqual(await session.load(),bytes());assert.equal(reads,1);assert.equal(session.state.candidate,null);assert.equal(await session.load(),null);
});
test('HCI rejects missing, ambiguous, unknown-size, oversized and remote picker selections without reads',async()=>{
 const asset=result().assets![0]!;
 for(const value of [{canceled:true}, {canceled:false,assets:[]}, {canceled:false,assets:[asset,asset]},
  ...[undefined,0,15,32769,NaN,Infinity,1.5].map(size=>({canceled:false,assets:[{...asset,size}]})),
  {canceled:false,assets:[{...asset,uri:'https://example.invalid/file'}]}]) {
  const session=new NativeHciFileSession(async()=>value,noRead);session.attach(true);await session.choose();assert.equal(session.state.candidate,null);assert.equal(await session.load(),null);
 }
});
test('OS picker background return requires a new foreground Load; subsequent background discards candidate',async()=>{
 const picker=deferred<NativeHciPickResult>();let reads=0;
 const session=new NativeHciFileSession(()=>picker.promise,async()=>{reads++;return bytes();});session.attach(true);
 const choosing=session.choose();session.foreground(false);picker.resolve(result());await choosing;
 assert.ok(session.state.candidate);assert.equal(await session.load(),null);assert.equal(reads,0);
 session.foreground(false);session.foreground(true);assert.deepEqual(await session.load(),bytes());
 await session.choose();session.foreground(false);session.foreground(true);assert.equal(session.state.candidate,null);
});
test('clear, detach and newer input fence pending picker results and stale rendered actions',async()=>{
 for(const action of ['reset','detach'] as const) {
  const pending=deferred<NativeHciPickResult>();const s=new NativeHciFileSession(()=>pending.promise,noRead);s.attach(true);
  const old=s.state,choosing=s.choose();s[action]();pending.resolve(result());await choosing;assert.equal(s.state.candidate,null);
  await s.choose(old);assert.equal(s.state.candidate,null);
 }
 const s=new NativeHciFileSession(async()=>result(),async()=>bytes());s.attach(true);await s.choose();const stale=s.state;
 await s.choose();assert.equal(await s.load(stale),null);assert.ok(s.state.candidate);
});
test('pending reads remain owned while background, reset or newer source prevent publication',async()=>{
 for(const action of ['background','reset','detach','source'] as const) {
  const pending=deferred<Uint8Array>();let source=true,checks:(()=>boolean)|undefined;
  const s=new NativeHciFileSession(async()=>result(),async(_file,current)=>{checks=current;return pending.promise;});s.attach(true);await s.choose();
  const loading=s.load(s.state,()=>source);assert.equal(s.state.reading,true);
  if(action==='background')s.foreground(false);if(action==='reset')s.reset();if(action==='detach')s.detach();if(action==='source')source=false;
  assert.equal(checks!(),false);assert.equal(s.state.reading,true);assert.equal(await s.load(),null);
  pending.resolve(bytes());assert.equal(await loading,null);assert.equal(s.state.reading,false);assert.equal(s.state.candidate,null);
 }
});
test('reentrant observers cannot dispatch after clear or publish bytes after final detach',async()=>{
 let picks=0;const s=new NativeHciFileSession(async()=>{picks++;return result();},async()=>bytes());s.attach(true);
 const off=s.subscribe(()=>{if(s.state.picking)s.reset();});await s.choose();off();assert.equal(picks,0);
 await s.choose();s.subscribe(()=>{if(s.state.message.startsWith('File bytes read'))s.detach();});assert.equal(await s.load(),null);
 const t=new NativeHciFileSession(async()=>result(),async()=>bytes());t.attach(true);t.subscribe(()=>{throw Error('observer');});await t.choose();assert.deepEqual(await t.load(),bytes());
});
test('module gates survive replacement sessions and hold failed-close errors without reopening',async()=>{
 const pending=deferred<Uint8Array>();let reads=0;const read=nativeHciSingleFlight(async()=>{reads++;return pending.promise;},true);
 const first=new NativeHciFileSession(async()=>result(),read),second=new NativeHciFileSession(async()=>result(),read);
 first.attach(true);await first.choose();const loading=first.load();first.detach();
 second.attach(true);await second.choose();assert.equal(await second.load(),null);assert.match(second.state.message,/still draining/);assert.equal(reads,1);
 pending.resolve(bytes());assert.equal(await loading,null);await second.choose();assert.deepEqual(await second.load(),bytes());assert.equal(reads,2);
 const failure=new NativeLocalFileCloseError([Error('private URI')]);let attempts=0;
 const latched=nativeHciSingleFlight(async()=>{attempts++;throw failure;},true);
 await assert.rejects(latched(),error=>error===failure);await assert.rejects(latched(),error=>error===failure);assert.equal(attempts,1);
 const s=new NativeHciFileSession(async()=>result(),latched);s.attach(true);await s.choose();assert.equal(await s.load(),null);assert.match(s.state.message,/restart/);assert.doesNotMatch(s.state.message,/private/);
});
test('picker gate drains through unmount and releases ordinary errors for explicit retry',async()=>{
 const pending=deferred<NativeHciPickResult>();let picks=0;const pick=nativeHciSingleFlight(async()=>{picks++;return pending.promise;});
 const first=new NativeHciFileSession(pick,noRead),second=new NativeHciFileSession(pick,noRead);first.attach(true);const choosing=first.choose();first.detach();
 second.attach(true);await second.choose();assert.equal(picks,1);assert.match(second.state.message,/still open/);
 pending.resolve(result());await choosing;await second.choose();assert.equal(picks,2);assert.ok(second.state.candidate);
 let calls=0;const retry=nativeHciSingleFlight(async()=>{if(++calls===1)throw Error('ordinary');return 1;});await assert.rejects(retry());assert.equal(await retry(),1);
 const gate=deferred<number>(),blocking=nativeHciSingleFlight(()=>gate.promise);const run=blocking();await assert.rejects(blocking(),NativeHciBusyError);gate.resolve(1);await run;
});
test('native HCI staging is atomic, exact, uninspected and isolated from stale controller state',async()=>{
 let hashes=0;const c=new HciWorkbenchController(true,async b=>{hashes++;return createHash('sha256').update(b).digest('hex');});
 c.example(c.lease);await c.inspect(c.lease);const previous=c.state;
 const data=bytes();assert.equal(c.stageFileBytes(data,c.lease,previous),true);data.fill(0);
 assert.equal(c.state.draft,HCI_EXAMPLE);assert.equal(c.state.provenance,'recorded-import');assert.equal(c.state.metadata,null);assert.equal(hashes,1);
 const accepted=c.state;c.stageFileBytes(bytes(),c.lease,previous);assert.equal(c.state,accepted);
 await c.inspect(c.lease);assert.equal(hashes,2);assert.equal(c.state.metadata!.source.sha256,createHash('sha256').update(bytes()).digest('hex'));
 assert.equal(c.state.metadata!.source.label,'selected native HCI file');
 c.deactivate();c.activate();const before=c.state;assert.equal(c.stageFileBytes(bytes(),c.lease-1,before),false);assert.equal(c.state,before);
 for(const bad of [new Uint8Array(15),new Uint8Array(32769),new Uint8Array(new SharedArrayBuffer(16)),new Uint8Array(new ArrayBuffer(16,{maxByteLength:32}))]){
  assert.equal(c.stageFileBytes(bad,c.lease,c.state),false);assert.equal(c.state.rejectedEdit,true);assert.equal(c.state.draft,HCI_EXAMPLE);
 }
 c.stageFileBytes(new Uint8Array(32768),c.lease,c.state);assert.equal(c.state.draft.length,65536);assert.equal(c.state.rejectedEdit,false);
});
