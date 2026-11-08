import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHciLegacyEventDocument as create, readHciLegacyEventDocument as read, prepareHci, selectHciLegacyEvent, listHciRecords, serializeHciReport } from '../packages/core/hci-offline.ts';
import type { HciContext, PreparedHci } from '../packages/core/hci-offline.ts';
const hash = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const context: HciContext = {provenance:'synthetic-fixture',label:'independent selected-event bytes'};
function report(data: number[] = [], eventType = 0, addressType = 0, rssi = 127) { return [eventType,addressType,1,2,3,4,5,6,data.length,...data,rssi]; }
function event(reports = [report()]) { const params = [2,reports.length,...reports.flat()]; return [4,62,params.length,...params]; }
function record(payload: number[], flags = 3, original = payload.length) {
  const b=Buffer.alloc(24+payload.length); b.writeUInt32BE(original); b.writeUInt32BE(payload.length,4); b.writeUInt32BE(flags,8); b.writeUInt32BE(17,12); b.writeBigInt64BE(-123n,16); b.set(payload,24); return b;
}
function file(...records: Uint8Array[]) { return Buffer.concat([Buffer.from('6274736e6f6f700000000001000003ea','hex'),...records]); }
const prepare = (b: Uint8Array) => prepareHci(b,context,hash);
const doc = async (payload = event()) => create(await prepare(file(record(payload))),0,hash);
test('nonfirst event exact binary span, unrelated marker exclusion, source vs derivative and coordinate oracles', async () => {
  const marker=Array.from(Buffer.from('UNRELATED_SECRET_KEY'));
  const before=[record([1,...marker],2),record([2,...marker],0)];
  const chosen=record(event([report([2,1,6]),report([0],4,3,255)]));
  const bytes=file(...before,chosen,record([4,62,marker.length+1,13,...marker]),record([4,24,...marker]));
  const prepared=await prepare(bytes), beforeJson=serializeHciReport(listHciRecords(prepared)), old=serializeHciReport(selectHciLegacyEvent(prepared,2));
  const text=await create(prepared,2,hash), v=JSON.parse(text), expected=file(chosen);
  assert.equal(v.derivative.fileHeaderHex,bytes.subarray(0,16).toString('hex'));
  assert.equal(v.derivative.recordHex,chosen.toString('hex')); assert.equal(v.derivative.sha256,await hash(expected));
  assert.equal(v.sourceReference.sha256,await hash(bytes)); assert.notEqual(v.sourceReference.sha256,v.derivative.sha256);
  assert.equal(v.sourceReference.recordOffset,16+before.reduce((n,b)=>n+b.length,0));
  assert.equal(v.sourceReference.byteCount,bytes.length); assert.ok(!text.includes(Buffer.from(marker).toString('hex')));
  const exact=' \n'+JSON.stringify(v,null,1)+'\t'; const opened=await read(exact,hash);
  assert.equal(opened.document,exact); assert.equal(opened.selection.record.offset,16); assert.equal(opened.selection.record.index,0);
  assert.equal(opened.selection.source.sha256,await hash(expected)); assert.equal(opened.selection.source.byteCount,expected.length);
  const shift=v.sourceReference.recordOffset-16;
  const reports=selectHciLegacyEvent(prepared,2).reports.map(r=>({...r,reportOffset:r.reportOffset-shift,dataOffset:r.dataOffset-shift}));
  assert.deepEqual(opened.selection.reports,reports); assert.equal(opened.verification.originalSourceReference,'UNVERIFIED');
  assert.ok(Object.isFrozen(opened.value.derivative)); assert.ok(Object.isFrozen(opened.selection.reports));
  assert.equal(serializeHciReport(listHciRecords(prepared)),beforeJson); assert.equal(serializeHciReport(selectHciLegacyEvent(prepared,2)),old);
  assert.deepEqual(Buffer.concat([Buffer.from(v.derivative.fileHeaderHex,'hex'),Buffer.from(v.derivative.recordHex,'hex')]),expected);
});
test('55 and 298 byte exact boundaries and maximum document label', async () => {
  assert.equal(JSON.parse(await doc()).derivative.byteCount,55);
  const payload=event([...Array.from({length:24},()=>report()),report([1,2,3])]);
  assert.equal(payload.length,258);
  const text=await create(await prepareHci(file(record(payload)),{...context,label:'"'.repeat(256)},hash),0,hash);
  assert.equal(JSON.parse(text).derivative.byteCount,298); assert.ok(text.length<=4096);
  assert.equal((await read(text,hash)).selection.reports.length,25);
});
test('forged spread proxy and invalid selections fail before hashing', async () => {
  const p=await prepare(file(record(event()))); let calls=0; const spy=async(b:Uint8Array)=>{calls++;return hash(b);};
  for(const forged of [{...p},new Proxy(p,{}),{},null]) await assert.rejects(create(forged as PreparedHci,0,spy));
  for(const index of [-1,1,0.1,NaN,Infinity]) await assert.rejects(create(p,index,spy));
  assert.equal(calls,0);
});
test('caller and malicious hash copy mutation, async hash rejection and bad digest never publish', async () => {
  const bytes=file(record(event([report([2,1,6])]))); const p=await prepare(bytes); bytes.fill(0);
  let release!:()=>void; const gate=new Promise<void>(r=>release=r);
  const pending=create(p,0,async b=>{const digest=await hash(b);b.fill(0);await gate;return digest;});
  release(); const text=await pending;
  const opened=await read(text,async b=>{const digest=await hash(b);b.fill(255);return digest;});
  assert.equal(opened.selection.reports[0]!.dataHex,'020106');
  for(const adapter of [async()=>{throw Error('local failure');},async()=>'',async()=>'F'.repeat(64)]) {
    await assert.rejects(create(p,0,adapter)); await assert.rejects(read(text,adapter));
  }
  await assert.rejects(read(text,async()=>'0'.repeat(64)));
});
test('strict bounded exact schema, escaped duplicate names and shape/range confusion before hashing', async () => {
  const text=await doc(); const value=JSON.parse(text); let calls=0;
  const spy=async(b:Uint8Array)=>{calls++;return hash(b);};
  const bad:string[]=[text+'x',' '.repeat(4097),text.replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1'),text.replace('"schemaVersion":1','"schemaVersion":1,"schema\\u0056ersion":1'),text.replace('"recordIndex":0','"recordIndex":0,"record\\u0049ndex":0'),text.replace('"recordIndex":0','"recordIndex":-0')];
  const mutate=(fn:(v:any)=>void)=>{const v=structuredClone(value);fn(v);bad.push(JSON.stringify(v));};
  for(const key of Object.keys(value)) {mutate(v=>{delete v[key];});}
  mutate(v=>{v.extra=1;}); mutate(v=>{v.context.label={x:1};}); mutate(v=>{v.derivative=[];});
  for(const field of ['context','sourceReference','derivative']) mutate(v=>{v[field].extra=1;});
  for(const x of [0,2,'1',null]) mutate(v=>{v.schemaVersion=x;});
  for(const x of ['', 'x'.repeat(257),'x\n','x\x7f']) mutate(v=>{v.context.label=x;});
  mutate(v=>{v.context.provenance='native';});
  for(const x of ['A'.repeat(64),'0'.repeat(63),0,null]) for(const key of ['sourceReference','derivative']) mutate(v=>{v[key].sha256=x;});
  for(const x of ['00','6274736e6f6f700000000001000003eb',value.derivative.fileHeaderHex.toUpperCase()]) mutate(v=>{v.derivative.fileHeaderHex=x;});
  for(const x of ['',value.derivative.recordHex+'0',value.derivative.recordHex.toUpperCase(),'gg'.repeat(39),'00'.repeat(283),'00'.repeat(38)]) mutate(v=>{v.derivative.recordHex=x;});
  for(const x of [54,299,56,'55',null,55.1]) mutate(v=>{v.derivative.byteCount=x;});
  for(const x of [-1,4096,0.5,'0',null]) mutate(v=>{v.sourceReference.recordIndex=x;});
  for(const x of [15,17,262144,'16',null]) mutate(v=>{v.sourceReference.recordOffset=x;});
  for(const x of [54,56,78,262145,'55',null]) mutate(v=>{v.sourceReference.byteCount=x;});
  mutate(v=>{v.sourceReference.recordIndex=1;});
  mutate(v=>{v.sourceReference.recordIndex=2;v.sourceReference.recordOffset=40;v.sourceReference.byteCount=79;});
  for(const b of bad) await assert.rejects(read(b,spy)); assert.equal(calls,0);
});
test('plausible claimed original references remain explicitly unverified, not substituted', async()=>{
  const v=JSON.parse(await doc());v.sourceReference={sha256:'a'.repeat(64),byteCount:143,recordIndex:2,recordOffset:80};
  const opened=await read(JSON.stringify(v),hash);
  assert.equal(opened.verification.originalSourceReference,'UNVERIFIED');assert.equal(opened.selection.record.offset,16);
  assert.equal(opened.selection.source.byteCount,55);assert.notEqual(opened.selection.source.sha256,v.sourceReference.sha256);
});
test('all accepted report enums/RSSI/AD lengths and opaque malformed unknown encrypted/inert AD parity', async()=>{
  for(const eventType of [0,1,2,3,4]) for(const addressType of [0,1,2,3]) for(const rssi of [129,255,0,20,127]) for(const len of [0,31]) {
    const text=await doc(event([report(Array(len).fill(0),eventType,addressType,rssi)]));
    assert.equal((await read(text,hash)).selection.reports[0]!.eventType,eventType);
  }
  const cases=[[9,255,1],[2,0xee,8],[4,0x16,0xd2,0xfc,0x41],[7,0x16,0xaa,0xfe,0x10,0,2,97]];
  for(const ad of cases) {
    const p=await prepare(file(record(event([report(ad)])))); const original=selectHciLegacyEvent(p,0);
    assert.deepEqual((await read(await create(p,0,hash),hash)).selection,original);
  }
});
test('whole event rejected for malformed wrappers, framing, reports or late invalid data on create and reopen', async()=>{
  const baseline=JSON.parse(await doc());
  const candidates=[record(event([])),record(event([report([],5)])),record(event([report([],0,4)])),record(event([report(Array(32).fill(0))])),... [21,126,128].map(rssi=>record(event([report(),report([],0,0,rssi)]))),record(event(),2),record(event(),7),record(event(),3,99),record([4,62,12,13,...report()]),record([1,...event()],2)];
  const trailing=event();trailing.push(0);trailing[2]!++; candidates.push(record(trailing));
  const count=event();count[4]=2;candidates.push(record(count));
  const length=event();length[2]!--;candidates.push(record(length));
  const nested=event();nested[13]=31;candidates.push(record(nested));
  for(const rec of candidates) {
    const p=await prepare(file(rec));let calls=0;
    await assert.rejects(create(p,0,async b=>{calls++;return hash(b);}));assert.equal(calls,0);
    const v=structuredClone(baseline);v.derivative.recordHex=rec.toString('hex');v.derivative.byteCount=16+rec.length;v.derivative.sha256=await hash(file(rec));v.sourceReference.byteCount=16+rec.length;
    await assert.rejects(read(JSON.stringify(v),hash));
  }
  const v=structuredClone(baseline);const rec=Buffer.from(v.derivative.recordHex,'hex');rec.writeUInt32BE(1,4);v.derivative.recordHex=rec.toString('hex');v.derivative.sha256=await hash(file(rec));await assert.rejects(read(JSON.stringify(v),hash));
});
test('exact JSON budget, escaped text retained, runtime input types, and multiple embedded records refused', async()=>{
  const text=await doc(); const escaped=text.replace('synthetic-fixture','synthetic-\\u0066ixture');
  const padded=escaped+' '.repeat(4096-escaped.length);
  assert.equal((await read(padded,hash)).document,padded);
  for(const input of [null,{},[],new String(text),7]) await assert.rejects(read(input as string,hash));
  const v=JSON.parse(text);const two=Buffer.concat([record(event()),record(event())]);
  v.derivative.recordHex=two.toString('hex');v.derivative.byteCount=16+two.length;v.derivative.sha256=await hash(file(two));v.sourceReference.byteCount=16+two.length;
  await assert.rejects(read(JSON.stringify(v),hash));
});
