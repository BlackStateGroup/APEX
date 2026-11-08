import test from 'node:test';
import assert from 'node:assert/strict';
import { HciDocumentController as Document } from '../src/hci-document-workbench.ts';
import { HciWorkbenchController as Capture } from '../src/hci-workbench.ts';
import { prepareHci, createHciLegacyEventDocument } from '../packages/core/hci-offline.ts';
import { hash, context, header, record, event, report, extended } from './hci-selected-review-fixture.ts';
const bytes=Buffer.concat([header,record(event([report('050941'),report('0516d2fc41ff'),report('0416ffff00'),report('0616d2fc400164'),report('0716d2fc400164ff')])),record(event([report('',4)])),record(extended)]);
const prepared=await prepareHci(bytes,context,hash);
const document=await createHciLegacyEventDocument(prepared,0,hash);
function deferred(){let resolve!:(s:string)=>void,reject!:(e:unknown)=>void;const promise=new Promise<string>((a,b)=>{resolve=a;reject=b;});return{resolve,reject,promise};}
test('independent document races: earlier success/failure cannot overwrite later accepted verification',async()=>{
 for(const fail of [false,true]){
  const gates=[deferred(),deferred()];let call=0;const digests:string[]=[];
  const c=new Document(true,async b=>{const i=call++;digests[i]=await hash(b);return gates[i]!.promise;});
  c.receive({id:1,document});const old=c.verify(c.lease,c.state);
  c.edit(document+'\n',c.lease,c.state);const fresh=c.verify(c.lease,c.state);
  await new Promise(r=>setImmediate(r));gates[1]!.resolve(digests[1]!);await fresh;const accepted=c.state;assert.ok(accepted.value);
  if(fail)gates[0]!.reject(Error('late untrusted text'));else gates[0]!.resolve(digests[0]!);await old;assert.equal(c.state,accepted);assert.equal(c.state.draft,document+'\n');
 }
});
test('independent document fencing: clear, rejected edit, source delivery and navigation invalidate pending work',async()=>{
 for(const action of ['clear','reject','source','leave']){
  const g=deferred();const c=new Document(true,()=>g.promise);c.receive({id:1,document});const lease=c.lease;const old=c.verify(lease,c.state);
  if(action==='clear')c.clear(lease,c.state);
  if(action==='reject')c.edit('x'.repeat(4097),lease,c.state);
  if(action==='source')c.receive({id:2,document:'{}'});
  if(action==='leave'){c.deactivate();c.activate();}
  const after=c.state;g.reject(Error('late'));await old;assert.equal(c.state,after);assert.equal(c.state.value,null);
  c.clear(lease,after);if(action==='leave')assert.equal(c.state,after);
 }
});
test('independent exact edits, source IDs, private frozen state and stale callbacks',async()=>{
 const c=new Document(true,hash);c.receive({id:1,document});const initial=c.state;
 for(const id of [-1,0,1,NaN,Infinity,1.5]){c.receive({id,document:'WRONG'});assert.equal(c.state,initial);}
 c.edit(' \r\n'+document+'\t',c.lease,c.state);assert.equal(c.state.draft,' \r\n'+document+'\t');
 c.clear(c.lease,initial);assert.notEqual(c.state.draft,'');
 for(const bad of [null,42,{},'😀'.repeat(2049)] as any[]){const retained=c.state.draft;c.edit(bad,c.lease,c.state);assert.equal(c.state.draft,retained);assert.equal(c.state.rejectedEdit,true);await c.verify(c.lease,c.state);assert.equal(c.state.value,null);}
 c.deactivate();c.activate();assert.equal(c.state.rejectedEdit,true);c.edit(document,c.lease,c.state);await c.verify(c.lease,c.state);assert.ok(c.state.value);
 assert.deepEqual(Object.keys(c),[]);assert.ok(Object.isFrozen(c));assert.ok(Object.isFrozen(c.state));assert.ok(Object.isFrozen(c.state.reports[0]));assert.ok(Object.isFrozen(c.state.value!.sourceReference));
 assert.equal(c.state.reports.length,4);const first=c.state;c.page(1,c.lease,first);assert.equal(c.state.reports.length,1);c.page(0,c.lease,first);assert.equal(c.state.page,1);
 for(const malformed of ['{}','null','[]','{"x":1}','\ufeff'+document]){c.edit(malformed,c.lease,c.state);await c.verify(c.lease,c.state);assert.equal(c.state.value,null);assert.equal(c.state.pending,false);}
});
test('independent preparation: second selection owns document despite overlapping hashes and stale handoff',async()=>{
 const g=[deferred(),deferred()];let calls=0;const digests:string[]=[];
 const c=new Capture(true,async b=>{if(calls++===0)return hash(b);const i=calls-2;digests[i]=await hash(b);return g[i]!.promise;});
 c.edit(bytes.toString('hex'),c.lease);c.declare('synthetic-fixture',c.lease);await c.inspect(c.lease);
 await c.prepareDocument(c.lease,c.state);assert.equal(c.state.preparedDocument,null);
 c.select(0,c.lease,c.state);const old=c.prepareDocument(c.lease,c.state);
 c.select(1,c.lease,c.state);const fresh=c.prepareDocument(c.lease,c.state);await new Promise(r=>setImmediate(r));
 g[1]!.resolve(digests[1]!);await fresh;const accepted=c.state;assert.equal(JSON.parse(accepted.preparedDocument!).sourceReference.recordIndex,1);
 g[0]!.resolve(digests[0]!);await old;assert.equal(c.state,accepted);
 const exact=c.takeDocument(c.lease,accepted);assert.equal(exact,accepted.preparedDocument);assert.equal(c.takeDocument(c.lease,accepted),null);
});
test('independent preparation fences rejected edits, clear, extended selection and navigation',async()=>{
 for(const action of ['reject','clear','extended','leave']){
  const g=deferred();let calls=0;const c=new Capture(true,b=>calls++===0?hash(b):g.promise);
  c.edit(bytes.toString('hex'),c.lease);c.declare('synthetic-fixture',c.lease);await c.inspect(c.lease);c.select(0,c.lease,c.state);
  const lease=c.lease,old=c.prepareDocument(lease,c.state);
  if(action==='reject')c.edit('!',lease);if(action==='clear')c.clear(lease);if(action==='extended')c.selectExtended(2,lease,c.state);if(action==='leave'){c.deactivate();c.activate();}
  const after=c.state;g.reject(Error('late'));await old;assert.equal(c.state,after);assert.equal(c.state.preparedDocument,null);assert.equal(c.state.preparingDocument,false);
 }
});
test('independent source receipt while inactive is exact, one-shot and never verifies',async()=>{
 let hashes=0;const c=new Document(false,async b=>{hashes++;return hash(b);});c.receive({id:7,document:' \n'+document+'\t'});
 assert.equal(c.state.draft,' \n'+document+'\t');assert.equal(c.state.value,null);await c.verify(c.lease,c.state);assert.equal(hashes,0);
 c.activate();await c.verify(c.lease,c.state);assert.equal(hashes,1);assert.ok(c.state.value);c.clear(c.lease,c.state);const cleared=c.state;
 c.receive({id:7,document});c.receive({id:6,document});assert.equal(c.state,cleared);
 c.receive({id:8,document:42 as any});assert.equal(c.state.draft,'');assert.equal(c.state.rejectedEdit,true);assert.equal(c.state.value,null);
});
