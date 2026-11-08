import assert from 'node:assert/strict';
import {inspectFlipperResponses as inspect} from '/workspace/scratch/b96d3539d24d/apex-flipper-inspector/packages/core/flipper-offline.ts';
const read=a=>inspect(Uint8Array.from(a),{provenance:'synthetic'});
assert.equal(read([128,4,...Array(256).fill([48,0]).flat()]).frames[0].fields.length,256);
assert.throws(()=>read([130,4,...Array(257).fill([48,0]).flat()]),e=>e.code==='field-budget');
assert.equal(read([135,8,138,2,131,8,10,128,8,...Array(1024).fill(65)]).frames[0].content.key.effective.length,1024);
assert.throws(()=>read([136,8,138,2,132,8,10,129,8,...Array(1025).fill(65)]),e=>e.code==='string-budget');
assert.equal(read([11,48,255,255,255,255,255,255,255,255,255,1]).frames[0].unknownFields.length,1);
const dense=Array(16).fill([128,4,...Array(256).fill([48,0]).flat()]).flat();
const report=read(dense);assert.equal(report.frames.length,16);
assert.throws(()=>read([...dense,2,48,0]),e=>e.code==='aggregate-field-budget');
// Count children too: 15*256 + 255 fields + envelope + child = 4097.
const near=Array(15).fill([128,4,...Array(256).fill([48,0]).flat()]).flat();
assert.throws(()=>read([...near,254,3,...Array(255).fill([48,0]).flat(),5,138,2,2,24,0]),e=>e.code==='aggregate-field-budget');
assert.equal(read([128,64,42,253,63,...Array(8189).fill(0)]).frames.length,1);
assert.equal(read([6,248,255,255,255,15,0]).frames[0].unknownFields[0].tag,536870911);
assert.throws(()=>read([6,128,128,128,128,16,0]),e=>e.code==='varint-overflow');
console.log('PASS exact field/string/aggregate/frame caps, overflow boundaries, max uint64 and legal field tag',JSON.stringify(report).length,'compact JSON chars at aggregate field cap');
