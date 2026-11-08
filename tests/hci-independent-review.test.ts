/** Independently authored review fixtures; no real capture or upstream fixture. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareHci,listHciRecords,selectHciLegacyEvent} from '../packages/core/hci-offline.ts';
import {parseBleAdvertisingHex,interpretBleServiceData} from '../packages/core/ble-advertisements.ts';
const ctx={provenance:'synthetic-fixture' as const,label:'independent review'};
const hash=async(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const prep=(b:Uint8Array)=>prepareHci(b,ctx,hash);
// Literal oracle, manually counted: 16-byte file header, 24-byte wrapper,
// 29-byte H4 event, reports at 45 and 58, AD starts at 54 and 67.
// Repeated structures deliberately differ in type/address/RSSI, not parallel arrays.
const literal=Buffer.from(
 '6274736e6f6f700000000001000003ea'+
 '0000001d0000001d00000003010203047fffffffffffffff'+
 '043e1a0202'+
 '00020123456789ab0302010681'+
 '04031032547698ba01007f','hex');
// Actual lengths are asserted separately, never inferred from parser output.
function wrap(payload:Uint8Array,flags=3,original=payload.length){
 const h=Buffer.alloc(24);h.writeUInt32BE(original);h.writeUInt32BE(payload.length,4);h.writeUInt32BE(flags,8);
 return Buffer.concat([literal.subarray(0,16),h,payload]);
}
const event=(data:Uint8Array)=>Buffer.from([4,62,12+data.length,2,1,0,0,1,2,3,4,5,6,data.length,...data,0xc4]);
test('manual byte oracle: offsets, signed64 max, BE drops, repeated reports and address reversal',async()=>{
 assert.equal(literal.length,69);
 const p=await prep(literal),s=selectHciLegacyEvent(p,0);
 assert.equal(p.source.byteCount,69);assert.equal(p.source.sha256,await hash(literal));
 assert.equal(s.record.timestampRaw,'9223372036854775807');assert.equal(s.record.cumulativeDrops,16909060);
 assert.equal(s.record.originalLength,29);assert.equal(s.record.payloadOffset,40);
 assert.deepEqual(s.reports.map(r=>[r.reportOffset,r.dataOffset,r.dataLength,r.dataHex,r.rssiDbm]),[[45,54,3,'020106',-127],[58,67,1,'00',null]]);
 assert.equal(s.reports[0]!.addressDisplay,'AB:89:67:45:23:01');
 assert.equal(s.reports[1]!.addressDisplay,'BA:98:76:54:32:10');
 assert.deepEqual(s.reports.map(r=>r.kind),['advertisement','scan-response']);
 for(const r of s.reports)assert.equal(literal.subarray(r.dataOffset,r.dataOffset+r.dataLength).toString('hex'),r.dataHex);
});
test('all RSSI octets and enum octets use exact supported sets',async()=>{
 for(let x=0;x<256;x++){
  const b=event(Buffer.alloc(0));b[b.length-1]=x;const p=await prep(wrap(b));
  if(x<=20||x===127||x>=129)assert.equal(selectHciLegacyEvent(p,0).reports[0]!.rssiDbm,x===127?null:x>127?x-256:x);
  else assert.throws(()=>selectHciLegacyEvent(p,0),/RSSI/);
  for(const [at,max]of [[5,4],[6,3]]as const){const b=event(Buffer.alloc(0));b[at]=x;const p=await prep(wrap(b));if(x<=max)assert.equal(selectHciLegacyEvent(p,0).reports.length,1);else assert.throws(()=>selectHciLegacyEvent(p,0),/semantics/);}
 }
});
test('classification does not validate; complete wrapper with every shortened candidate refuses selection',async()=>{
 const b=event(Buffer.from([2,1,6]));
 for(let n=0;n<b.length;n++){const p=await prep(wrap(b.subarray(0,n)));assert.throws(()=>selectHciLegacyEvent(p,0));}
 for(let x=0;x<256;x++){if(x===b.length-3)continue;const bad=Buffer.from(b);bad[2]=x;const p=await prep(wrap(bad));assert.equal(listHciRecords(p).records[0]!.classification,'legacy-advertising-candidate');assert.throws(()=>selectHciLegacyEvent(p,0),/event length/);}
 const truncated=await prep(wrap(b,3,b.length+1));assert.equal(listHciRecords(truncated).records[0]!.captureTruncated,true);assert.throws(()=>selectHciLegacyEvent(truncated,0));
});
test('nonlegacy metadata has only safe keys; every unknown first octet remains unexposed',async()=>{
 const allowed=['index','offset','payloadOffset','originalLength','includedLength','flags','cumulativeDrops','timestampRaw','captureTruncated','classification','flagStatus'].sort();
 for(let x=0;x<256;x++){
  const p=await prep(wrap(Buffer.from([x,255,83,69,67,82,69,84])));
  const row=listHciRecords(p).records[0]!;assert.deepEqual(Object.keys(row).sort(),allowed);
  const out=JSON.stringify(listHciRecords(p));assert.ok(!out.includes('SECRET'));assert.ok(!out.includes('534543524554'));
  assert.throws(()=>selectHciLegacyEvent(p,0));
  if(x>5||x===0)assert.equal(row.classification,'unknown-opaque');
 }
});
test('AD parser and service parity retain malformed, encrypted, unknown and inert URL bytes',async()=>{
 for(const hex of ['','0001','0409ff0000','03ff01','020106','0516d2fc41ff','0616d2fc400164','0716aafe10c40361','0416ffff00','02eeab']){
  const s=selectHciLegacyEvent(await prep(wrap(event(Buffer.from(hex,'hex')))),0),r=s.reports[0]!;
  const expected=parseBleAdvertisingHex(hex);assert.equal(r.dataHex,hex);assert.deepEqual(r.advertising,expected);
  assert.deepEqual(r.serviceReadings,expected.elements.flatMap(e=>e.value.kind==='service-data'?[{elementOffset:e.offset,reading:interpretBleServiceData(e.value.uuid,e.value.payloadHex)}]:[]));
  const out=JSON.stringify(s);assert.ok(!out.includes('android-scan-record'));assert.ok(!out.includes('BLE-PLX'));
 }
});
test('intrinsic view offset, detached buffer, frozen brand and copied hasher bytes',async()=>{
 const storage=Buffer.concat([Buffer.from('PRIVATE-PREFIX'),literal,Buffer.from('PRIVATE-SUFFIX')]);
 const view=storage.subarray(14,14+literal.length);let hashBytes:Uint8Array|undefined;
 const p=await prepareHci(view,ctx,async b=>{hashBytes=b;return hash(b);});hashBytes!.fill(0);storage.fill(0);
 assert.equal(p.source.byteCount,literal.length);assert.equal(p.source.sha256,await hash(literal));assert.equal(selectHciLegacyEvent(p,0).reports.length,2);
 assert.throws(()=>listHciRecords(Object.create(p)));assert.throws(()=>listHciRecords(new Proxy(p,{})));
 const buf=new ArrayBuffer(16);const detached=new Uint8Array(buf);structuredClone(buf,{transfer:[buf]});await assert.rejects(prep(detached));
});
test('standalone selected JSON carries source/time/drop/identity/RF limitations',async()=>{
 const s=selectHciLegacyEvent(await prep(literal),0);
 const warnings=(s as unknown as {warnings?:string[]}).warnings;
 assert.ok(Array.isArray(warnings),'selected artifact requires standalone warnings');
 const text=warnings.join(' ');
 assert.match(text,/RF/);assert.match(text,/timestamp/i);assert.match(text,/drop/i);assert.match(text,/identity|identities/i);assert.match(text,/digest|hash|SHA-256/i);
});
test('CLI subprocesses: no opaque markers/path leakage, strict argument matrix, atomic failure, ancestor link permitted',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hci-independent-'));const path=join(dir,'PRIVATE_FILENAME.snoop');
 const base=['--provenance','synthetic-fixture','--label','review'];
 const run=(p=path,extra:string[]=[])=>spawnSync(process.execPath,['--permission','--allow-fs-read=*','tools/inspect-hci.ts',p,...base,...extra],{encoding:'utf8'});
 try{
  writeFileSync(path,wrap(Buffer.from([4,255,...Buffer.from('PRIVATE_BODY_MARKER')])));
  const opaque=run();assert.equal(opaque.status,0,opaque.stderr);assert.ok(!opaque.stdout.includes('PRIVATE'));assert.ok(!opaque.stdout.includes('50524956415445'));
  const fail=(r:ReturnType<typeof run>)=>{assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'Offline HCI inspection refused; no report emitted.\n');};
  for(const args of [['--record','0'],['--record','1e0'],['--record','+0'],['--record',' 0'],['--record','00'],['--start','9007199254740992'],['--start','0','--record','0'],['--label','duplicate'],['--provenance','recorded-import'],['--start'],['extra','1']])fail(run(path,args));
  writeFileSync(path,literal);const good=run(path,['--record','0']);assert.equal(good.status,0,good.stderr);assert.equal(JSON.parse(good.stdout).reports.length,2);
  const late=Buffer.from(literal);late[59]=4;writeFileSync(path,late);fail(run(path,['--record','0']));
  writeFileSync(path,Buffer.concat([literal,Buffer.from([0])]));fail(run(path,['--record','0']));
  writeFileSync(path,Buffer.alloc(262145));fail(run());fail(run(dir));fail(run(join(dir,'missing')));
  writeFileSync(path,literal);symlinkSync(path,join(dir,'final-link'));fail(run(join(dir,'final-link')));
  symlinkSync(dir,join(dir,'ancestor-link'));assert.equal(run(join(dir,'ancestor-link','PRIVATE_FILENAME.snoop')).status,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
