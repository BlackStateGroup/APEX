import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NfcStaticWorkbenchController as Controller, NFC_STATIC_DATA_EXAMPLE as DATA, NFC_STATIC_STRUCTURE_EXAMPLE as STRUCTURE, decodeStaticHex, staticExcerpt } from '../src/nfc-static-workbench.ts';
import { hciDigest } from '../src/platform/hci-digest.ts';
const hash = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const ready = (h = hash) => { const c = new Controller(true, h); c.example('static-data-48', c.lease); return c; };
function deferred() { let resolve!: (s: string) => void, reject!: (e: unknown) => void; const promise = new Promise<string>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
test('strict exact-mode decoding and existing byte adapter parity', async () => {
 for (const text of ['', 'a', DATA+'00', DATA+' ', DATA.slice(1), 'Ｆ'.repeat(96), 'g'.repeat(96), STRUCTURE]) assert.throws(() => decodeStaticHex(text, 'static-data-48'));
 assert.throws(() => decodeStaticHex(DATA, 'static-structure-64'));
 for (const [text, mode] of [[DATA,'static-data-48'],[STRUCTURE,'static-structure-64']] as const) {
  const bytes=decodeStaticHex(text,mode); assert.equal(await hciDigest(bytes), await hash(bytes)); assert.notEqual(await hciDigest(bytes),await hash(Buffer.from(text)));
 }
 assert.ok(staticExcerpt('x'.repeat(1000)).length<150);
});
test('explicit mode/provenance, immutable report, separate byte copy', async () => {
 let supplied: Uint8Array | undefined;
 const c = new Controller(true, async b => { supplied=b; const result=await hash(b); b.fill(255); return result; });
 c.edit(DATA,c.lease); await c.inspect(c.lease); assert.equal(c.state.report,null);
 c.declare('synthetic-fixture',c.lease); await c.inspect(c.lease); assert.equal(c.state.report,null);
 c.mode('static-data-48',c.lease); await c.inspect(c.lease);
 assert.equal(c.state.report!.ndef.status,'empty'); assert.equal(c.state.report!.source.sha256,await hash(decodeStaticHex(DATA,'static-data-48')));
 supplied!.fill(0); assert.equal(c.state.report!.elements[0]!.kind,'ndef');
 assert.ok(Object.isFrozen(c)); assert.deepEqual(Object.keys(c),[]); assert.ok(Object.isFrozen(c.state)); assert.ok(Object.isFrozen(c.state.report!.elements[0]));
 assert.throws(()=>{ (c.state.report!.source as any).byteCount=0; });
 assert.equal(c.state.draft,DATA); assert.doesNotMatch(JSON.stringify(c.state.report),/rawHex|payloadHex|uidHex/);
 c.mode('static-structure-64',c.lease); await c.inspect(c.lease); assert.equal(c.state.report,null); assert.equal(c.state.mode,'static-structure-64');
});
test('whole rejected edits retain draft and fence across declarations, mode and leave', async () => {
 const c=ready(); await c.inspect(c.lease);
 for(const bad of ['00 ', 'f'.repeat(129), '０0', 42 as any]) {
  c.edit(bad,c.lease); assert.equal(c.state.draft,DATA); assert.ok(c.state.rejectedEdit); assert.equal(c.state.report,null);
  c.mode('static-structure-64',c.lease); c.declare('recorded-import',c.lease); c.deactivate(); c.activate(); await c.inspect(c.lease);
  assert.ok(c.state.rejectedEdit); assert.equal(c.state.report,null);
 }
 c.edit('a',c.lease); assert.equal(c.state.rejectedEdit,false); await c.inspect(c.lease); assert.equal(c.state.report,null);
 c.clear(c.lease); assert.equal(c.state.mode,null); assert.equal(c.state.provenance,null); assert.equal(c.state.draft,'');
 c.example('static-structure-64',c.lease); assert.equal(c.state.report,null); await c.inspect(c.lease); assert.equal(c.state.report!.source.byteCount,64);
});
test('late success/error fenced by accepted/rejected edits, mode, provenance, examples, clear and leave; old controls inert', async () => {
 for(const reject of [false,true]) for(const operation of ['edit','reject','mode','declare','example','clear','leave']) {
  const gate=deferred(), c=ready(()=>gate.promise), lease=c.lease; const pending=c.inspect(lease);
  if(operation==='edit') c.edit('a',lease); if(operation==='reject') c.edit(' ',lease); if(operation==='mode') c.mode('static-structure-64',lease);
  if(operation==='declare') c.declare('recorded-import',lease); if(operation==='example') c.example('static-structure-64',lease); if(operation==='clear') c.clear(lease);
  if(operation==='leave') { c.deactivate(); c.activate(); }
  const after=c.state; if(reject) gate.reject(Error('must not render')); else gate.resolve('a'.repeat(64)); await pending; assert.equal(c.state,after);
  if(operation==='leave') { c.edit('00',lease); c.mode('static-structure-64',lease); c.declare('recorded-import',lease); c.example('static-structure-64',lease); c.clear(lease); await c.inspect(lease); assert.equal(c.state,after); }
 }
});
test('bounded pages reject stale observations and reset on edits or leave', async () => {
 const c=ready(); c.edit('00'.repeat(48),c.lease); await c.inspect(c.lease); const first=c.state;
 c.page('tlvPage',1,c.lease,first); assert.equal(c.state.tlvPage,1); c.page('tlvPage',2,c.lease,first); assert.equal(c.state.tlvPage,1);
 for(const p of [-1,1.5,12,Infinity]) c.page('tlvPage',p,c.lease,c.state); assert.equal(c.state.tlvPage,1);
 c.edit(DATA,c.lease); assert.equal(c.state.tlvPage,0); await c.inspect(c.lease); c.deactivate(); assert.equal(c.state.report,null); assert.equal(c.state.draft,DATA);
});
test('record and issue paging use independent observations, and repeated inspect pending is inert',async()=>{
 const gate=deferred(); let calls=0; const c=ready(async()=>{calls++; return gate.promise;});
 const pending=c.inspect(c.lease); await c.inspect(c.lease); assert.equal(calls,1); gate.resolve('a'.repeat(64)); await pending;
 // Six manually authored empty NDEF records: MB first, ME last, no payloads.
 const ndef='900000'+'100000'.repeat(4)+'500000';
 c.edit(('0312'+ndef+'fe').padEnd(96,'0'),c.lease); await c.inspect(c.lease);
 assert.equal(c.state.report!.ndef.decoder!.records.length,6);
 c.page('recordPage',1,c.lease,c.state); assert.equal(c.state.recordPage,1); assert.equal(c.state.tlvPage,0);
 c.page('issuePage',1,c.lease,c.state); assert.equal(c.state.issuePage,0);
 c.mode('static-structure-64',c.lease); assert.equal(c.state.recordPage,0);
});
test('authored structure example contains complete inert Text APEX and exact source hash', async()=>{
 const c=new Controller(true,hciDigest); c.example('static-structure-64',c.lease);
 assert.equal(c.state.draft.length,128); assert.equal(c.state.report,null);
 await c.inspect(c.lease); const r=c.state.report!;
 assert.equal(r.tlvStatus,'supported'); assert.equal(r.ndef.status,'decoded'); assert.equal(r.ndef.decoder!.status,'parsed');
 assert.deepEqual(r.ndef.decoder!.records[0]!.value,{kind:'text',language:'en',encoding:'utf-8',text:'APEX'});
 assert.equal(r.ndef.decoder!.records[0]!.sourceOffset,18);
 assert.equal(r.source.sha256,await hash(Buffer.from(STRUCTURE,'hex')));
 assert.deepEqual(r.trailing,{offset:14,endOffset:48,sourceOffset:30,sourceEndOffset:64});
});
