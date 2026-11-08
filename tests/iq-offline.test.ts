import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareIq, IQ_DATA_LIMIT, IQ_METADATA_LIMIT } from '../packages/core/iq-offline.ts';
const context = { schemaVersion: 1 as const, origin: 'synthetic-fixture' as const, importedAt: '2026-11-07T00:00:00.000Z' };
const hasher = { digest: async (algorithm: string, bytes: Uint8Array) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(bytes).digest('hex') };
const meta = () => ({ global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024 } as Record<string, unknown>, captures: [{ 'core:sample_start': 0, 'core:frequency': 1e6 } as Record<string, unknown>], annotations: [] as unknown[] });
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const data = new Uint8Array([1, 0, 254, 255]);
const hash = (bytes: Uint8Array, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');

test('synthetic exact view bytes, endianness, snapshots and caller mutation during async hashing', async () => {
  const m = encode(meta()); const padded = new Uint8Array(m.length + 4); padded.set(m, 2);
  const d = new Uint8Array([99, 1, 0, 254, 255, 99]);
  const ctx = { ...context }; let calls = 0;
  const pending = prepareIq(padded.subarray(2, -2), d.subarray(1, -1), ctx, { digest: async (algorithm, bytes) => {
    calls++; await new Promise(resolve => setTimeout(resolve, 1)); return hasher.digest(algorithm, bytes);
  } });
  padded.fill(0); d.fill(0); ctx.origin = 'external-file' as never;
  const r = await pending; assert.equal(calls, 2);
  assert.deepEqual(r.getMetadataBytes(), m); assert.deepEqual(r.getDataBytes(), data);
  assert.equal(r.metadataSha256, hash(m)); assert.equal(r.dataSha256, hash(data));
  assert.equal(new DataView(r.getDataBytes().buffer).getInt16(2, true), -2);
  r.getDataBytes().fill(0); assert.deepEqual(r.getDataBytes(), data);
  assert.equal(r.context.origin, 'synthetic-fixture'); assert.ok(Object.isFrozen(r.supplierClaim));
});
test('synthetic exact source hashes and optional SHA512 are not authenticity', async () => {
  const m = meta(); m.global['core:sha512'] = hash(data, 'sha512').toUpperCase();
  const r = await prepareIq(encode(m), data, context, hasher); assert.equal(r.sha512Status, 'byte-match-only');
  const absent = await prepareIq(encode(meta()), data, context, hasher); assert.equal(absent.sha512Status, 'not-provided');
  const whitespace = new TextEncoder().encode(' '+JSON.stringify(meta())+'\n');
  const changed = await prepareIq(whitespace, data, context, hasher);
  assert.notEqual(changed.metadataSha256, absent.metadataSha256); assert.equal(changed.dataSha256, absent.dataSha256);
  const changedData = data.slice(); changedData[0] = 2;
  assert.notEqual((await prepareIq(encode(meta()), changedData, context, hasher)).dataSha256, absent.dataSha256);
  await assert.rejects(prepareIq(encode(m), changedData, context, hasher), /integrity mismatch/);
  m.global['core:sha512'] = 'invalid'; await assert.rejects(prepareIq(encode(m), data, context, hasher));
});
test('synthetic malformed JSON bytes, duplicates, aliases, bounds and shapes reject', async () => {
  const valid = JSON.stringify(meta());
  for (const bytes of [new Uint8Array(), new Uint8Array([0xc0, 0xaf]), new Uint8Array([0xef,0xbb,0xbf,...encode(meta())]),
    new TextEncoder().encode(valid.replace('"global":', '"global":{},"global":')),
    new TextEncoder().encode(valid.replace('"global":', '"globa\\u006c":{},"global":')),
    new TextEncoder().encode(valid.replace('1024', '1e999')),
    encode([]), encode(null), encode({}), new Uint8Array(IQ_METADATA_LIMIT + 1)]) {
    await assert.rejects(prepareIq(bytes, data, context, hasher));
  }
  for (const size of [0,1,2,3,5,6,7,IQ_DATA_LIMIT+4]) await assert.rejects(prepareIq(encode(meta()), new Uint8Array(size), context, hasher));
  assert.equal((await prepareIq(encode(meta()), new Uint8Array(IQ_DATA_LIMIT), context, hasher)).sampleCount, 65536);
  const exact = new TextEncoder().encode(valid + ' '.repeat(IQ_METADATA_LIMIT - valid.length));
  assert.equal((await prepareIq(exact, data, context, hasher)).metadataLength, IQ_METADATA_LIMIT);
});
test('synthetic unsupported fields, layout, versions, numeric types and ranges reject', async () => {
  const globalCases: [string, unknown][] = [ ['core:datatype','ci16_be'],['core:version','1.0.0'],['core:sample_rate',0],['core:sample_rate',1e9+1],['core:sample_rate','1024'],['core:sample_rate',null],['core:num_channels',2],['core:offset',4],['core:metadata_only',true],['core:dataset','file'],['core:trailing_bytes',0],['core:global_index',0],['core:unknown',0],['__proto__',{}],['core:author',2],['core:description','x'.repeat(4097)] ];
  for (const [key,value] of globalCases) { const m=meta(); Object.defineProperty(m.global,key,{value,enumerable:true}); await assert.rejects(prepareIq(encode(m),data,context,hasher), key); }
  for (const [key,value] of [['core:sample_start',1],['core:sample_start',0.5],['core:sample_start',Number.MAX_SAFE_INTEGER+1],['core:frequency',1e12+1],['core:frequency','0'],['core:header_bytes',0],['core:global_index',0]] as const) {const m=meta(); m.captures[0]![key]=value;await assert.rejects(prepareIq(encode(m),data,context,hasher));}
  for (const field of ['core:datatype','core:version','core:sample_rate']) { const m=meta(); delete m.global[field]; await assert.rejects(prepareIq(encode(m),data,context,hasher)); }
  for (const field of ['core:sample_start','core:frequency']) { const m=meta(); delete m.captures[0]![field]; await assert.rejects(prepareIq(encode(m),data,context,hasher)); }
  const m=meta(); m.captures.push({...m.captures[0]}); await assert.rejects(prepareIq(encode(m),data,context,hasher));
  m.captures.pop(); m.annotations.push({}); await assert.rejects(prepareIq(encode(m),data,context,hasher));
});
test('synthetic optional extension content stays inert and globally bounded', async () => {
  const m=meta(); m.global['core:extensions']=[{name:'test',version:'1',optional:true}];
  m.global['test:claim']={source:'live/native/verified',url:'https://invalid.example'}; m.global['core:license']='https://invalid.example/license';
  m.captures[0]!['core:datetime']='not a date';
  const r=await prepareIq(encode(m),data,{...context,origin:'external-file'},hasher);
  assert.equal(r.context.origin,'external-file'); assert.ok(r.warnings.includes('timestamp retained, not validated'));
  for (const extensions of [[{name:'test',version:'1',optional:false}],[{name:'test',version:'1',optional:'true'}],[{name:'test',version:'1',optional:true,extra:0}],Array(17).fill({name:'test',version:'1',optional:true}),Array(2).fill({name:'test',version:'1',optional:true})]) {
    await assert.rejects(prepareIq(encode({...m,global:{...m.global,'core:extensions':extensions}}),data,context,hasher));
  }
  for (const value of [Array(257).fill(0), Object.fromEntries(Array.from({length:129},(_,i)=>[String(i),0]))]) {
    m.global['test:claim']=value; await assert.rejects(prepareIq(encode(m),data,context,hasher));
  }
  m.global['test:claim']={['x'.repeat(129)]:0}; await assert.rejects(prepareIq(encode(m),data,context,hasher));
  m.global['test:claim']=[[[[[[[[0]]]]]]]]; await assert.rejects(prepareIq(encode(m),data,context,hasher));
  delete m.global['core:extensions']; m.global['test:claim']=0; await assert.rejects(prepareIq(encode(m),data,context,hasher));
});
test('synthetic context, shared buffers, and broken hash adapters reject', async () => {
  for (const ctx of [{...context,origin:'native'},{...context,importedAt:'yesterday'},{...context,verified:true},{...context,supplierLabel:'x'.repeat(4097)}]) await assert.rejects(prepareIq(encode(meta()),data,ctx as never,hasher));
  await assert.rejects(prepareIq(encode(meta()),new Uint8Array(new SharedArrayBuffer(4)),context,hasher));
  await assert.rejects(prepareIq(encode(meta()),data,context,{digest:async()=> 'wrong'}));
});

test('intrinsic IQ view bounds reject spoofed empty/oversized storage without reading claims', async () => {
  let reads = 0;
  class Spoof extends Uint8Array {
    get byteLength() { reads++; return 4; }
    get buffer(): ArrayBuffer { reads++; return new ArrayBuffer(4); }
    get byteOffset() { reads++; return 0; }
  }
  for (const size of [0, 3, IQ_DATA_LIMIT + 4]) {
    await assert.rejects(prepareIq(encode(meta()), new Spoof(size), context, hasher));
  }
  await assert.rejects(prepareIq(new Spoof(IQ_METADATA_LIMIT + 1), data, context, hasher));
  const valid = new Spoof([1, 0, 254, 255]);
  assert.deepEqual((await prepareIq(encode(meta()), valid, context, hasher)).getDataBytes(), data);
  assert.equal(reads, 0);
});

test('IQ rejects shared/resizable/detached/proxy and forged non-byte views before hashing', async () => {
  let calls = 0;
  const noHash = { digest: async () => { calls++; return 'a'.repeat(64); } };
  const detached = new Uint8Array(4); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  const shared = new Uint8Array(new SharedArrayBuffer(4));
  Object.defineProperty(shared, 'buffer', { value: new ArrayBuffer(4) });
  const resized = new Uint8Array(new ArrayBuffer(4, { maxByteLength: 16 }));
  const outOfBoundsBuffer = new ArrayBuffer(8, { maxByteLength: 16 });
  const outOfBounds = new Uint8Array(outOfBoundsBuffer, 4, 4); outOfBoundsBuffer.resize(0);
  const forged = new Uint16Array(4); Object.setPrototypeOf(forged, Uint8Array.prototype);
  for (const bytes of [shared, resized, outOfBounds, detached, new Proxy(data, {}), forged, new DataView(new ArrayBuffer(4))]) {
    await assert.rejects(prepareIq(encode(meta()), bytes as Uint8Array, context, noHash));
    await assert.rejects(prepareIq(bytes as Uint8Array, data, context, noHash));
  }
  assert.equal(calls, 0);
});

test('IQ context uses only own data fields and never invokes field getters', async () => {
  let reads = 0; let hashes = 0;
  const noHash = { digest: async () => { hashes++; return 'a'.repeat(64); } };
  for (const key of ['schemaVersion', 'origin', 'importedAt', 'supplierLabel', 'unknown', Symbol('claim')]) {
    const ctx = { ...context };
    Object.defineProperty(ctx, key, { get() { reads++; return 'synthetic-fixture'; }, enumerable: false });
    await assert.rejects(prepareIq(encode(meta()), data, ctx, noHash));
  }
  for (const key of ['unknown', Symbol('claim')]) {
    const ctx = { ...context }; Object.defineProperty(ctx, key, { value: true, enumerable: false });
    await assert.rejects(prepareIq(encode(meta()), data, ctx, noHash));
  }
  for (const key of ['schemaVersion', 'origin', 'importedAt']) {
    const ctx: Record<string, unknown> = { ...context }; delete ctx[key];
    await assert.rejects(prepareIq(encode(meta()), data, ctx as never, noHash));
  }
  assert.equal(reads, 0); assert.equal(hashes, 0);
});

test('Buffer and subarray inputs preserve exact bytes, hashes, context and profile parity', async () => {
  const m = encode(meta()); const baseline = await prepareIq(m, data, context, hasher);
  const paddedMetadata = Buffer.concat([Buffer.from([99]), Buffer.from(m), Buffer.from([99])]);
  const paddedData = Buffer.from([99, ...data, 99]);
  const ctx = Object.defineProperty({ ...context }, 'origin', { value: context.origin, enumerable: false });
  const actual = await prepareIq(paddedMetadata.subarray(1, -1), paddedData.subarray(1, -1), ctx, hasher);
  for (const key of Object.keys(baseline) as (keyof typeof baseline)[]) {
    if (key === 'getMetadataBytes' || key === 'getDataBytes') assert.deepEqual(actual[key](), baseline[key]());
    else assert.deepEqual(actual[key], baseline[key]);
  }
});
