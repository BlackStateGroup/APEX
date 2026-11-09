/** Independent hostile lifecycle/provider checks. Host-only, not native acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureNativeLocalFile, NativeLocalFileCloseError } from '../src/native-local-file.ts';
import { NativeHciFileSession, nativeHciSingleFlight } from '../src/native-hci-file.ts';
import { HciWorkbenchController } from '../src/hci-workbench.ts';
const asset = {name:'untrusted.btsnoop',uri:'content://authority/document/encoded%3Aname',size:16};
const selection = {canceled:false,assets:[asset]};
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}

test('independent: maximum exact bytes survive arbitrary short chunks, offset views and staging without hashing',async()=>{
 const data=Uint8Array.from({length:32768},(_,i)=>i%256),requests:number[]=[];let offset=0,closes=0,hashes=0;
 const file=captureNativeLocalFile({...asset,size:data.length},16,32768);
 const actual=await file.read(()=>({size:data.length,async readBytes(n){requests.push(n);const length=Math.min(997,n,data.length-offset);const backing=new Uint8Array(length+19);backing.set(data.subarray(offset,offset+length),7);offset+=length;return backing.subarray(7,7+length);},close(){closes++;}}));
 assert.deepEqual(actual,data);assert.equal(closes,1);assert.equal(requests.at(-1),1);assert.ok(requests.every(n=>n>=1&&n<=16384));
 const c=new HciWorkbenchController(true,async()=>{hashes++;return 'unused';});
 assert.equal(c.stageFileBytes(actual,c.lease,c.state),true);actual.fill(255);
 assert.equal(c.state.draft,Buffer.from(data).toString('hex'));assert.equal(c.state.provenance,'recorded-import');assert.equal(c.state.metadata,null);assert.equal(hashes,0);
});

test('independent: read error after partial data publishes neither bytes nor native diagnostics',async()=>{
 let calls=0,closes=0;
 const s=new NativeHciFileSession(async()=>selection,async(file,current)=>file.read(()=>({size:16,async readBytes(){if(++calls===1)return new Uint8Array(8);throw Error(asset.uri);},close(){closes++;}}),current));
 s.attach(true);await s.choose();assert.equal(await s.load(),null);assert.equal(calls,2);assert.equal(closes,1);assert.equal(s.state.candidate,null);assert.doesNotMatch(JSON.stringify(s.state),/content:|authority/);
});

test('independent: failed EOF close latches even if read was invalidated while draining',async()=>{
 const eof=deferred<Uint8Array>(),started=deferred<void>();let opens=0,closes=0;
 const read=nativeHciSingleFlight(async(file:ReturnType<typeof captureNativeLocalFile>,current:()=>boolean)=>file.read(()=>{opens++;let n=0;return {size:16,async readBytes(){if(++n===1)return new Uint8Array(16);started.resolve();return eof.promise;},close(){closes++;throw Error('release unknown');}};},current),true);
 const s=new NativeHciFileSession(async()=>selection,read);s.attach(true);await s.choose();const pending=s.load();await started.promise;s.reset();eof.resolve(new Uint8Array());assert.equal(await pending,null);
 const t=new NativeHciFileSession(async()=>selection,read);t.attach(true);await t.choose();assert.equal(await t.load(),null);assert.equal(opens,1);assert.equal(closes,1);assert.match(t.state.message,/restart/);
 await assert.rejects(read(captureNativeLocalFile(asset,16,32768),()=>true),NativeLocalFileCloseError);
});

test('independent: final read publication can synchronously replace selection without leaking old bytes',async()=>{
 let picks=0;const s=new NativeHciFileSession(async()=>{picks++;return selection;},async()=>new Uint8Array(16));s.attach(true);await s.choose();
 let invoked=false;let picking:Promise<void>|undefined;
 s.subscribe(()=>{if(!invoked&&!s.state.reading&&s.state.message.startsWith('File bytes read')){invoked=true;picking=s.choose();}});
 assert.equal(await s.load(),null);await picking;assert.equal(picks,2);assert.ok(s.state.candidate);assert.equal(s.state.reading,false);assert.equal(s.state.picking,false);
});

test('independent: every controller input action invalidates an in-flight native handoff immediately',async()=>{
 for(const action of ['edit','clear','declare','example','inspect','navigate'] as const){
  const c=new HciWorkbenchController(true,async()=> 'unused'),observed=c.state,lease=c.lease,pending=deferred<Uint8Array>();
  const sourceCurrent=()=>c.isActive(lease)&&c.state===observed;
  const s=new NativeHciFileSession(async()=>selection,()=>pending.promise);s.attach(true);await s.choose();const loading=s.load(s.state,sourceCurrent);
  if(action==='edit')c.edit('aabb',lease);if(action==='clear')c.clear(lease);if(action==='declare')c.declare('synthetic-fixture',lease);if(action==='example')c.example(lease);if(action==='inspect')await c.inspect(lease);if(action==='navigate'){c.deactivate();c.activate();}
  const retained=c.state;pending.resolve(new Uint8Array(16));assert.equal(await loading,null,action);assert.equal(c.stageFileBytes(new Uint8Array(16),lease,observed),false,action);assert.equal(c.state,retained,action);
 }
});

test('independent: detach and attach same session cannot adopt prior OS picker or release its ownership early',async()=>{
 const picked=deferred<typeof selection>();let calls=0;const s=new NativeHciFileSession(()=>{calls++;return picked.promise;},async()=>new Uint8Array(16));s.attach(true);const old=s.choose();s.detach();s.attach(true);await s.choose();assert.equal(calls,1);picked.resolve(selection);await old;assert.equal(s.state.candidate,null);await s.choose();assert.equal(calls,2);assert.ok(s.state.candidate);
});
