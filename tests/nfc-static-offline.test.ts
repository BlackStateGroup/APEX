import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectNfcStatic, serializeNfcStaticReport } from '../packages/core/nfc-static-offline.ts';
import type { NfcStaticContext } from '../packages/core/nfc-static-offline.ts';
import { inspectNfcStaticCli } from '../tools/inspect-nfc-static.ts';
import { decodeNdefMessage } from '../packages/core/ndef-offline.ts';
const ctx: NfcStaticContext={mode:'static-data-48',provenance:'synthetic-fixture',label:'manually authored bytes'};
const hash=async(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const data=(values:number[]=[])=>{const b=new Uint8Array(48);b.set(values);return b;};
const inspect=(b:Uint8Array)=>inspectNfcStatic(b,ctx,hash);
const message=[0xd1,1,4,0x54,2,0x65,0x6e,0x41];
const input=()=>data([3,message.length,...message,254]);
const full=(b:Uint8Array,cc=0)=>{const f=new Uint8Array(64);f.fill(0xaa,0,12);f.set([0xe1,0x10,6,cc],12);f.set(b,16);return f;};
test('exact source SHA256, literal offsets and whole NDEF value parity',async()=>{
  const b=full(input());const r=await inspectNfcStatic(b,{...ctx,mode:'static-structure-64'},hash);
  assert.equal(r.source.sha256,await hash(b));assert.notEqual(r.source.sha256,await hash(Uint8Array.from(message)));
  assert.deepEqual(r.ndef.value,{offset:2,endOffset:10,sourceOffset:18,sourceEndOffset:26});
  assert.deepEqual(r.trailing,{offset:11,endOffset:48,sourceOffset:27,sourceEndOffset:64});
  const d=decodeNdefMessage('d101045402656e41');assert.deepEqual(r.ndef.decoder,{status:d.status,issues:d.issues,records:d.records.map(x=>({offset:x.offset,endOffset:x.endOffset,dataOffset:2+x.offset,dataEndOffset:2+x.endOffset,sourceOffset:18+x.offset,sourceEndOffset:18+x.endOffset,value:x.value}))});
  const s=serializeNfcStaticReport(r);assert.ok(!s.includes('aaaaaa'));assert.ok(!s.includes('rawHex'));assert.ok(!s.includes('d10104'));
});
test('explicit mode lengths and exact CC accepted set, no access inference',async()=>{
  for(const n of [0,1,47,49,63,65,100])await assert.rejects(inspect(new Uint8Array(n)));
  await assert.rejects(inspect(full(input())));await assert.rejects(inspectNfcStatic(input(),{...ctx,mode:'static-structure-64'},hash));
  for(let c=0;c<256;c++){const r=await inspectNfcStatic(full(input(),c),{...ctx,mode:'static-structure-64'},hash);assert.equal(r.tlvStatus,[0,15].includes(c)?'supported':'unsupported');if(![0,15].includes(c))assert.equal(r.ndef.decoder,null);}
  for(const off of [12,13,14]){const b=full(input());b[off]=b[off]!^1;const r=await inspectNfcStatic(b,{...ctx,mode:'static-structure-64'},hash);assert.equal(r.tlvStatus,'unsupported');}
});
test('all 256 tags and length bytes, no search recovery',async()=>{
  for(let tag=0;tag<256;tag++){const r=await inspect(data([tag,0,254]));assert.equal(r.tlvStatus,[0,3,253,254].includes(tag)?'supported':'unsupported');}
  for(const tag of [3,253])for(let len=0;len<256;len++){
    const r=await inspect(data([tag,len]));assert.equal(r.tlvStatus,len<=46?'supported':len===255?'unsupported':'malformed');
  }
  for(const tag of [1,2,4,252,255]){const r=await inspect(data([tag,3,8,...message]));assert.equal(r.ndef.status,'not-attempted');assert.equal(r.elements.length,0);}
});
test('literal edge offsets, NULL exhaustion, terminator and opaque trailing',async()=>{
  assert.equal((await inspect(data())).elements.length,48);assert.equal((await inspect(data())).ndef.status,'missing');
  for(const tag of [3,253]){const b=data();b[47]=tag;const r=await inspect(b);assert.equal(r.diagnostic!.code,'truncated-length');assert.equal(r.diagnostic!.offset,47);}
  const last=data();last[47]=254;assert.equal((await inspect(last)).trailing,null);
  const stopped=await inspect(data([254,1,2,255,3,255]));assert.equal(stopped.tlvStatus,'supported');assert.equal(stopped.trailing!.offset,1);
  const end=await inspect(data([253,46,...Array(46).fill(99)]));assert.equal(end.elements.length,1);assert.equal(end.elements[0]!.value!.endOffset,48);assert.equal(end.trailing,null);
});
test('late malformed/unsupported suppress NDEF; missing, multiple, empty, decoder failure separate',async()=>{
  for(const tail of [[1],[2],[255],[3,255],[253,100]]){const r=await inspect(data([3,8,...message,...tail]));assert.notEqual(r.tlvStatus,'supported');assert.equal(r.ndef.decoder,null);assert.equal(r.ndef.status,'not-attempted');}
  assert.equal((await inspect(data([3,0,254]))).ndef.status,'empty');
  const multiple=await inspect(data([3,0,3,0,254]));assert.equal(multiple.tlvStatus,'supported');assert.equal(multiple.ndef.status,'ambiguous');assert.equal(multiple.ndef.count,2);
  const malformed=await inspect(data([3,1,0xd1,254]));assert.equal(malformed.tlvStatus,'supported');assert.equal(malformed.ndef.decoder!.status,'malformed');
  const trailing=await inspect(data([3,9,...message,0,254]));assert.equal(trailing.ndef.decoder!.status,'malformed');assert.equal(trailing.ndef.decoder!.issues[0]!.code,'trailing-bytes');
  const opaque=await inspect(data([253,4,0xde,0xad,0xbe,0xef,3,0,254]));assert.equal(opaque.ndef.status,'empty');assert.ok(!serializeNfcStaticReport(opaque).includes('deadbeef'));
});
test('snapshot before context, independent hash copy, frozen results and private source',async()=>{
  const b=input(),expected=await hash(b);let unblock!:(s:string)=>void;
  const pending=inspectNfcStatic(b,ctx,async copy=>{copy.fill(255);return new Promise(r=>{unblock=r;});});b.fill(1);unblock(expected);
  const r=await pending;assert.equal(r.ndef.decoder!.status,'parsed');assert.equal(r.source.sha256,expected);
  assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.ndef.decoder!.records[0]!.value));assert.throws(()=>{(r.source as {label:string}).label='changed';});
  assert.throws(()=>serializeNfcStaticReport({...r}));
  let called=false;const accessor={...ctx};Object.defineProperty(accessor,'label',{get(){called=true;return 'x';}});await assert.rejects(inspectNfcStatic(input(),accessor,hash));assert.equal(called,false);
  const original=input();const c=new Proxy(ctx,{ownKeys(t){original.fill(1);return Reflect.ownKeys(t);}});assert.equal((await inspectNfcStatic(original,c,hash)).ndef.decoder!.status,'parsed');
  for(const bad of ['', 'A'.repeat(64),'g'.repeat(64),'0'.repeat(63)])await assert.rejects(inspectNfcStatic(input(),ctx,async()=>bad));
});
test('actual fixed nonshared Uint8Array and strict own context',async()=>{
  for(const b of [new Uint8Array(new SharedArrayBuffer(48)),new Uint8Array(new ArrayBuffer(48,{maxByteLength:64})),new Uint16Array(48),new Proxy(input(),{}),Array(48).fill(0)])await assert.rejects(inspect(b as Uint8Array));
  const b=input();Object.defineProperty(b,'byteLength',{value:999});Object.defineProperty(b,'buffer',{value:new SharedArrayBuffer(1)});assert.equal((await inspect(b)).ndef.status,'decoded');
  for(const c of [{...ctx,extra:1},{...ctx,label:''},{...ctx,label:'a'.repeat(129)},{...ctx,label:'a\n'},{...ctx,mode:'auto'},{...ctx,provenance:'verified'},Object.create(ctx)])await assert.rejects(inspectNfcStatic(input(),c as NfcStaticContext,hash));
});
test('CLI strict args, bounded regular-file reads, symlinks, generic atomic errors, read-only permission',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'apex-static-'));
  try {
    const path=join(dir,'synthetic.bin');await writeFile(path,input());const before=await readFile(path);
    const flags=['--mode','static-data-48','--provenance','synthetic-fixture','--label','own synthetic'];
    assert.equal(JSON.parse(await inspectNfcStaticCli([path,...flags])).ndef.status,'decoded');
    for(const args of [[],[path],[path,...flags,'--label','again'],[path,...flags,'--extra','x'],[path,...flags,'junk'],[path,...flags.slice(0,-1)]])await assert.rejects(inspectNfcStaticCli(args));
    await symlink(path,join(dir,'link'));await assert.rejects(inspectNfcStaticCli([join(dir,'link'),...flags]));
    await symlink(dir,join(dir,'ancestor'));assert.equal(JSON.parse(await inspectNfcStaticCli([join(dir,'ancestor','synthetic.bin'),...flags])).ndef.status,'decoded');
    for(const n of [0,47,49,65]){await writeFile(join(dir,'bad'),new Uint8Array(n));await assert.rejects(inspectNfcStaticCli([join(dir,'bad'),...flags]));}
    const cli=resolve('tools/inspect-nfc-static.ts');const result=spawnSync(process.execPath,['--permission','--allow-fs-read='+process.cwd(),'--allow-fs-read='+dir,cli,path,...flags],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).ndef.status,'decoded');assert.deepEqual(await readFile(path),before);
    const failure=spawnSync(process.execPath,[cli,join(dir,'SECRET_MISSING_PATH'),...flags],{encoding:'utf8'});assert.equal(failure.status,1);assert.equal(failure.stdout,'');assert.equal(failure.stderr,'Offline static NFC inspection failed\n');
  } finally {await rm(dir,{recursive:true,force:true});}
});
