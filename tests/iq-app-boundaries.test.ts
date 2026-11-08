import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// All samples are mathematical fixtures. No radio, file picker, device, or network is used.
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const metadata = () => ({ global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024 } as Record<string, unknown>, captures: [{ 'core:sample_start': 0, 'core:frequency': 1e6 }], annotations: [] as unknown[] });
const digest = async (algorithm: 'SHA-256' | 'SHA-512', bytes: Uint8Array) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(bytes).digest('hex');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function gate<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function frozenTree(value: unknown) {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    Object.values(value).forEach(frozenTree);
  }
}
import { IqController, type IqFile } from '../src/iq-workbench.ts';
import { IQ_METADATA_LIMIT, IQ_DATA_LIMIT } from '../packages/core/iq-offline.ts';
const NOW = '2026-11-08T12:34:56.789Z';
const make = (hasher = { digest }) => new IqController(true, hasher, () => NOW);
function file(bytes: Uint8Array, name = 'untrusted name'): IqFile {
  return { name, size: bytes.length, arrayBuffer: async () => bytes.slice().buffer };
}
function stage(c: IqController, m = encode(metadata()), d = new Uint8Array(4096)) {
  c.stageFile('metadata', file(m, 'capture.sigmf-meta'), c.lease, c.state);
  c.stageFile('data', file(d, 'capture.sigmf-data'), c.lease, c.state);
}
const inspect = (c: IqController) => c.inspect(c.lease, c.state);

test('IQ validates both captured sizes before either read, including missing pair and every boundary', async () => {
  for (const [m, d] of [[0,4],[IQ_METADATA_LIMIT+1,4],[1,0],[1,1],[1,3],[1,5],[1,IQ_DATA_LIMIT+4],[NaN,4],[Infinity,4],[1,Infinity],[1,4.5],[1,-4],[1,Number.MAX_SAFE_INTEGER+1]]) {
    const c = make(); let reads = 0;
    const bad = (size: number) => ({ name: 'x', size, arrayBuffer: async () => { reads++; return new ArrayBuffer(4); } });
    c.stageFile('metadata', bad(m!), c.lease, c.state); c.stageFile('data', bad(d!), c.lease, c.state);
    await inspect(c); assert.equal(reads, 0, `${m}/${d}`); assert.equal(c.state.report, null); assert.equal(c.state.busy, false);
  }
  const c = make(); let reads = 0;
  c.stageFile('metadata', {name:'x',size:1,arrayBuffer:async()=>{reads++;return new ArrayBuffer(1);}}, c.lease,c.state);
  await inspect(c); assert.equal(reads,0);
});

test('IQ staging is read-free and size/name/read method are captured, not reread at inspection', async () => {
  const c = make(); const m = encode(metadata()); let reads = 0;
  const f = { name:'original',size:m.length,arrayBuffer:async()=>{reads++;return m.slice().buffer;} };
  c.stageFile('metadata',f,c.lease,c.state); c.stageFile('data',file(new Uint8Array(4)),c.lease,c.state);
  f.name='changed';f.size=0;f.arrayBuffer=async()=>{throw new Error('replacement must not run');};
  assert.equal(reads,0);assert.equal(c.state.metadata!.name,'original');assert.equal(c.state.metadata!.size,m.length);
  await inspect(c);assert.equal(reads,1);assert.ok(c.state.report);
});

test('IQ exact boundary sizes accepted and raw read mismatches fail closed', async () => {
  const m = encode(metadata()); const padded = new Uint8Array(IQ_METADATA_LIMIT).fill(32);padded.set(m);
  const c = make();stage(c,padded,new Uint8Array(IQ_DATA_LIMIT));await inspect(c);
  assert.equal(c.state.report!.metadataLength,IQ_METADATA_LIMIT);assert.equal(c.state.report!.dataLength,IQ_DATA_LIMIT);
  for (const side of ['metadata','data'] as const) for (const returned of [new ArrayBuffer(0),new ArrayBuffer(5),new SharedArrayBuffer(4),new ArrayBuffer(4,{maxByteLength:8}),{},new Uint8Array(4)]) {
    const c = make();stage(c);c.stageFile(side,{name:'bad',size:side==='metadata'?m.length:4096,arrayBuffer:async()=>returned as ArrayBuffer},c.lease,c.state);
    await inspect(c);assert.equal(c.state.report,null);assert.equal(c.state.busy,false);assert.equal(c.state.bins.length,0);
  }
});

test('IQ import rejects UTF8, BOM, duplicate escaped keys, profile drift and SHA512 mismatch without reports', async () => {
  const valid = JSON.stringify(metadata());
  const bad = [new Uint8Array([0xc0,0xaf]),new Uint8Array([0xef,0xbb,0xbf,...encode(metadata())]),new TextEncoder().encode(valid.replace('"global":','"global":{},"global":')),new TextEncoder().encode(valid.replace('"global":','"globa\\u006c":{},"global":')),encode([]),encode(null)];
  for (const [key,value] of [['core:datatype','ci16_be'],['core:version','1.0.0'],['core:sample_rate',0],['core:sample_rate','1024'],['core:num_channels',2],['core:offset',4],['core:unknown',0],['core:sha512','a'.repeat(128)]] as const) {const m=metadata();m.global[key]=value;bad.push(encode(m));}
  const annotated=metadata();annotated.annotations.push({});bad.push(encode(annotated));
  for (const m of bad) {const c=make();stage(c,m);await inspect(c);assert.equal(c.state.report,null);assert.equal(c.state.pending,false);assert.equal(c.state.busy,false);assert.deepEqual(c.state.bins,[]);}
});

test('IQ exact byte provenance never conflates supplier time, external naming or synthetic source', async () => {
  const m=metadata();(m.captures[0] as Record<string,unknown>)['core:datetime']='producer supplied, not validated';
  m.global['core:sha512']=await digest('SHA-512',new Uint8Array(4096));
  const bytes=new TextEncoder().encode(' \n'+JSON.stringify(m)+'\t');const c=make();stage(c,bytes);await inspect(c);
  const report=c.state.report!;assert.equal(report.origin,'external-file');assert.equal(report.importedAt,NOW);assert.equal(report.producerTime,'producer supplied, not validated');
  assert.equal(report.metadataSha256,hash(bytes));assert.equal(report.dataSha256,hash(new Uint8Array(4096)));assert.equal(report.sha512Status,'byte-match-only');
  c.example(c.lease,c.state);assert.equal(c.state.report,null);await inspect(c);assert.equal(c.state.report!.origin,'synthetic-fixture');
  c.stageFile('metadata',file(bytes,'synthetic-zero.sigmf-meta'),c.lease,c.state);assert.equal(c.state.origin,'external-file');assert.equal(c.state.data,null);await inspect(c);assert.equal(c.state.report,null);
});

test('IQ pages expose at most eight immutable bins, cover FFT exactly, and refuse stale/invalid events', async () => {
  const c=make();stage(c);await inspect(c);const first=c.state;frozenTree(first);assert.equal(first.pageCount,128);assert.equal(first.bins.length,8);
  assert.equal(first.report!.spectrum!.peakBin,null);assert.equal(first.report!.statistics.rmsComplexMagnitude,0);
  const signed:number[]=[];
  for(let p=0;p<128;p++){c.page(p,c.lease,c.state);assert.equal(c.state.bins.length,8);frozenTree(c.state);for(const bin of c.state.bins){signed.push(bin.signedBin);assert.equal(bin.amplitude,0);assert.equal(bin.dbRelativeToUnitAmplitude,null);assert.equal(bin.displayDb,-160);}}
  assert.deepEqual(signed,Array.from({length:1024},(_,i)=>i-512));
  for(const p of [-1,128,1.2,NaN,Infinity]){const previous=c.state;c.page(p,c.lease,previous);assert.equal(c.state,previous);}
  const last=c.state;c.page(0,c.lease,first);c.clear(c.lease,first);c.example(c.lease,first);c.stageFile('data',null,c.lease,first);await c.inspect(c.lease,first);assert.equal(c.state,last);
  assert.throws(()=>{(first.bins as unknown as unknown[]).push({});});assert.throws(()=>{(first.report!.statistics as any).meanI=99;});
  stage(c,encode(metadata()),new Uint8Array(4));await inspect(c);assert.ok(c.state.report);assert.equal(c.state.report!.spectrum,null);assert.equal(c.state.pageCount,0);assert.deepEqual(c.state.bins,[]);assert.equal(c.state.report!.statistics.sampleCount,1);
});

test('IQ clear, replacement and deactivate preserve one actual read slot until settle and fence stale results', async () => {
  for(const change of ['clear','replace','deactivate'] as const) for(const rejected of [false,true]) {
    const c=make();const delayed=gate<ArrayBuffer>();let oldReads=0,newReads=0;stage(c);
    c.stageFile('metadata',{name:'old',size:encode(metadata()).length,arrayBuffer:()=>{oldReads++;return delayed.promise;}},c.lease,c.state);
    const oldLease=c.lease,oldState=c.state;const pending=inspect(c);assert.equal(c.state.busy,true);
    if(change==='clear')c.clear(c.lease,c.state);if(change==='deactivate'){c.deactivate();c.activate();}
    const m=encode(metadata());c.stageFile('metadata',{name:'new',size:m.length,arrayBuffer:async()=>{newReads++;return m.slice().buffer;}},c.lease,c.state);c.stageFile('data',file(new Uint8Array(4)),c.lease,c.state);
    assert.equal(c.state.pending,false);assert.equal(c.state.busy,true);await inspect(c);assert.equal(newReads,0);assert.equal(oldReads,1);
    if(rejected)delayed.reject(new Error('PRIVATE IO ERROR'));else delayed.resolve(m.slice().buffer);await pending;
    assert.equal(c.state.busy,false);assert.equal(c.state.report,null);assert.equal(c.state.metadata!.name,'new');assert.doesNotMatch(JSON.stringify(c.state),/PRIVATE IO ERROR/);
    if(change==='deactivate'){const fresh=c.state;c.clear(oldLease,fresh);c.example(oldLease,fresh);c.stageFile('data',null,oldLease,fresh);await c.inspect(oldLease,fresh);assert.equal(c.state,fresh);}
    await c.inspect(c.lease,oldState);assert.equal(newReads,0);await inspect(c);assert.equal(newReads,1);assert.equal(c.state.report!.statistics.sampleCount,1);
  }
});

test('IQ metadata snapshot survives deferred data read', async () => {
  const m=encode(metadata()),original=m.slice(),d=new Uint8Array(4096),delayed=gate<ArrayBuffer>(),started=gate<void>();
  const c=make();c.stageFile('metadata',{name:'m',size:m.length,arrayBuffer:async()=>m.buffer},c.lease,c.state);
  c.stageFile('data',{name:'d',size:d.length,arrayBuffer:()=>{started.resolve();return delayed.promise;}},c.lease,c.state);
  const pending=inspect(c);await started.promise;m.fill(0);delayed.resolve(d.buffer);await pending;
  assert.ok(c.state.report,'metadata must be snapshotted before awaiting data read');assert.equal(c.state.report!.metadataSha256,hash(original));
});

test('IQ pending hash is fenced at each boundary and slot drains before retry', async () => {
  const delayed=gate<string>(),started=gate<void>();let calls=0;
  const c=make({digest:async(a,b)=>{calls++;if(calls===1){started.resolve();return delayed.promise;}return digest(a,b);}});stage(c);
  const pending=inspect(c);await started.promise;c.clear(c.lease,c.state);c.example(c.lease,c.state);await inspect(c);assert.equal(calls,1);assert.equal(c.state.busy,true);
  delayed.resolve('a'.repeat(64));await pending;assert.equal(calls,1);assert.equal(c.state.report,null);assert.equal(c.state.busy,false);
  await inspect(c);assert.equal(calls,3);assert.ok(c.state.report);
});

test('IQ invalid or throwing digest outcomes never publish source claims', async () => {
  for(const value of [null,undefined,{},'f'.repeat(63),'f'.repeat(65),'g'.repeat(64),'f'.repeat(64)+'\n']){const c=make({digest:async()=>value as string});stage(c);await inspect(c);assert.equal(c.state.report,null);assert.equal(c.state.busy,false);}
  const c=make({digest:async()=>{throw Error('PRIVATE DIGEST FAILURE');}});stage(c);await inspect(c);assert.equal(c.state.report,null);assert.doesNotMatch(JSON.stringify(c.state),/PRIVATE DIGEST FAILURE/);
});

test('IQ second-read and digest rejections drain one slot without reviving cleared report or exposing errors', async () => {
  for(const boundary of ['data-read','digest'] as const)for(const change of ['clear','replacement','deactivate'] as const){
    const read=gate<ArrayBuffer>(),hashed=gate<string>(),started=gate<void>();let hashCalls=0;
    const c=make({digest:async(a,b)=>{hashCalls++;if(boundary==='digest'&&hashCalls===1){started.resolve();return hashed.promise;}return digest(a,b);}});
    stage(c);
    if(boundary==='data-read')c.stageFile('data',{name:'slow',size:4096,arrayBuffer:()=>{started.resolve();return read.promise;}},c.lease,c.state);
    const pending=inspect(c);await started.promise;
    if(change==='deactivate'){c.deactivate();c.activate();}else if(change==='clear')c.clear(c.lease,c.state);
    c.example(c.lease,c.state);assert.equal(c.state.busy,true);await inspect(c);
    assert.equal(hashCalls,boundary==='digest'?1:0);
    if(boundary==='digest')hashed.reject(Error('SECRET ASYNC ERROR'));else read.reject(Error('SECRET ASYNC ERROR'));
    await pending;assert.equal(c.state.busy,false);assert.equal(c.state.pending,false);assert.equal(c.state.report,null);assert.equal(c.state.origin,'synthetic-fixture');assert.doesNotMatch(JSON.stringify(c.state),/SECRET ASYNC ERROR/);
    await inspect(c);assert.equal(c.state.report!.origin,'synthetic-fixture');assert.equal(hashCalls,boundary==='digest'?3:2);
  }
});

test('IQ failed replacement removes successful report immediately and tab exit releases both handles', async () => {
  const c=make();stage(c);await inspect(c);const old=c.state;assert.ok(old.report);
  c.stageFile('metadata',file(new Uint8Array([0xff])),c.lease,c.state);assert.equal(c.state.report,null);assert.equal(c.state.pageCount,0);assert.deepEqual(c.state.bins,[]);
  await inspect(c);assert.equal(c.state.report,null);assert.ok(old.report);assert.equal(old.bins.length,8);
  c.deactivate();assert.equal(c.state.metadata,null);assert.equal(c.state.data,null);c.activate();await inspect(c);assert.equal(c.state.report,null);assert.equal(c.state.busy,false);
});

test('IQ source buffers mutated during hash await cannot change prepared exact bytes or statistics', async () => {
  const m=encode(metadata()),d=new Uint8Array([1,0,254,255]),mOriginal=m.slice(),dOriginal=d.slice(),started=gate<void>(),release=gate<void>();
  let calls=0;const c=make({digest:async(a,b)=>{if(++calls===1){started.resolve();await release.promise;}return digest(a,b);}});
  c.stageFile('metadata',{name:'m',size:m.length,arrayBuffer:async()=>m.buffer},c.lease,c.state);c.stageFile('data',{name:'d',size:d.length,arrayBuffer:async()=>d.buffer},c.lease,c.state);
  const pending=inspect(c);await started.promise;m.fill(0);d.fill(0);release.resolve();await pending;
  assert.equal(c.state.report!.metadataSha256,hash(mOriginal));assert.equal(c.state.report!.dataSha256,hash(dOriginal));assert.equal(c.state.report!.statistics.meanI,1/32768);assert.equal(c.state.report!.statistics.meanQ,-2/32768);
});
