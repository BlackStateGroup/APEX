import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, writeFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareHci, selectHciExtendedMetadata, listHciRecords, selectHciLegacyEvent, serializeHciReport} from '../packages/core/hci-offline.ts';
import {inspectHciCli} from '../tools/inspect-hci.ts';
// Manually authored synthetic fields, not captured or copied upstream packets.
const report = (data: number[] = []) => [0,0,0,6,5,4,3,2,1,1,0,0,127,129,0,0,255,6,5,4,3,2,1,data.length,...data];
const event = (reports = [report()]) => {const params=[13,reports.length,...reports.flat()];return [4,62,params.length,...params];};
function file(payload: number[], flags=3, missing=0) {
  const b=Buffer.alloc(40+payload.length); b.write('btsnoop\0'); b.writeUInt32BE(1,8); b.writeUInt32BE(1002,12);
  b.writeUInt32BE(payload.length+missing,16); b.writeUInt32BE(payload.length,20); b.writeUInt32BE(flags,24); b.writeBigInt64BE(-1n,32); b.set(payload,40); return b;
}
const prepare=(bytes:Uint8Array)=>prepareHci(bytes,{provenance:'synthetic-fixture',label:'synthetic extended metadata'},async b=>createHash('sha256').update(b).digest('hex'));
const select=async (r=report())=>selectHciExtendedMetadata(await prepare(file(event([r]))),0);
test('explicit metadata selection, scalar spans, privacy and standalone disclosures',async()=>{
  const data=Array.from(Buffer.from('SECRET_AD_PAYLOAD')); const r=report(data); r[14]=255; r[15]=255;
  const bytes=file(event([r,report()])), p=await prepare(bytes), result=selectHciExtendedMetadata(p,0), a=result.reports[0]!;
  assert.equal(result.source.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(a.reportOffset,45); assert.equal(a.reportLength,24+data.length); assert.equal(a.dataOffset,69); assert.equal(a.dataLength,data.length);
  assert.deepEqual(a.eventType.offset,45); assert.equal(a.eventType.length,2); assert.equal(a.advertiserType.offset,47);
  assert.ok('display' in a.advertiserAddress); assert.ok('wireHex' in a.advertiserAddress); assert.equal(a.advertiserAddress.offset,48); assert.equal(a.advertiserAddress.display,'01:02:03:04:05:06'); assert.equal(a.advertiserAddress.wireHex,'060504030201');
  assert.equal(a.primaryPhy.offset,54); assert.equal(a.secondaryPhy.offset,55); assert.equal(a.sid.offset,56);
  assert.equal(a.txPower.offset,57); assert.equal(a.rssi.offset,58); assert.equal(a.periodicInterval.offset,59);
  assert.equal(a.directType.offset,61); assert.equal(a.directAddress.offset,62); assert.equal(a.dataLengthOffset,68);
  assert.equal(a.periodicInterval.raw,65535); assert.equal(a.periodicInterval.value,81918.75);
  assert.equal(result.reports[1]!.reportOffset,69+data.length); assert.equal(a.rssi.value,-127); assert.equal(a.txPower.state,'unavailable');
  const output=serializeHciReport(result); for(const marker of ['SECRET_AD_PAYLOAD',Buffer.from(data).toString('hex'),'dataHex','serviceReadings','"advertising":']) assert.ok(!output.includes(marker),marker);
  assert.ok(Object.isFrozen(a.eventType)); assert.ok(Object.isFrozen(result.warnings));
  for(const warning of listHciRecords(p).warnings.slice(0,-1)) assert.ok(result.warnings.includes(warning));
  assert.match(result.warnings.join(' '),/last fragment/); assert.match(result.warnings.join(' '),/not full semantic validity/);
  assert.equal(listHciRecords(p).records[0]!.classification,'extended-advertising-uninspected');
  assert.ok(!serializeHciReport(listHciRecords(p)).includes('060504030201'));
  assert.throws(()=>selectHciLegacyEvent(p,0)); assert.throws(()=>selectHciExtendedMetadata({...p},0));
  for(const index of [-1,1,0.5,NaN,Infinity]) assert.throws(()=>selectHciExtendedMetadata(p,index));
});
test('whole-event structural rejection has precise absolute offsets, including late failures',async()=>{
  const cases: [number[],number][]=[];
  let e=event(); e[2]!--; cases.push([e,42]);
  e=event(); e[4]=0; cases.push([e,44]); e=event(); e[4]=11; cases.push([e,44]);
  e=event([report(),report()]); e.pop(); e[2]!--; cases.push([e,69]);
  e=event([report(),report()]); e[52]=1; cases.push([e,93]);
  e=event(); e[28]=230; cases.push([e,68]);
  e=event(); e.push(0); e[2]!++; cases.push([e,69]);
  for(const [bytes,offset] of cases) { const p=await prepare(file(bytes)); assert.throws(()=>selectHciExtendedMetadata(p,0),new RegExp(`at offset ${offset}$`)); }
  for(const flags of [0,1,2,4,7,0xffffffff]) {const p=await prepare(file(event(),flags));assert.throws(()=>selectHciExtendedMetadata(p,0),/flags 3/);}
  const truncated=await prepare(file(event(),3,1)); assert.throws(()=>selectHciExtendedMetadata(truncated,0));
  for(const n of [0,229]) assert.equal((await select(report(Array(n).fill(255)))).reports[0]!.dataLength,n);
  assert.equal(selectHciExtendedMetadata(await prepare(file(event(Array.from({length:10},()=>report())))),0).reports.length,10);
});
test('scalar states exhaust wire values without guessing unavailable or reserved measurements',async()=>{
  for(let raw=0;raw<256;raw++) {
    const r=report(); r[2]=raw;r[11]=raw;r[12]=raw;r[13]=raw;r[9]=raw;r[10]=raw;
    const a=(await select(r)).reports[0]!;
    assert.equal(a.advertiserType.raw,raw);assert.equal(a.advertiserType.state,raw<4?'known':raw===255?'unavailable':'reserved');
    assert.equal('display' in a.advertiserAddress,raw<4);
    assert.equal(a.sid.state,raw<16?'known':raw===255?'unavailable':'reserved');
    const signed=raw>127?raw-256:raw, state=raw===127?'unavailable':signed>=-127&&signed<=20?'known':'reserved';
    for(const power of [a.txPower,a.rssi]) {assert.equal(power.state,state);assert.equal(power.value,state==='known'?signed:undefined);}
    assert.equal(a.primaryPhy.state,raw===1?'known':raw===3||raw===4?'feature-context-unknown':'reserved');
    assert.equal(a.secondaryPhy.state,raw===0?'inapplicable':raw===1||raw===2?'known':raw===3||raw===4?'feature-context-unknown':'reserved');
  }
  for(const interval of [0,1,5,6,65535]) {const r=report();r[14]=interval&255;r[15]=interval>>8;const a=(await select(r)).reports[0]!.periodicInterval;
    assert.equal(a.state,interval===0?'inapplicable':interval<6?'reserved':'known');assert.equal(a.value,interval>=6?interval*1.25:undefined);}
});
test('directed fields ignored when inapplicable, resolved target not asserted as identity',async()=>{
  for(let raw=0;raw<256;raw++) for(const directed of [false,true]) {
    const r=report();r[0]=directed?4:0;r[16]=raw;const a=(await select(r)).reports[0]!;
    const known=[0,1,2,3,254].includes(raw);
    assert.equal(a.directType.raw,raw);assert.equal(a.directType.state,!directed?'inapplicable':raw===2||raw===3?'feature-context-unknown':known?'known':'reserved');
    assert.equal('display' in a.directAddress,directed&&known);
    if(directed&&(raw===2||raw===3)) {assert.match(a.directType.meaning,/TargetA or corresponding scanner address/);assert.match(a.directType.meaning,/Own_Address_Type/);}
  }
});
test('event bits, conditional coded PHY, legacy contradictions and fragment statuses remain separate',async()=>{
  for(const status of [0,1,2,3]) {
    const r=report();r[0]=status<<5;const a=(await select(r)).reports[0]!;
    assert.equal(a.dataStatus.raw,status);assert.equal(a.dataStatus.state,status===3?'reserved':'known');
    assert.equal(a.dataStatus.mask,96);assert.equal(a.dataStatus.offset,45);
  }
  for(const eventType of [0x13,0x15,0x12,0x10,0x1b,0x1a]) {const r=report();r[0]=eventType;const a=(await select(r)).reports[0]!;assert.equal(a.diagnostics.length,0);assert.equal(a.eventType.legacy,true);}
  for(const [eventType,primary,secondary] of [[0x11,1,0],[0x13,2,0],[0x13,1,1],[0x33,1,0],[0x93,1,0]]) {
    const r=report();r[0]=eventType!;r[9]=primary!;r[10]=secondary!;const a=(await select(r)).reports[0]!;assert.equal(a.eventType.state,'contradictory');assert.equal(a.diagnostics.length,1);
  }
  const r=report();r[0]=0x8f;r[1]=0x80;r[9]=3;r[10]=4;const a=(await select(r)).reports[0]!;
  assert.equal(a.eventType.reservedBits,0x8080); assert.equal(a.eventType.state,'reserved');
  for(const flag of ['connectable','scannable','directed','scanResponse'] as const) assert.equal(a.eventType[flag],true);
  assert.match(a.eventType.meaning,/original advertisement/);assert.match(a.primaryPhy.meaning,/unspecified coding/);assert.match(a.secondaryPhy.meaning,/otherwise reserved/);
});
test('CLI option is exclusive, default stays private, late structural failure emits no stdout',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'apex-extended-hci-'));
  try {
    const path=join(dir,'synthetic.snoop');await writeFile(path,file(event()));
    const args=[path,'--provenance','synthetic-fixture','--label','synthetic'];
    assert.equal(JSON.parse(await inspectHciCli(args)).reports,undefined);
    assert.equal(JSON.parse(await inspectHciCli([...args,'--extended-record','0'])).sourceKind,'offline-hci-extended-advertising-metadata');
    for(const extra of [['--extended-record','0','--record','0'],['--extended-record','0','--start','0'],['--extended-record','01'],['--extended-record','-1'],['--extended-record','0','--extended-record','0'],['--extended-record']]) await assert.rejects(inspectHciCli([...args,...extra]));
    const link=join(dir,'link');await symlink(path,link);await assert.rejects(inspectHciCli([link,...args.slice(1),'--extended-record','0']));
    const child=spawnSync(process.execPath,['--permission','--allow-fs-read=*','tools/inspect-hci.ts',...args,'--extended-record','0'],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout).reports.length,1);
    const e=event([report(),report()]);e[52]=1;await writeFile(path,file(e));
    const bad=spawnSync(process.execPath,['tools/inspect-hci.ts',...args,'--extended-record','0'],{encoding:'utf8'});
    assert.equal(bad.status,1);assert.equal(bad.stdout,'');assert.ok(!bad.stderr.includes(path));
  } finally {await rm(dir,{recursive:true,force:true});}
});
