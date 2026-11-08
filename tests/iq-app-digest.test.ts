/** Host byte digest and native-source mock checks, not device runtime acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { IqController } from '../src/iq-workbench.ts';
import { iqByteHasher as web } from '../src/platform/iq-digest.ts';

test('IQ web/native adapters hash exact subview bytes with both algorithms and take isolated snapshots',async()=>{
  const calls:{algorithm:string;bytes:Uint8Array}[]=[];
  (globalThis as any).__iqDigestReview=async(algorithm:string,bytes:Uint8Array)=>{calls.push({algorithm,bytes});await Promise.resolve();return Uint8Array.from(createHash(algorithm==='SHA-256'?'sha256':'sha512').update(bytes).digest()).buffer;};
  const url=new URL('../src/platform/iq-digest.native.ts',import.meta.url).href;
  const hook=registerHooks({resolve(s,c,next){if(c.parentURL===url&&s==='expo-crypto')return{url:'data:text/javascript,'+encodeURIComponent('export const CryptoDigestAlgorithm={SHA256:"SHA-256",SHA512:"SHA-512"};export const digest=globalThis.__iqDigestReview;export const digestStringAsync=()=>{throw Error("No text hashing allowed");};'),shortCircuit:true};return next(s,c);}});
  try{
    const {iqByteHasher:native}=await import('../src/platform/iq-digest.native.ts');
    for(const algorithm of ['SHA-256','SHA-512'] as const)for(const b of [new Uint8Array(),new Uint8Array([0,128,255,195,169]),Buffer.from([11,255,0,128,22]).subarray(1,4),Uint8Array.from({length:256},(_,i)=>i)]){
      const expected=createHash(algorithm==='SHA-256'?'sha256':'sha512').update(b).digest('hex');
      assert.equal(await web.digest(algorithm,b),expected);assert.equal(await native.digest(algorithm,b),expected);
      assert.equal(calls.at(-1)!.algorithm,algorithm);assert.notEqual(calls.at(-1)!.bytes,b);assert.deepEqual([...calls.at(-1)!.bytes],[...b]);
    }
    for(const adapter of [web,native])for(const algorithm of ['SHA-256','SHA-512'] as const){const bytes=new Uint8Array([255,128,0,195,169]);const expected=createHash(algorithm==='SHA-256'?'sha256':'sha512').update(bytes).digest('hex');const pending=adapter.digest(algorithm,bytes);bytes.fill(0);assert.equal(await pending,expected);}
    for(const adapter of [web,native])await assert.rejects(adapter.digest('SHA-1' as never,new Uint8Array([1])));
    const c = new IqController(true,native,()=> '2026-11-08T12:00:00.000Z');
    const before = calls.length; c.example(c.lease,c.state); assert.equal(calls.length,before); assert.equal(c.state.report,null);
    await c.inspect(c.lease,c.state); assert.equal(calls.length,before+2); assert.equal(c.state.report!.origin,'synthetic-fixture'); assert.equal(c.state.report!.dataSha256,createHash('sha256').update(new Uint8Array(4096)).digest('hex')); assert.equal(c.state.report!.statistics.rmsComplexMagnitude,0); assert.equal(c.state.report!.spectrum!.peakBin,null);
    assert.ok(Object.isFrozen(web));assert.ok(Object.isFrozen(native));
  }finally{hook.deregister();delete(globalThis as any).__iqDigestReview;}
});
