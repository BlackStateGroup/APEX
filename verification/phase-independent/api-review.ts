import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareIq } from '../../packages/core/iq-offline.ts';
import { analyzeIqPhaseIncrement as analyze } from '../../packages/core/iq-phase-increment.ts';
const metadata = new TextEncoder().encode(JSON.stringify({global:{'core:datatype':'ci16_le','core:version':'1.2.6','core:sample_rate':9},captures:[{'core:sample_start':0,'core:frequency':0}],annotations:[]}));
const input=new Uint8Array([1,0,0,0,0,0,1,0,255,255,0,0]);
const originalMeta=metadata.slice(), originalData=input.slice();
const pending=prepareIq(metadata,input,{schemaVersion:1,origin:'synthetic-fixture',importedAt:'2026-11-08T00:00:00.000Z'},{digest:async(algorithm,bytes)=>{await Promise.resolve();const result=createHash(algorithm==='SHA-256'?'sha256':'sha512').update(bytes).digest('hex');bytes.fill(222);return result;}});
metadata.fill(0);input.fill(0);
const prepared=await pending;
const opts={startSample:0,lag:1,step:1,count:2};
const expected=JSON.stringify(analyze(prepared,opts));
assert.deepEqual(prepared.getDataBytes(),originalData);assert.deepEqual(prepared.getMetadataBytes(),originalMeta);
let access=0;
for(const key of Object.keys(opts)){
 const o=Object.defineProperty({...opts},key,{get(){access++;throw Error('getter must not run');}});
 assert.throws(()=>analyze(prepared,o));
}
for(const o of [null,undefined,[],Object.create(null),Object.create(opts),{...opts,bogus:true},{...opts,[Symbol('x')]:1},{...opts,count:NaN},{...opts,count:Infinity},{...opts,count:1n}]) assert.throws(()=>analyze(prepared,o as never));
for(const p of [{...prepared},Object.create(prepared),new Proxy(prepared,{}),null,{}])assert.throws(()=>analyze(p as never,opts));
assert.equal(access,0);
const report=analyze(prepared,opts);opts.count=1;
report.pairs.splice(0);report.options.lag=2;report.warnings.push('changed');report.source.warnings=[];
prepared.getDataBytes().fill(0);prepared.getMetadataBytes().fill(0);
assert.throws(()=>{(report.source.context as any).origin='changed'});
assert.throws(()=>{(report.source.supplierClaim as any).global['core:sample_rate']=10});
assert.equal(JSON.stringify(analyze(prepared,{startSample:0,lag:1,step:1,count:2})),expected);
console.log('PASS independent API getter nonexecution, malformed/symbol/unknown options, brand/proxy rejection, synchronous input snapshot, hostile hasher byte isolation, returned-byte/report/options/provenance alias isolation. Arbitrary-JS sandbox is not claimed.');
