import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { HciWorkbenchController as Hci, HCI_EXAMPLE, decodeHciHex } from '../src/hci-workbench.ts';
import { HciDocumentController as Document } from '../src/hci-document-workbench.ts';
import { nextAnalysisSource } from '../src/analysis-navigation.ts';
const hash = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
function deferred() { let resolve!: (s: string) => void, reject!: (e: unknown) => void; const promise = new Promise<string>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
async function selected(h = hash, input = HCI_EXAMPLE) { const c = new Hci(true, h); c.edit(input,c.lease); c.declare('synthetic-fixture',c.lease); await c.inspect(c.lease); c.select(0,c.lease,c.state); return c; }
async function document() { const c = await selected(); await c.prepareDocument(c.lease,c.state); return c.state.preparedDocument!; }
test('creation only follows explicit valid selection and explicit prepare; handoff once only', async () => {
 let calls = 0; const c = new Hci(true,async b => { calls++; return hash(b); });
 c.example(c.lease); await c.prepareDocument(c.lease,c.state); assert.equal(calls,0);
 await c.inspect(c.lease); assert.equal(calls,1); assert.equal(c.state.preparedDocument,null);
 await c.prepareDocument(c.lease,c.state); assert.equal(calls,1);
 const before = c.state; c.select(0,c.lease,c.state); assert.equal(calls,1);
 await c.prepareDocument(c.lease,before); assert.equal(calls,1);
 await c.prepareDocument(c.lease,c.state); assert.equal(calls,2);
 const ready = c.state, exact = c.takeDocument(c.lease,ready); assert.ok(exact);
 assert.equal(c.takeDocument(c.lease,ready),null); assert.equal(c.takeDocument(c.lease,c.state),null);
 const d = new Document(false,hash); d.receive(nextAnalysisSource(null,{document:exact})); assert.equal(d.state.draft,exact); assert.equal(d.state.value,null);
 assert.ok(Object.isFrozen(c)); assert.ok(Object.isFrozen(d)); assert.ok(Object.isFrozen(d.state)); assert.deepEqual(Object.keys(d),[]);
});
test('prepare overlap, stale callbacks, repeated selection, edits, clear and exit fence late success/rejection', async () => {
 for (const fail of [false,true]) for (const action of ['select','edit','clear','leave','inspect','declare','example']) {
  const gate = deferred(); let calls = 0;
  const c = await selected(b => ++calls === 1 ? hash(b) : gate.promise);
  const lease = c.lease, snapshot = c.state, p = c.prepareDocument(lease,snapshot);
  await c.prepareDocument(lease,snapshot); await c.prepareDocument(lease,c.state); assert.equal(calls,2);
  if(action==='select') c.select(0,lease,c.state);
  if(action==='edit') c.edit('00 ',lease);
  if(action==='clear') c.clear(lease);
  if(action==='leave') { c.deactivate(); c.activate(); }
  if(action==='inspect') void c.inspect(lease);
  if(action==='declare') c.declare('recorded-import',lease);
  if(action==='example') c.example(lease);
  const after = c.state;
  if(fail) gate.reject(new Error('SECRET_HASH_ERROR')); else gate.resolve(await hash(decodeHciHex(HCI_EXAMPLE)));
  await p;
  // A fresh inspection may legitimately complete, but old preparation must never publish.
  if(action!=='inspect') assert.equal(c.state,after);
  assert.equal(c.state.preparedDocument,null); assert.doesNotMatch(c.state.message,/SECRET_HASH_ERROR/);
  assert.equal(c.takeDocument(lease,snapshot),null);
 }
});
test('exact source delivery once including hidden state; no automatic verification, old reports cleared', async () => {
 let calls=0; const d = new Document(false,async b=>{ calls++;return hash(b); }); const exact=' \n'+await document()+'\t';
 d.receive({id:1,document:exact}); assert.equal(d.state.draft,exact); assert.equal(calls,0);
 d.activate(); await d.verify(d.lease,d.state); assert.ok(d.state.value); assert.equal(calls,1);
 assert.equal(d.state.value!.sourceReference.recordIndex,0); assert.equal(d.state.draft,exact);
 assert.equal(d.state.reports[0]!.reportOffset,45); assert.ok(Object.isFrozen(d.state.reports[0]));
 d.clear(d.lease,d.state); const cleared=d.state;
 for(const id of [1,0,-1,NaN,Infinity,1.5]) d.receive({id,document:exact}); assert.equal(d.state,cleared);
 d.receive({id:2,document:exact}); assert.equal(d.state.value,null); assert.equal(calls,1);
 d.deactivate(); const left=d.state; d.receive({id:2,document:exact}); assert.equal(d.state,left);
});
test('4096 UTF16 whole-edit budget retains exact draft, clears reports and fences rejected edits', async () => {
 const d = new Document(true,hash); const exact=await document(); d.receive({id:1,document:exact}); await d.verify(d.lease,d.state); assert.ok(d.state.value);
 for(const bad of ['x'.repeat(4097),'😀'.repeat(2049),123 as any]) {
  d.edit(bad,d.lease,d.state); assert.equal(d.state.draft,exact); assert.equal(d.state.rejectedEdit,true); assert.equal(d.state.value,null); assert.deepEqual(d.state.reports,[]);
  d.deactivate(); d.activate(); const rejected=d.state; await d.verify(d.lease,d.state); assert.equal(d.state,rejected);
 }
 d.edit('😀'.repeat(2048),d.lease,d.state); assert.equal(d.state.draft.length,4096); assert.equal(d.state.rejectedEdit,false);
 d.edit(exact,d.lease,d.state); await d.verify(d.lease,d.state); assert.ok(d.state.value);
 const old=d.state; d.edit('{}',d.lease,d.state); await d.verify(d.lease,old); assert.equal(d.state.value,null); await d.verify(d.lease,d.state); assert.equal(d.state.value,null);
 d.clear(d.lease,d.state); assert.equal(d.state.draft,''); assert.equal(d.state.rejectedEdit,false);
});
test('reopen races: new sources, accepted/rejected edits, Clear, exits and stale snapshots', async () => {
 const exact=await document();
 for(const fail of [false,true]) for(const action of ['source','edit','rejected','clear','leave']) {
  const gate=deferred(); let calls=0; const d=new Document(true,()=>{calls++;return gate.promise;}); d.receive({id:1,document:exact});
  const lease=d.lease, snapshot=d.state; const pending=d.verify(lease,snapshot);
  await d.verify(lease,snapshot); await d.verify(lease,d.state); assert.equal(calls,1);
  if(action==='source') d.receive({id:2,document:' '+exact});
  if(action==='edit') d.edit(exact+' ',lease,d.state);
  if(action==='rejected') d.edit('x'.repeat(4097),lease,d.state);
  if(action==='clear') d.clear(lease,d.state);
  if(action==='leave') {d.deactivate();d.activate();}
  const after=d.state;
  if(fail) gate.reject(new Error('PRIVATE_ERROR')); else gate.resolve(JSON.parse(exact).derivative.sha256);
  await pending; assert.equal(d.state,after); assert.equal(d.state.value,null); assert.deepEqual(d.state.reports,[]);
  d.edit('stale',lease,snapshot); d.clear(lease,snapshot); d.page(1,lease,snapshot); await d.verify(lease,snapshot); assert.equal(d.state,after);
 }
});
test('bounded reports paginate and never project nested advertising or readable private text', async () => {
 const reports=5, data=Buffer.from([8,9,...Buffer.from('PRIVATE')]);
 const payload=[4,62,2+reports*(10+data.length),2,reports]; for(let i=0;i<reports;i++) payload.push(0,0,1,2,3,4,5,6,data.length,...data,192);
 const record=Buffer.alloc(24); record.writeUInt32BE(payload.length);record.writeUInt32BE(payload.length,4);record.writeUInt32BE(3,8);
 const c=await selected(hash,HCI_EXAMPLE.slice(0,32)+record.toString('hex')+Buffer.from(payload).toString('hex')); await c.prepareDocument(c.lease,c.state);
 const d=new Document(true,hash);d.receive({id:1,document:c.state.preparedDocument!});await d.verify(d.lease,d.state);
 assert.equal(d.state.reportCount,5);assert.equal(d.state.reports.length,4);assert.doesNotMatch(JSON.stringify(d.state.reports),/PRIVATE|"advertising"|"serviceReadings":\[/);
 const first=d.state; d.page(1,d.lease,d.state); assert.equal(d.state.reports.length,1);d.page(0,d.lease,first);assert.equal(d.state.page,1);
 for(const n of [-1,2,Infinity,NaN,1.5]) {const before=d.state;d.page(n,d.lease,d.state);assert.equal(d.state,before);}
});
test('App routes exact prepared document and preserves separate stable inspector mounts', () => {
 const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
 assert.match(app,/setSelectedHciDocument\(previous => nextAnalysisSource\(previous, \{ document \}\)\); selectInspector\(ANALYSIS_ROUTES\['selected-hci-event'\]\)/);
 assert.equal((app.match(/<HciDocumentWorkbench /g)??[]).length,1);
 const source=readFileSync(new URL('../src/HciDocumentWorkbench.tsx',import.meta.url),'utf8');
 assert.match(source,/controller.receive\(selectedSource\)/);assert.doesNotMatch(source,/Linking|Clipboard|fetch\(|store\.save/);
});
test('new successful preparations/reopens survive old late completion or rejection', async () => {
 for(const fail of [false,true]) {
  const gate=deferred();let calls=0;const c=await selected(b=>++calls===2?gate.promise:hash(b));
  const old=c.prepareDocument(c.lease,c.state);c.select(0,c.lease,c.state);await c.prepareDocument(c.lease,c.state);const newest=c.state;
  if(fail)gate.reject(new Error('old'));else gate.resolve(await hash(decodeHciHex(HCI_EXAMPLE)));await old;assert.equal(c.state,newest);assert.ok(c.state.preparedDocument);
  const reopenGate=deferred();let reopens=0;const d=new Document(true,b=>++reopens===1?reopenGate.promise:hash(b));
  d.receive({id:1,document:c.state.preparedDocument!});const oldReopen=d.verify(d.lease,d.state);
  d.receive({id:2,document:' '+c.state.preparedDocument!});await d.verify(d.lease,d.state);const newReopen=d.state;
  if(fail)reopenGate.reject(new Error('old'));else reopenGate.resolve(JSON.parse(c.state.preparedDocument!).derivative.sha256);
  await oldReopen;assert.equal(d.state,newReopen);assert.ok(d.state.value);
 }
});
test('nonfirst selected document excludes unrelated record marker and uses derivative offsets', async () => {
 const unrelated=Buffer.from([4,14,7,...Buffer.from('PRIVATE')]);const header=Buffer.alloc(24);header.writeUInt32BE(unrelated.length);header.writeUInt32BE(unrelated.length,4);header.writeUInt32BE(3,8);
 const hex=HCI_EXAMPLE.slice(0,32)+header.toString('hex')+unrelated.toString('hex')+HCI_EXAMPLE.slice(32);
 const c=new Hci(true,hash);c.edit(hex,c.lease);c.declare('recorded-import',c.lease);await c.inspect(c.lease);c.select(1,c.lease,c.state);
 await c.prepareDocument(c.lease,c.state);const exact=c.state.preparedDocument!;assert.doesNotMatch(exact,/50524956415445/);
 const d=new Document(true,hash);d.receive({id:1,document:exact});await d.verify(d.lease,d.state);
 assert.equal(d.state.value!.sourceReference.recordIndex,1);assert.equal(d.state.value!.sourceReference.recordOffset,50);
 assert.equal(d.state.reports[0]!.reportOffset,45);assert.equal(d.state.value!.context.provenance,'recorded-import');
});
