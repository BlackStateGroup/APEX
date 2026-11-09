/** Synthetic providers only; no native operations or user files. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureNativeLocalFile, NATIVE_LOCAL_READ_CHUNK, NativeLocalFileCloseError } from '../src/native-local-file.ts';
import type { NativeLocalReadHandle } from '../src/native-local-file.ts';
const asset = (size = 4) => ({name:'capture.btsnoop', uri:'file:///selected/capture.btsnoop', size});
const select = (size = 4) => captureNativeLocalFile(asset(size), 0, 65536);
function deferred<T>() { let resolve!: (value:T) => void; const promise = new Promise<T>(r => {resolve=r;}); return {promise,resolve}; }
function provider(data = new Uint8Array([1,2,3,4]), partial = Infinity) {
 let offset = 0, closed = 0; const requests: number[] = [];
 const handle = {size: data.length as number|null, async readBytes(n: number): Promise<Uint8Array> {
  requests.push(n); const result=data.slice(offset,offset+Math.min(n,partial)); offset+=result.length; return result;
 }, close() {closed++;}};
 return {handle,requests,get closed(){return closed;}};
}
test('selection is immutable, captures mutable input once, hides URI and bounds display',async()=>{
 const input=asset();input.name='x'.repeat(256); const file=captureNativeLocalFile(input,1,4);
 assert.ok(Object.isFrozen(file));assert.deepEqual(Object.keys(file),['name','size','read']);assert.equal(file.name.length,160);
 Object.assign(input,{uri:'https://invalid.test',size:999,name:'changed'});
 const p=provider();let opened='';assert.deepEqual(await file.read(uri=>{opened=uri;return p.handle;}),new Uint8Array([1,2,3,4]));
 assert.equal(opened,asset().uri);assert.equal(p.closed,1);
 assert.equal(captureNativeLocalFile({...asset(),name:'x\n\u202ey'},1,4).name,'x\ufffd\ufffdy');
});
test('strict sizes, caller bounds, names and whole local URI validation',()=>{
 for(const size of [undefined,NaN,Infinity,-1,1.5,5,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>captureNativeLocalFile({...asset(),size},0,4));
 for(const [min,max] of [[-1,4],[5,4],[0,Infinity],[0,4.5],[NaN,4]]) assert.throws(()=>captureNativeLocalFile(asset(),min!,max!));
 for(const name of ['', 'x'.repeat(257)]) assert.throws(()=>captureNativeLocalFile({...asset(),name},1,4));
 for(const uri of ['https://test/x','file://server/x','file:////server/x','file:///','content://provider','content:///x','content://user@provider/x','content://provider:80/x',
  'file:///x trailing','file:///x\n','file:///x\u0000','file:///x\\y','file:///x%','file:///x%GG','file:///x%0a','file:///x%5c',
  'file:///x?query','file:///x#fragment','file:///'+ 'x'.repeat(8192),'file:///x\u00a0','file:///x%ff'])
  assert.throws(()=>captureNativeLocalFile({...asset(),uri},1,4),uri);
 for(const uri of ['file:///x%20y','content://org.example.provider/document/a%3Ab', 'file:///'+'x'.repeat(8184)])
  assert.ok(captureNativeLocalFile({...asset(),uri},4,4));
 assert.ok(captureNativeLocalFile(asset(0),0,0));
});
test('bounded chunks, short nonempty progress, exact EOF and independently owned snapshots',async()=>{
 const data=Uint8Array.from({length:65536},(_,i)=>i%251),p=provider(data,5000);
 assert.deepEqual(await select(data.length).read(()=>p.handle),data);
 assert.ok(p.requests.every(n=>n>0&&n<=NATIVE_LOCAL_READ_CHUNK));assert.equal(p.requests.at(-1),1);assert.equal(p.closed,1);
 const empty=provider(new Uint8Array());assert.deepEqual(await select(0).read(()=>empty.handle),new Uint8Array());assert.deepEqual(empty.requests,[1]);
 const p2=provider();const file=select();const first=await file.read(()=>p2.handle);first[0]=99;
 assert.deepEqual(await file.read(()=>provider().handle),new Uint8Array([1,2,3,4]));
});
test('size mismatch, unknown size, growth and truncation fail closed',async()=>{
 for(const size of [null,3,5,NaN]) {const p=provider();p.handle.size=size;await assert.rejects(select().read(()=>p.handle));assert.deepEqual(p.requests,[]);assert.equal(p.closed,1);}
 for(const length of [3,5]) {const p=provider(new Uint8Array(length));p.handle.size=4;await assert.rejects(select().read(()=>p.handle));assert.equal(p.closed,1);}
 const p=provider();const original=p.handle.readBytes;p.handle.readBytes=async n=>{const data=await original(n);if(!data.length)p.handle.size=5;return data;};
 await assert.rejects(select().read(()=>p.handle));assert.equal(p.closed,1);
});
test('invalid chunks, shared and resizable backing stores rejected',async()=>{
 const invalid: unknown[]=[null,new Uint8Array(0),new Uint8Array(5),new Uint16Array(2),new Uint8Array(new SharedArrayBuffer(4)),new Uint8Array(new ArrayBuffer(4,{maxByteLength:8}))];
 for(const value of invalid){const p=provider();p.handle.readBytes=async()=>value as Uint8Array;await assert.rejects(select().read(()=>p.handle));assert.equal(p.closed,1);}
});
test('stale before open never opens; pending open drains then closes without reads',async()=>{
 let opened=0;await assert.rejects(select().read(()=>{opened++;return provider().handle;},()=>false));assert.equal(opened,0);
 const pending=deferred<NativeLocalReadHandle>();let live=true;const p=provider();const read=select().read(()=>pending.promise,()=>live);
 live=false;pending.resolve(p.handle);await assert.rejects(read,/no longer current/);assert.equal(p.closed,1);assert.deepEqual(p.requests,[]);
});
test('stale pending data/EOF reads drain, close and do not issue further reads',async()=>{
 for(const staleAtEof of [false,true]) {
  let live=true,count=0,closed=0;const pending=deferred<Uint8Array>(),started=deferred<void>();
  const handle:NativeLocalReadHandle={size:4,async readBytes(){count++;if(staleAtEof&&count===1)return new Uint8Array(4);started.resolve();return pending.promise;},close(){closed++;}};
  const read=select().read(()=>handle,()=>live);await started.promise;live=false;
  assert.equal(closed,0);pending.resolve(new Uint8Array(staleAtEof?0:4));await assert.rejects(read,/no longer current/);
  assert.equal(count,staleAtEof?2:1);assert.equal(closed,1);
 }
});
test('checks guard before each next read even if prior check was current',async()=>{
 let checks=0;const p=provider();await assert.rejects(select().read(()=>p.handle,()=>++checks<3));
 assert.deepEqual(p.requests,[]);assert.equal(p.closed,1);
});
test('close failures reject success, and preserve original failures including non-Error values',async()=>{
 const closeError=new Error('close failed');const p=provider();p.handle.close=()=>{throw closeError;};
 await assert.rejects(select().read(()=>p.handle),e=>e instanceof NativeLocalFileCloseError && e.errors.length===1 && e.errors[0]===closeError);
 for(const failure of [new Error('read failed'),undefined]) {
  let closed=0;const handle:NativeLocalReadHandle={size:4,async readBytes(){throw failure;},close(){closed++;throw closeError;}};
  await assert.rejects(select().read(()=>handle),e=>e instanceof NativeLocalFileCloseError && e instanceof AggregateError && e.errors.length===2 && e.errors[0]===failure && e.errors[1]===closeError);
  assert.equal(closed,1);
 }
 const failure=new Error('open failed');await assert.rejects(select().read(()=>{throw failure;}),e=>e===failure);
});

test('post-open guard and size accessor failures still close the handle',async()=>{
 const guardError=new Error('guard failed');let checks=0;const p=provider();
 await assert.rejects(select().read(()=>p.handle,()=>{if(++checks===2)throw guardError;return true;}),e=>e===guardError);
 assert.equal(p.closed,1);assert.deepEqual(p.requests,[]);
 let closed=0;const sizeError=new Error('size failed');
 await assert.rejects(select().read(()=>({get size(): number {throw sizeError;},async readBytes(){return new Uint8Array();},close(){closed++;}})),e=>e===sizeError);
 assert.equal(closed,1);
});
test('same-size replacement is a snapshot, not authenticated content',async()=>{
 const file=select();const replacement=new Uint8Array([9,8,7,6]);
 assert.deepEqual(await file.read(()=>provider(replacement).handle),replacement);
});
