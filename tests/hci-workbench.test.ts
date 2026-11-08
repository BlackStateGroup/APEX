import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { HciWorkbenchController as Controller, HCI_EXAMPLE, decodeHciHex, hciExcerpt } from '../src/hci-workbench.ts';
import { hciDigest } from '../src/platform/hci-digest.ts';
import { listHciRecords } from '../packages/core/hci-offline.ts';
const hash = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const ready = (h = hash) => { const c = new Controller(true, h); c.example(c.lease); return c; };
function deferred() { let resolve!: (s: string) => void, reject!: (e: unknown) => void; const promise = new Promise<string>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function fixture(records: number, reports = 1, invalidLast = false) {
 const payload = [4,62,2+10*reports,2,reports];
 for(let i=0;i<reports;i++) payload.push(invalidLast && i === reports-1 ? 5 : 0,0,1,2,3,4,5,6,0,192);
 const b = Buffer.alloc(24+payload.length); b.writeUInt32BE(payload.length,0); b.writeUInt32BE(payload.length,4); b.writeUInt32BE(3,8); b.set(payload,24);
 return HCI_EXAMPLE.slice(0,32)+b.toString('hex').repeat(records);
}
test('strict decoder boundaries and byte hashing parity, including all byte values and subviews', async () => {
 for (const text of ['', '0', 'abc', '00 ', ' 00', '00\n', '0x00', 'é0', '０0', 'gg', '00'.repeat(32769)]) assert.throws(()=>decodeHciHex(text));
 assert.equal(decodeHciHex('aA'.repeat(32768)).length,32768);
 assert.deepEqual([...decodeHciHex('00fFaA')],[0,255,170]);
 for(const b of [decodeHciHex(HCI_EXAMPLE), Uint8Array.from({length:256},(_,i)=>i), new Uint8Array([3,0,255,4]).subarray(1,3)]) assert.equal(await hciDigest(b),await hash(b));
 assert.notEqual(await hciDigest(decodeHciHex(HCI_EXAMPLE)),await hash(Buffer.from(HCI_EXAMPLE)));
 const source = readFileSync(new URL('../src/platform/hci-digest.native.ts',import.meta.url),'utf8');
 assert.match(source,/Crypto\.digest\(Crypto\.CryptoDigestAlgorithm.SHA256, new Uint8Array\(bytes\)\)/);
 assert.doesNotMatch(source,/digestStringAsync\(/);
});
test('immutable snapshots, private prepared brand and metadata privacy', async () => {
 const c=ready(); const before=c.state; await c.inspect(c.lease); const m=c.state.metadata!;
 assert.ok(m); assert.equal(m.records.length,1); assert.equal(c.state.selectedIndex,null); assert.deepEqual(c.state.reports,[]);
 assert.ok(Object.isFrozen(c)); assert.ok(Object.isFrozen(c.state)); assert.ok(Object.isFrozen(m.records[0]));
 assert.throws(()=>{ (m.source as any).sha256='bad'; }); assert.throws(()=>{ (c.state as any).draft='bad'; });
 assert.throws(()=>listHciRecords(m as any),/unrecognized/); assert.deepEqual(Object.keys(c),[]);
 assert.doesNotMatch(JSON.stringify(m),/addressWireHex|dataHex|"advertising"/); // classification includes legacy-advertising, so check keys below
 assert.equal(before.metadata,null);
});
test('declaration and rejected whole edits block inspection, retain draft and clear reports', async () => {
 const c=new Controller(true,hash); c.edit(HCI_EXAMPLE,c.lease); await c.inspect(c.lease); assert.equal(c.state.metadata,null);
 c.declare('recorded-import',c.lease); await c.inspect(c.lease); assert.ok(c.state.metadata);
 for(const bad of ['00 ', 'ＦF','f'.repeat(65537),123 as any]) {
  c.edit(bad,c.lease); assert.equal(c.state.draft,HCI_EXAMPLE); assert.ok(c.state.rejectedEdit); assert.equal(c.state.metadata,null);
  c.declare('synthetic-fixture',c.lease); c.deactivate(); c.activate(); await c.inspect(c.lease); assert.equal(c.state.metadata,null); assert.ok(c.state.rejectedEdit);
 }
 c.edit('a',c.lease); assert.equal(c.state.rejectedEdit,false); await c.inspect(c.lease); assert.equal(c.state.metadata,null);
 c.clear(c.lease); assert.equal(c.state.draft,''); assert.equal(c.state.provenance,null); assert.equal(c.state.rejectedEdit,false);
});
test('late success and rejection fenced after edit, declaration, clear or tab leave', async () => {
 for(const reject of [false,true]) for(const operation of ['edit','declare','clear','leave']) {
  const gate=deferred(); const c=ready(()=>gate.promise); const lease=c.lease; const pending=c.inspect(lease);
  if(operation==='edit') c.edit('aa',lease); if(operation==='declare') c.declare('recorded-import',lease); if(operation==='clear') c.clear(lease); if(operation==='leave') { c.deactivate(); c.activate(); }
  const after=c.state; if(reject) gate.reject(new Error('untrusted error')); else gate.resolve(await hash(decodeHciHex(HCI_EXAMPLE)));
  await pending; assert.equal(c.state,after); assert.equal(c.state.metadata,null);
  if(operation==='leave') { c.example(lease); c.edit('00',lease); c.clear(lease); await c.inspect(lease); assert.equal(c.state,after); }
 }
});
test('four whole records and four whole selected reports; stale selection and whole event failure', async () => {
 const c=ready(); c.edit(fixture(6,5),c.lease); await c.inspect(c.lease); const first=c.state;
 assert.equal(first.metadata!.records.length,4); c.page(4,c.lease,first); assert.equal(c.state.metadata!.records.length,2);
 c.select(0,c.lease,first); assert.equal(c.state.selectedIndex,null);
 c.select(4,c.lease,c.state); assert.equal(c.state.reports.length,4); assert.equal(c.state.reportCount,5); assert.equal(c.state.reports[0]!.addressDisplay,'06:05:04:03:02:01');
 assert.ok(Object.isFrozen(c.state.reports)); assert.ok(Object.isFrozen(c.state.reports[0])); assert.equal('advertising' in c.state.reports[0]!,false);
 const prior=c.state; c.reportPage(1,c.lease,prior); assert.equal(c.state.reports.length,1); c.reportPage(0,c.lease,prior); assert.equal(c.state.reportPage,1);
 c.edit(fixture(1,5,true),c.lease); await c.inspect(c.lease); c.select(0,c.lease,c.state); assert.equal(c.state.selectedIndex,null); assert.equal(c.state.reports.length,0); assert.match(c.state.message,/Whole legacy event refused/);
 assert.ok(hciExcerpt('x'.repeat(5000)).length<160);
});
test('transport acceptance preserves malformed AD and opaque/invalid/format-match service statuses', async () => {
 for (const [dataHex, adStatus, matched, opaque, invalid, incomplete] of [
  ['050941','malformed',0,0,0,0],
  ['0416d2fc41','parsed',0,1,0,1],
  ['0416341200','parsed',0,1,0,0],
  ['0516aafe2000','parsed',0,0,1,0],
  ['0716d2fc40022e09','parsed',1,0,0,0],
  ['0816d2fc40022e09ff','parsed',0,1,0,1],
  ['0516d2fc4002','parsed',0,0,1,1],
 ] as const) {
  const data=Buffer.from(dataHex,'hex'), payload=Buffer.from([4,62,12+data.length,2,1,0,0,1,2,3,4,5,6,data.length,...data,192]);
  const record=Buffer.alloc(24+payload.length); record.writeUInt32BE(payload.length,0);record.writeUInt32BE(payload.length,4);record.writeUInt32BE(3,8);record.set(payload,24);
  const c=ready();c.edit(HCI_EXAMPLE.slice(0,32)+record.toString('hex'),c.lease);await c.inspect(c.lease);c.select(0,c.lease,c.state);
  const r=c.state.reports[0]!;assert.equal(r.adStatus,adStatus);assert.equal(r.serviceMatched,matched);assert.equal(r.serviceOpaque,opaque);assert.equal(r.serviceInvalid,invalid);assert.equal(r.serviceIncomplete,incomplete);
  assert.equal(r.bthomeComplete+r.bthomeUnsupported+r.bthomeMalformed+r.bthomeLimit+r.bthomeOpaque, dataHex.includes('d2fc') ? 1 : 0);
  if(dataHex==='0816d2fc40022e09ff') assert.equal(r.bthomeUnsupported,1);
  if(dataHex==='0516d2fc4002') assert.equal(r.bthomeMalformed,1);
  if(dataHex==='0416d2fc41') assert.equal(r.bthomeOpaque,1);
  if(adStatus==='malformed') { assert.equal(r.adIssues,1); assert.equal(r.adUnparsedBytes,3); }
  assert.match(c.state.message,/transport framing accepted/);assert.doesNotMatch(c.state.message,/event validated/);
 }
});
