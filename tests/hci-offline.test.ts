import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareHci, listHciRecords, selectHciLegacyEvent, serializeHciReport, HCI_OUTPUT_LIMIT } from '../packages/core/hci-offline.ts';
import type { HciContext, PreparedHci } from '../packages/core/hci-offline.ts';
import { parseBleAdvertisingHex } from '../packages/core/ble-advertisements.ts';
import { inspectHciCli } from '../tools/inspect-hci.ts';
const hash = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const context: HciContext = {provenance:'synthetic-fixture',label:'independently authored test bytes'};
function report(data: number[] = [2,1,6], event = 0, addressType = 0, rssi = 0xd8) { return [event,addressType,0x66,0x55,0x44,0x33,0x22,0x11,data.length,...data,rssi]; }
function event(reports = [report()]) { const params = [2,reports.length,...reports.flat()]; return [4,0x3e,params.length,...params]; }
function record(payload: number[], flags = 3, original = payload.length, timestamp = -1n, drops = 0) {
  const b = Buffer.alloc(24 + payload.length); b.writeUInt32BE(original,0); b.writeUInt32BE(payload.length,4); b.writeUInt32BE(flags,8); b.writeUInt32BE(drops,12); b.writeBigInt64BE(timestamp,16); b.set(payload,24); return b;
}
function file(...records: Uint8Array[]) { const h = Buffer.alloc(16); h.write('btsnoop\0'); h.writeUInt32BE(1,8); h.writeUInt32BE(1002,12); return Buffer.concat([h,...records]); }
const prepare = (bytes: Uint8Array) => prepareHci(bytes,context,hash);
test('exact source digest, offsets, multi-report address order, separate scan response and AD parity', async () => {
  const bytes = file(record(event([report(),report([0],4,3,127)])));
  const p = await prepare(bytes), result = selectHciLegacyEvent(p,0);
  assert.equal(p.source.sha256,await hash(bytes)); assert.equal(p.source.byteCount,bytes.length);
  assert.equal(result.record.offset,16); assert.equal(result.record.payloadOffset,40);
  assert.equal(result.reports[0]!.dataOffset,54); assert.equal(result.reports[0]!.addressWireHex,'665544332211');
  assert.equal(result.reports[0]!.addressDisplay,'11:22:33:44:55:66');
  assert.equal(result.reports[1]!.addressType,3); assert.equal(result.reports[1]!.kind,'scan-response');
  assert.equal(result.reports[1]!.rssiDbm,null); assert.equal(result.reports[0]!.rssiDbm,-40);
  assert.equal(result.reports[0]!.dataHex,'020106'); assert.equal(result.reports[1]!.dataHex,'00');
  assert.deepEqual(result.reports[0]!.advertising,parseBleAdvertisingHex('020106'));
  assert.ok(Object.isFrozen(result.reports[0]!.advertising.elements));
});
test('metadata redacts all packet bodies including extended, keys, large/empty opaque payloads', async () => {
  const marker = Array.from(Buffer.from('SECRET_PAYLOAD_MARKER'));
  const p = await prepare(file(record([1,...marker],2),record([2,...marker],0),record([3,...marker],0),record([5,...marker],0),record([4,0x3e,21,13,...marker]),record([4,0x18,...marker]),record([]),record([99,...Array(60000).fill(65)])));
  const page = listHciRecords(p); const out = serializeHciReport(page);
  assert.ok(!out.includes('SECRET')); assert.ok(!out.includes('53454352')); assert.ok(!out.includes('414141'));
  assert.equal(page.records[4]!.classification,'extended-advertising-uninspected');
  for (let i=0;i<8;i++) assert.throws(()=>selectHciLegacyEvent(p,i));
});
test('atomic header, wrapper, EOF and record budgets reject without recovery', async () => {
  const good = file(record(event()));
  for (let n=0;n<good.length;n++) { if (n===16) continue; await assert.rejects(prepare(good.subarray(0,n))); }
  for (const [offset,value] of [[0,0],[8,2],[12,1001],[12,1003],[12,1004]]) {
    const bad = Buffer.from(good); if(offset===0) bad[0]=value!; else bad.writeUInt32BE(value!,offset!); await assert.rejects(prepare(bad));
  }
  const reversed = file(record(event(),3,1)); await assert.rejects(prepare(reversed));
  await assert.rejects(prepare(new Uint8Array(262145)));
  await assert.rejects(prepare(file(...Array.from({length:4097},()=>record([])))));
  assert.equal((await prepare(file(...Array.from({length:4096},()=>record([]))))).recordCount,4096);
});
test('capture truncation, flags and raw timestamps remain metadata without truth claims', async () => {
  const p = await prepare(file(record(event(),3,100,5n,0),record(event(),2,event().length,-9223372036854775808n,7),record(event(),7),record([2],3)));
  const rows = listHciRecords(p).records;
  assert.equal(rows[0]!.captureTruncated,true); assert.equal(rows[1]!.timestampRaw,'-9223372036854775808');
  assert.equal(rows[1]!.cumulativeDrops,7); assert.equal(rows[1]!.flagStatus,'contradictory'); assert.equal(rows[2]!.flagStatus,'reserved-bits'); assert.equal(rows[3]!.flagStatus,'contradictory');
  for(let i=0;i<4;i++) assert.throws(()=>selectHciLegacyEvent(p,i));
  assert.match(listHciRecords(p).warnings.join(' '),/Zero cumulative drops/);
});
test('event framing, nested counts, enums, lengths and late errors reject whole selection', async () => {
  const candidates = [event([]),event(Array.from({length:26},()=>report([]))),event([report(Array(32).fill(0))]),event([report([],5)]),event([report([],0,4)]),event([report(),report([],0,0,128)]),event([report([],0,0,21)]),event([report([],0,0,126)])];
  const trailing=event(); trailing.push(0); trailing[2]!++; candidates.push(trailing);
  const short=event(); short.pop(); candidates.push(short);
  const count=event(); count[4]=2; candidates.push(count);
  const nested=event(); nested[13]=31; candidates.push(nested);
  for(const bytes of candidates) {const p=await prepare(file(record(bytes))); assert.throws(()=>selectHciLegacyEvent(p,0));}
  for(const n of [0,31]) for(const rssi of [129,255,0,20,127]) for(const type of [0,1,2,3,4]) {
    const p=await prepare(file(record(event([report(Array(n).fill(0),type,type%4,rssi)]))));
    assert.equal(selectHciLegacyEvent(p,0).reports[0]!.dataLength,n);
  }
  assert.equal(selectHciLegacyEvent(await prepare(file(record(event(Array.from({length:25},()=>report([])))))),0).reports.length,25);
});
test('intrinsic snapshots, own context, brand and async mutation resistance', async () => {
  const input=file(record(event())), ctx={...context}; const expected=await hash(input);
  let release!:()=>void; const gate=new Promise<void>(r=>release=r);
  const pending=prepareHci(input,ctx,async bytes=>{ const digest=await hash(bytes); bytes.fill(0); await gate; return digest; });
  input.fill(0); ctx.label='changed'; release(); const p=await pending;
  assert.equal(p.source.sha256,expected); assert.equal(p.source.label,context.label); assert.equal(selectHciLegacyEvent(p,0).reports[0]!.dataHex,'020106');
  assert.throws(()=>{(p.source as {label:string}).label='forged';});
  assert.throws(()=>selectHciLegacyEvent({...p},0)); assert.throws(()=>listHciRecords({} as PreparedHci));
  const accessor={...context}; Object.defineProperty(accessor,'label',{get:()=>{throw new Error('getter executed');}});
  await assert.rejects(prepareHci(file(),accessor,hash),/own data/);
  const shadow=file(record(event())); Object.defineProperty(shadow,'byteLength',{value:1}); Object.defineProperty(shadow,'buffer',{value:new ArrayBuffer(0)});
  assert.equal((await prepare(shadow)).source.byteCount,58);
  await assert.rejects(prepare(new Uint8Array(new SharedArrayBuffer(20))));
  await assert.rejects(prepare(new Uint8Array(new ArrayBuffer(20,{maxByteLength:30}))));
  await assert.rejects(prepare(new Proxy(new Uint8Array(20),{})));
  await assert.rejects(prepareHci(file(),context,async()=> 'bad'));
});
test('explicit bounded pagination, no silent truncation and output cap', async () => {
  const p=await prepare(file(...Array.from({length:65},()=>record([]))));
  assert.equal(listHciRecords(p).records.length,64); assert.equal(listHciRecords(p).nextStart,64); assert.equal(listHciRecords(p,64).records.length,1);
  for(const [start,count] of [[-1,1],[66,1],[0,65],[0,0],[0,1.5]]) assert.throws(()=>listHciRecords(p,start,count));
  assert.throws(()=>serializeHciReport({...listHciRecords(p),warnings:['x'.repeat(HCI_OUTPUT_LIMIT)]}),/output limit/);
});
test('CLI explicit selection, strict flags, read-only permissions and atomic late failures', async () => {
  const dir=await mkdtemp(join(tmpdir(),'apex-hci-'));
  try {
    const path=join(dir,'fixture.snoop'); await writeFile(path,file(record(event())));
    const args=[path,'--provenance','synthetic-fixture','--label','synthetic test'];
    assert.ok(!JSON.parse(await inspectHciCli(args)).reports);
    const selectedCli = JSON.parse(await inspectHciCli([...args,'--record','0']));
    assert.equal(selectedCli.reports[0].dataHex,'020106');
    assert.match(selectedCli.warnings.join(' '),/No guarantee of capture completeness, authenticity, ownership, or device identity/);
    for(const extra of [['--record','-1'],['--record','01'],['--record','0','--start','0'],['--wat','1'],['--label','twice'],['--record']]) await assert.rejects(inspectHciCli([...args,...extra]));
    await assert.rejects(inspectHciCli([path]));
    await symlink(path,join(dir,'link')); await assert.rejects(inspectHciCli([join(dir,'link'),...args.slice(1)]));
    const child=spawnSync(process.execPath,['--permission','--allow-fs-read=*','tools/inspect-hci.ts',...args],{cwd:resolve('.'),encoding:'utf8'});
    assert.equal(child.status,0,child.stderr); assert.equal(JSON.parse(child.stdout).records.length,1);
    const denied=spawnSync(process.execPath,['--permission','--allow-fs-read=*','--input-type=module','-e',`import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(join(dir,'forbidden'))},'x')`],{encoding:'utf8'});
    assert.notEqual(denied.status,0); assert.match(denied.stderr,/ERR_ACCESS_DENIED/);
    await writeFile(path,file(record(event()),Buffer.from([0])));
    const bad=spawnSync(process.execPath,['tools/inspect-hci.ts',...args,'--record','0'],{encoding:'utf8'});
    assert.equal(bad.status,1); assert.equal(bad.stdout,''); assert.ok(!bad.stderr.includes(path));
    await writeFile(path,file(record(event([report(),report([],5)]))));
    const late=spawnSync(process.execPath,['tools/inspect-hci.ts',...args,'--record','0'],{encoding:'utf8'});
    assert.equal(late.status,1); assert.equal(late.stdout,'');
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('service interpretation is per report and malformed/opaque AD survives unchanged', async () => {
  // Service UUID FCD2, encrypted BTHome device-info, opaque remainder.
  const data = [5,0x16,0xd2,0xfc,0x41,0xff];
  const selected = selectHciLegacyEvent(await prepare(file(record(event([report(data),report([3,0xff,1])])))),0);
  assert.equal(selected.reports[0]!.serviceReadings.length,1);
  assert.equal(selected.reports[0]!.serviceReadings[0]!.reading.status,'opaque');
  assert.equal(selected.reports[1]!.advertising.status,'malformed');
  assert.equal(selected.reports[1]!.serviceReadings.length,0);
});
test('actual-byte budgets ignore subclass claims, context fields do not invoke inherited data', async () => {
  class LyingBytes extends Uint8Array { override get byteLength() {return 16;} override get length() {return 16;} }
  await assert.rejects(prepare(new LyingBytes(262145)));
  const actual = file(record([99,...Array(262144-41).fill(65)]));
  assert.equal(actual.length,262144); assert.equal((await prepare(actual)).source.byteCount,262144);
  await assert.rejects(prepareHci(file(),Object.create(context),hash));
  await assert.rejects(prepareHci(file(),{...context, extra:'x'} as HciContext,hash));
  await assert.rejects(prepareHci(file(),{...context,label:'\n'},hash));
});

test('standalone selected JSON retains every metadata disclosure', async () => {
  const prepared = await prepare(file(record(event())));
  const selected = selectHciLegacyEvent(prepared,0);
  assert.deepEqual(selected.warnings,listHciRecords(prepared).warnings);
  assert.ok(Object.isFrozen(selected.warnings));
  const json = JSON.parse(serializeHciReport(selected));
  const text = json.warnings.join(' ');
  for (const caveat of [/Operator-supplied offline host.controller bytes/, /not physical RF samples/,
    /No guarantee of capture completeness, authenticity, ownership, or device identity/,
    /SHA-256 identifies the supplied byte content/, /digest equality establishes byte equality only/,
    /not authenticated origin, truthful capture history, ownership, receiver identity, physical reception, or device identity/,
    /producer-declared claims; no wall-clock conversion/, /Zero cumulative drops does not establish absence of losses/,
    /Resolved identity addresses are not necessarily the actual over-air addresses/,
    /Scan responses remain separate/, /no address pooling or concatenation/, /Extended advertising is uninspected/]) {
    assert.match(text,caveat);
  }
});
