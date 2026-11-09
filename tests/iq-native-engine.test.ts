import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareIq } from '../packages/core/iq-offline.ts';
import type { IqByteHasher } from '../packages/core/iq-offline.ts';
import { analyzeIq, analyzeIqTimeFrequency } from '../packages/core/iq-analysis.ts';
import { IqAnalysisEngine } from '../src/iq-engine.ts';
import { IqController } from '../src/iq-workbench.ts';
import { Cancelled } from '../experimental/hybrid-iq/bridge/client.ts';
const dir=mkdtempSync(join(tmpdir(),'apex-iq-activation-')),host=join(dir,'host');
after(()=>rmSync(dir,{recursive:true,force:true}));
const built=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra','-Werror','-fno-fast-math','-ffp-contract=off','experimental/hybrid-iq/src/kernel.cpp','experimental/hybrid-iq/bridge/bridge.cpp','experimental/hybrid-iq/bridge/host.cpp','-o',host],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
const hasher:IqByteHasher={digest:async(algorithm,bytes)=>createHash(algorithm==='SHA-256'?'sha256':'sha512').update(bytes).digest('hex')};
const metadata=new TextEncoder().encode(JSON.stringify({global:{'core:datatype':'ci16_le','core:version':'1.2.6','core:sample_rate':8192},captures:[{'core:sample_start':0,'core:frequency':1e6}],annotations:[]}));
async function recording(samples=65536){const data=new Uint8Array(samples*4),v=new DataView(data.buffer);let seed=45;for(let at=0;at<data.length;at+=2){seed=(Math.imul(seed,1664525)+1013904223)>>>0;v.setInt16(at,(seed>>>16)-32768,true);}return prepareIq(metadata,data,{schemaVersion:1,origin:'synthetic-fixture',importedAt:'2026-11-08T00:00:00.000Z'},hasher);}
function native(bytes:Uint8Array){const r=spawnSync(host,[],{input:bytes,maxBuffer:400000,timeout:10000});assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stderr.length,0);return new Uint8Array(r.stdout);}
let session=10000;
function provider(execute:(bytes:Uint8Array)=>Promise<Uint8Array>=async bytes=>native(bytes)) {const value={calls:0,cancels:0,closes:0,opens:0,open:()=>{value.opens++;const id=++session;return {bridge:{session:id,execute:async(bytes:Uint8Array)=>{value.calls++;return execute(bytes);},cancel:()=>{value.cancels++;}},close:()=>{value.closes++;}};}};return value;}
function deferred<T>(){let resolve!:(x:T)=>void,reject!:(x:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function turns(check:()=>boolean){for(let k=0;k<1000&&!check();k++)await new Promise(resolve=>setImmediate(resolve));assert.ok(check(),'condition did not settle');}
test('actual C++ path qualifies all sizes then preserves complete single/TF core reports',async()=>{
 const source=await recording(),p=provider(),engine=new IqAnalysisEngine(p.open);
 for(const fftSize of [256,512,1024,2048,4096] as const){const opts={fftSize,startSample:37};const r=await engine.single(source,opts);assert.equal(r.engine.backend,'native-cpp');assert.match(r.engine.summary,/verification mode/);assert.deepEqual(r.analysis,analyzeIq(source,opts));}
 for(const opts of [{fftSize:256 as const,startSample:11,hopSamples:1,frameCount:64},{fftSize:4096 as const,startSample:37,hopSamples:4096,frameCount:4}]){const r=await engine.timeFrequency(source,opts);assert.equal(r.engine.backend,'native-cpp');assert.deepEqual(r.analysis,analyzeIqTimeFrequency(source,opts));}
 assert.equal(p.calls,17+7);assert.equal(p.opens,1);engine.release();assert.equal(p.closes,1);
});
test('absent module and failing open preserve JS result and provenance',async()=>{
 const source=await recording(1024),expected=analyzeIq(source);
 for(const open of [()=>null,()=>{throw Error('module absent');}]){const engine=new IqAnalysisEngine(open,'No native module in this build');const r=await engine.single(source);assert.equal(r.engine.backend,'javascript');assert.deepEqual(r.analysis,expected);assert.match(r.engine.summary,/No native/);}
});
test('short default is statistics only; forged recording/invalid windows never invoke module',async()=>{
 const source=await recording(1),p=provider(),engine=new IqAnalysisEngine(p.open);const r=await engine.single(source);assert.deepEqual(r.analysis,analyzeIq(source));assert.equal(r.analysis.spectrum,null);assert.equal(p.opens,0);
 await assert.rejects(engine.single(source,{fftSize:256}),/exceeds/);await assert.rejects(engine.single({...source}),/prepared/i);assert.equal(p.opens,0);
});
test('raw signed-zero qualification catches a backend even when magnitude would agree',async()=>{
 const source=await recording(1024),p=provider(async bytes=>{const response=native(bytes);new DataView(response.buffer).setFloat64(32,-0,true);return response;}),engine=new IqAnalysisEngine(p.open);
 const result=await engine.single(source);assert.equal(result.engine.backend,'javascript');assert.match(result.engine.summary,/self-test failed/);assert.deepEqual(result.analysis,analyzeIq(source));assert.equal(p.calls,1);assert.equal(p.closes,1);
 const again=await engine.single(source);assert.match(again.engine.summary,/quarantined/);assert.equal(p.calls,1);
});
test('per-request verification rejects plausible finite corruption after successful qualification',async()=>{
 const source=await recording(1024);let call=0;const p=provider(async bytes=>{const response=native(bytes);if(++call===18){const v=new DataView(response.buffer);v.setFloat64(32,v.getFloat64(32,true)+0.001,true);}return response;}),engine=new IqAnalysisEngine(p.open);
 const result=await engine.single(source);assert.equal(result.engine.backend,'javascript');assert.match(result.engine.summary,/request failed exact/);assert.deepEqual(result.analysis,analyzeIq(source));assert.equal(p.calls,18);assert.equal(p.closes,1);
});
test('wrong identity and rejected native invocation fail closed before any native result is used',async()=>{
 const source=await recording(1024);
 for(const execute of [async()=>{throw Error('JNI failure');},async(bytes:Uint8Array)=>{const r=native(bytes);new DataView(r.buffer).setUint32(12,999,true);return r;}]){const p=provider(execute),engine=new IqAnalysisEngine(p.open);const result=await engine.single(source);assert.equal(result.engine.backend,'javascript');assert.deepEqual(result.analysis,analyzeIq(source));assert.equal(p.calls,1);assert.equal(p.closes,1);}
});
test('cancel during qualification holds admission until real promise settles',async()=>{
 const source=await recording(1024),d=deferred<Uint8Array>();let input:Uint8Array|undefined;const p=provider(async bytes=>{input=bytes;return d.promise;}),engine=new IqAnalysisEngine(p.open),pending=engine.single(source),rejected=assert.rejects(pending,Cancelled);
 await turns(()=>!!input);engine.cancel();await assert.rejects(engine.single(source),/busy/);assert.equal(p.cancels,1);assert.equal(p.closes,0);d.resolve(native(input!));await rejected;engine.release();assert.equal(p.closes,1);
});
test('release during actual request fences completion, drains then closes and requalifies new session',async()=>{
 const source=await recording(1024),d=deferred<Uint8Array>();let count=0,input:Uint8Array|undefined;const p=provider(async bytes=>{if(++count===19){input=bytes;return d.promise;}return native(bytes);}),engine=new IqAnalysisEngine(p.open);
 assert.equal((await engine.single(source)).engine.backend,'native-cpp');const pending=engine.single(source),rejected=assert.rejects(pending,Cancelled);await turns(()=>!!input);engine.release();assert.equal(p.closes,0);await assert.rejects(engine.single(source),/busy/);d.resolve(native(input!));await rejected;assert.equal(p.closes,1);assert.equal((await engine.single(source)).engine.backend,'native-cpp');assert.equal(p.opens,2);engine.release();assert.equal(p.closes,2);
});
test('controller uses verified native path, retains provenance and clears stale backend labels',async()=>{
 const p=provider(),engine=new IqAnalysisEngine(p.open),controller=new IqController(true,hasher,()=> '2026-11-08T00:00:00.000Z',engine);
 controller.example(controller.lease,controller.state);await controller.inspect(controller.lease,controller.state);assert.match(controller.state.analysisEngine,/Native C\+\+ FFT active/);assert.equal(controller.state.report?.origin,'synthetic-fixture');assert.equal(controller.state.bins.every(b=>b.amplitude===0),true);
 controller.clear(controller.lease,controller.state);assert.equal(controller.state.report,null);assert.doesNotMatch(controller.state.analysisEngine,/active/);
 controller.deactivate();assert.equal(p.closes,1);
});
test('controller Clear during native qualification suppresses report until native drain',async()=>{
 const d=deferred<Uint8Array>();let input:Uint8Array|undefined;const p=provider(async bytes=>{input=bytes;return d.promise;}),controller=new IqController(true,hasher,undefined,new IqAnalysisEngine(p.open));
 controller.example(controller.lease,controller.state);const pending=controller.inspect(controller.lease,controller.state);await turns(()=>!!input);controller.clear(controller.lease,controller.state);assert.equal(controller.state.busy,true);assert.equal(controller.state.report,null);d.resolve(native(input!));await pending;assert.equal(controller.state.busy,false);assert.equal(controller.state.report,null);assert.doesNotMatch(controller.state.analysisEngine,/active/);controller.deactivate();
});
