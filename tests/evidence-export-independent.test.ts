import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EvidenceStore } from '../packages/core/evidence.ts';
import { readEvidenceBundle } from '../packages/core/evidence-bundle.ts';
import { EvidenceExportWorkbench } from '../src/evidence-export-workbench.ts';
import { createEvidenceShareGate, EvidenceShareBusyError, EvidenceShareUncertainError } from '../src/native-evidence-share.ts';

const time = '2026-11-09T10:00:00.000Z';
const hash = async (text: string) => createHash('sha256').update(text).digest('hex');
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; }
async function record(id: string) {
 const base = {schemaVersion:1,id,kind:'analysis.can',source:'offline-fixture',observedAt:time,payload:{note:'private 🔬'}};
 return '\n' + JSON.stringify({...base,sha256:await hash(JSON.stringify(base))},null,2) + '\t';
}
async function selected() {
 const document = await record('one'); const w = new EvidenceExportWorkbench();
 await w.refresh(async()=>[document],w.lease,w.state);w.toggle('one',w.lease,w.state);
 return {w,document};
}

test('independent: listDocuments is exact and isolated, with no hash, insert, or ID generation',async()=>{
 const document = await record('one');const originals=[document];let lists=0;
 const forbidden=()=>{throw new Error('Unexpected mutating or cryptographic work');};
 const store=new EvidenceStore({insert:forbidden,list:async limit=>{assert.equal(limit,2);lists++;return originals;}},{sha256:forbidden,randomId:forbidden});
 const result=await store.listDocuments(2);assert.deepEqual(result,[document]);assert.notEqual(result,originals);
 result[0]='changed';assert.equal(originals[0],document);assert.equal(lists,1);
 await assert.rejects(store.listDocuments(0));assert.equal(lists,1);
});

test('independent: second-pass bundle digest mismatch never exposes the first-pass bundle',async()=>{
 const {w}=await selected();let calls=0;
 await w.prepare(async text=>{calls++;assert.equal(w.state.bundle,null);return calls===3?'f'.repeat(64):hash(text);},undefined,time,w.lease,w.state);
 assert.equal(calls,3);assert.equal(w.state.bundle,null);assert.equal(w.state.pending,null);
 assert.equal(JSON.stringify(w.state).includes('private'),false);
});

test('independent: a newer prepare owns output even when an older hash fails later',async()=>{
 const {w,document}=await selected();const blocked=deferred<string>();let oldHashes=0;
 const old=w.prepare(()=>{oldHashes++;return blocked.promise;},undefined,time,w.lease,w.state);
 await w.prepare(hash,undefined,time,w.lease,w.state);
 const successful=w.state;assert.ok(successful.bundle);
 blocked.reject(new Error('private failure'));await old;
 assert.equal(w.state,successful);assert.equal(oldHashes,1);
 assert.deepEqual((await readEvidenceBundle(successful.bundle!,hash)).recordDocuments,[document]);
});

test('independent: revoking owner and reopening does not release an outstanding native API call',async()=>{
 const {w}=await selected();await w.prepare(hash,undefined,time,w.lease,w.state);
 const result=deferred<'dismissed'>();let calls=0;
 const share=createEvidenceShareGate(()=>{calls++;return result.promise;});
 const lease=w.lease;const state=w.state;const current=()=>w.isActive(lease)&&w.state===state;
 const pending=share(state.bundle!,current);w.deactivate();w.activate();
 assert.equal(await share(state.bundle!,current),null);
 await assert.rejects(share('new explicit request',()=>true),EvidenceShareBusyError);
 assert.equal(calls,1);result.resolve('dismissed');assert.equal(await pending,'dismissed');
 assert.equal(w.state.bundle,null);assert.deepEqual(w.state.selectedIds,[]);
});

test('independent: rejection after owner loss still latches uncertainty for a fresh caller',async()=>{
 const result=deferred<'returned'>();let active=true,calls=0;
 const share=createEvidenceShareGate(()=>{calls++;return result.promise;});
 const pending=share('prepared exact text',()=>active);active=false;
 result.reject(new Error('sensitive native diagnostic'));
 await assert.rejects(pending,EvidenceShareUncertainError);
 await assert.rejects(share('new owner text',()=>true),EvidenceShareUncertainError);
 assert.equal(calls,1);
});

test('independent: identical successful bundle text gets a fresh ID; display-only paging does not',async()=>{
 const {w}=await selected();
 await w.prepare(hash,undefined,time,w.lease,w.state);
 const first=w.state;assert.equal(first.preparationId,1);
 w.page(0);assert.equal(w.state.bundle,first.bundle);assert.equal(w.state.preparationId,1);
 await w.prepare(hash,undefined,time,w.lease,w.state);
 assert.equal(w.state.bundle,first.bundle);assert.equal(w.state.preparationId,2);
 let calls=0;
 await w.prepare(async text=>{calls++;return hash(text);},undefined,time,w.lease,first);
 assert.equal(calls,0);assert.equal(w.state.preparationId,2);
});

test('independent: clearing and foreground lease renewal cannot reuse a successful preparation ID',async()=>{
 const {w,document}=await selected();
 const prepare=()=>w.prepare(hash,undefined,time,w.lease,w.state);
 await prepare();assert.equal(w.state.preparationId,1);
 for(const reset of [()=>w.clear(),()=>{w.deactivate();w.activate();}]){
  const oldId: number=w.state.preparationId;reset();assert.equal(w.state.bundle,null);
  await w.refresh(async()=>[document],w.lease,w.state);w.toggle('one',w.lease,w.state);
  await prepare();assert.ok(w.state.preparationId>oldId);
 }
 assert.equal(w.state.preparationId,3);
});

test('independent: failed and reentrantly revoked hashing cannot mint a preparation token',async()=>{
 const {w,document}=await selected();
 await w.prepare(async()=>{throw Error('hash failure');},undefined,time,w.lease,w.state);
 assert.equal(w.state.preparationId,0);assert.equal(w.state.bundle,null);
 let calls=0;
 await w.prepare(async text=>{calls++;w.clear();return hash(text);},undefined,time,w.lease,w.state);
 assert.equal(calls,1);assert.equal(w.state.preparationId,0);assert.equal(w.state.bundle,null);
 await w.refresh(async()=>[document],w.lease,w.state);w.toggle('one',w.lease,w.state);
 await w.prepare(hash,undefined,time,w.lease,w.state);
 assert.equal(w.state.preparationId,1);assert.ok(w.state.bundle);
});
