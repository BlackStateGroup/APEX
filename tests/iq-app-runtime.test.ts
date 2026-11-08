/** Missing-runtime-feature simulation only, not evidence of a native runtime failure. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IqController } from '../src/iq-workbench.ts';
import { iqByteHasher } from '../src/platform/iq-digest.ts';
const EXACT = '{"global":{"core:datatype":"ci16_le","core:version":"1.2.6","core:sample_rate":1024},"captures":[{"core:sample_start":0,"core:frequency":0}],"annotations":[]}';
function absent(name: 'TextEncoder' | 'TextDecoder' | 'crypto') {
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
 Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:undefined});
 return ()=>{if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);};
}
test('synthetic Load needs no global TextEncoder and preserves exact ASCII bytes/hashes',async()=>{
 const restore=absent('TextEncoder');let calls=0;
 try {
  const c=new IqController(true,{digest:async(algorithm,bytes)=>{calls++;return createHash(algorithm==='SHA-256'?'sha256':'sha512').update(bytes).digest('hex');}});
  assert.doesNotThrow(()=>c.example(c.lease,c.state));assert.equal(calls,0);assert.equal(c.state.report,null);assert.equal(c.state.metadata!.size,Buffer.byteLength(EXACT));
  await c.inspect(c.lease,c.state);assert.equal(calls,2);assert.equal(c.state.busy,false);assert.equal(c.state.report!.metadataSha256,createHash('sha256').update(EXACT,'ascii').digest('hex'));assert.equal(c.state.report!.dataSha256,createHash('sha256').update(new Uint8Array(4096)).digest('hex'));assert.equal(c.state.report!.statistics.rmsComplexMagnitude,0);
 } finally {restore();}
});
test('unavailable decoder or WebCrypto refuses Inspect cleanly and releases slot for later explicit retry',async()=>{
 for(const feature of ['TextDecoder','crypto'] as const){
  const c=new IqController(true,iqByteHasher);c.example(c.lease,c.state);const restore=absent(feature);
  try {await assert.doesNotReject(c.inspect(c.lease,c.state));assert.equal(c.state.busy,false);assert.equal(c.state.pending,false);assert.equal(c.state.report,null);assert.match(c.state.message,/Inspection refused/);}
  finally {restore();}
  await c.inspect(c.lease,c.state);assert.equal(c.state.busy,false);assert.equal(c.state.report!.statistics.sampleCount,1024);
 }
});
