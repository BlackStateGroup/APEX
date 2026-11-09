import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceShareGate, evidenceShareByteLength, MAX_NATIVE_EVIDENCE_SHARE_BYTES, EvidenceShareBusyError, EvidenceShareUncertainError, EvidenceShareSizeError } from '../src/native-evidence-share.ts';
function deferred<T>() {let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('native share byte count matches UTF-8 across ASCII, Unicode and lone surrogates',()=>{
 for(const text of ['', 'ascii\n', '\u007f\u0080\u07ff\u0800', '☃ 🔬 中文', '\ud800', '\udc00', '\ud800\ud800\udc00', '\udfffA'])assert.equal(evidenceShareByteLength(text),Buffer.byteLength(text,'utf8'));
 let seed=771;
 for(let run=0;run<100;run++){
  let text='';for(let i=0;i<100;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;text+=String.fromCharCode(seed&65535);}
  assert.equal(evidenceShareByteLength(text),Buffer.byteLength(text,'utf8'));
 }
});
test('explicit current share dispatches unchanged text once, does not infer delivery and refuses overlap',async()=>{
 const pending=deferred<'returned'>(),calls:string[]=[];
 const share=createEvidenceShareGate(text=>{calls.push(text);return pending.promise;});
 const exact='\n {"payload":"private 🔬"} \t';
 assert.equal(await share(exact,()=>false),null);assert.deepEqual(calls,[]);
 const first=share(exact,()=>true);await assert.rejects(share('replacement',()=>true),EvidenceShareBusyError);assert.deepEqual(calls,[exact]);
 pending.resolve('returned');assert.equal(await first,'returned');
 assert.equal(await share(exact,()=>true),'returned');assert.deepEqual(calls,[exact,exact]);
});
test('whole UTF-8 payload limit permits exact bound and refuses oversize without truncation or latching',async()=>{
 const calls:string[]=[];const share=createEvidenceShareGate(async text=>{calls.push(text);return 'dismissed';});
 const exact='🔬'.repeat(MAX_NATIVE_EVIDENCE_SHARE_BYTES/4);
 await assert.rejects(share(exact+'a',()=>true),EvidenceShareSizeError);
 await assert.rejects(share('a'.repeat(MAX_NATIVE_EVIDENCE_SHARE_BYTES+1),()=>true),EvidenceShareSizeError);
 await assert.rejects(share('',()=>true),EvidenceShareSizeError);
 await assert.rejects(share(null as any,()=>true),EvidenceShareSizeError);
 assert.equal(calls.length,0);assert.equal(await share(exact,()=>true),'dismissed');assert.deepEqual(calls,[exact]);
});
test('a second current-intent check prevents native dispatch without poisoning the gate',async()=>{
 let calls=0,checks=0;const share=createEvidenceShareGate(async()=>{calls++;return 'returned';});
 assert.equal(await share('x',()=>++checks===1),null);assert.equal(calls,0);
 assert.equal(await share('x',()=>true),'returned');assert.equal(calls,1);
});
test('sync failure, rejection, and unknown native result latch uncertain outcome across callers',async()=>{
 for(const boundary of [()=>{throw Error('SECRET');},async()=>{throw undefined;},async()=>('unexpected' as any)]){
  let calls=0;const share=createEvidenceShareGate(()=>{calls++;return boundary();});
  await assert.rejects(share('exact',()=>true),error=>error instanceof EvidenceShareUncertainError&&!String(error).includes('SECRET'));
  await assert.rejects(share('another',()=>true),EvidenceShareUncertainError);assert.equal(calls,1);
  assert.equal(await share('x',()=>false),null);assert.equal(calls,1);
 }
});
