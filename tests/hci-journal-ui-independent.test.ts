import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { HciDocumentController } from '../src/hci-document-workbench.ts';
import { HciEvidenceReopenController } from '../src/hci-evidence-reopen.ts';
import { EvidenceBundleWorkbench } from '../src/evidence-bundle-workbench.ts';
import { EvidenceStore } from '../packages/core/evidence.ts';
import { prepareHciEventEvidenceInput } from '../packages/core/hci-event-evidence.ts';
import { prepareHci, createHciLegacyEventDocument } from '../packages/core/hci-offline.ts';
import { createEvidenceBundle } from '../packages/core/evidence-bundle.ts';
import { hash, context, header, record, event, report } from './hci-selected-review-fixture.ts';
const textHash=async(s:string)=>createHash('sha256').update(s).digest('hex');
const bytes=Buffer.concat([header,record(event(Array.from({length:6},()=>report('020106'))))]);
const document=' \n'+await createHciLegacyEventDocument(await prepareHci(bytes,context,hash),0,hash)+'\t';
const tick=()=>new Promise<void>(r=>setImmediate(r));
function gate<T>() {let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function journal() { const documents:string[]=[];let id=0;const store=new EvidenceStore({insert:async(_,s)=>{documents.push(s);},list:async()=>documents},{sha256:textHash,sha256Bytes:hash,randomId:()=>`independent-${++id}`});return{store,documents}; }
async function verified() {const c=new HciDocumentController(true,hash);c.receive({id:1,document});await c.verify(c.lease,c.state);assert.ok(c.state.value);return c;}
test('independent save keeps detached snapshot and one pending lock across every invalidation',async()=>{
 for(const action of ['edit','reject','source','clear','leave']) for(const fail of [false,true]) {
  const c=await verified(),g=gate<void>(),j=journal();let calls=0;
  const store={save:async(input:any)=>{calls++;await g.promise;return j.store.save(input);}};
  const lease=c.lease,observed=c.state,pending=c.save(store,lease,observed);
  await c.save(store,lease,observed);assert.equal(calls,1);
  if(action==='edit')c.edit(document+'\n',c.lease,c.state);
  if(action==='reject')c.edit('x'.repeat(4097),c.lease,c.state);
  if(action==='source')c.receive({id:2,document:document+' '});
  if(action==='clear'){c.clear(c.lease,c.state);c.edit(document+'\n',c.lease,c.state);}
  if(action==='leave'){c.deactivate();c.activate();}
  assert.equal(c.state.saving,true,action);assert.match(c.state.saveMessage,/snapshot|save/i);
  await c.verify(c.lease,c.state);const value=c.state.value,draft=c.state.draft,reports=c.state.reports;
  await c.save(store,c.lease,c.state);assert.equal(calls,1,action);
  if(fail)g.reject(Error('storage failed'));else g.resolve();await pending;
  assert.equal(c.state.saving,false);assert.equal(c.state.draft,draft);assert.equal(c.state.value,value);assert.equal(c.state.reports,reports);
  assert.equal(j.documents.length,fail?0:1);if(!fail)assert.equal(JSON.parse(j.documents[0]!).payload.document,document);
  assert.match(c.state.saveMessage,fail?/failed/:/saved/);assert.doesNotMatch(c.state.saveMessage,/cancelled|nothing saved/i);
 }
});
test('independent saves require current full verification and preserve successful insert on refresh failure',async()=>{
 const c=new HciDocumentController(true,hash),j=journal();c.receive({id:1,document});await c.save(j.store,c.lease,c.state);assert.equal(j.documents.length,0);
 await c.verify(c.lease,c.state);const stale=c.state;c.page(1,c.lease,c.state);await c.save(j.store,c.lease,stale);assert.equal(j.documents.length,0);
 await c.save(j.store,c.lease,c.state,async()=>{throw Error('refresh failed');});assert.equal(j.documents.length,1);assert.match(c.state.saveMessage,/saved.*refresh failed/i);
 await c.save(j.store,c.lease,c.state);assert.equal(j.documents.length,1);
});
test('independent reopen snapshots before outer and inner awaits, and fences replacement/exit',async()=>{
 for(const stage of ['outer','inner']) for(const action of ['mutate','replace','leave']) {
  const j=journal(),row=await j.store.save(prepareHciEventEvidenceInput(document));const g=gate<void>();let seen:any;
  const c=new HciEvidenceReopenController(row,async b=>{if(stage==='inner')await g.promise;return hash(b);});
  const verifier={verify:async(r:any)=>{seen=r;if(stage==='outer')await g.promise;return j.store.verify(r);}};
  const pending=c.reopen(verifier,c.lease,c.state);await tick();assert.ok(Object.isFrozen(seen));assert.ok(Object.isFrozen(seen.payload));
  if(action==='mutate'){(row.payload as any).document='{}';row.sha256='0'.repeat(64);}
  if(action==='replace')c.replace({...row,id:'replacement'});
  if(action==='leave'){c.deactivate();c.activate();}
  g.resolve();await pending;
  if(action==='mutate'){assert.equal(c.state.draft,document);assert.ok(c.state.value);assert.equal(c.state.reports.length,4);c.page(1,c.lease,c.state);assert.equal(c.state.reports.length,2);}
  else{assert.equal(c.state.value,null);assert.equal(c.state.draft,'');}
  assert.equal(c.pending,false);
 }
});
test('independent forged boolean verifier cannot bypass stale binary digest or malformed legacy framing',async()=>{
 for(const validHash of [false,true]) {
  const j=journal(),row=await j.store.save(prepareHciEventEvidenceInput(document));const value=JSON.parse(document),b=Buffer.from(value.derivative.recordHex,'hex');b[27]=13;value.derivative.recordHex=b.toString('hex');
  if(validHash)value.derivative.sha256=await hash(Buffer.concat([Buffer.from(value.derivative.fileHeaderHex,'hex'),b]));
  (row.payload as any).document=JSON.stringify(value);const c=new HciEvidenceReopenController(row,hash);await c.reopen({verify:async()=>true},c.lease,c.state);assert.equal(c.state.value,null);assert.match(c.message,/refused/);
 }
});
test('independent bundle requires byte capability, preserves exact documents and fences delayed completion',async()=>{
 const j=journal();for(let i=0;i<5;i++)await j.store.save(prepareHciEventEvidenceInput(document));const bundle=await createEvidenceBundle(j.documents,'2026-11-08T01:02:03.000Z',textHash,hash);
 const c=new EvidenceBundleWorkbench();c.edit(bundle);await c.inspect(textHash);assert.equal(c.state.report,null);assert.match(c.state.message,/byte SHA/);
 await c.inspect(textHash,hash);assert.deepEqual(c.state.report!.recordDocuments,j.documents);assert.ok(Object.isFrozen(c.state.report!.records[0]!.payload));c.page(1);assert.equal(c.state.page,1);
 const g=gate<string>();const pending=c.inspect(textHash,()=>g.promise);await tick();c.edit('{}');const after=c.state;g.resolve(await hash(bytes));await pending;assert.equal(c.state,after);
});
test('independent reopen rejects missing byte capability and wrong source even with permissive outer verifier',async()=>{
 const j=journal(),row=await j.store.save(prepareHciEventEvidenceInput(document));
 for(const source of ['native-ios','native-android','offline-import']){
  const c=new HciEvidenceReopenController({...row,source:source as any},hash);await c.reopen({verify:async()=>true},c.lease,c.state);assert.equal(c.state.value,null);assert.match(c.message,/refused/);
 }
 const missing=new HciEvidenceReopenController(row,undefined as any);await missing.reopen({verify:async()=>true},missing.lease,missing.state);assert.equal(missing.state.value,null);assert.match(missing.message,/refused/);
});
test('independent bundle UI refuses stale and malformed derivatives even under valid record and bundle hashes',async()=>{
 const {parseEvidence}=await import('../packages/core/evidence.ts');
 for(const matching of [false,true]){
  const j=journal(),row=await j.store.save(prepareHciEventEvidenceInput(document));const v=JSON.parse(document),b=Buffer.from(v.derivative.recordHex,'hex');b[27]=13;v.derivative.recordHex=b.toString('hex');
  if(matching)v.derivative.sha256=await hash(Buffer.concat([Buffer.from(v.derivative.fileHeaderHex,'hex'),b]));
  (row.payload as any).document=JSON.stringify(v);const {sha256:_,...base}=parseEvidence(JSON.stringify(row));const signed=JSON.stringify({...base,sha256:await textHash(JSON.stringify(base))});
  const bundleBase={schemaVersion:1,format:'apex.selected-evidence',exportedAt:'2026-11-08T01:02:03.000Z',recordCount:1,records:[signed]};const exact=JSON.stringify({...bundleBase,sha256:await textHash(JSON.stringify(bundleBase))});
  const c=new EvidenceBundleWorkbench();c.edit(exact);await c.inspect(textHash,hash);assert.equal(c.state.document,exact);assert.equal(c.state.report,null);assert.match(c.state.message,/failed/);
 }
});
