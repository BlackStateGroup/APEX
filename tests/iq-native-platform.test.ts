/** Actual native adapter with synthetic Expo boundary; not Android device acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { prepareIq } from '../packages/core/iq-offline.ts';
import { Cancelled } from '../experimental/hybrid-iq/bridge/client.ts';
const state:{os:string;module:unknown;lookups:number}={os:'android',module:null,lookups:0};
(globalThis as any).__iqNativePlatform={Platform:{get OS(){return state.os;}},requireOptionalNativeModule:(name:string)=>{assert.equal(name,'ApexIq');state.lookups++;return state.module;}};
const url=new URL('../src/platform/iq-engine.native.ts',import.meta.url).href;
const hook=registerHooks({resolve(s,c,next){if(c.parentURL===url&&s==='react-native')return {url:'data:text/javascript,export const Platform=globalThis.__iqNativePlatform.Platform;',shortCircuit:true};if(c.parentURL===url&&s==='expo-modules-core')return {url:'data:text/javascript,export const requireOptionalNativeModule=globalThis.__iqNativePlatform.requireOptionalNativeModule;',shortCircuit:true};return next(s,c);}});
const {createIqAnalysisEngine}=await import('../src/platform/iq-engine.native.ts');hook.deregister();test.after(()=>delete(globalThis as any).__iqNativePlatform);
const metadata=new TextEncoder().encode('{"global":{"core:datatype":"ci16_le","core:version":"1.2.6","core:sample_rate":1024},"captures":[{"core:sample_start":0,"core:frequency":0}],"annotations":[]}');
const prepared=await prepareIq(metadata,new Uint8Array(4096),{schemaVersion:1,origin:'synthetic-fixture',importedAt:'2026-11-08T00:00:00.000Z'},{digest:async(a,b)=>createHash(a==='SHA-256'?'sha256':'sha512').update(b).digest('hex')});
let id=30000;
function module(){const events:string[]=[];const session=++id;return {events,session,capabilities:()=>({available:true,contractVersion:1,backend:'cpp',cancellation:'between-frames',mobileRust:false}),openSession:()=>{events.push('open');return session;},reserve:(s:number,r:number)=>{assert.equal(s,session);assert.equal(r,1);events.push('reserve');},execute:async(bytes:Uint8Array)=>{const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);assert.equal(v.getUint32(8,true),session);assert.equal(v.getUint32(12,true),1);events.push('execute');throw Error('synthetic native rejection');},cancel:(s:number,r:number)=>{assert.equal(s,session);assert.equal(r,1);events.push('cancel');},closeSession:(s:number)=>{assert.equal(s,session);events.push('close');}};}
test('iOS never looks up Android module and reports JavaScript',async()=>{state.os='ios';state.lookups=0;state.module=module();const result=await createIqAnalysisEngine().single(prepared);assert.equal(state.lookups,0);assert.equal(result.engine.backend,'javascript');assert.match(result.engine.summary,/iOS.*not been enabled/);});
test('absent and incompatible module capabilities remain JavaScript without opening sessions',async()=>{
 state.os='android';for(const patch of [null,{available:false},{available:'true'},{contractVersion:2},{backend:'rust'},{mobileRust:true},{cancellation:'immediate'}]){const m=module();state.module=patch?{...m,capabilities:()=>({...m.capabilities(),...patch})}:null;const result=await createIqAnalysisEngine().single(prepared);assert.equal(result.engine.backend,'javascript');assert.deepEqual(m.events,[]);}
});
test('native adapter reserves identity synchronously before queued execute and closes on rejection',async()=>{state.os='android';const m=module();state.module=m;const result=await createIqAnalysisEngine().single(prepared);assert.equal(result.engine.backend,'javascript');assert.deepEqual(m.events,['open','reserve','execute','close']);});
test('cancel uses independent control before async settlement; close waits for drain',async()=>{
 state.os='android';let reject!:(e:unknown)=>void;const m=module();state.module={...m,execute:async()=>{m.events.push('execute');return new Promise<Uint8Array>((_,r)=>{reject=r;});}};const engine=createIqAnalysisEngine(),pending=engine.single(prepared),rejected=assert.rejects(pending,Cancelled);engine.release();assert.deepEqual(m.events,['open','reserve','execute','cancel']);reject(Error('drained'));await rejected;assert.deepEqual(m.events,['open','reserve','execute','cancel','close']);
});
