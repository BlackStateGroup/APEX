// Independent actual-source execution only, not mounted React or native/browser hardware.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DeviceSession } from '../packages/core/session.ts';
import { SimulatorTransport } from '../packages/core/simulator.ts';
import { clearReleasedSession } from '../src/session-controls.ts';
import type { ByteTransport } from '../packages/core/transport.ts';
const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() { let resolve!: () => void; let reject!: (e: Error) => void; const promise = new Promise<void>((r,j) => {resolve=r;reject=j;}); return {resolve,reject,promise}; }
function fixture(browserAxp: any = null) {
  const writes: [string, unknown][] = []; const write = (name: string) => (value?: unknown) => writes.push([name,value]);
  const env = {nativeBackground:{current:null as any},setNativeBackgroundPending:()=>{},foreground:{current:true},AppState:{currentState:'active'},acquisition:{current:null as any},setAcquisitionView:write('acquisition'),refreshAcquisition:write('refresh'),browserAxp, attached:{current:true}, mountEpoch:{current:1}, lock:{current:false}, operation:{current:null as object|null}, session:{current:null as DeviceSession|null}, disconnectListener:{current:null as (()=>void)|null}, captureBusy:{current:false}, serviceDataBusy:{current:false}, serviceDataUncertain:{current:false}, observationBusy:{current:false}, observationUncertain:{current:false}, setNotice:write('notice'),setBusy:write('busy'),append:write('event'),clearSession:write('clear'),setIdentity:write('identity'),setSource:write('source'),setCaps:write('caps'),DeviceSession,clearReleasedSession};
  const code = source.slice(source.indexOf('  async function run('),source.indexOf('  const runForeground')) + source.slice(source.indexOf('  async function connect('),source.indexOf('  async function disconnect('));
  const methods = new Function(...Object.keys(env),stripTypeScriptTypes(code)+';return {run,connect}')( ...Object.values(env)) as {run(action:()=>Promise<void>):Promise<void>;connect(t:ByteTransport):Promise<void>};
  return {...methods,env,writes};
}
function softwareUsb(open: Promise<void> = Promise.resolve(), close: Promise<void> = Promise.resolve()) {
  const sim = new SimulatorTransport(); const calls:string[]=[]; const observers:((e:Error)=>void)[]=[];
  const transport: ByteTransport = {source:'usb',async connect(){calls.push('acquire');await open;await sim.connect();},async disconnect(){calls.push('release');await close;await sim.disconnect();},write:b=>sim.write(b),onData:fn=>sim.onData(fn),onDisconnect:fn=>{observers.push(fn);return sim.onDisconnect(fn);}};
  return {transport,calls,observers};
}

test('independent: reentrant browser refresh cannot overwrite successor busy state',async()=>{
  const next = deferred(); let successor:Promise<void>|undefined; let once=false;
  const h=fixture({refresh(){if(!once){once=true;successor=h.run(()=>next.promise);}}});
  await h.run(async()=>{});
  assert.equal(h.env.lock.current,true); assert.notEqual(h.env.operation.current,null);
  assert.deepEqual(h.writes.filter(([name])=>name==='busy').at(-1),['busy',true]);
  next.resolve();await successor;assert.equal(h.env.lock.current,false);
});

test('independent: old rejected close cannot clear replacement session/listener/operation',async()=>{
  const delayed=deferred();const old=softwareUsb(Promise.resolve(),delayed.promise);const h=fixture();
  const previous=new DeviceSession(old.transport);await previous.open();h.env.session.current=previous;
  const next=softwareUsb();const work=h.run(()=>h.connect(next.transport));await turn();
  const successor=new DeviceSession(new SimulatorTransport());const token={};let removed=0;const listener=()=>removed++;
  h.env.session.current=successor;h.env.operation.current=token;h.env.disconnectListener.current=listener;const count=h.writes.length;
  delayed.reject(new Error('unknown old release'));await work;
  assert.equal(h.env.session.current,successor);assert.equal(h.env.operation.current,token);assert.equal(h.env.disconnectListener.current,listener);assert.equal(removed,0);assert.equal(h.writes.length,count);assert.deepEqual(next.calls,[]);assert.equal(previous.transportReleasePending,true);
});

test('independent: rejected open cannot remove a successor listener or publish stale UI',async()=>{
  const delayed=deferred();const old=softwareUsb(delayed.promise);const h=fixture();const work=h.run(()=>h.connect(old.transport));await turn();
  const selected=h.env.session.current!;const successor=new DeviceSession(new SimulatorTransport());let removed=0;const listener=()=>removed++;
  h.env.session.current=successor;h.env.operation.current={};h.env.disconnectListener.current=listener;const count=h.writes.length;
  delayed.reject(new Error('late open rejection'));await work;
  assert.equal(h.env.session.current,successor);assert.equal(h.env.disconnectListener.current,listener);assert.equal(removed,0);assert.equal(h.writes.length,count);assert.equal(selected.state,'closed');
});

test('independent: epoch change fences successful native negotiation and retained observer',async()=>{
  const delayed=deferred();const t=softwareUsb(delayed.promise);const h=fixture();const work=h.run(()=>h.connect(t.transport));await turn();
  const selected=h.env.session.current!;++h.env.mountEpoch.current;const count=h.writes.length;
  delayed.resolve();await work;t.observers[0]!(new Error('stale native observer'));
  assert.equal(h.writes.length,count);assert.equal(h.env.session.current,selected);await selected.close();
});

test('independent: active native acquisition still opens normally',async()=>{
  const h=fixture();const t=softwareUsb();await h.run(()=>h.connect(t.transport));
  assert.equal(h.env.session.current?.state,'open');assert.deepEqual(t.calls,['acquire']);await h.env.session.current!.close();
});
