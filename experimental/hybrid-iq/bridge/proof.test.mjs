import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { encode, project, snapshot, MAX_REQUEST, MAX_RESPONSE } from './codec.ts';
import { OptionalIqExecutor, Cancelled } from './client.ts';
import { fixtures, packPairs } from '../../cpp-iq/proof-codec.mjs';
import { extraFixtures } from '../../cpp-iq/extra-fixtures.mjs';
import { prepareReference, runReference } from '../reference.mjs';
import { fftComplexForward } from '../../../packages/core/iq-analysis.ts';
const root=fileURLToPath(new URL('.',import.meta.url));
const sanitized=process.env.APEX_BRIDGE_SANITIZE==='1';
const build=join(root,'../.build');mkdirSync(build,{recursive:true});
const host=join(build,`bridge-${sanitized?'sanitize':'verify'}`);
const env={...process.env,ASAN_OPTIONS:'detect_leaks=0:abort_on_error=1',UBSAN_OPTIONS:'halt_on_error=1:print_stacktrace=1'};
function command(program,args,options={}) {return spawnSync(program,args,{cwd:root,timeout:120000,maxBuffer:MAX_RESPONSE+65536,env,...options});}
const flags=['-std=c++17',sanitized?'-O1':'-O3','-Wall','-Wextra','-Wpedantic','-Wconversion','-Werror','-fno-fast-math','-ffp-contract=off'];
if(sanitized)flags.push('-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-fno-pie','-no-pie');
for(const [source,out] of [['host.cpp',host],['abi.test.cpp',`${host}-abi`]]) {const result=command('g++',[...flags,'../src/kernel.cpp','bridge.cpp',source,'-o',out]);assert.equal(result.status,0,result.stderr.toString());}
function native(bytes) {const r=command(host,[],{input:bytes});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stderr.length,0);return new Uint8Array(r.stdout);}
const numeric=r=>({fftSize:r.options.fftSize,frameCount:r.options.frameCount,cellCount:r.cellCount,windowDurationSeconds:r.windowDurationSeconds,binSpacingHz:r.binSpacingHz,axis:r.axis,frames:r.frames});
const fixture=()=>fixtures()[0];
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function* impulses(){for(const n of [256,512,1024,2048,4096])for(let pos=0;pos<n;){const count=Math.min(n-pos,16384/n),data=Buffer.alloc(n*count*4);for(let k=0;k<count;k++){data.writeInt16LE(16384,(k*n+pos+k)*4);data.writeInt16LE(-8192,(k*n+pos+k)*4+2);}yield {name:`impulse-${n}-${pos}`,data,fftSize:n,startSample:0,hopSamples:n,frameCount:count,sampleRate:8192,centerFrequency:1e6};pos+=count;}}
function* randomCases(){let state=0x1ae78501;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;for(const n of [256,512,1024,2048,4096])for(let k=0;k<12;k++){const count=1+next()%Math.min(64,16384/n),start=next()%64,hop=1+next()%Math.floor((65536-start-n)/Math.max(1,count-1)+1),length=start+(count-1)*hop+n;yield {name:`random-${n}-${k}`,data:packPairs(Array.from({length},()=>[(next()>>>16)-32768,(next()>>>16)-32768])),fftSize:n,startSample:start,hopSamples:hop,frameCount:count,sampleRate:[1,1e9,12345678.125][k%3],centerFrequency:[-1e12,1e12,-123456789.75][k%3]};}}
test('C ABI: cancellation, bounded input, no partial output, output span and rounding',()=>{const r=command(`${host}-abi`,[]);assert.equal(r.status,0,r.stderr.toString());assert.match(r.stdout.toString(),/PASS/);});
test('pinned reference core and runtime-neutral client imports',()=>{
 for(const [file,sha] of [['../../../packages/core/iq-analysis.ts','c1d65937e402e53f93e40838fa89fc4063b391b7'],['../../../packages/core/iq-offline.ts','df6a1bea6fe1dd527e91be2979538ee054a4387f'],['../../../packages/core/bounded-json.ts','aed4bc98243b3bcda2ed205bf210940b95e7c49b']]){const b=readFileSync(join(root,file));assert.equal(createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'),sha);}
 for(const file of ['codec.ts','client.ts'])assert.doesNotMatch(readFileSync(join(root,file),'utf8'),/\bBuffer\b|node:|require\(/);
});
test('portable bridge exact projection and raw FFT across full 1,485-request corpus',async t=>{
 let cases=0,windows=0,bins=0;
 for(const f of [...fixtures(),...extraFixtures(),...impulses(),...randomCases()]){
  const request=encode(f,{session:0xffffffff,request:++cases}),response=native(request.bytes);
  assert.deepEqual(project(response,request.context),numeric(runReference(await prepareReference(f),f)),f.name);
  const view=new DataView(response.buffer,response.byteOffset,response.byteLength);let at=32;
  for(let frame=0;frame<f.frameCount;frame++){
   const real=new Float64Array(f.fftSize),imaginary=new Float64Array(f.fftSize),data=new DataView(f.data.buffer,f.data.byteOffset,f.data.length);
   for(let k=0;k<f.fftSize;k++){const w=0.5-0.5*Math.cos(2*Math.PI*k/f.fftSize),offset=(f.startSample+frame*f.hopSamples+k)*4;real[k]=data.getInt16(offset,true)/32768*w;imaginary[k]=data.getInt16(offset+2,true)/32768*w;}
   const expected=fftComplexForward(real,imaginary);
   for(const values of [expected.real,expected.imaginary])for(const value of values){assert.ok(Object.is(view.getFloat64(at,true),value),`${f.name} raw ${at}`);at+=8;}
  }
  windows+=f.frameCount;bins+=f.frameCount*f.fftSize;
 }
 assert.equal(cases,1485);assert.equal(bins,23029248);t.diagnostic(JSON.stringify({cases,windows,bins,exactRawComponents:bins*2,sanitized,leakSanitizer:false,mobile:false,rust:false}));
});
test('wrong identity, shape, nonfinite/oversized response and foreign context are refused',()=>{
 const f=fixture(),a=encode(f,{session:1,request:1}),b=encode(f,{session:1,request:2}),c=encode(f,{session:2,request:1}),good=native(a.bytes);
 for(const context of [b.context,c.context,{}])assert.throws(()=>project(good,context));
 const bad=[new Uint8Array(),good.slice(0,-1),new Uint8Array(MAX_RESPONSE+1)];
 for(const at of [0,4,6,8,12,16,20,24,28]){const bytes=good.slice();bytes[at]^=1;bad.push(bytes);}
 for(const value of [NaN,Infinity,-Infinity,1e20]){const bytes=good.slice();new DataView(bytes.buffer).setFloat64(32,value,true);bad.push(bytes);}
 for(const bytes of bad)assert.throws(()=>project(bytes,a.context));
 const backing=new Uint8Array(good.length+17);backing.set(good,7);assert.deepEqual(project(backing.subarray(7,7+good.length),a.context),project(good,a.context));
});
test('malformed native request bounds and reserved fields reject without response',()=>{
 const valid=encode(fixture(),{session:1,request:1}).bytes;
 const bad=[new Uint8Array(),valid.slice(0,47),valid.slice(0,-1),new Uint8Array(MAX_REQUEST+1)];
 for(const at of [0,4,6,36,40,44]){const b=valid.slice();b[at]^=1;bad.push(b);}
 for(const [at,values] of [[8,[0]],[12,[0]],[16,[0,3,262148,0xffffffff]],[20,[0,128,4097,0xffffffff]],[24,[65536,0xffffffff]],[28,[0,65537,0xffffffff]],[32,[0,65,0xffffffff]]])for(const value of values){const b=valid.slice();new DataView(b.buffer).setUint32(at,value,true);bad.push(b);}
 const n=new DataView(valid.buffer).getUint32(20,true),length=new DataView(valid.buffer).getUint32(16,true);
 for(const at of [48+length,48+length+n*8,valid.length-8])for(const value of [NaN,Infinity,-Infinity,2]){const b=valid.slice();new DataView(b.buffer).setFloat64(at,value,true);bad.push(b);}
 for(const input of bad){const r=command(host,[],{input});assert.ok(r.status===1||r.status===2,r.stderr.toString());assert.equal(r.stdout.length,0);}
});
test('snapshots own byte views, metadata; shared/resizable and invalid geometry reject',()=>{
 const f=fixture(),backing=new Uint8Array(f.data.length+8);backing.set(f.data,3);const original=snapshot({...f,data:backing.subarray(3,3+f.data.length)});backing.fill(7);f.sampleRate=999;assert.notEqual(original.sampleRate,999);assert.notEqual(original.data[0],7);
 const invalid=[{data:new Uint8Array(new SharedArrayBuffer(4096))},{data:new Uint8Array(new ArrayBuffer(4096,{maxByteLength:8192}))},{fftSize:128},{sampleRate:NaN},{sampleRate:0},{centerFrequency:Infinity},{startSample:-1},{hopSamples:0},{frameCount:65},{data:new Uint8Array(3)}];
 for(const patch of invalid)assert.throws(()=>snapshot({...fixture(),...patch}));
});
test('default JS fallback and optional native success preserve identical value',async()=>{
 const f=fixture(),expected=numeric(runReference(await prepareReference(f),f));let calls=0;
 const fallback=async copy=>{calls++;return numeric(runReference(await prepareReference(copy),copy));};
 assert.deepEqual(await new OptionalIqExecutor(fallback).run(f),{value:expected,backend:'javascript',fallback:'not-configured'});
 assert.equal(calls,1);
 const executor=new OptionalIqExecutor(fallback,{session:55,execute:async bytes=>native(bytes),cancel(){}});
 assert.deepEqual(await executor.run(f),{value:expected,backend:'native',fallback:null});assert.equal(calls,1);assert.equal(executor.busy,false);
});
test('native reject, throw, malformed or wrong-request response falls back on untouched snapshot',async()=>{
 const f=fixture(),expected=numeric(runReference(await prepareReference(f),f));let session=100;
 for(const execute of [()=>{throw Error('sync');},async()=>{throw Error('async');},async()=>new Uint8Array(),async bytes=>{const response=native(bytes);new DataView(response.buffer).setUint32(12,99,true);return response;},async bytes=>{bytes.fill(0);throw Error('mutated');}]){
  const executor=new OptionalIqExecutor(async copy=>numeric(runReference(await prepareReference(copy),copy)),{session:session++,execute,cancel(){}});
  assert.deepEqual(await executor.run(f),{value:expected,backend:'javascript',fallback:'native-rejected'});assert.equal(executor.busy,false);
 }
});
test('cancel retains busy gate until native drain and suppresses success/fallback',async()=>{
 for(const reject of [false,true]){
  const d=defer();let input,cancels=0,fallbacks=0;
  const executor=new OptionalIqExecutor(()=>{fallbacks++;throw Error('must not fallback');},{session:reject?201:200,execute:bytes=>{input=bytes;return d.promise;},cancel(session,request){assert.equal(session,reject?201:200);assert.equal(request,1);cancels++;throw Error('control failed');}});
  const pending=executor.run(fixture()),rejected=assert.rejects(pending,Cancelled);executor.cancel();executor.cancel();
  assert.equal(executor.busy,true);await assert.rejects(executor.run(fixture()),/busy/);assert.equal(cancels,1);
  reject?d.reject(Error('native failure')):d.resolve(native(input));await rejected;assert.equal(executor.busy,false);assert.equal(fallbacks,0);
 }
});
test('old same-shape response cannot satisfy next operation',async()=>{
 let old,call=0,fallback=0;const executor=new OptionalIqExecutor(async f=>{fallback++;return numeric(runReference(await prepareReference(f),f));},{session:300,execute:async bytes=>{call++;if(call===1)old=native(bytes);return old;},cancel(){}});
 assert.equal((await executor.run(fixture())).backend,'native');assert.equal((await executor.run(fixture())).fallback,'native-rejected');assert.equal(fallback,1);
});
test('dispose and cancellation during JS fallback fence publication; errors release gate',async()=>{
 const d=defer(),executor=new OptionalIqExecutor(()=>d.promise),pending=executor.run(fixture()),rejected=assert.rejects(pending,Cancelled);executor.dispose();assert.equal(executor.busy,true);await assert.rejects(executor.run(fixture()),/disposed/);d.resolve({});await rejected;assert.equal(executor.busy,false);
 const failing=new OptionalIqExecutor(()=>{throw Error('fallback failed');});await assert.rejects(failing.run(fixture()),/fallback failed/);assert.equal(failing.busy,false);
 await assert.rejects(failing.run({...fixture(),fftSize:9}),/FFT size/);assert.equal(failing.busy,false);
});
test('reentrant input cancellation prevents native dispatch',async()=>{
 let calls=0;const executor=new OptionalIqExecutor(()=>{calls++;throw Error('unexpected fallback');},{session:400,execute:async()=>{calls++;return new Uint8Array();},cancel(){calls++;}});
 const f=fixture();Object.defineProperty(f,'sampleRate',{get(){executor.cancel();return 8192;}});await assert.rejects(executor.run(f),Cancelled);assert.equal(calls,0);assert.equal(executor.busy,false);
});

test('intrinsic typed-array checks reject spoofed shared/resizable/oversize arrays',()=>{
 const f=fixture();
 for(const data of [new Uint8Array(new SharedArrayBuffer(f.data.length)),new Uint8Array(new ArrayBuffer(f.data.length,{maxByteLength:f.data.length*2})),new Uint8Array(262148)]) {
  Object.defineProperty(data,'buffer',{value:new ArrayBuffer(f.data.length)});Object.defineProperty(data,'length',{value:f.data.length});
  assert.throws(()=>snapshot({...f,data}));
 }
 const fake=Object.create(Uint8Array.prototype);assert.throws(()=>snapshot({...f,data:fake}));
 const request=encode(f,{session:1,request:1}),good=native(request.bytes),oversize=new Uint8Array(MAX_RESPONSE+1);oversize.set(good);Object.defineProperty(oversize,'length',{value:good.length});assert.throws(()=>project(oversize,request.context));
 const shared=new Uint8Array(new SharedArrayBuffer(good.length));shared.set(good);Object.defineProperty(shared,'buffer',{value:good.buffer});assert.throws(()=>project(shared,request.context));
});
test('session identity cannot be reused by another executor even after disposal',()=>{
 const fallback=()=>{throw Error('not called');};const backend={session:501,execute:async()=>new Uint8Array(),cancel(){}};
 const first=new OptionalIqExecutor(fallback,backend);assert.throws(()=>new OptionalIqExecutor(fallback,backend),/already claimed/);first.dispose();assert.throws(()=>new OptionalIqExecutor(fallback,{...backend}),/already claimed/);
 for(const session of [0,-1,NaN,1.5,0x100000000])assert.throws(()=>new OptionalIqExecutor(fallback,{...backend,session}),/Invalid native session/);
});

test('cancelled asynchronous fallback rejection is still cancellation',async()=>{
 const d=defer(),executor=new OptionalIqExecutor(()=>d.promise),pending=executor.run(fixture()),rejected=assert.rejects(pending,Cancelled);executor.cancel();d.reject(Error('late fallback failure'));await rejected;assert.equal(executor.busy,false);
});
test('session registry has a bounded fail-closed lifetime',()=>{
 const source=`import { OptionalIqExecutor } from ${JSON.stringify(new URL('./client.ts',import.meta.url).href)}; const fallback=()=>{throw Error('not called');}; for(let session=1;session<=1024;session++)new OptionalIqExecutor(fallback,{session,execute:async()=>new Uint8Array(),cancel(){}}); try{new OptionalIqExecutor(fallback,{session:1025,execute:async()=>new Uint8Array(),cancel(){}});process.exit(2);}catch(e){if(!/registry exhausted/.test(e.message))throw e;}`;
 const r=command(process.execPath,['--input-type=module','-e',source]);assert.equal(r.status,0,r.stderr.toString());
});
