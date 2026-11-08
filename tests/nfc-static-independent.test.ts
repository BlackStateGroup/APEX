import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, symlink, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectNfcStatic, serializeNfcStaticReport } from '../packages/core/nfc-static-offline.ts';
import type { NfcStaticContext } from '../packages/core/nfc-static-offline.ts';
const ctx: NfcStaticContext = {mode:'static-data-48',provenance:'synthetic-fixture',label:'independent hand-authored bytes'};
const digest = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const area = (...v:number[]) => { const b=new Uint8Array(48); b.set(v); return b; };
const view = (b:Uint8Array, c=ctx) => inspectNfcStatic(b,c,digest);
const structure = (data:Uint8Array, cc3=0) => {const b=new Uint8Array(64);b.fill(0xa9,0,12);b.set([0xe1,0x10,6,cc3],12);b.set(data,16);return b;};
const ctx64:NfcStaticContext={...ctx,mode:'static-structure-64'};

test('independent: every tag at every static-area position has a fixed no-resynchronization outcome',async()=>{
 for(let p=0;p<48;p++) for(let tag=0;tag<256;tag++) {
  const b=area();b[p]=tag;
  const r=await view(b);
  const status=tag===0||tag===254?'supported':tag===3||tag===253?(p===47?'malformed':'supported'):'unsupported';
  assert.equal(r.tlvStatus,status,`p=${p}, tag=${tag}`);
  if(status!=='supported') {assert.equal(r.ndef.status,'not-attempted');assert.equal(r.ndef.decoder,null);assert.equal(r.diagnostic?.sourceOffset,p);}
  else if(tag===254) {assert.equal(r.elements.length,p+1);assert.deepEqual(r.trailing,p===47?null:{offset:p+1,endOffset:48,sourceOffset:p+1,sourceEndOffset:48});}
 }
});
test('independent: all length octets at all available positions obey subtraction bounds',async()=>{
 for(const tag of [3,253]) for(let p=0;p<47;p++) for(let n=0;n<256;n++) {
  const b=area();b[p]=tag;b[p+1]=n;
  const r=await view(b);const expected=n===255?'unsupported':n>46-p?'malformed':'supported';
  assert.equal(r.tlvStatus,expected,`tag=${tag}, p=${p}, n=${n}`);
  if(expected==='supported') {const e=r.elements[p]!;assert.equal(e.endOffset,p+2+n);assert.equal(e.value?.offset,p+2);assert.equal(e.value?.endOffset,p+2+n);}
  else {assert.equal(r.ndef.decoder,null);assert.equal(r.diagnostic?.offset,p+1);}
 }
});
test('independent: each CC octet exhaustively checked against literal accepted values, no physical identity inference',async()=>{
 for(let index=12;index<16;index++) for(let value=0;value<256;value++) {
  const b=structure(area(254));b[index]=value;
  const r=await view(b,ctx64);const accepted=index===15?(value===0||value===15):value===[225,16,6][index-12];
  assert.equal(r.tlvStatus,accepted?'supported':'unsupported',`${index}:${value}`);
  assert.equal(r.ndef.decoder,null);if(!accepted) assert.equal(r.elements.length,0);
 }
});
test('independent: literal NDEF slice, absolute offsets, source digest, inert URI and private opaque bytes',async()=>{
 // Leading NULL; 3 proprietary bytes include apparent tags; one complete URI NDEF; terminator and opaque tail.
 const b=structure(area(0,253,3,3,254,255,3,6,0xd1,1,2,0x55,4,0x78,254,0x91,0x92));
 const r=await view(b,ctx64);
 assert.equal(r.source.sha256,'cdacd7b320cced2be80426e9700be58227e95e4dabc9ea8fd386d3071a78eec6');
 assert.deepEqual(r.ndef.value,{offset:8,endOffset:14,sourceOffset:24,sourceEndOffset:30});
 assert.deepEqual(r.elements[1]?.value,{offset:3,endOffset:6,sourceOffset:19,sourceEndOffset:22});
 assert.deepEqual(r.trailing,{offset:15,endOffset:48,sourceOffset:31,sourceEndOffset:64});
 assert.deepEqual(r.ndef.decoder?.records.map(({value,...coordinates})=>coordinates),[{offset:0,endOffset:6,dataOffset:8,dataEndOffset:14,sourceOffset:24,sourceEndOffset:30}]);
 assert.equal(r.ndef.decoder?.status,'parsed');assert.deepEqual(r.ndef.decoder?.records[0]?.value,{kind:'uri',prefixCode:4,uri:'https://x',actionable:false});
 const s=serializeNfcStaticReport(r);assert.ok(!/a9a9|9192|rawHex|inputHex|payloadHex|idHex|typeHex/.test(s));
 const changed=new Uint8Array(b);changed[0]=changed[0]!^1;const other=await view(changed,ctx64);assert.notEqual(other.source.sha256,r.source.sha256);assert.deepEqual(other.elements,r.elements);assert.deepEqual(other.ndef,r.ndef);
});
test('independent: missing, empty, ambiguous, exact exhaustion and terminator are distinct',async()=>{
 assert.equal((await view(area())).ndef.status,'missing');assert.equal((await view(area(3,0,254)) ).ndef.status,'empty');
 const ambiguous=await view(area(3,0,3,3,0xd0,0,0,254));assert.equal(ambiguous.tlvStatus,'supported');assert.equal(ambiguous.ndef.status,'ambiguous');assert.equal(ambiguous.ndef.decoder,null);
 const b=area();b[43]=3;b[44]=3;b.set([0xd0,0,0],45);const r=await view(b);assert.equal(r.tlvStatus,'supported');assert.equal(r.ndef.decoder?.status,'parsed');assert.equal(r.trailing,null);
 const trailing=await view(area(254,3,255,1,2));assert.equal(trailing.tlvStatus,'supported');assert.equal(trailing.ndef.status,'missing');
});
test('independent: a valid early NDEF never escapes later malformed/unsupported region',async()=>{
 for(const suffix of [[1],[2],[4],[253,255],[3,255],[253,47],[3,47]]) {
  const r=await view(area(3,3,0xd0,0,0,...suffix));assert.notEqual(r.tlvStatus,'supported');assert.equal(r.ndef.status,'not-attempted');assert.equal(r.ndef.decoder,null);
 }
});
test('independent: whole NDEF value, malformed/chunked/unknown semantics remain separate from TLV',async()=>{
 const vectors=[{v:[0xd0,0,0,0],status:'malformed',code:'trailing-bytes'},{v:[0xb1,1,0,0x54],status:'unsupported',code:'chunking-not-supported'},{v:[0xd5,0,1,0x99],status:'parsed',kind:'opaque'},{v:[0xd1,1,1,0x54,0x40],status:'malformed',code:'invalid-rtd'}];
 for(const x of vectors){const r=await view(area(3,x.v.length,...x.v,254));assert.equal(r.tlvStatus,'supported');assert.equal(r.ndef.status,'decoded');assert.equal(r.ndef.decoder?.status,x.status);if(x.code)assert.equal(r.ndef.decoder?.issues[0]?.code,x.code);if(x.kind)assert.equal(r.ndef.decoder?.records[0]?.value.kind,x.kind);}
});
test('independent: exact sizes, explicit own context, buffer brands and hasher result shape fail closed',async()=>{
 for(let n=0;n<80;n++)if(n!==48)await assert.rejects(()=>view(new Uint8Array(n)));
 await assert.rejects(()=>view(new Uint8Array(48),ctx64));await assert.rejects(()=>view(new Uint8Array(64)));
 for(const bad of [{...ctx,extra:1},{...ctx,mode:'auto'},{...ctx,provenance:'tag'},{...ctx,label:''},{...ctx,label:'x'.repeat(129)},{...ctx,label:'x\ny'},Object.create(ctx)])await assert.rejects(()=>view(area(),bad as NfcStaticContext));
 let getter=false;await assert.rejects(()=>view(area(),{...ctx,get label(){getter=true;return 'x';}}));assert.equal(getter,false);
 for(const b of [new Uint8Array(new SharedArrayBuffer(48)),new Uint8Array(new ArrayBuffer(48,{maxByteLength:64})),new Proxy(area(),{}),new Int8Array(48),new Uint8ClampedArray(48)])await assert.rejects(()=>view(b as Uint8Array));
 const detached=area();structuredClone(detached.buffer,{transfer:[detached.buffer]});await assert.rejects(()=>view(detached));
 for(const result of ['', 'A'.repeat(64),'a'.repeat(63),'a'.repeat(65),null,3])await assert.rejects(()=>inspectNfcStatic(area(),ctx,async()=>result as string));
});
test('independent: intrinsic source copy precedes context traps and async adapter mutation',async()=>{
 const source=area(3,3,0xd0,0,0,254);const original=new Uint8Array(source);
 Object.defineProperty(source,'buffer',{get(){throw Error('shadow buffer executed');}});Object.defineProperty(source,'byteLength',{get(){throw Error('shadow length executed');}});source.subarray=()=>{throw Error('shadow method executed');};
 const c=new Proxy({...ctx},{ownKeys(t){source.fill(255);return Reflect.ownKeys(t);}});
 let adapter:Uint8Array|undefined;const report=await inspectNfcStatic(source,c,async bytes=>{adapter=bytes;const h=await digest(bytes);bytes.fill(1);return h;});
 assert.equal(report.source.sha256,await digest(original));assert.equal(report.ndef.decoder?.status,'parsed');adapter!.fill(2);assert.equal(report.ndef.decoder?.status,'parsed');
 const input=area(3,0,254),context={...ctx};let resolve!:(s:string)=>void;const pending=inspectNfcStatic(input,context,()=>new Promise(r=>resolve=r));input.fill(1);context.label='changed';resolve('0'.repeat(64));const r=await pending;assert.equal(r.source.label,ctx.label);assert.equal(r.ndef.status,'empty');
 function frozen(v:unknown){if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v));for(const x of Object.values(v))frozen(x);}}frozen(report);
 assert.throws(()=>serializeNfcStaticReport({...report}));assert.throws(()=>serializeNfcStaticReport(JSON.parse(JSON.stringify(report))));
});
test('independent: real CLI generic atomic errors, strict options, final symlink refusal and ancestor allowance under Node write denial',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'apex-static-review-'));try {
  await mkdir(join(dir,'real'));const file=join(dir,'real','fixture.bin');const b=area(3,3,0xd0,0,0,254);await writeFile(file,b);await symlink(file,join(dir,'final-link'));await symlink(join(dir,'real'),join(dir,'ancestor'));
  const options=['--mode','static-data-48','--provenance','synthetic-fixture','--label','independent'];
  const run=(args:string[])=>spawnSync(process.execPath,['--permission','--allow-fs-read=*','tools/inspect-nfc-static.ts',...args],{encoding:'utf8',timeout:10000,env:{...process.env,CI:'1',EXPO_OFFLINE:'1',EXPO_NO_TELEMETRY:'1',npm_config_update_notifier:'false',npm_config_offline:'true',npm_config_audit:'false',npm_config_fund:'false'}});
  for(const path of [file,join(dir,'ancestor','fixture.bin')]){const result=run([path,...options]);assert.equal(result.status,0,result.stderr);const r=JSON.parse(result.stdout);assert.equal(r.ndef.decoder.status,'parsed');assert.ok(Buffer.byteLength(result.stdout)<=65536);}
  for(const n of [0,47,49,65])await writeFile(join(dir,`${n}.bin`),new Uint8Array(n));
  const invalid=[[],[file],[file,...options,'--wat','x'],[file,...options,'--label','duplicate'],[file,...options.slice(0,-1)],[file,...options,'extra'],[join(dir,'final-link'),...options],[dir,...options],[join(dir,'missing-sensitive-name'),...options],...[0,47,49,65].map(n=>[join(dir,`${n}.bin`),...options])];
  for(const args of invalid){const result=run(args);assert.equal(result.status,1,JSON.stringify(args));assert.equal(result.stdout,'');assert.equal(result.stderr,'Offline static NFC inspection failed\n');}
  assert.deepEqual(new Uint8Array(await readFile(file)),b);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('independent: NDEF issue coordinates include exact end boundary and output budget covers maximal NULL metadata',async()=>{
 const b=structure(area(0,3,4,0xd0,0,0,0,254));const r=await view(b,ctx64);
 assert.deepEqual(r.ndef.decoder?.issues,[{offset:3,dataOffset:6,sourceOffset:22,code:'trailing-bytes'}]);
 for(const data of [area(),area(254),area(3,0),area(253,46)]) {const report=await view(data);assert.ok(Buffer.byteLength(serializeNfcStaticReport(report))<=65536);}
 const buffer=Buffer.from(area(3,0,254));assert.equal((await view(buffer)).ndef.status,'empty');
});
