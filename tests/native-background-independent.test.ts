// Independent actual App handler/lifecycle source execution with software doubles.
// Not mounted React, native compilation, hardware, or radio evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { harness } from './support/app-acquisition.ts';
import { DeviceSession } from '../packages/core/session.ts';
import { SimulatorTransport } from '../packages/core/simulator.ts';
import type { ByteTransport } from '../packages/core/transport.ts';
const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const turn = () => new Promise<void>(r => setImmediate(r));
function gate() { let resolve!: () => void; let reject!: (e: Error) => void; const promise = new Promise<void>((r,j)=>{resolve=r;reject=j;}); return {promise,resolve,reject}; }
function fixture() {
  const foreground = { current: true };
  let listener!: (state: string) => void;
  const AppState = {currentState:'active',addEventListener(_event: string, fn: (state:string)=>void) { listener=fn;return {remove(){}}; }};
  const base = harness({foreground,AppState});
  const env = {...base.env, foreground,AppState,
    capture:{}, updatePhoneNdefLifecycle:(state:string)=>state==='active',
    syncBrowserSession(){}, nfc:{async stop(){}}, async stopAccessoryDiscovery(){},
  };
  const run = source.slice(source.indexOf('  async function run('),source.indexOf('  const runForeground'));
  const methods = source.slice(source.indexOf('  async function connect('),source.indexOf('  async function resetBluetooth('));
  const begin=source.indexOf("    const lifecycle = AppState.addEventListener('change', state => {");
  const end=source.indexOf('\n    });',begin);
  const lifecycle=source.slice(begin,end+7);
  const api=new Function(...Object.keys(env),stripTypeScriptTypes(run+methods+lifecycle)+';return {run,connect,disconnect};')(...Object.values(env)) as {run(fn:()=>Promise<void>):Promise<void>;connect(t:ByteTransport):Promise<void>;disconnect():Promise<void>};
  return {...api,env,writes:base.writes,change(state:string){AppState.currentState=state;listener(state);}};
}
function transport() {
  const sim=new SimulatorTransport();const calls:string[]=[];
  let open:Promise<void>|null=null,close:Promise<void>|null=null;
  const value:ByteTransport={source:'usb',async connect(){calls.push('connect');if(open)await open;await sim.connect();},async disconnect(){calls.push('disconnect');if(close)await close;await sim.disconnect();},write:b=>sim.write(b),onData:fn=>sim.onData(fn),onDisconnect:fn=>sim.onDisconnect(fn)};
  return {value,calls,delayOpen(p:Promise<void>){open=p;},delayClose(p:Promise<void>){close=p;}};
}
for(const state of ['inactive','background']) test(`independent native retained connect refuses dispatch when ${state}`,async()=>{
  const h=fixture(),t=transport();h.change(state);await h.run(()=>h.connect(t.value));
  try {assert.equal(t.calls.includes('connect'),false);assert.equal(h.env.session.current,null);}
  finally {await h.env.session.current?.close();}
});
test('independent native permission inactive does not cancel issued acquisition',async()=>{
  const h=fixture(),t=transport(),opening=gate();t.delayOpen(opening.promise);
  const work=h.run(()=>h.connect(t.value));await turn();h.change('inactive');
  assert.equal(t.calls.includes('disconnect'),false);h.change('active');opening.resolve();await work;
  try {assert.equal(h.env.session.current?.state,'open');assert.ok(h.writes.some(v=>String(v).includes('Connected:')));}
  finally {await h.env.session.current?.close();}
});
test('independent background cancellation stays latched through fast resume and delayed permission completion',async()=>{
  const h=fixture(),t=transport(),opening=gate();t.delayOpen(opening.promise);
  const work=h.run(()=>h.connect(t.value));await turn();const selected=h.env.session.current!;
  h.change('background');h.change('active');opening.resolve();await work;await turn();
  try {assert.equal(selected.state,'closed');assert.equal(h.env.session.current,null);assert.equal(h.writes.some(v=>String(v).includes('Connected:')),false);assert.equal(h.env.lock.current,false);}
  finally {await selected.close();}
});
test('independent background while prior close is pending never creates successor',async()=>{
  const h=fixture(),old=transport(),next=transport(),closing=gate();const selected=new DeviceSession(old.value);await selected.open();h.env.session.current=selected;old.delayClose(closing.promise);
  const work=h.run(()=>h.connect(next.value));await turn();h.change('background');h.change('active');closing.resolve();await work;
  try {assert.equal(next.calls.includes('connect'),false);assert.equal(h.env.session.current,null);}
  finally {await h.env.session.current?.close();}
});
test('independent duplicate background drains open session once and blocks fast-resume acquisition',async()=>{
  const h=fixture(),t=transport(),next=transport(),closing=gate();await h.run(()=>h.connect(t.value));const selected=h.env.session.current!;t.delayClose(closing.promise);
  h.change('background');h.change('background');await turn();h.change('active');const successor=h.run(()=>h.connect(next.value));await turn();
  const prematurelyAcquired=next.calls.includes('connect');closing.resolve();await successor;await turn();await turn();
  try {assert.equal(prematurelyAcquired,false);assert.equal(t.calls.filter(v=>v==='disconnect').length,1);assert.equal(selected.state,'closed');assert.equal(h.env.session.current,null);}
  finally {await h.env.session.current?.close();}
});
test('independent failed background release remains selected without automatic retry',async()=>{
  const h=fixture(),t=transport(),closing=gate();await h.run(()=>h.connect(t.value));const selected=h.env.session.current!;t.delayClose(closing.promise);
  h.change('background');await turn();closing.reject(new Error('unconfirmed background release'));await turn();await turn();h.change('active');h.change('background');await turn();
  assert.equal(h.env.session.current,selected);assert.equal(selected.state,'closed');assert.equal(selected.transportReleasePending,true);assert.equal(t.calls.filter(v=>v==='disconnect').length,1);
  t.delayClose(Promise.resolve());h.change('active');await h.run(h.disconnect);assert.equal(h.env.session.current,null);
});
test('independent background cleanup cannot clear replacement ownership',async()=>{
  const h=fixture(),t=transport(),closing=gate();await h.run(()=>h.connect(t.value));const selected=h.env.session.current!;t.delayClose(closing.promise);
  h.change('background');await turn();const replacement=new DeviceSession(new SimulatorTransport());await replacement.open();h.env.session.current=replacement;
  closing.resolve();await turn();await turn();
  try {assert.equal(h.env.session.current,replacement);assert.equal(replacement.state,'open');assert.equal(selected.state,'closed');}
  finally {await replacement.close();}
});
test('independent background cancellation preserves failed prior-close ownership without retry',async()=>{
  const h=fixture(),old=transport(),next=transport(),closing=gate();const selected=new DeviceSession(old.value);await selected.open();h.env.session.current=selected;old.delayClose(closing.promise);
  const work=h.run(()=>h.connect(next.value));await turn();h.change('background');closing.reject(new Error('prior release failed'));await work;await turn();
  try {assert.equal(h.env.session.current,selected);assert.equal(selected.transportReleasePending,true);assert.equal(old.calls.filter(v=>v==='disconnect').length,1);assert.equal(next.calls.includes('connect'),false);assert.equal(h.env.lock.current,false);}
  finally {old.delayClose(Promise.resolve());await selected.close();}
});
test('independent background cancellation keeps operation lock until pending connect and release settle',async()=>{
  const h=fixture(),t=transport(),opening=gate(),closing=gate();t.delayOpen(opening.promise);t.delayClose(closing.promise);
  const work=h.run(()=>h.connect(t.value));await turn();h.change('background');await turn();h.change('active');opening.resolve();await turn();
  assert.equal(h.env.lock.current,true);assert.equal(h.env.session.current?.state,'closed');closing.resolve();await work;
  assert.equal(h.env.lock.current,false);assert.equal(h.env.session.current,null);assert.equal(h.writes.some(v=>String(v).includes('Connected:')),false);
});
test('independent stale background cleanup completion publishes no UI after mount changes',async()=>{
  const h=fixture(),t=transport(),closing=gate();await h.run(()=>h.connect(t.value));t.delayClose(closing.promise);h.change('background');await turn();
  ++h.env.mountEpoch.current;const count=h.writes.length;closing.resolve();await turn();await turn();assert.equal(h.writes.length,count);
});
test('independent background interrupts active Ping without unlocking before cleanup drains',async()=>{
  const h=fixture(),t=transport(),writing=gate(),closing=gate();await h.run(()=>h.connect(t.value));const selected=h.env.session.current!;
  const write=t.value.write;t.value.write=async bytes=>{await writing.promise;await write(bytes);};
  const work=h.run(async()=>{await selected.request('system.ping');});await turn();t.delayClose(closing.promise);const beforeBackground=h.writes.length;h.change('background');await work;
  const interruptionWrites=h.writes.slice(beforeBackground);
  assert.ok(interruptionWrites.some(v=>String(v).includes('Releasing the native session')));
  assert.equal(interruptionWrites.some(v=>String(v).includes('Session closed')),false);
  assert.equal(selected.state,'closed');assert.equal(selected.pendingCount,0);assert.equal(h.env.nativeBackground.current?.target,selected);
  const next=transport();h.change('active');await h.run(()=>h.connect(next.value));assert.equal(next.calls.includes('connect'),false);
  writing.resolve();closing.resolve();await turn();await turn();assert.equal(h.env.session.current,null);assert.equal(h.env.nativeBackground.current?.pending,null);
});
test('independent background of already disconnected session never retries failed transport release',async()=>{
  const h=fixture(),t=transport(),closing=gate();await h.run(()=>h.connect(t.value));const selected=h.env.session.current!;t.delayClose(closing.promise);
  const disconnect=h.run(h.disconnect);await turn();closing.reject(new Error('explicit release failed'));await disconnect;
  h.change('background');h.change('active');h.change('background');await turn();
  assert.equal(h.env.session.current,selected);assert.equal(selected.transportReleasePending,true);assert.equal(t.calls.filter(v=>v==='disconnect').length,1);
  t.delayClose(Promise.resolve());await selected.close();
});
test('independent direct retained connect cannot bypass background cleanup on fast resume',async()=>{
  const h=fixture(),t=transport(),next=transport(),closing=gate();await h.run(()=>h.connect(t.value));const selected=h.env.session.current!;t.delayClose(closing.promise);
  h.change('background');await turn();h.change('active');const count=h.writes.length;
  const direct=h.connect(next.value);await turn();
  assert.equal(h.env.acquisition.current,null);assert.equal(h.writes.length,count);assert.equal(h.env.session.current,selected);assert.equal(next.calls.length,0);
  closing.resolve();await direct;await turn();await turn();assert.equal(h.env.session.current,null);assert.equal(next.calls.length,0);
});
for(const thrown of [new Error('unrelated transport failure'),'Session closed',new Error('Session closed unexpectedly')]) test(`independent pending background cleanup does not suppress ${typeof thrown}: ${String(thrown)}`,async()=>{
  const h=fixture(),t=transport(),closing=gate(),action=gate();await h.run(()=>h.connect(t.value));t.delayClose(closing.promise);
  const work=h.run(()=>action.promise);h.change('background');const count=h.writes.length;
  action.reject(thrown as Error);await work;
  const message=thrown instanceof Error?thrown.message:thrown;
  assert.ok(h.writes.slice(count).some(v=>String(v)===`Error: ${message}`));
  closing.resolve();await turn();await turn();
});
test('independent Session closed error remains visible without pending background cleanup',async()=>{
  const h=fixture();await h.run(async()=>{throw new Error('Session closed');});
  assert.ok(h.writes.some(v=>String(v)==='Error: Session closed'));
});
