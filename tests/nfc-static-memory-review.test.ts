/** Independent host review. No mounted React, browser or native claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NfcStaticWorkbenchController as C, decodeStaticHex, NFC_STATIC_DATA_EXAMPLE as DATA } from '../src/nfc-static-workbench.ts';
import { hciDigest } from '../src/platform/hci-digest.ts';
const sha = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const pad = (s: string) => s.padEnd(96, '0');
const setup = (hash = sha) => { const c = new C(true, hash); c.example('static-data-48', c.lease); return c; };
const gate = () => { let resolve!: (s: string)=>void, reject!: (e: Error)=>void; const promise = new Promise<string>((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
test('independent boundaries: every size 0..130, explicit selections and whole rejection', async()=>{
 for(let n=0;n<=130;n++) {
  const text='a'.repeat(n);
  for(const mode of ['static-data-48','static-structure-64'] as const) {
   if(n===(mode==='static-data-48'?96:128)) assert.equal(decodeStaticHex(text,mode).length,n/2);
   else assert.throws(()=>decodeStaticHex(text,mode));
  }
 }
 const c=new C(true,sha); c.edit(DATA,c.lease); await c.inspect(c.lease); assert.equal(c.state.report,null);
 c.mode('static-data-48',c.lease); await c.inspect(c.lease); assert.equal(c.state.report,null);
 c.declare('recorded-import',c.lease); await c.inspect(c.lease); assert.equal((c.state as import('../src/nfc-static-workbench.ts').NfcStaticWorkbenchState).report?.source.provenance,'recorded-import');
 for(const bad of [' '+DATA, DATA+'\n', '０'.repeat(96), 'a'.repeat(129), DATA.slice(0,95)+'z']) {
  c.edit(bad,c.lease); assert.equal(c.state.draft,DATA); assert.equal(c.state.report,null);
  c.mode('static-data-48',c.lease); c.declare('synthetic-fixture',c.lease); c.deactivate(); c.activate(); await c.inspect(c.lease);
  assert.equal(c.state.rejectedEdit,true); assert.equal(c.state.report,null);
 }
 c.edit('',c.lease); assert.equal(c.state.rejectedEdit,false); await c.inspect(c.lease); assert.equal(c.state.report,null);
});
test('independent newer completion survives older success AND older error',async()=>{
 for(const fail of [false,true]) {
  const old=gate(), fresh=gate(); let calls=0; const c=setup(()=>++calls===1?old.promise:fresh.promise);
  const p=c.inspect(c.lease); c.edit(pad('fe'),c.lease); const q=c.inspect(c.lease);
  fresh.resolve('b'.repeat(64)); await q; const result=c.state; assert.equal(result.report?.ndef.status,'missing');
  if(fail) old.reject(Error('PRIVATE_ERROR_MARKER')); else old.resolve('a'.repeat(64)); await p;
  assert.equal(c.state,result); assert.equal(c.state.report?.source.sha256,'b'.repeat(64));
 }
});
test('independent malformed digest shapes never publish and alias mutations cannot affect parse',async()=>{
 for(const value of ['', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), undefined, 42]) {
  const c=setup(async()=>value as string); await c.inspect(c.lease); assert.equal(c.state.report,null); assert.equal(c.state.pending,false);
 }
 let copy:Uint8Array|undefined; const c=setup(async b=>{copy=b; const s=await sha(b); b.fill(0xff); return s;});
 await c.inspect(c.lease); copy!.fill(0); assert.equal(c.state.report?.ndef.status,'empty');
 assert.equal(c.state.report?.source.sha256,await hciDigest(decodeStaticHex(DATA,'static-data-48')));
 assert.notEqual(c.state.report?.source.sha256,await sha(Buffer.from(DATA)));
 const walk=(v:any)=>{if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v)); Object.values(v).forEach(walk);}}; walk(c.state);
});
test('independent whole TLV scan, unsupported CC, opaque report and offsets',async()=>{
 const c=setup();
 for(const [prefix,tlv,ndef] of [['03010102','unsupported','not-attempted'],['0301010330','malformed','not-attempted'],['03000300fe','supported','ambiguous'],['0300fe','supported','empty'],['fe','supported','missing'],['030100fe','supported','decoded']] as const) {
  c.edit(pad(prefix),c.lease); await c.inspect(c.lease); assert.equal(c.state.report?.tlvStatus,tlv); assert.equal(c.state.report?.ndef.status,ndef);
  if(ndef==='decoded') assert.equal(c.state.report?.ndef.decoder?.status,'malformed');
 }
 c.mode('static-structure-64',c.lease); c.edit('ab'.repeat(12)+'e1100700'+DATA,c.lease); await c.inspect(c.lease); assert.equal(c.state.report?.tlvStatus,'unsupported'); assert.equal(c.state.report?.ndef.status,'not-attempted');
 const data=pad('fd04cafebabe0308d1010461deadbeeffefacefeed');
 const hex='ab'.repeat(12)+'e1100600'+data; c.edit(hex,c.lease); await c.inspect(c.lease);
 const r=c.state.report!; assert.equal(r.source.sha256,await sha(Buffer.from(hex,'hex'))); assert.notEqual(r.source.sha256,await sha(Buffer.from(data,'hex')));
 assert.equal(r.ndef.value?.offset,8); assert.equal(r.ndef.value?.sourceOffset,24);
 assert.doesNotMatch(JSON.stringify(r),/cafebabe|deadbeef|facefeed|abababab|payloadHex|rawHex/);
 c.mode('static-data-48',c.lease); await c.inspect(c.lease); assert.equal(c.state.report,null);
});
test('independent stale paging, invalid numbers, and old leases do not mutate',async()=>{
 const c=setup(); c.edit('00'.repeat(48),c.lease); await c.inspect(c.lease);
 const old=c.state; c.page('tlvPage',11,c.lease,old); assert.equal(c.state.tlvPage,11); const last=c.state;
 for(const n of [-1,NaN,Infinity,12,1.1,Number.MAX_SAFE_INTEGER]) c.page('tlvPage',n,c.lease,c.state);
 c.page('tlvPage',0,c.lease,old); assert.equal(c.state,last);
 const lease=c.lease; c.deactivate(); c.activate(); const exited=c.state;
 c.example('static-data-48',lease); c.clear(lease); c.edit(DATA,lease); c.mode('static-data-48',lease); c.declare('recorded-import',lease); await c.inspect(lease); c.page('tlvPage',0,lease,last);
 assert.equal(c.state,exited); assert.equal(c.state.draft,'00'.repeat(48)); assert.equal(c.state.report,null); assert.equal(c.state.tlvPage,0);
});

import { readFileSync } from 'node:fs';
import { ANALYSIS_INSPECTORS, ANALYSIS_ROUTES, DEFAULT_ANALYSIS_INSPECTOR } from '../src/analysis-navigation.ts';
test('independent source integration preserves static NFC and all prior inspectors alongside explicit HCI documents',()=>{
 assert.deepEqual(ANALYSIS_INSPECTORS.map(x=>x.id),['recording','ble','ble-trials','ble-candidate','flipper','ir','hci-document','hci','ndef','phone-ndef','static-nfc','hci-compare','iq']);
 assert.equal(ANALYSIS_INSPECTORS[10].label,'Static NFC data area'); assert.equal(DEFAULT_ANALYSIS_INSPECTOR,'recording');
 assert.deepEqual(ANALYSIS_ROUTES, {'staged-hci-report':'hci-compare','selected-hci-event':'hci-document','service-data':'ble','advertised-uuid':'ble','phone-capture':'phone-ndef','staged-ble':'ble-trials'});
 const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
 assert.equal((app.match(/<NfcStaticWorkbench /g)||[]).length,1);
 assert.ok(app.includes("<NfcStaticWorkbench active={tab === 'Analysis' && inspector === 'static-nfc'} />"));
 const select=app.slice(app.indexOf('function selectInspector('),app.indexOf('const inspectorLabel'));
 assert.doesNotMatch(select,/inspect\(|example\(|save\(|capture\(|loadFixture/);
 const phone=readFileSync(new URL('../src/PhoneNdefWorkbench.tsx',import.meta.url),'utf8'); assert.match(phone,/expectedPlatform/);
 const ui=readFileSync(new URL('../tests/ui.smoke.spec.mjs',import.meta.url),'utf8');
 assert.match(ui,/static NFC chooser keeps exact mode/); assert.match(ui,/\['Static NFC data area', 'Inspect static NFC'\]/);
});

test('independent 64-byte authored APEX example remains explicit and hashes full supplied structure',async()=>{
 const c=new C(true,sha); c.example('static-structure-64',c.lease);
 assert.equal(c.state.report,null); assert.equal(c.state.pending,false);
 assert.equal(c.state.mode,'static-structure-64'); assert.equal(c.state.provenance,'synthetic-fixture');
 const bytes=decodeStaticHex(c.state.draft,'static-structure-64'); assert.equal(bytes.length,64);
 await c.inspect(c.lease); const report=c.state.report!;
 assert.equal(report.source.sha256,await sha(bytes)); assert.notEqual(report.source.sha256,await sha(bytes.slice(16)));
 assert.equal(report.tlvStatus,'supported'); assert.equal(report.ndef.status,'decoded');
 assert.equal(report.ndef.decoder?.status,'parsed'); assert.equal(report.ndef.decoder?.records.length,1);
 const value=report.ndef.decoder!.records[0]!.value;
 assert.deepEqual(value,{kind:'text',encoding:'utf-8',language:'en',text:'APEX'});
 assert.equal(report.ndef.value?.sourceOffset,18); assert.equal(report.ndef.value?.offset,2);
});
