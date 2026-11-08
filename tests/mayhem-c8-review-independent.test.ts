/** Independent adversarial review tests; handwritten synthetic bytes only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { importMayhemC8, MAYHEM_C8_LIMITS } from '../packages/core/mayhem-c8-import.ts';
import { IQ_DATA_LIMIT, IQ_METADATA_LIMIT, prepareIq, type IqImportContext } from '../packages/core/iq-offline.ts';

const sourceText = 'sample_rate=19\ncenter_frequency=23\nformat=c8 (signed int8 I,Q)\n';
const encode = (s: string) => new TextEncoder().encode(s);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const ctx: IqImportContext = { schemaVersion: 1, origin: 'external-file', importedAt: '2026-11-08T09:00:00.000Z', supplierLabel: 'https://example.invalid/claim?verified=true' };
const hasher = { digest: async (_algorithm: 'SHA-256' | 'SHA-512', bytes: Uint8Array) => sha(bytes) };
const run = (bytes: Uint8Array = new Uint8Array([128,127]), sidecar: Uint8Array = encode(sourceText), context = ctx) => importMayhemC8(bytes, sidecar, context, hasher);

test('review: every possible signed I/Q pair at the exact maximum preserves order and normalized values', async () => {
  const bytes = new Uint8Array(256 * 256 * 2);
  for (let i=0; i<256; i++) for (let q=0; q<256; q++) { const p=2*(i*256+q); bytes[p]=i; bytes[p+1]=q; }
  const result = await run(bytes);
  const output = result.recording.getDataBytes();
  const data = new DataView(output.buffer,output.byteOffset,output.byteLength);
  for (let i=0; i<256; i++) for (let q=0; q<256; q++) {
    const p=4*(i*256+q);
    assert.equal(data.getInt16(p,true)/32768,(i<128?i:i-256)/128);
    assert.equal(data.getInt16(p+2,true)/32768,(q<128?q:q-256)/128);
  }
  assert.equal(result.original.dataSha256,sha(bytes));
  assert.equal(result.recording.dataSha256,sha(output));
  assert.equal(result.recording.sampleCount,65536);
  assert.equal(result.recording.dataLength,IQ_DATA_LIMIT);
  assert.equal(IQ_DATA_LIMIT,262144); assert.equal(IQ_METADATA_LIMIT,65536);
});

test('review: overlapping byte views survive mutation and buffer detachment after the first await', async () => {
  const all=encode(sourceText), original=all.slice(), data=all.subarray(0,2);
  const context={...ctx}; let release!:()=>void;
  const gate=new Promise<void>(r=>{release=r;}); let calls=0;
  const pending=importMayhemC8(data,all,context,{digest:async (_a,b)=>{ if (++calls===1) await gate; return sha(b); }});
  all.fill(255); structuredClone(all.buffer,{transfer:[all.buffer]});
  context.supplierLabel='changed'; context.importedAt='bad'; release();
  const result=await pending;
  assert.deepEqual(result.getOriginalDataBytes(),original.slice(0,2));
  assert.deepEqual(result.getOriginalSidecarBytes(),original);
  assert.equal(result.original.dataSha256,sha(original.slice(0,2)));
  assert.equal(result.recording.context.supplierLabel,ctx.supplierLabel);
  assert.equal(result.recording.context.importedAt,ctx.importedAt);
  assert.ok(Object.isFrozen(result.recording.context));
});

test('review: source snapshots never call hostile iterator, constructor, buffer, offsets or coercion hooks', async () => {
  const bytes=new Uint8Array([128,127]), sidecar=encode(sourceText);
  let calls=0; const trap=()=>{calls++;throw Error('untrusted hook invoked');};
  for(const object of [bytes,sidecar]) for(const key of ['constructor','buffer','byteOffset','byteLength','length',Symbol.iterator,Symbol.toPrimitive,Symbol.toStringTag]) Object.defineProperty(object,key,{get:trap});
  const result=await run(bytes,sidecar);
  assert.deepEqual(result.getOriginalDataBytes(),new Uint8Array([128,127])); assert.equal(calls,0);
});

test('review: true Uint8Array from another realm is accepted without trusting its prototype', async () => {
  const foreign=vm.runInNewContext('new Uint8Array([128, 127])') as Uint8Array;
  assert.equal(foreign instanceof Uint8Array,false);
  const result=await run(foreign);
  assert.deepEqual(result.recording.getDataBytes(),new Uint8Array([0,128,0,127]));
});

test('review: all four SHA-256 calls cover exact separate byte domains and disposable buffers', async () => {
  const bytes=new Uint8Array([128,127,255,1]), sidecar=encode(sourceText);
  const seen:Uint8Array[]=[], snapshots:Uint8Array[]=[];
  const result=await importMayhemC8(bytes,sidecar,ctx,{digest:async (algorithm,input)=>{
    assert.equal(algorithm,'SHA-256'); for(const old of seen) assert.notEqual(input.buffer,old.buffer);
    seen.push(input); snapshots.push(input.slice()); const hash=sha(input); input.fill(0); return hash.toUpperCase();
  }});
  assert.equal(seen.length,4);
  assert.deepEqual(snapshots,[result.recording.getMetadataBytes(),result.recording.getDataBytes(),bytes,sidecar]);
  assert.equal(result.recording.metadataSha256,sha(snapshots[0]!)); assert.equal(result.recording.dataSha256,sha(snapshots[1]!));
  assert.equal(result.original.dataSha256,sha(bytes)); assert.equal(result.original.sidecarSha256,sha(sidecar));
  const getters=[()=>result.getOriginalDataBytes(),()=>result.getOriginalSidecarBytes(),()=>result.recording.getDataBytes(),()=>result.recording.getMetadataBytes()];
  for(const getter of getters) {const copy=getter(); const expected=copy.slice(); structuredClone(copy.buffer,{transfer:[copy.buffer]}); assert.deepEqual(getter(),expected);}
});

function oracle(bytes: Uint8Array): boolean {
  // Independent grammar oracle: match all field-order alternatives using a single
  // whole-string expression, followed by canonical-decimal and range checks.
  if (bytes.some(b=>b>127)) return false;
  const s=String.fromCharCode(...bytes);
  const fields=['sample_rate=([0-9]+)','center_frequency=([0-9]+)','format=c8 \\(signed int8 I,Q\\)'];
  for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) for(const eol of ['\n','\r\n']) {
    const exact=new RegExp('^(?:'+order.map(i=>fields[i]).join(eol)+')'+'(?:'+eol+')?(?![\\s\\S])').exec(s);
    if(!exact) continue;
    const values=order.filter(i=>i!==2).map((i,j)=>({i,value:exact[j+1]!}));
    return values.every(({i,value})=>String(Number(value))===value && Number.isSafeInteger(Number(value)) && (i===0 ? Number(value)>=1&&Number(value)<=1e9 : Number(value)>=0&&Number(value)<=1e12));
  }
  return false;
}

test('review: exhaustive one-byte substitutions and all byte prefixes match a separate strict grammar oracle', async t => {
  const base=encode(sourceText); let checked=0,accepted=0;
  for(let position=0;position<base.length;position++) for(let byte=0;byte<256;byte++) {
    const changed=base.slice();changed[position]=byte;
    let hashes=0;const expected=oracle(changed);
    try {
      await importMayhemC8(new Uint8Array([128,127]),changed,ctx,{digest:async(_a,b)=>{hashes++;return sha(b);}});
      assert.equal(expected,true,`accepted position=${position} byte=${byte}`); assert.equal(hashes,4);accepted++;
    } catch(error) { if(expected) throw error; assert.equal(hashes,0,`hashed malformed position=${position} byte=${byte}`); }
    checked++;
  }
  for(let byte=0;byte<256;byte++) {
    const changed=new Uint8Array(base.length+1);changed[0]=byte;changed.set(base,1);
    await assert.rejects(run(new Uint8Array([128,127]),changed));checked++;
  }
  t.diagnostic(`${checked} adversarial mutations checked; ${accepted} accepted canonical variants.`);
});

test('review: rejected storage and huge sidecars never call caller hashing or perform coercion', async () => {
  let calls=0;const rejectHash={digest:async()=>{calls++;throw Error('must not hash');}};
  const badInputs:unknown[]=[undefined,1,'aa',new Int8Array([1,2]),new Uint16Array([1,2]),new Float32Array([1,2]),new ArrayBuffer(2),new Uint8Array(new SharedArrayBuffer(2)),new Uint8Array(new ArrayBuffer(2,{maxByteLength:2}))];
  for(const item of badInputs) for(const side of [false,true]) await assert.rejects(importMayhemC8(side?new Uint8Array([1,2]):item as Uint8Array,side?item as Uint8Array:encode(sourceText),ctx,rejectHash));
  for(const length of [4096,4097,1000000]) await assert.rejects(importMayhemC8(new Uint8Array([1,2]),new Uint8Array(length),ctx,rejectHash));
  assert.equal(calls,0); assert.equal(MAYHEM_C8_LIMITS.dataBytes,131072);
});

test('review: context facts stay inert and invalid contexts reject before hashing', async () => {
  const result=await run(); assert.equal(result.recording.context.supplierLabel,ctx.supplierLabel);
  assert.deepEqual(result.verification,{acquisitionVerified:false,producerVerified:false,authenticityVerified:false});
  const metadata=JSON.parse(new TextDecoder().decode(result.recording.getMetadataBytes()));
  assert.equal(metadata.global['core:sample_rate'],19); assert.equal(metadata.captures[0]['core:frequency'],23);
  assert.equal(Object.hasOwn(metadata.captures[0],'core:datetime'),false);
  assert.equal(result.recording.context.origin,'external-file');
  let hashes=0; const h={digest:async()=>{hashes++;return '0'.repeat(64);}};
  for(const c of [{...ctx,importedAt:'2026-02-30T00:00:00.000Z'},{...ctx,supplierLabel:undefined},{...ctx,origin:'verified'},Object.assign(Object.create({extra:1}),ctx),{...ctx,acquisitionVerified:false}]) await assert.rejects(importMayhemC8(new Uint8Array([1,2]),encode(sourceText),c as IqImportContext,h));
  assert.equal(hashes,0);
  await prepareIq(result.recording.getMetadataBytes(),result.recording.getDataBytes(),ctx,hasher);
});
