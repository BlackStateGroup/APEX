import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { importMayhemC8, MAYHEM_C8_FORMAT, MAYHEM_C8_LIMITS, MAYHEM_C8_PROFILE } from '../packages/core/mayhem-c8-import.ts';
import { analyzeIq } from '../packages/core/iq-analysis.ts';
import { prepareIq, IQ_DATA_LIMIT, type IqImportContext } from '../packages/core/iq-offline.ts';

const encode = (text: string) => new TextEncoder().encode(text);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const hasher = { digest: async (algorithm: string, bytes: Uint8Array) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(bytes).digest('hex') };
const context = { schemaVersion: 1 as const, origin: 'synthetic-fixture' as const, importedAt: '2026-11-08T08:00:00.000Z' };
const sidecar = (rate = '1024', frequency = '433920000') => encode(`sample_rate=${rate}\ncenter_frequency=${frequency}\nformat=${MAYHEM_C8_FORMAT}\n`);
const sample = new Uint8Array([128, 127, 255, 0, 1, 64, 192, 2]);
const run = (data = sample, text = sidecar(), ctx: IqImportContext = context) => importMayhemC8(data, text, ctx, hasher);

test('signed int8 endpoints, exact little endian bytes, I/Q order and all 256 byte values', async () => {
  const data = Uint8Array.from({ length: 256 }, (_, i) => i);
  const imported = await run(data);
  const bytes = imported.recording.getDataBytes();
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 256; i++) {
    const signed = i < 128 ? i : i - 256;
    assert.equal(view.getInt16(i * 2, true), signed * 256, `byte ${i}`);
    assert.equal(view.getInt16(i * 2, true) / 32768, signed / 128);
    assert.equal(bytes[i * 2], 0); assert.equal(bytes[i * 2 + 1], i);
  }
  assert.equal(view.getInt16(128 * 2, true), -32768);
  assert.equal(view.getInt16(127 * 2, true), 32512);
  assert.equal(imported.recording.sampleCount, 128);
  assert.equal(imported.conversion, 'signed-int8-times-256-to-signed-int16-le; interleaved-IQ-order-preserved');
  assert.deepEqual((await run()).recording.getDataBytes(), new Uint8Array([0,128,0,127,0,255,0,0,0,1,0,64,0,192,0,2]));
});

test('original byte hashes and derived hashes are separate, exact and stable', async () => {
  const text = sidecar(); const result = await run(sample, text);
  assert.equal(result.sourceProfile, MAYHEM_C8_PROFILE);
  assert.equal(result.parserVersion, '1');
  assert.deepEqual(result.original, { dataLength: sample.length, sidecarLength: text.length, dataSha256: hash(sample), sidecarSha256: hash(text) });
  assert.equal(result.recording.dataSha256, hash(result.recording.getDataBytes()));
  assert.equal(result.recording.metadataSha256, hash(result.recording.getMetadataBytes()));
  assert.notEqual(result.recording.dataSha256, result.original.dataSha256);
  assert.equal(result.recording.profile, 'apex-ci16-le-v1');
  assert.equal(result.recording.sha512Status, 'not-provided');
  assert.equal(result.recording.context.origin, 'synthetic-fixture');
  assert.deepEqual(result.verification, { acquisitionVerified: false, producerVerified: false, authenticityVerified: false });
  const metadata = JSON.parse(new TextDecoder().decode(result.recording.getMetadataBytes()));
  assert.equal(metadata.global['core:datatype'], 'ci16_le');
  assert.equal(metadata.global['core:version'], '1.2.6');
  assert.deepEqual(metadata.captures, [{ 'core:sample_start': 0, 'core:frequency': 433920000 }]);
  assert.deepEqual(metadata.annotations, []);
  assert.equal(Object.hasOwn(metadata.captures[0], 'core:datetime'), false);
});

test('all sidecar field orders, uniform line endings and optional final newline preserve semantics but not source hash', async () => {
  const fields = ['sample_rate=1024', 'center_frequency=433920000', `format=${MAYHEM_C8_FORMAT}`];
  const base = await run();
  for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) for (const ending of ['\n','\r\n']) for (const tail of ['', ending]) {
    const original = encode(order.map(i => fields[i]).join(ending) + tail);
    const r = await run(sample, original);
    assert.deepEqual(r.sourceClaims, base.sourceClaims);
    assert.equal(r.recording.metadataSha256, base.recording.metadataSha256);
    assert.equal(r.recording.dataSha256, base.recording.dataSha256);
    assert.equal(r.original.sidecarSha256, hash(original));
    assert.deepEqual(r.getOriginalSidecarBytes(), original);
  }
  assert.notEqual((await run(sample, encode(fields.join('\r\n')))).original.sidecarSha256, base.original.sidecarSha256);
});

test('valid integer Hz limits and one complete I/Q pair', async () => {
  for (const [rate, frequency] of [['1','0'],['1000000000','1000000000000']]) {
    const r = await run(new Uint8Array([128,127]), sidecar(rate,frequency));
    assert.equal(r.recording.sampleRate, Number(rate)); assert.equal(r.recording.centerFrequency, Number(frequency));
    assert.equal(r.recording.sampleCount, 1); assert.equal(r.recording.dataLength, 4);
  }
});

test('maximum input converts exactly to existing APEX limit without truncation', async () => {
  const data = new Uint8Array(MAYHEM_C8_LIMITS.dataBytes); data[data.length-2]=255; data[data.length-1]=128;
  const r = await run(data);
  assert.equal(r.original.dataLength, 131072); assert.equal(r.recording.dataLength, IQ_DATA_LIMIT);
  assert.equal(r.recording.sampleCount, 65536);
  assert.deepEqual(r.recording.getDataBytes().slice(-4), new Uint8Array([0,255,0,128]));
});

test('prepared output is accepted unchanged by existing analyzer and prepareIq', async () => {
  const r = await run(); const stats = analyzeIq(r.recording).statistics;
  assert.deepEqual(stats.rawI, { minimum: -32768, maximum: 256 });
  assert.deepEqual(stats.rawQ, { minimum: 0, maximum: 32512 });
  assert.equal(stats.meanI, (-128-1+1-64)/128/4);
  assert.equal(stats.meanQ, (127+0+64+2)/128/4);
  const again = await prepareIq(r.recording.getMetadataBytes(), r.recording.getDataBytes(), context, hasher);
  assert.deepEqual(analyzeIq(again), analyzeIq(r.recording));
});

test('source labels remain explicit context and cannot create acquisition or producer verification', async () => {
  const r = await run(sample, sidecar(), { ...context, origin: 'external-file', supplierLabel: 'claimed: live verified HackRF' });
  assert.equal(r.recording.context.origin, 'external-file');
  assert.equal(r.recording.context.supplierLabel, 'claimed: live verified HackRF');
  assert.equal(r.recording.acquisition, 'offline import; acquisition not verified');
  assert.equal(r.verification.producerVerified, false);
});

test('input snapshots survive asynchronous caller mutation and returned buffers cannot change retained evidence', async () => {
  const data = sample.slice(), text = sidecar(), ctx = { ...context };
  const expectedText = text.slice(); let calls = 0;
  const pending = importMayhemC8(data, text, ctx, { digest: async (algorithm, bytes) => {
    calls++; await new Promise(resolve => setTimeout(resolve, 1)); return hasher.digest(algorithm,bytes);
  } });
  data.fill(0); text.fill(0); ctx.origin = 'external-file' as never;
  const r = await pending;
  assert.equal(calls, 4); assert.equal(r.recording.context.origin, 'synthetic-fixture');
  assert.deepEqual(r.getOriginalDataBytes(), sample); assert.deepEqual(r.getOriginalSidecarBytes(), expectedText);
  r.getOriginalDataBytes().fill(0); r.getOriginalSidecarBytes().fill(0); r.recording.getDataBytes().fill(0); r.recording.getMetadataBytes().fill(0);
  assert.deepEqual(r.getOriginalDataBytes(), sample); assert.deepEqual(r.getOriginalSidecarBytes(), expectedText);
  assert.equal(r.recording.dataSha256, hash(r.recording.getDataBytes()));
  assert.equal(r.recording.metadataSha256, hash(r.recording.getMetadataBytes()));
  for (const value of [r, r.original, r.sourceClaims, r.verification, r.warnings, r.recording]) assert.ok(Object.isFrozen(value));
});

test('hash adapter receives disposable copies, normalizes uppercase digest and cannot mutate retained originals', async () => {
  const r = await importMayhemC8(sample, sidecar(), context, { digest: async (algorithm, bytes) => {
    const result = await hasher.digest(algorithm,bytes); bytes.fill(13); return result.toUpperCase();
  } });
  assert.deepEqual(r.getOriginalDataBytes(), sample);
  assert.equal(r.original.dataSha256, hash(sample));
  assert.equal(r.recording.dataSha256, hash(r.recording.getDataBytes()));
});

test('Buffer, subarray offsets and Uint8Array subclasses use exact intrinsic source bytes', async () => {
  let reads=0;
  class Spoof extends Uint8Array {
    get byteLength() { reads++; return 0; }
    get byteOffset() { reads++; return 99; }
    get buffer(): ArrayBuffer { reads++; return new ArrayBuffer(0); }
  }
  const data = Buffer.from([99,...sample,99]), text = Buffer.from([99,...sidecar(),99]);
  const base = await run();
  const b = await run(data.subarray(1,-1), text.subarray(1,-1));
  const c = await run(new Spoof(sample),new Spoof(sidecar()));
  for (const r of [b,c]) { assert.deepEqual(r.original,base.original); assert.equal(r.recording.dataSha256,base.recording.dataSha256); }
  assert.equal(reads,0);
});

test('odd, empty and oversized data or sidecar reject before hashing', async () => {
  let calls=0; const neverHash = { digest: async () => { calls++; return 'a'.repeat(64); } };
  for (const length of [0,1,3,131071,131073,131074]) await assert.rejects(importMayhemC8(new Uint8Array(length),sidecar(),context,neverHash));
  for (const text of [new Uint8Array(),new Uint8Array(MAYHEM_C8_LIMITS.sidecarBytes+1)]) await assert.rejects(importMayhemC8(sample,text,context,neverHash));
  assert.equal(calls,0);
});

test('reject unsupported grammar, aliases, duplicate fields, extra claims, controls and encodings before hashing', async () => {
  const valid = new TextDecoder().decode(sidecar());
  const wrong = [
    '', valid+'\n', '\n'+valid, valid+'verified=true\n', valid+'url=https://invalid.example\n',
    valid.replace('sample_rate=1024','sample_rate=1024\nsample_rate=2048'),
    valid.replace('sample_rate=1024','center_frequency=1024'),
    valid.replace('sample_rate','Sample_rate'), valid.replace('sample_rate','sampleRate'),
    valid.replace('sample_rate=', 'sample_rate ='), valid.replace('=1024','= 1024'),
    valid.replace('=1024','=1024 '), valid.replace('=1024','=1024\t'),
    valid.replace(MAYHEM_C8_FORMAT,'ci8'), valid.replace(MAYHEM_C8_FORMAT,'c8 (unsigned int8 I,Q)'),
    valid.replace(MAYHEM_C8_FORMAT,'c8 (signed int8 Q,I)'), valid.replace(MAYHEM_C8_FORMAT,'c8 (signed int8 I,Q) '),
    valid.replace('format=', 'format=='), valid.replace(/\n/g,'\r'), valid.replace('\n','\r\n'),
    valid.replace('1024','1024\0'), valid.replace('1024','1024\u001b'), valid.replace('1024','１２３４'),
    '\ufeff'+valid, valid.replace('sample_rate=1024\n',''), valid.replace('format='+MAYHEM_C8_FORMAT+'\n',''),
  ];
  let calls=0; const neverHash={digest:async()=>{calls++;return 'a'.repeat(64);}};
  for (const text of wrong) await assert.rejects(importMayhemC8(sample,encode(text),context,neverHash),JSON.stringify(text));
  for (const bytes of [new Uint8Array([0xff]),new Uint8Array([0xc0,0xaf])]) await assert.rejects(importMayhemC8(sample,bytes,context,neverHash));
  assert.equal(calls,0);
});

test('reject noncanonical, fractional, signed, exponent and out-of-range Hz fields', async () => {
  for (const n of ['0','-1','+1','01','1.0','1e3','Infinity','NaN','1000000001','9007199254740993','0x400','']) await assert.rejects(run(sample,sidecar(n)));
  for (const n of ['-1','+1','01','1.0','1e3','Infinity','NaN','1000000000001','9007199254740993','0x400','']) await assert.rejects(run(sample,sidecar('1024',n)));
});

test('reject shared, resizable, detached, proxy, spoofed and non-byte storage without hashing', async () => {
  let calls=0; const neverHash={digest:async()=>{calls++;return 'a'.repeat(64);}};
  const detached=new Uint8Array(4); structuredClone(detached.buffer,{transfer:[detached.buffer]});
  const shared=new Uint8Array(new SharedArrayBuffer(4)); Object.defineProperty(shared,'buffer',{value:new ArrayBuffer(4)});
  const resized=new Uint8Array(new ArrayBuffer(4,{maxByteLength:16}));
  const outOfBoundsBuffer=new ArrayBuffer(8,{maxByteLength:16}), outOfBounds=new Uint8Array(outOfBoundsBuffer,4,4);outOfBoundsBuffer.resize(0);
  const forged=new Uint16Array(4);Object.setPrototypeOf(forged,Uint8Array.prototype);
  for (const bytes of [shared,resized,outOfBounds,detached,new Proxy(sample,{}),forged,new Uint8ClampedArray(4),new DataView(new ArrayBuffer(4)),[],null,Object.create(Uint8Array.prototype)]) {
    await assert.rejects(importMayhemC8(bytes as Uint8Array,sidecar(),context,neverHash));
    await assert.rejects(importMayhemC8(sample,bytes as Uint8Array,context,neverHash));
  }
  assert.equal(calls,0);
});

test('invalid context and accessors are rejected through unchanged prepareIq contract before hashing', async () => {
  let reads=0,calls=0;const neverHash={digest:async()=>{calls++;return 'a'.repeat(64);}};
  for (const ctx of [{...context,origin:'live'},{...context,importedAt:'today'},{...context,verified:true},{...context,supplierLabel:'x'.repeat(4097)}]) await assert.rejects(importMayhemC8(sample,sidecar(),ctx as never,neverHash));
  for (const key of ['origin','unknown',Symbol('claim')]) {
    const ctx={...context};Object.defineProperty(ctx,key,{get(){reads++;return 'synthetic-fixture';},enumerable:false});
    await assert.rejects(importMayhemC8(sample,sidecar(),ctx,neverHash));
  }
  assert.equal(reads,0);assert.equal(calls,0);
});

test('hash failure or malformed hash at any stage rejects atomically', async () => {
  for (const position of [1,2,3,4]) for (const mode of ['bad','throw']) {
    let calls=0;
    await assert.rejects(importMayhemC8(sample,sidecar(),context,{digest:async(algorithm,bytes)=>{
      if (++calls===position) {if(mode==='throw')throw new Error('hash failure');return 'invalid';}
      return hasher.digest(algorithm,bytes);
    }}));
    assert.equal(calls,position);
  }
});
