import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceSession } from '../packages/core/session.ts';
import { SimulatorTransport } from '../packages/core/simulator.ts';
function deferred() { let resolve!:()=>void; let reject!:(e:Error)=>void; const promise=new Promise<void>((y,n)=>{resolve=y;reject=n;}); return {promise,resolve,reject}; }
for (const order of ['connect-first', 'release-first'] as const) {
 test(`concurrent closes join failed late release (${order})`, async () => {
  const connect=deferred(), early=deferred(), late=deferred(); const peer=new SimulatorTransport(); let calls=0; let terminal!:(e:Error)=>void;
  peer.onDisconnect=fn=>{terminal=fn; return ()=>{};}; peer.connect=()=>connect.promise;
  peer.disconnect=()=>++calls===1?early.promise:late.promise;
  const session=new DeviceSession(peer); const opening=assert.rejects(session.open(),/closed during open/);
  terminal(new Error('Lost')); const a=assert.rejects(session.close(),/Late uncertain/); const b=assert.rejects(session.close(),/Late uncertain/);
  await Promise.resolve();
  if(order==='connect-first') {connect.resolve(); await Promise.resolve(); early.resolve();}
  else {early.resolve(); connect.resolve();}
  for(let i=0;i<15;i++) await Promise.resolve();
  assert.equal(calls,2); assert.equal(session.transportReleasePending,true);
  const c=assert.rejects(session.close(),/Late uncertain/); terminal(new Error('Stale'));
  late.reject(new Error('Late uncertain')); await Promise.all([opening,a,b,c]);
  assert.equal(calls,2); assert.equal(session.transportReleasePending,true);
  peer.disconnect=async()=>{calls++;}; await session.close(); assert.equal(calls,3); assert.equal(session.transportReleasePending,false);
 });
}
