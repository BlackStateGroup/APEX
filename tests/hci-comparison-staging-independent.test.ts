import test from 'node:test';
import assert from 'node:assert/strict';
import { HciDocumentController as Controller } from '../src/hci-document-workbench.ts';
import { HciComparisonController } from '../src/hci-comparison-workbench.ts';
import { nextAnalysisSource } from '../src/analysis-navigation.ts';
import { doc, report, hash } from './hci-comparison-review-fixture.ts';
const document=' \n'+await doc(Array.from({length:5},(_,i)=>report([i])))+'\t';
function gate(){let resolve!:()=>void,reject!:(e:unknown)=>void;const promise=new Promise<void>((a,b)=>{resolve=a;reject=b});return{resolve,reject,promise};}
async function verified(){const c=new Controller(true,hash);c.receive({id:1,document});await c.verify(c.lease,c.state);return c;}
test('independent staging: exact explicit report/side and observed-state consumption close the React navigation gap',async()=>{
 const c=await verified(),before=c.state;assert.equal(c.stage(4,'left',c.lease,before),null);for(const index of [-0,-1,NaN,Infinity,1.1,25])assert.equal(c.stage(index,'left',c.lease,before),null);assert.equal(c.stage(0,'neither' as any,c.lease,before),null);assert.equal(c.state,before);
 const source=c.stage(2,'right',c.lease,before);assert.deepEqual(source,{document,index:2,side:'right'});assert.ok(Object.isFrozen(source));assert.notEqual(c.state,before);assert.equal(c.stage(2,'right',c.lease,before),null);assert.equal(c.stage(0,'left',c.lease,before),null);
 const comparison=new HciComparisonController(false,hash);const one=nextAnalysisSource(null,source!);comparison.receive(one);assert.equal(comparison.state.left.draft,'');assert.equal(comparison.state.right.draft,document);assert.equal(comparison.state.right.value,null);assert.equal(comparison.state.right.selected,null);comparison.activate();await comparison.verify('right',comparison.lease,comparison.state);assert.equal(comparison.state.right.selected,2);const accepted=comparison.state;comparison.receive({...one});assert.equal(comparison.state,accepted);
});
test('independent staging: save retains snapshot, lock and truthful outcome through staging, navigation and replacement',async()=>{
 for(const failure of [false,true]){const c=await verified();const g=gate();let calls=0;let saved:any;const pending=c.save({save:async input=>{calls++;saved=input;await g.promise;return {} as any}},c.lease,c.state);
 const observed=c.state,source=c.stage(1,'left',c.lease,observed);assert.equal(source!.document,document);assert.equal(c.stage(1,'left',c.lease,observed),null);assert.equal(c.state.saving,true);c.deactivate();c.activate();c.receive({id:2,document:document+'\n'});await c.verify(c.lease,c.state);const current=c.state.value;await c.save({save:async()=>{calls++;return {} as any}},c.lease,c.state);assert.equal(calls,1);if(failure)g.reject(Error('private failure'));else g.resolve();await pending;assert.equal(c.state.value,current);assert.equal(c.state.draft,document+'\n');assert.equal(c.state.saving,false);assert.equal(saved.payload.document,document);assert.equal(c.state.savedDocument,failure?null:document);assert.match(c.state.saveMessage,failure?/failed/:/saved/);assert.doesNotMatch(c.state.saveMessage,/cancelled/);}
});
