/** Synchronous one-shot observer transitions, not an observed mounted app defect. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IqController } from '../src/iq-workbench.ts';
import type { IqFile } from '../src/iq-workbench.ts';
const meta = Buffer.from('{"global":{"core:datatype":"ci16_le","core:version":"1.2.6","core:sample_rate":1024},"captures":[{"core:sample_start":0,"core:frequency":0}],"annotations":[]}');
const hash = (bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const make=()=>new IqController(true,{digest:async(algorithm,bytes)=>createHash(algorithm==='SHA-256'?'sha256':'sha512').update(bytes).digest('hex')});
const file=(bytes:Uint8Array,name:string):IqFile=>({name,size:bytes.length,arrayBuffer:async()=>new Uint8Array(bytes).buffer});
test('example and file staging commit atomically before one-shot observer clear, exit or replacement',async()=>{
 for(const operation of ['example','stage'] as const)for(const action of ['clear','exit','replace'] as const){
  const c=make();c.example(c.lease,c.state);const data=new Uint8Array([1,0,2,0]);let calls=0;
  c.subscribe(()=>{if(++calls!==1)return;
   if(operation==='example'){assert.equal(c.state.origin,'synthetic-fixture');assert.equal(c.state.metadata!.name,'synthetic-zero.sigmf-meta');assert.equal(c.state.data!.name,'synthetic-zero.sigmf-data');}
   else {assert.equal(c.state.origin,'external-file');assert.equal(c.state.metadata!.name,'outer');assert.equal(c.state.data,null);}
   if(action==='clear')c.clear(c.lease,c.state);
   if(action==='exit'){c.deactivate();c.activate();}
   if(action==='replace'){c.stageFile('metadata',file(meta,'replacement metadata'),c.lease,c.state);c.stageFile('data',file(data,'replacement data'),c.lease,c.state);}
  });
  assert.doesNotThrow(()=>operation==='example'?c.example(c.lease,c.state):c.stageFile('metadata',file(meta,'outer'),c.lease,c.state));
  assert.equal(calls,1,'one coherent outer notification; nested dispatch suppressed');
  if(action==='replace'){
   assert.equal(c.state.origin,'external-file');assert.equal(c.state.metadata!.name,'replacement metadata');assert.equal(c.state.data!.name,'replacement data');
   await c.inspect(c.lease,c.state);assert.equal(c.state.report!.origin,'external-file');assert.equal(c.state.report!.dataSha256,hash(data));assert.equal(c.state.report!.statistics.sampleCount,1);
  }else{assert.equal(c.state.metadata,null);assert.equal(c.state.data,null);await c.inspect(c.lease,c.state);assert.equal(c.state.report,null);}
 }
});
test('clear and exit publish released labels and sources together without overwriting observer replacement',async()=>{
 for(const operation of ['clear','exit'] as const){const c=make();c.example(c.lease,c.state);await c.inspect(c.lease,c.state);let calls=0;
  c.subscribe(()=>{if(++calls!==1)return;assert.equal(c.state.metadata,null);assert.equal(c.state.data,null);assert.equal(c.state.report,null);c.activate();c.example(c.lease,c.state);});
  if(operation==='clear')c.clear(c.lease,c.state);else c.deactivate();
  assert.equal(calls,1);assert.equal(c.state.origin,'synthetic-fixture');assert.equal(c.state.metadata!.name,'synthetic-zero.sigmf-meta');assert.equal(c.state.data!.name,'synthetic-zero.sigmf-data');
  await c.inspect(c.lease,c.state);assert.equal(c.state.report!.dataSha256,hash(new Uint8Array(4096)));
 }
});
