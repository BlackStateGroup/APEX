import test from 'node:test';
import assert from 'node:assert/strict';
import { HciComparisonController as Controller } from '../src/hci-comparison-workbench.ts';
import { doc, report, hash } from './hci-comparison-review-fixture.ts';
const left = await doc([report([2,1,0]),report([0])]);
const right = await doc([report([2,1,0,0],4,9)]);
function gate(){let resolve!:(s:string)=>void,reject!:(e:unknown)=>void;const promise=new Promise<string>((a,b)=>{resolve=a;reject=b});return{resolve,reject,promise};}
async function ready(c:Controller){c.edit('left',left,c.lease,c.state);c.edit('right',right,c.lease,c.state);await c.verify('left',c.lease,c.state);await c.verify('right',c.lease,c.state);c.select('left',0,c.lease,c.state);c.select('right',0,c.lease,c.state);}
function frozen(v:unknown){if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v));for(const x of Object.values(v))frozen(x);}}
test('independent comparison UI: manual verification never defaults report zero and re-verifies exact selected documents',async()=>{
 let calls=0;const c=new Controller(true,async b=>{calls++;return hash(b)});c.edit('left',' \n'+left+'\t',c.lease,c.state);c.edit('right',right,c.lease,c.state);
 await c.verify('left',c.lease,c.state);await c.verify('right',c.lease,c.state);assert.equal(c.state.left.selected,null);assert.equal(c.state.right.selected,null);assert.equal(c.canCompare(),false);assert.equal(calls,2);
 c.select('left',0,c.lease,c.state);c.select('right',0,c.lease,c.state);await c.compare(c.lease,c.state);assert.equal(calls,4);assert.equal(c.state.left.draft,' \n'+left+'\t');assert.ok(c.state.result);
 assert.deepEqual(c.state.result.rows.map(r=>[r.leftHex,r.rightHex,r.relation]),[['02','02','equal'],['01','01','equal'],['00','00','equal'],[null,'00','right-only']]);assert.equal(c.state.result.metadataEquality.eventType,false);assert.equal(c.state.result.metadataEquality.addressWireHex,false);frozen(c.state);assert.deepEqual(Object.keys(c),[]);assert.ok(Object.isFrozen(c));
});
test('independent comparison UI: parallel side verification and one-sided replacement isolate epochs',async()=>{
 for(const failure of [false,true]){const gates=[gate(),gate()];let n=0;const digests:string[]=[];const c=new Controller(true,async b=>{const i=n++;digests[i]=await hash(b);return gates[i]!.promise});c.edit('left',left,c.lease,c.state);c.edit('right',right,c.lease,c.state);
 const a=c.verify('left',c.lease,c.state);const b=c.verify('right',c.lease,c.state);await new Promise(r=>setImmediate(r));c.edit('left','{}',c.lease,c.state);gates[1]!.resolve(digests[1]!);await b;const accepted=c.state;assert.ok(accepted.right.value);assert.equal(accepted.left.value,null);if(failure)gates[0]!.reject(Error('late secret'));else gates[0]!.resolve(digests[0]!);await a;assert.equal(c.state,accepted);}
});
test('independent comparison UI: deferred compare cannot publish after edits, rejects, clear, source, selection, verify or exit',async()=>{
 for(const action of ['edit','reject','clear','source','select','verify','exit'])for(const failure of [false,true]){const g=gate();let n=0;let digest='';const c=new Controller(true,async b=>{if(++n===3){digest=await hash(b);return g.promise}return hash(b)});await ready(c);const lease=c.lease;const old=c.compare(lease,c.state);await new Promise(r=>setImmediate(r));
 if(action==='edit')c.edit('left',left+'\n',lease,c.state);if(action==='reject')c.edit('right','😀'.repeat(2049),lease,c.state);if(action==='clear')c.clear('left',lease,c.state);if(action==='source')c.receive({id:1,side:'right',document:right,index:0});if(action==='select')c.select('left',1,lease,c.state);if(action==='verify')await c.verify('right',lease,c.state);if(action==='exit'){c.deactivate();c.activate()}
 const after=c.state;if(failure)g.reject(Error('private late failure'));else g.resolve(digest);await old;assert.equal(c.state,after,action);assert.equal(c.state.result,null);assert.equal(c.state.pending,false);}
});
test('independent comparison UI: rejected whole input retains exact draft, fences one slot and cannot verify',async()=>{
 for(const invalid of ['x'.repeat(4097),'😀'.repeat(2049),null,42,{}]){const c=new Controller(true,hash);await ready(c);const other=c.state.right;c.edit('left',invalid as string,c.lease,c.state);assert.equal(c.state.left.draft,left);assert.equal(c.state.left.rejected,true);assert.equal(c.state.left.value,null);assert.equal(c.state.right,other);await c.verify('left',c.lease,c.state);assert.equal(c.state.left.value,null);c.deactivate();c.activate();assert.equal(c.state.left.rejected,true);c.clear('left',c.lease,c.state);assert.equal(c.state.left.rejected,false);}
});
test('independent comparison UI: one-shot routed sources preserve other slot and invalid requested indices never become usable',async()=>{
 for(const index of [-0,-1,NaN,Infinity,1.5,24,25,'0',null,undefined]){const c=new Controller(true,hash);await ready(c);const other=c.state.right;c.receive({id:1,side:'left',document:left,index:index as number});assert.equal(c.state.right,other);assert.equal(c.state.left.value,null);await c.verify('left',c.lease,c.state);assert.equal(c.state.left.selected,null,`invalid ${String(index)}`);assert.equal(c.canCompare(),false);const observed=c.state;for(const id of [1,0,-1,NaN,Infinity,1.5])c.receive({id,side:'right',document:'wrong',index:0});assert.equal(c.state,observed);}
 const c=new Controller(false,hash);c.receive({id:3,side:'left',document:' \n'+left,index:1});assert.equal(c.state.left.selected,null);await c.verify('left',c.lease,c.state);assert.equal(c.state.left.value,null);c.activate();await c.verify('left',c.lease,c.state);assert.equal(c.state.left.selected,1);
});
test('independent comparison UI: stale callbacks, invalid manual indices and off-page selections do not change state',async()=>{
 const c=new Controller(true,hash);await ready(c);const original=c.state;c.edit('right',right+'\n',c.lease,original);const after=c.state;c.clear('left',c.lease,original);c.select('left',1,c.lease,original);await c.compare(c.lease,original);assert.equal(c.state,after);
 for(const index of [-0,-1,NaN,Infinity,1.5,24,25,'0',null]){const before=c.state;c.select('left',index as number,c.lease,before);assert.equal(c.state,before,`invalid ${String(index)}`)}
 c.deactivate();const lease=c.lease;c.activate();const current=c.state;c.edit('left','wrong',lease,current);assert.equal(c.state,current);
});

test('independent comparison UI: report pages are bounded and exact examples do no automatic hashing',async()=>{
 const many=await doc(Array.from({length:9},(_,i)=>report([i])));let hashes=0;const c=new Controller(true,async b=>{hashes++;return hash(b)});c.example(many,right,c.lease,c.state);assert.equal(hashes,0);assert.equal(c.state.left.selected,null);assert.equal(c.state.right.selected,null);await c.verify('left',c.lease,c.state);assert.equal(c.state.left.reports.length,9);const first=c.state;c.select('left',4,c.lease,first);assert.equal(c.state,first);c.reportPage('left',1,c.lease,c.state);c.select('left',4,c.lease,c.state);assert.equal(c.state.left.selected,4);const chosen=c.state;for(const page of [-1,NaN,Infinity,1.5,3])c.reportPage('left',page,c.lease,c.state);assert.equal(c.state,chosen);
});
test('independent final right-hash completion and error cannot overwrite replacement comparison',async()=>{
 for(const fail of [false,true]){const g=gate();let n=0,digest='';const c=new Controller(true,async b=>{if(++n===4){digest=await hash(b);return g.promise}return hash(b)});await ready(c);const old=c.compare(c.lease,c.state);await new Promise(r=>setImmediate(r));c.select('left',1,c.lease,c.state);await c.compare(c.lease,c.state);const fresh=c.state;assert.equal(fresh.result!.left.reportIndex,1);if(fail)g.reject(Error('late private'));else g.resolve(digest);await old;assert.equal(c.state,fresh);}
});
test('independent same-slot replacement verification wins over old hash completion or error',async()=>{
 for(const fail of [false,true]){const g=gate();let n=0,digest='';const c=new Controller(true,async b=>{if(++n===1){digest=await hash(b);return g.promise}return hash(b)});c.edit('left',left,c.lease,c.state);const old=c.verify('left',c.lease,c.state);await new Promise(r=>setImmediate(r));c.receive({id:1,side:'left',document:right,index:0});await c.verify('left',c.lease,c.state);const newer=c.state;assert.equal(newer.left.draft,right);assert.equal(newer.left.selected,0);if(fail)g.reject(Error('private old'));else g.resolve(digest);await old;assert.equal(c.state,newer);}
});
test('independent maximum comparison is 31 exact positional rows in bounded eight-row result pages',async()=>{
 const c=new Controller(true,hash);const l=await doc([report(Array(31).fill(0))]),r=await doc([report([])]);c.example(l,r,c.lease,c.state);await c.verify('left',c.lease,c.state);await c.verify('right',c.lease,c.state);c.select('left',0,c.lease,c.state);c.select('right',0,c.lease,c.state);await c.compare(c.lease,c.state);assert.equal(c.state.result!.rows.length,31);assert.equal(c.state.result!.rows[30]!.leftDerivativeOffset,84);assert.equal(c.state.result!.rows[30]!.rightHex,null);for(const page of [1,2,3]){c.resultPage(page,c.lease,c.state);assert.equal(c.state.page,page)}const last=c.state;for(const page of [-1,4,NaN,Infinity,1.5])c.resultPage(page,c.lease,c.state);assert.equal(c.state,last);
});
