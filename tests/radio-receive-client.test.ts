import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadioReceiveClient, RadioReceiveBusyError, RadioReceiveCancelledError } from '../packages/core/radio-receive-client.ts';
import type { RadioReceiveSession } from '../packages/core/radio-receive-client.ts';
import type { Operation } from '../packages/core/session.ts';
const operations:Operation[]=['system.info','system.capabilities','system.ping','radio.rx.start','radio.rx.poll','radio.rx.stop'];
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
type Fields={state?:number;id?:number;observed?:number;accepted?:number;dropped?:number;rejected?:number;queued?:number;elapsed?:number;error?:number;packet?:{elapsed:number;payload:number[]}};
function response(f:Fields={}){
 const packet=f.packet,b=new Uint8Array(packet?31+packet.payload.length:24),v=new DataView(b.buffer);
 b.set([1,f.state??1,1,packet?1:0]);v.setUint32(4,f.id??1,true);v.setUint16(8,f.observed??0,true);v.setUint16(10,f.accepted??0,true);v.setUint16(12,f.dropped??0,true);v.setUint16(14,f.rejected??0,true);
 b[16]=f.queued??0;b[17]=packet?.payload.length??0;v.setUint32(18,f.elapsed??150,true);v.setInt16(22,f.error??0,true);
 if(packet){v.setUint32(24,packet.elapsed,true);v.setInt16(28,-735,true);b[30]=201;b.set(packet.payload,31);}return b;
}
function peer(){
 const calls:{operation:Operation;payload:number[]}[]=[];
 let handler=(operation:Operation):Promise<Uint8Array>=>Promise.resolve(response({state:operation==='radio.rx.stop'?2:1}));
 const session:RadioReceiveSession={state:'open',capabilities:[...operations],request(operation,payload=new Uint8Array()){calls.push({operation,payload:Array.from(payload)});return handler(operation);}};
 return{session,calls,setHandler:(next:typeof handler)=>{handler=next;},client:createRadioReceiveClient(session)};
}
const turn=()=>new Promise<void>(resolve=>setTimeout(resolve,0));

test('client selection is inert, immutable and retained across callers; local refusals issue nothing',async()=>{
 const p=peer();assert.equal(createRadioReceiveClient(p.session),p.client);assert.equal(p.calls.length,0);assert.ok(Object.isFrozen(p.client));assert.ok(Object.isFrozen(p.client.state));
 await assert.rejects(p.client.poll());await assert.rejects(p.client.start(49,1));await assert.rejects(p.client.start(1000,65));assert.equal(await p.client.stop(),null);assert.equal(p.calls.length,0);
 assert.throws(()=>createRadioReceiveClient({...p.session,capabilities:operations.slice(0,3)}));assert.throws(()=>createRadioReceiveClient({...p.session,state:'closed'}));
});
test('bounded explicit start, complete manual drainage and a new capture preserve exact packet order',async()=>{
 const p=peer();await p.client.start(1000,4);assert.deepEqual(p.calls[0],{operation:'radio.rx.start',payload:[1,1,232,3,4,0]});
 await assert.rejects(p.client.start(1000,4),RadioReceiveBusyError);
 let index=0;p.setHandler(async operation=>operation==='radio.rx.start'?response({id:2}):response({state:4,observed:4,accepted:4,queued:3-index,elapsed:200,packet:{elapsed:160+index,payload:[index++]}}));
 for(let i=0;i<4;i++)await p.client.poll();
 assert.deepEqual(p.client.state.packets.map(packet=>packet.payload),[[0],[1],[2],[3]]);assert.equal(p.client.state.unreturnedAccepted,0);assert.equal(p.client.state.status!.queued,0);
 assert.ok(Object.isFrozen(p.client.state.packets));assert.ok(Object.isFrozen(p.client.state.packets[0]!.payload));await assert.rejects(p.client.poll());
 await p.client.start(1000,4);assert.equal(p.client.state.status!.captureId,2);assert.equal(p.client.state.packets.length,0);
});
test('Stop before deferred dispatch cancels Start without IO and allows a later explicit start',async()=>{
 const p=peer();const start=p.client.start(1000,4),stop=p.client.stop();await assert.rejects(start,RadioReceiveCancelledError);assert.equal(await stop,null);assert.equal(p.calls.length,0);
 assert.equal(p.client.state.uncertain,false);await p.client.start(1000,4);assert.equal(p.calls.length,1);
});
test('Stop during a dispatched Start joins one cleanup and never overlaps native requests',async()=>{
 const p=peer(),gate=deferred<Uint8Array>();p.setHandler(operation=>operation==='radio.rx.start'?gate.promise:Promise.resolve(response({state:2})));
 const start=p.client.start(1000,4);await turn();const one=p.client.stop(),two=p.client.stop();assert.equal(one,two);assert.equal(p.calls.length,1);
 await assert.rejects(p.client.poll(),RadioReceiveBusyError);await assert.rejects(p.client.start(1000,4),RadioReceiveBusyError);
 gate.resolve(response());await start;await one;assert.deepEqual(p.calls.map(c=>c.operation),['radio.rx.start','radio.rx.stop']);assert.deepEqual(p.calls[1]!.payload,[1,0,0,0]);assert.equal(p.client.state.stopQueued,false);
});
test('lost Poll is not retried; queued Stop uses only known ID and never clears uncertainty',async()=>{
 const p=peer();await p.client.start(1000,4);const gate=deferred<Uint8Array>();p.setHandler(operation=>operation==='radio.rx.poll'?gate.promise:Promise.resolve(response({state:2,elapsed:160})));
 const poll=p.client.poll();await turn();const stop=p.client.stop();gate.reject(Error('private timeout'));await assert.rejects(poll,error=>!String(error).includes('private timeout'));await stop;
 assert.equal(p.client.state.uncertain,true);assert.equal(p.client.state.status!.state,2);assert.deepEqual(p.calls.map(c=>c.operation),['radio.rx.start','radio.rx.poll','radio.rx.stop']);
 await assert.rejects(p.client.poll());await assert.rejects(p.client.start(1000,4));assert.equal(p.calls.length,3);await p.client.stop();assert.equal(p.calls.length,4);
});
test('contradictory Start does not authorize guessing its ID for cleanup',async()=>{
 const p=peer();p.setHandler(async()=>response({observed:1,accepted:1}));await assert.rejects(p.client.start(1000,4));assert.equal(p.client.state.uncertain,true);assert.equal(p.client.state.status,null);
 assert.equal(await p.client.stop(),null);assert.equal(p.calls.length,1);
});
test('wrong ID, regressing counters, impossible state and lease violation fail atomically',async()=>{
 const cases:Fields[]=[{id:2},{state:0},{state:3,elapsed:999},{state:4,observed:3,accepted:3},{observed:5,accepted:5},{elapsed:1000}];
 for(const invalid of cases){const p=peer();await p.client.start(1000,4);const before=p.client.state.status;p.setHandler(async()=>response(invalid));await assert.rejects(p.client.poll());assert.equal(p.client.state.status,before);assert.equal(p.client.state.packets.length,0);assert.equal(p.client.state.uncertain,true);}
});
test('failed initialization and stop fault are reported without claiming physical release or restarting',async()=>{
 for(const initialFault of [true,false]){
  const p=peer();p.setHandler(async op=>response({state:initialFault||op==='radio.rx.stop'?5:1,error:initialFault?-701:op==='radio.rx.stop'?-702:0}));
  await p.client.start(1000,4);if(!initialFault)await p.client.stop();assert.equal(p.client.state.status!.state,5);assert.match(p.client.state.message,/Physical stop is unverified/);await assert.rejects(p.client.start(1000,4));
 }
});
test('an out-of-band drain is counted as unreturned accepted data, never presumed RF loss',async()=>{
 const p=peer();await p.client.start(1000,4);p.setHandler(async()=>response({state:2,observed:3,accepted:3,queued:3,elapsed:170}));await p.client.stop();
 p.setHandler(async()=>response({state:2,observed:3,accepted:3,queued:0,elapsed:170,packet:{elapsed:160,payload:[9]}}));await p.client.poll();
 assert.equal(p.client.state.unreturnedAccepted,2);assert.equal(p.client.state.uncertain,false);assert.equal(p.client.state.packets.length,1);
});
test('known exhausted capture IDs cannot trigger another start request',async()=>{
 const p=peer();p.setHandler(async operation=>response({id:0xffffffff,state:operation==='radio.rx.stop'?2:1}));
 await p.client.start(1000,4);await p.client.stop();const before=p.calls.length;
 await assert.rejects(p.client.start(1000,4),/exhausted/);assert.equal(p.calls.length,before);
});
