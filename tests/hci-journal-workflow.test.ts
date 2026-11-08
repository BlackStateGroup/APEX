import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { HciWorkbenchController, HCI_EXAMPLE } from '../src/hci-workbench.ts';
import { HciDocumentController } from '../src/hci-document-workbench.ts';
import { HciEvidenceReopenController } from '../src/hci-evidence-reopen.ts';
import { EvidenceStore } from '../packages/core/evidence.ts';
import { EvidenceBundleWorkbench } from '../src/evidence-bundle-workbench.ts';
import { createEvidenceBundle } from '../packages/core/evidence-bundle.ts';
const hash = async (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');
function deferred<T>() { let resolve!: (v:T)=>void, reject!: (e:unknown)=>void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; }
async function fixture(provenance: 'synthetic-fixture'|'recorded-import' = 'synthetic-fixture') { const c=new HciWorkbenchController(true,hash);c.edit(HCI_EXAMPLE,c.lease);c.declare(provenance,c.lease);await c.inspect(c.lease);c.select(0,c.lease,c.state);await c.prepareDocument(c.lease,c.state);return '\n '+c.state.preparedDocument!+'\t'; }
function journal() {const documents:string[]=[];const store=new EvidenceStore({insert:async(_,s)=>{documents.push(s);},list:async()=>documents},{sha256:hash,sha256Bytes:hash,randomId:()=>`saved-${documents.length}`});return {store,documents};}
async function ready(exact?: string) { exact ??= await fixture(); const c=new HciDocumentController(true,hash);c.edit(exact,c.lease,c.state);await c.verify(c.lease,c.state);return c; }
test('explicit save only, exact source mapping, no duplicate stale dispatch, refresh failure retains successful save',async()=>{
 for(const provenance of ['synthetic-fixture','recorded-import'] as const){const exact=await fixture(provenance),c=new HciDocumentController(true,hash),j=journal();
 c.edit(exact,c.lease,c.state);await c.save(j.store,c.lease,c.state);assert.equal(j.documents.length,0);
 await c.verify(c.lease,c.state);assert.equal(j.documents.length,0);const state=c.state;
 const p=c.save(j.store,c.lease,state,async()=>{throw Error('refresh');});await c.save(j.store,c.lease,state);await c.save(j.store,c.lease,c.state);await p;
 assert.equal(j.documents.length,1);const record=(await j.store.list())[0]!;assert.equal((record.payload as any).document,exact);assert.equal(record.source,provenance==='synthetic-fixture'?'offline-fixture':'offline-import');assert.match(c.state.saveMessage,/saved locally, but evidence refresh failed/);assert.equal(c.canSave(),false);
 }
});
test('dispatched save survives newer edits, rejected edits, clear and leaving without reviving old verification',async()=>{
 for(const fail of [false,true])for(const action of ['edit','reject','clear','leave']){const c=await ready(),gate=deferred<any>();const exact=c.state.draft;let calls=0;
 const p=c.save({save:async input=>{calls++;assert.equal((input.payload as any).document,exact);return gate.promise;}},c.lease,c.state);
 if(action==='edit')c.edit('{}',c.lease,c.state);if(action==='reject')c.edit('x'.repeat(4097),c.lease,c.state);if(action==='clear')c.clear(c.lease,c.state);if(action==='leave'){c.deactivate();c.activate();}
 assert.equal(c.state.saving,true);const draft=c.state.draft, message=c.state.message;await c.save({save:async()=>{throw Error('duplicate');}},c.lease,c.state);
 fail?gate.reject(Error('storage')):gate.resolve({});await p;assert.equal(calls,1);assert.equal(c.state.draft,draft);assert.equal(c.state.message,message);assert.equal(c.state.value,null);assert.equal(c.state.saving,false);assert.equal(c.state.savedDocument,fail?null:exact);assert.match(c.state.saveMessage,fail?/save failed/:/saved locally/);
 }
});
test('journal reopening snapshots before await and independently rejects bad bytes, size and malformed documents despite true verifier',async()=>{
 const c=await ready(),j=journal();await c.save(j.store,c.lease,c.state);const original=(await j.store.list())[0]!;
 const gate=deferred<boolean>(),r=new HciEvidenceReopenController(original,hash),p=r.reopen({verify:async()=>gate.promise},r.lease,r.state);
 (original.payload as any).document='{}';gate.resolve(true);await p;assert.equal(r.state.draft,c.state.draft);assert.ok(r.state.value);assert.equal(r.state.reports[0]!.reportOffset,45);
 for(const mutation of ['hash','size','malformed']){const record=JSON.parse(j.documents[0]!);const doc=JSON.parse(record.payload.document);if(mutation==='hash')doc.derivative.sha256='0'.repeat(64);if(mutation==='size')doc.derivative.byteCount++;record.payload.document=mutation==='malformed'?'{}':JSON.stringify(doc);
 const bad=new HciEvidenceReopenController(record,hash);await bad.reopen({verify:async()=>true},bad.lease,bad.state);assert.equal(bad.state.value,null);assert.equal(bad.state.draft,'');assert.match(bad.message,/refused/);}
});
test('reopen record replacement, leases, overlap and late failures cannot publish stale interpretations',async()=>{
 for(const fail of [false,true])for(const action of ['replace','leave']){const c=await ready(),j=journal();await c.save(j.store,c.lease,c.state);const record=(await j.store.list())[0]!,gate=deferred<boolean>();const r=new HciEvidenceReopenController(record,hash);const lease=r.lease,state=r.state;let calls=0;const store={verify:async()=>{calls++;return gate.promise;}};const p=r.reopen(store,lease,state);await r.reopen(store,lease,state);assert.equal(calls,1);
 if(action==='replace')r.replace({...record});else{r.deactivate();r.activate();}await r.reopen(store,lease,state);assert.equal(calls,1);await r.reopen(j.store,r.lease,r.state);const latest=r.state;fail?gate.reject(Error('late')):gate.resolve(true);await p;assert.equal(r.state,latest);assert.ok(r.state.value);assert.match(r.message,/Canonical envelope verified/);}
});
test('real web adapter isolated mock, storage failure, bundle byte capability and native/App wiring',async()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let saved='[]',fail=false;Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>saved,setItem:(_:string,v:string)=>{if(fail)throw Error('quota');saved=v;}}});
 try {const {evidenceStore}=await import('../src/platform/evidence.ts');const c=await ready();await c.save(evidenceStore,c.lease,c.state);assert.equal(JSON.parse(saved).length,1);const record=(await evidenceStore.list())[0]!;const r=new HciEvidenceReopenController(record,hash);await r.reopen(evidenceStore,r.lease,r.state);assert.ok(r.state.value);
 const bundle=await createEvidenceBundle(JSON.parse(saved),'2026-11-08T01:02:03.000Z',hash,hash),b=new EvidenceBundleWorkbench();b.edit(bundle);await b.inspect(hash);assert.equal(b.state.report,null);await b.inspect(hash,hash);assert.equal(b.state.report!.records[0]!.kind,'analysis.hci-event');
 fail=true;const d=await ready();await d.save(evidenceStore,d.lease,d.state);assert.match(d.state.saveMessage,/save failed/);assert.equal(JSON.parse(saved).length,1);
 }finally{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else delete (globalThis as any).localStorage;}
 const native=readFileSync(new URL('../src/platform/evidence.native.ts',import.meta.url),'utf8');assert.match(native,/sha256Bytes: hciDigest/);const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');assert.match(app,/HciDocumentWorkbench[^\n]+store=\{evidenceStore\}/);assert.match(app,/HciEvidenceReopen record=\{record\} store=\{evidenceStore\}/);assert.match(app,/records.map\(record => record.kind === 'analysis.hci-event' \?/);
});
test('old inner hash success and rejection cannot clear newer reopened snapshot after replacement',async()=>{
 for(const fail of [false,true]){const c=await ready(),j=journal();await c.save(j.store,c.lease,c.state);const record=(await j.store.list())[0]!,gate=deferred<string>(),entered=deferred<void>();let calls=0;
 const r=new HciEvidenceReopenController(record,async b=>{if(++calls===1){entered.resolve();return gate.promise;}return hash(b);});
 const p=r.reopen({verify:async()=>true},r.lease,r.state);await entered.promise;r.replace({...record});await r.reopen(j.store,r.lease,r.state);const latest=r.state;assert.ok(latest.value);
 fail?gate.reject(Error('late inner')):gate.resolve(latest.value!.derivative.sha256);await p;assert.equal(r.state,latest);assert.equal(r.pending,false);assert.match(r.message,/Canonical envelope verified/);
 }
});
