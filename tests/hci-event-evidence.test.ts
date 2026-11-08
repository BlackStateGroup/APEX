import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareHci, createHciLegacyEventDocument, parseHciLegacyEventDocument } from '../packages/core/hci-offline.ts';
import { prepareHciEventEvidenceInput as prepare, snapshotHciEventEvidencePayload } from '../packages/core/hci-event-evidence.ts';
import { EvidenceStore, parseEvidence, verifyEvidenceDocument } from '../packages/core/evidence.ts';
import { createEvidenceBundle, readEvidenceBundle } from '../packages/core/evidence-bundle.ts';
const time = '2026-11-08T01:02:03.000Z';
const sha256 = async (text: string) => createHash('sha256').update(text).digest('hex');
const bytesHash = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture(provenance: 'synthetic-fixture' | 'recorded-import' = 'synthetic-fixture') {
  const event = [4,62,12,2,1,0,0,1,2,3,4,5,6,0,127];
  const record = Buffer.alloc(24 + event.length); record.writeUInt32BE(event.length); record.writeUInt32BE(event.length,4); record.writeUInt32BE(3,8); record.set(event,24);
  const bytes = Buffer.concat([Buffer.from('6274736e6f6f700000000001000003ea','hex'),record]);
  const document = await createHciLegacyEventDocument(await prepareHci(bytes,{provenance,label:'synthetic test'},bytesHash),0,bytesHash);
  return { bytes, document: '\n '+JSON.stringify(JSON.parse(document),null,1)+'\t' };
}
function journal(hash: typeof bytesHash | undefined = bytesHash) {
  const documents: string[] = [];
  const store = new EvidenceStore({insert: async (_,text)=>{documents.push(text);},list:async()=>documents}, {sha256,sha256Bytes:hash,randomId:()=> 'hci-test'});
  return {store,documents};
}
async function signed(payload: unknown) {
  const base = {schemaVersion:1,id:'hci-test',kind:'analysis.hci-event',source:'offline-fixture',observedAt:time,payload};
  // Canonical payload field order is alphabetical, unlike the convenience input.
  const canonical = JSON.parse(JSON.stringify(base));
  canonical.payload = Object.fromEntries(Object.entries(canonical.payload).sort(([a],[b])=>a.localeCompare(b)));
  return JSON.stringify({...canonical,sha256:await sha256(JSON.stringify(canonical))});
}
test('exact text, source mapping, binary bytes and all successful entry points', async()=>{
  for (const provenance of ['synthetic-fixture','recorded-import'] as const) {
    const {bytes,document}=await fixture(provenance); const input=prepare(document);
    assert.equal(input.source,provenance==='synthetic-fixture'?'offline-fixture':'offline-import');
    const seen: Uint8Array[]=[];const hash=async(b:Uint8Array)=>{seen.push(new Uint8Array(b));const digest=await bytesHash(b);b.fill(0);return digest;};
    const {store,documents}=journal(hash);const record=await store.save({...input,observedAt:time});
    assert.equal((record.payload as any).document,document);assert.equal(await store.verify(record),true);
    assert.deepEqual(await store.list(),[record]);assert.deepEqual(await verifyEvidenceDocument(documents[0]!,sha256,hash),record);
    const bundle=await createEvidenceBundle(documents,time,sha256,hash);assert.deepEqual((await readEvidenceBundle(bundle,sha256,hash)).records,[record]);
    seen.forEach(b=>assert.deepEqual(Buffer.from(b),bytes));
    await assert.rejects(store.save({...input,source:input.source==='offline-import'?'offline-fixture':'offline-import'}));
    await assert.rejects(store.save({...input,source:'native-ios'}));assert.equal(documents.length,1);
  }
});
test('missing capability rejects save, verify and both bundle operations; structural list remains available', async()=>{
  const input=prepare((await fixture()).document);const good=journal();const record=await good.store.save({...input,observedAt:time});
  const missing=journal(); // explicitly construct string-only crypto (default parameter would add it).
  const store=new EvidenceStore({insert:async(_,t)=>{missing.documents.push(t);},list:async()=>good.documents},{sha256,randomId:()=> 'hci-test'});
  await assert.rejects(store.save(input),/byte SHA/);await assert.rejects(store.verify(record),/byte SHA/);
  await assert.rejects(verifyEvidenceDocument(good.documents[0]!,sha256),/byte SHA/);
  await assert.rejects(createEvidenceBundle(good.documents,time,sha256),/byte SHA/);
  const bundle=await createEvidenceBundle(good.documents,time,sha256,bytesHash);await assert.rejects(readEvidenceBundle(bundle,sha256),/byte SHA/);
  assert.deepEqual(await store.list(),[record]);assert.equal(missing.documents.length,0);
});
test('re-signed outer content cannot authorize stale digest or matching-hash malformed legacy event',async()=>{
  const {document}=await fixture();
  for(const matching of [false,true]) {
    const value=JSON.parse(document);const record=Buffer.from(value.derivative.recordHex,'hex');record[27]=13;value.derivative.recordHex=record.toString('hex');
    if(matching)value.derivative.sha256=await bytesHash(Buffer.concat([Buffer.from(value.derivative.fileHeaderHex,'hex'),record]));
    const input=prepare(JSON.stringify(value));parseHciLegacyEventDocument(input.payload.document);
    const {store,documents}=journal();await assert.rejects(store.save(input));assert.equal(documents.length,0);
    const text=await signed(input.payload);const parsed=parseEvidence(text);await assert.rejects(store.verify(parsed));await assert.rejects(verifyEvidenceDocument(text,sha256,bytesHash));await assert.rejects(createEvidenceBundle([text],time,sha256,bytesHash));
    const base={schemaVersion:1,format:'apex.selected-evidence',exportedAt:time,recordCount:1,records:[text]};
    await assert.rejects(readEvidenceBundle(JSON.stringify({...base,sha256:await sha256(JSON.stringify(base))}),sha256,bytesHash));
  }
});
test('payload exact own-data fields reject getters, hidden/symbol extras and malformed bounded JSON',async()=>{
  const {document}=await fixture();const input=prepare(document);let calls=0;
  const accessor={...input.payload};Object.defineProperty(accessor,'document',{enumerable:true,get(){calls++;return document;}});
  const hidden={...input.payload};Object.defineProperty(hidden,'extra',{value:true});
  for(const payload of [accessor,hidden,{...input.payload,[Symbol('extra')]:true},{...input.payload,extra:true},{...input.payload,document:0},{...input.payload,schemaVersion:2},null]) {
    assert.throws(()=>snapshotHciEventEvidencePayload(payload));const {store,documents}=journal();await assert.rejects(store.save({...input,payload}));assert.equal(documents.length,0);
    await assert.rejects(store.verify({schemaVersion:1,id:'hci-test',kind:input.kind,source:input.source,payload,observedAt:time,sha256:'0'.repeat(64)}));
  }
  assert.equal(calls,0);
  const compact=JSON.stringify(JSON.parse(document));const boundary=compact+' '.repeat(4096-compact.length);assert.equal(prepare(boundary).payload.document.length,4096);
  assert.throws(()=>prepare(boundary+' '));assert.throws(()=>prepare(compact.replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1')));
  assert.throws(()=>prepare(compact.replace('"schemaVersion":1','"schemaVersion":1,"extra":0')));
});
test('caller mutation during delayed byte and string hashes never changes persisted/returned snapshot; storage failure propagates',async()=>{
  const {document}=await fixture();const input=prepare(document);let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const {store,documents}=journal(async b=>{await gate;return bytesHash(b);});const pending=store.save({...input,observedAt:time});input.payload.document='{}';release();
  const record=await pending;assert.equal((record.payload as any).document,document);assert.equal((JSON.parse(documents[0]!).payload).document,document);
  let unlock!:()=>void;const delayed=new Promise<void>(r=>{unlock=r;});const verifying=verifyEvidenceDocument(documents[0]!,async t=>{await delayed;return sha256(t);},bytesHash);record.payload={};unlock();assert.equal(((await verifying).payload as any).document,document);
  const failure=new EvidenceStore({insert:async()=>{throw Error('storage failure');},list:async()=>[]},{sha256,sha256Bytes:bytesHash,randomId:()=> 'hci-test'});await assert.rejects(failure.save(prepare(document)),/storage failure/);
});
test('real CLI create and preview round trip HCI without decoded reports, reject forged derivative',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'apex-hci-evidence-'));
  try {
    const {store,documents}=journal();await store.save({...prepare((await fixture()).document),observedAt:time});
    const selected=join(dir,'selected.json'),bundle=join(dir,'bundle.json');writeFileSync(selected,JSON.stringify(documents));
    const run=(args:string[])=>spawnSync(process.execPath,['tools/evidence-bundle.ts',...args],{encoding:'utf8'});
    const created=run(['create',selected,time]);assert.equal(created.status,0,created.stderr);assert.equal(created.stdout,await createEvidenceBundle(documents,time,sha256,bytesHash)+'\n');writeFileSync(bundle,created.stdout);
    const preview=run(['preview',bundle]);assert.equal(preview.status,0,preview.stderr);assert.equal(preview.stdout,JSON.stringify(await readEvidenceBundle(created.stdout,sha256,bytesHash))+'\n');assert.ok(!preview.stdout.includes('"selection"'));
    const bad=JSON.parse((await fixture()).document);bad.derivative.sha256='0'.repeat(64);writeFileSync(selected,JSON.stringify([await signed(prepare(JSON.stringify(bad)).payload)]));const rejected=run(['create',selected,time]);assert.equal(rejected.status,1);assert.equal(rejected.stdout,'');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
