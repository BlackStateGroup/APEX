import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareHci,selectHciExtendedMetadata,listHciRecords,serializeHciReport} from '../packages/core/hci-offline.ts';
// Independent synthetic builder: all byte positions explicitly assigned.
function row(n=0) {const b=Buffer.alloc(24+n,0xab); b.writeUInt16LE(0,0);b[2]=0;b[9]=1;b[10]=0;b[11]=0;b[12]=0;b[13]=0;b.writeUInt16LE(0,14);b[16]=255;b[23]=n;return b;}
function packet(rows: Buffer[]=[row()]) {const body=Buffer.concat([Buffer.from([13,rows.length]),...rows]);return Buffer.concat([Buffer.from([4,62,body.length&255]),body]);}
function capture(payload=packet(),flags=3,extra=0) {const b=Buffer.alloc(40+payload.length);b.write('btsnoop\0');b.writeUInt32BE(1,8);b.writeUInt32BE(1002,12);b.writeUInt32BE(payload.length+extra,16);b.writeUInt32BE(payload.length,20);b.writeUInt32BE(flags,24);b.set(payload,40);return b;}
const ctx={provenance:'synthetic-fixture' as const,label:'independent synthetic'};
const digest=async(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const prepared=(b:Uint8Array)=>prepareHci(b,ctx,digest);
const inspect=async(r:Buffer)=>selectHciExtendedMetadata(await prepared(capture(packet([r]))),0).reports[0]!;
function frozenTree(v:unknown) {if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v));for(const x of Object.values(v))frozenTree(x);}}
test('independent exhaustive 65536 event words and periodic interval arithmetic',async()=>{
 const legal=new Set([16,18,19,21,26,27]);
 for(let word=0;word<65536;word++) {const r=row();r.writeUInt16LE(word,0);r.writeUInt16LE(word,14);const a=await inspect(r);
  assert.equal(a.eventType.raw,word);assert.equal(a.periodicInterval.raw,word);
  for(const [i,key] of ['connectable','scannable','directed','scanResponse','legacy'].entries()) assert.equal(a.eventType[key as 'legacy'],Math.floor(word/2**i)%2===1);
  const legacy=Math.floor(word/16)%2===1, contradiction=legacy&&!legal.has(word);
  assert.equal(a.diagnostics.length,contradiction?1:0);assert.equal(a.eventType.state,contradiction?'contradictory':word>=128?'reserved':'known');
  assert.equal(a.eventType.reservedBits,Math.floor(word/128)*128);assert.equal(a.dataStatus.raw,Math.floor(word/32)%4);
  assert.equal(a.dataStatus.state,Math.floor(word/32)%4===3?'reserved':'known');
  assert.equal(a.periodicInterval.state,word===0?'inapplicable':word<6?'reserved':'known');assert.equal(a.periodicInterval.value,word<6?undefined:word*5/4);
 }
});
test('independent exhaustive octets, directed applicability, signed and conditional states',async()=>{
 for(let raw=0;raw<256;raw++)for(const directed of [false,true]) {const r=row();r[0]=directed?4:0;for(const pos of [2,9,10,11,12,13,16])r[pos]=raw;const a=await inspect(r);
 assert.equal(a.advertiserType.state,raw<4?'known':raw===255?'unavailable':'reserved');assert.equal('wireHex' in a.advertiserAddress,raw<4);
 assert.equal(a.directType.state,!directed?'inapplicable':[2,3].includes(raw)?'feature-context-unknown':[0,1,254].includes(raw)?'known':'reserved');assert.equal('wireHex' in a.directAddress,directed&&[0,1,2,3,254].includes(raw));
 assert.equal(a.primaryPhy.state,[3,4].includes(raw)?'feature-context-unknown':raw===1?'known':'reserved');assert.equal(a.secondaryPhy.state,[3,4].includes(raw)?'feature-context-unknown':raw===0?'inapplicable':[1,2].includes(raw)?'known':'reserved');
 assert.equal(a.sid.state,raw<16?'known':raw===255?'unavailable':'reserved');
 for(const field of [a.txPower,a.rssi]) {const valid=raw<=20||raw>=129;assert.equal(field.state,raw===127?'unavailable':valid?'known':'reserved');assert.equal(field.value,valid?(raw<128?raw:raw-256):undefined);assert.equal(field.raw,raw);}
 }
});
test('all data sizes and feasible counts, offsets, allowlisted property privacy',async()=>{
 for(let n=0;n<=229;n++){const r=row(n),a=await inspect(r);assert.equal(a.dataLength,n);assert.equal(a.dataOffset,69);assert.equal(a.reportLength,n+24);assert.equal(a.dataLengthOffset,68);
 assert.deepEqual(Object.keys(a).sort(),['index','reportOffset','reportLength','eventType','dataStatus','advertiserType','advertiserAddress','primaryPhy','secondaryPhy','sid','txPower','rssi','periodicInterval','directType','directAddress','dataOffset','dataLength','dataLengthOffset','diagnostics'].sort());}
 for(let count=1;count<=10;count++){const rs=Array.from({length:count},()=>row());rs[count-1]=row(253-24*count);const out=selectHciExtendedMetadata(await prepared(capture(packet(rs))),0);assert.equal(out.reports.length,count);assert.equal(out.reports[count-1]!.dataOffset+out.reports[count-1]!.dataLength,298);frozenTree(out);}
 for(let n=230;n<=255;n++){const r=row();r[23]=n;await assert.rejects(inspect(r));}
});
test('snapshot and trusted hasher separation, private brand, repeated selection',async()=>{
 const b=capture(), original=Buffer.from(b);let release!:(s:string)=>void;let hashCopy!:Uint8Array;
 const pending=prepareHci(b,ctx,async copy=>{hashCopy=copy;return new Promise<string>(resolve=>{release=resolve;});});b.fill(0);hashCopy.fill(255);release(await digest(original));const p=await pending;
 const out=selectHciExtendedMetadata(p,0);assert.equal(out.reports[0]!.primaryPhy.raw,1);assert.equal(p.source.sha256,await digest(original));frozenTree(out);
 assert.deepEqual(selectHciExtendedMetadata(p,0),out);assert.throws(()=>selectHciExtendedMetadata({...p},0));assert.throws(()=>selectHciExtendedMetadata(Object.create(p),0));
 assert.equal(serializeHciReport(listHciRecords(p)).includes('abababababab'),false);
});
test('structural late failures, selector framing and all non-three small flags',async()=>{
 const good=packet([row(3),row(4)]);for(let cut=0;cut<good.length;cut++){const short=Buffer.from(good.subarray(0,cut));if(short.length>=3)short[2]=short.length-3;const p=await prepared(capture(short));assert.throws(()=>selectHciExtendedMetadata(p,0));}
 for(const field of [0,1,3]){const b=packet();b[field]=0;const p=await prepared(capture(b));assert.throws(()=>selectHciExtendedMetadata(p,0));}
 for(let flags=0;flags<16;flags++){if(flags===3)continue;const p=await prepared(capture(packet(),flags));assert.throws(()=>selectHciExtendedMetadata(p,0));}
 const p=await prepared(capture(packet(),3,1));assert.throws(()=>selectHciExtendedMetadata(p,0));
 for(const count of [0,11,255]){const b=packet();b[4]=count;const p=await prepared(capture(b));assert.throws(()=>selectHciExtendedMetadata(p,0));}
});
test('actual CLI privacy, conflicts, atomic stderr, symlink scope and read denial',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hci-independent-ext-'));const path=join(dir,'synthetic');const cli=resolve('tools/inspect-hci.ts');
 const run=(file:string,extra:string[]=[],permission:string[]=[])=>spawnSync(process.execPath,[...permission,cli,file,'--provenance','synthetic-fixture','--label','independent',...extra],{encoding:'utf8'});
 try{writeFileSync(path,capture());let out=run(path);assert.equal(out.status,0,out.stderr);assert.equal(JSON.parse(out.stdout).reports,undefined);assert.ok(!out.stdout.includes('abababababab'));
 out=run(path,['--extended-record','0']);assert.equal(out.status,0,out.stderr);assert.equal(JSON.parse(out.stdout).reports.length,1);
 for(const extra of [['--extended-record','0','--start','0'],['--record','0','--extended-record','0'],['--extended-record','0','--extended-record','0'],['--extended-record','01'],['--extended-record','1e0'],['--extended-record','9007199254740992'],['--extended-record','-0'],['--extended-record'],['--extended-record','1']]){out=run(path,extra);assert.equal(out.status,1);assert.equal(out.stdout,'');assert.ok(!out.stderr.includes(path));}
 symlinkSync(path,join(dir,'final'));assert.equal(run(join(dir,'final'),['--extended-record','0']).status,1);symlinkSync(dir,join(dir,'ancestor'));assert.equal(run(join(dir,'ancestor','synthetic'),['--extended-record','0']).status,0);
 out=run(path,['--extended-record','0'],['--permission',`--allow-fs-read=${process.cwd()}`]);assert.equal(out.status,1);assert.equal(out.stdout,'');
 const late=packet([row(),row()]);late[late.length-1]=1;writeFileSync(path,capture(late));out=run(path,['--extended-record','0']);assert.equal(out.status,1);assert.equal(out.stdout,'');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
