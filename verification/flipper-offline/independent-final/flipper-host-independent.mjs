import assert from 'node:assert/strict';
import {inspectFlipperResponses as inspect} from '/workspace/scratch/b96d3539d24d/apex-flipper-inspector/packages/core/flipper-offline.ts';
import {inspectFlipperCli} from '/workspace/scratch/b96d3539d24d/apex-flipper-inspector/tools/inspect-flipper-offline.ts';
import {writeFileSync} from 'node:fs';
let calls=0;assert.throws(()=>inspect(Uint8Array.of(0),{get provenance(){calls++; return 'synthetic';}}),/invalid-provenance/);assert.equal(calls,0);
class Bytes extends Uint8Array {get byteLength(){throw Error('accessor called');}get byteOffset(){throw Error('offset called');}get buffer(){throw Error('buffer called');}[Symbol.iterator](){throw Error('iterator called');}}
assert.throws(()=>inspect(new Bytes(65537),{provenance:'synthetic'}),/input-budget/);
assert.deepEqual([...inspect(new Bytes([3,138,2,0]),{provenance:'synthetic'}).originalBytes],[3,138,2,0]);
for(const input of [new Uint8Array(new SharedArrayBuffer(1)),new Proxy(new Uint8Array(1),{}),new Uint8ClampedArray(1),new DataView(new ArrayBuffer(1))])assert.throws(()=>inspect(input,{provenance:'synthetic'}),/invalid-input/);
const detached=Uint8Array.of(0);structuredClone(detached.buffer,{transfer:[detached.buffer]});assert.throws(()=>inspect(detached,{provenance:'synthetic'}),/invalid-input/);
const dense=Uint8Array.from(Array(16).fill([128,4,...Array(256).fill([48,0]).flat()]).flat());
const report=inspect(dense,{provenance:'synthetic'});
assert.equal(report.frames[0].content.kind,'unsupported');assert.match(report.frames[0].diagnostics.join(' '),/ambiguous/);
assert.equal(report.frames[0].fields[0],report.frames[0].unknownFields[0]);
writeFileSync('/tmp/flipper-independent-files/dense',dense);
const cli=await inspectFlipperCli(['/tmp/flipper-independent-files/dense','--provenance','synthetic']);
assert.equal((cli.match(/"originalBytes"/g)||[]).length,1);
console.log('PASS host descriptors, intrinsic size/kind/storage, unsupported ambiguity, alias metadata, single original-byte field');
console.log(JSON.stringify({inputBytes:dense.length,fieldRecords:4096,coreCompactJsonChars:JSON.stringify(report).length,cliPrettyJsonChars:cli.length,cliUtf8Bytes:Buffer.byteLength(cli)}));
const rab=new ArrayBuffer(4,{maxByteLength:8});const outOfBounds=new Uint8Array(rab,2,2);rab.resize(1);
try{let r=inspect(outOfBounds,{provenance:'synthetic'});console.log('CAVEAT out-of-bounds resizable typed array accepted as',r.originalBytes.length,'bytes');}catch(e){console.log('Resizable out-of-bounds rejected:',e.code);}
