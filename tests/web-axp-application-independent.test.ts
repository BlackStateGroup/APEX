// Independent host mocks only: no browser process, network, permissions, radio or device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { WebAxpApplication } from '../src/experimental/web-axp-application.ts';
import { WebAxpManager } from '../src/experimental/web-axp.ts';
import type { WebAxpHost, WebAxpDevice, WebAxpServer, WebAxpCharacteristic } from '../src/experimental/web-axp.ts';
import { AXP_SERVICE, AXP_WRITE, AXP_NOTIFY, AXP_READY } from '../packages/core/ble-transport.ts';
import { FrameDecoder, encode, Kind, Opcode, utf8 } from '../packages/protocol/index.ts';
import { DeviceSession } from '../packages/core/session.ts';
import { SimulatorTransport } from '../packages/core/simulator.ts';
const turn = () => new Promise<void>(r => setImmediate(r));
function pending<T>() { let resolve!: (x:T)=>void; let reject!: (e:Error)=>void; const promise=new Promise<T>((r,j)=>{resolve=r;reject=j}); return {resolve,reject,promise}; }
const gate = () => ({foreground:true,devicesTab:true,busy:false,scanning:false,observing:false,capturing:false,nfc:false});
function hostFixture() {
  const calls:string[]=[]; const listeners=new Set<()=>void>(); const closeListeners=new Set<()=>void>();
  let connected=false; let current:DataView|null=null; let ready=true; let disconnectWorks=true;
  let pickDelay:Promise<WebAxpDevice>|null=null; let connectDelay:Promise<void>|null=null; let writeDelay:Promise<void>|null=null;
  const emit=(data:Uint8Array)=>{current=new DataView(data.slice().buffer);for(const fn of [...listeners])fn()};
  const decoder=new FrameDecoder(frame=>{
    let payload=frame.payload;
    if(frame.opcode===Opcode.Info)payload=utf8(JSON.stringify({id:'independent host',board:'mock',firmware:'mock-only',protocol:1,source:'accessory'}));
    if(frame.opcode===Opcode.Capabilities)payload=utf8(JSON.stringify({operations:['system.info','system.capabilities','system.ping']}));
    const bytes=encode({id:frame.id,opcode:frame.opcode,kind:Kind.Response,payload});
    for(let i=0;i<bytes.length;i+=20)emit(bytes.slice(i,i+20));
  });
  const notify:WebAxpCharacteristic={properties:{notify:true},get value(){return current},addEventListener(_,fn){calls.push('listen');listeners.add(fn)},removeEventListener(_,fn){calls.push('unlisten');listeners.delete(fn)},async startNotifications(){calls.push('start');if(ready)emit(AXP_READY);return notify},async stopNotifications(){calls.push('stop');return notify}};
  const write:WebAxpCharacteristic={...notify,properties:{write:true},async writeValueWithResponse(bytes){calls.push('write');if(writeDelay)await writeDelay;decoder.push(bytes)}};
  const service={async getCharacteristic(id:string){calls.push(id);assert.ok(id===AXP_WRITE||id===AXP_NOTIFY);return id===AXP_WRITE?write:notify}};
  const server:WebAxpServer={get connected(){return connected},async connect(){calls.push('connect');if(connectDelay)await connectDelay;connected=true;return server},disconnect(){calls.push('disconnect');if(disconnectWorks)connected=false},async getPrimaryService(id){calls.push('service');assert.equal(id,AXP_SERVICE);return service}};
  const device:WebAxpDevice={name:'independent mock',gatt:server,addEventListener(_,fn){closeListeners.add(fn)},removeEventListener(_,fn){closeListeners.delete(fn)}};
  const host:WebAxpHost={secureContext:true,bluetooth:{requestDevice(options){calls.push('pick');assert.deepEqual(options,{filters:[{services:[AXP_SERVICE]}]});return pickDelay??Promise.resolve(device)}}};
  const manager=new WebAxpManager(host,{effectTimeoutMs:40,setupTimeoutMs:120,cleanupTimeoutMs:25});
  const app=new WebAxpApplication(manager);
  return {app,host,manager,calls,device,server,emit,listeners,closeListeners,setReady(v:boolean){ready=v},setDisconnect(v:boolean){disconnectWorks=v},setPick(p:Promise<WebAxpDevice>|null){pickDelay=p},setConnect(p:Promise<void>|null){connectDelay=p},setWrite(p:Promise<void>|null){writeDelay=p}};
}

test('independent: acquisition filters and observer order, frozen deep snapshot, selected cancel no GATT',async()=>{
 const f=hostFixture();let publications=0;let synchronous=true;let seen=false;
 f.app.observe(()=>{publications++;assert.equal(f.calls[0],'pick');assert.equal(f.app.held,true)});
 const original=f.host.bluetooth!.requestDevice;f.host.bluetooth!.requestDevice=options=>{seen=synchronous;assert.equal(publications,0);return original(options)};
 const chosen=f.app.choose(gate());synchronous=false;assert.ok(seen);assert.throws(()=>f.app.choose(gate()));await chosen;
 const snapshot=f.app.snapshot();assert.ok(Object.isFrozen(snapshot));assert.ok(Object.isFrozen(snapshot.manager));assert.ok(Object.isFrozen(snapshot.manager.candidate));
 assert.throws(()=>{(snapshot.manager.candidate as any).name='changed'});await f.app.cancel();assert.deepEqual(f.calls,['pick']);
});

test('independent: every gate applies to connect, held simulator is not closed or replaced',async()=>{
 for(const key of Object.keys(gate()) as (keyof ReturnType<typeof gate>)[]){const f=hostFixture();await f.app.choose(gate());const g=gate();g[key]=!g[key];assert.throws(()=>f.app.connect(g));assert.deepEqual(f.calls,['pick']);await f.app.cancel()}
 const f=hostFixture();await f.app.choose(gate());const sim=new DeviceSession(new SimulatorTransport());await sim.open();f.app.session.current=sim;assert.throws(()=>f.app.connect(gate()));assert.equal(sim.state,'open');assert.equal(f.app.session.current,sim);f.app.session.current=null;await sim.close();await f.app.cancel();
});

test('independent: cancelled raw picker rejects immediately, blocks replacement, late reject never acquires',async()=>{
 const f=hostFixture();const raw=pending<WebAxpDevice>();f.setPick(raw.promise);const picking=assert.rejects(f.app.choose(gate()));
 const cancellation=assert.rejects(f.app.cancel(),/pending/);assert.equal(f.app.snapshot().manager.rawPending,1);await Promise.all([picking,cancellation]);
 assert.throws(()=>f.app.choose(gate()));assert.throws(()=>f.app.connect(gate()));raw.reject(new Error('late mock reject'));await turn();assert.equal(f.app.snapshot().manager.rawPending,0);assert.equal(f.app.held,false);assert.deepEqual(f.calls,['pick']);
});

test('independent: reentrant cancel on exact reservation cannot acquire and joins cleanup identity',async()=>{
 const f=hostFixture();await f.app.choose(gate());let closing:Promise<void>|undefined;let active=false;
 f.app.observe(()=>{if(!active&&f.manager.snapshot().state==='reserved'){active=true;closing=f.app.cancel();assert.equal(f.app.cancel(),closing)}});
 await assert.rejects(f.app.connect(gate()));await closing;await turn();assert.deepEqual(f.calls,['pick']);assert.equal(f.app.held,false);assert.equal(f.app.session.current,null);
});

test('independent: cancel fences before exact session.close even with operation lock and pending open',async()=>{
 const f=hostFixture();const raw=pending<void>();f.setConnect(raw.promise);await f.app.choose(gate());const opening=assert.rejects(f.app.connect(gate()));await turn();
 const session=f.app.session.current!;const close=session.close.bind(session);let sawFence=false;session.close=()=>{sawFence=f.manager.snapshot().state!=='acquiring';assert.ok(f.calls.includes('disconnect'));return close()};f.app.lock.current=true;
 const cancellation=assert.rejects(f.app.cancel());assert.ok(sawFence);await Promise.all([opening,cancellation]);assert.equal(f.app.session.current,session);assert.ok(session.transportReleasePending);
 const before=f.calls.length;f.app.suspend();f.app.suspend();assert.equal(f.calls.length,before);raw.resolve();await turn();assert.equal(f.calls.includes('service'),false);assert.equal(f.app.session.current,session);await f.app.cancel(true);assert.equal(f.app.session.current,null);assert.equal(f.app.held,false);f.app.lock.current=false;
});

test('independent: pending write is locally cancelled; late raw effect cannot free poison or reach replacement',async()=>{
 const f=hostFixture();await f.app.choose(gate());await f.app.connect(gate());const old=f.app.session.current!;const stale=[...f.listeners];
 const raw=pending<void>();f.setWrite(raw.promise);const ping=assert.rejects(old.request('system.ping',utf8('old')));await turn();const cancelling=assert.rejects(f.app.cancel());await Promise.all([ping,cancelling]);
 assert.ok(f.app.snapshot().cleanupFailed);assert.throws(()=>f.app.choose(gate()));raw.resolve();await turn();assert.equal(f.app.session.current,old);assert.ok(f.app.held);await f.app.cancel(true);f.setWrite(null);
 await f.app.choose(gate());await f.app.connect(gate());const next=f.app.session.current!;assert.notEqual(next,old);for(const cb of stale)cb();await old.close();await turn();assert.equal(f.app.session.current,next);assert.equal(next.state,'open');assert.deepEqual(await next.request('system.ping',utf8('next')),utf8('next'));await f.app.cancel();
});

test('independent: failed disconnect survives view detach and requires explicit retry',async()=>{
 const f=hostFixture();await f.app.choose(gate());await f.app.connect(gate());const session=f.app.session.current!;f.setDisconnect(false);await assert.rejects(f.app.cancel());assert.ok(f.app.snapshot().cleanupFailed);assert.equal(f.app.session.current,session);
 let updates=0;const detach=f.app.observe(()=>updates++);detach();f.app.suspend();const before=f.calls.length;await assert.rejects(f.app.cancel(),/explicit Retry/);assert.equal(f.calls.length,before);assert.equal(updates,0);f.setDisconnect(true);await f.app.cancel(true);assert.equal(f.app.held,false);
});

test('independent: cancellation completion publication may select new work without old finally clearing it',async()=>{
 const f=hostFixture();await f.app.choose(gate());await f.app.connect(gate());const old=f.app.session.current!;let newer:Promise<void>|null=null;let started=false;
 f.app.observe(()=>{if(!started&&!f.app.held&&!f.app.snapshot().cleaning){started=true;newer=f.app.choose(gate())}});
 await f.app.cancel();await newer;assert.equal(f.manager.snapshot().state,'selected');assert.ok(f.app.held);assert.equal(old.state,'closed');await f.app.connect(gate());assert.notEqual(f.app.session.current,old);await f.app.cancel();
});

test('independent: production source routes real App handlers through live owner and exact cleanup',()=>{
 const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
 assert.match(app,/const lock = browserAxp\?\.lock \?\? localLock/);assert.match(app,/const session = browserAxp\?\.session \?\? localSession/);
 assert.match(app,/async function connect\(transport: ByteTransport\) \{\s*if \(browserAxp\?\.held\)/);
 assert.match(app,/async function disconnect\(\) \{\s*if \(browserAxp\?\.owns\(session.current\)\) \{ await browserAxp.cancel\(\); return; \}/);
 assert.match(app,/onChoose=\{\(\) => browserAction\(\(\) => browserAxp.choose\(browserGate\(\)\)\)\}/);
 assert.match(app,/onCancel=\{\(\) => browserAction\(\(\) => browserAxp.cancel\(\)/);
 assert.equal((app.match(/canStart=\{\(\) => !browserAxp\?\.held/g)||[]).length,2);
 assert.match(app,/if \(browserAxp\?\.held \|\| !foreground.current/);assert.match(app,/operation.current === token/);assert.match(app,/mountEpoch.current !== epoch/);
 const native=readFileSync(new URL('../src/platform/web-axp.native.ts',import.meta.url),'utf8');assert.match(native,/import type/);assert.doesNotMatch(native,/new WebAxp|navigator|requestDevice/);
});

function pingAction(bindings:Record<string,unknown>):()=>void {
 const source=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');const section=source.slice(source.indexOf('title="Ping device"'));
 const handler=section.slice(section.indexOf('onPress={')+9,section.indexOf('})} />')+2);
 return new Function(...Object.keys(bindings),'return '+handler)(...Object.values(bindings));
}
for(const transition of ['replacement','unmount','StrictMode epoch','closed session'])test(`independent: actual Ping closure cannot publish after ${transition}`,async()=>{
 const raw=pending<Uint8Array>();const old={state:'open',source:'ble',request:()=>raw.promise};const session={current:old};const attached={current:true};const mountEpoch={current:1};let running:Promise<void>|undefined;const messages:string[]=[];
 const click=pingAction({run:(fn:()=>Promise<void>)=>{running=fn()},session,attached,mountEpoch,browserAxp:{},utf8,text:(b:Uint8Array)=>new TextDecoder().decode(b),append:(m:string)=>messages.push(m)});
 click();raw.resolve(utf8('old reply'));
 if(transition==='replacement')session.current={...old};if(transition==='unmount')attached.current=false;if(transition==='StrictMode epoch')mountEpoch.current++;if(transition==='closed session')old.state='closed';
 await running;assert.deepEqual(messages,[]);
});

test('independent: actual lifecycle adapter and singleton never acquire on import, bind, remount or visible',async()=>{
 class MockDocument extends EventTarget { visibilityState='visible'; }
 class MockWindow extends EventTarget { isSecureContext=true; }
 const document=new MockDocument();const window=new MockWindow();const f=hostFixture();
 const saved=new Map<string,PropertyDescriptor|undefined>();for(const [key,value] of Object.entries({document,window,navigator:{bluetooth:f.host.bluetooth}})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})}
 try{
  const binding=await import('../src/platform/web-axp.ts');assert.deepEqual(f.calls,[]);assert.equal(binding.browserAxpSupport(),null);
  const singleton=binding.getBrowserAxpApplication();assert.equal(binding.getBrowserAxpApplication(),singleton);assert.deepEqual(f.calls,[]);
  let updates=0;let detach=binding.observeBrowserAxpLifecycle(singleton,()=>updates++);detach();detach=binding.observeBrowserAxpLifecycle(singleton,()=>updates++);
  document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));assert.deepEqual(f.calls,[]);
  await singleton.choose(gate());assert.equal(singleton.held,true);detach();assert.equal(binding.getBrowserAxpApplication(),singleton);assert.equal(singleton.held,true);
  detach=binding.observeBrowserAxpLifecycle(singleton,()=>updates++);document.visibilityState='hidden';document.dispatchEvent(new Event('visibilitychange'));await turn();assert.equal(singleton.held,false);assert.deepEqual(f.calls,['pick']);
  document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));await turn();assert.deepEqual(f.calls,['pick']);
  await singleton.choose(gate());window.dispatchEvent(new Event('pagehide'));await turn();assert.equal(singleton.held,false);assert.deepEqual(f.calls,['pick','pick']);
  detach();const last=updates;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));assert.equal(updates,last);
  window.isSecureContext=false;assert.match(binding.browserAxpSupport()!,/secure/);window.isSecureContext=true;Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});assert.match(binding.browserAxpSupport()!,/Safari\/iOS/);
 }finally{for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key]}}
});

test('independent: actual stale Cancel closure never reports poisoned cleanup completed',async()=>{
 const f=hostFixture();await f.app.choose(gate());await f.app.connect(gate());f.setDisconnect(false);await assert.rejects(f.app.cancel());assert.ok(f.app.held);
 const source=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
 const declaration=source.slice(source.indexOf('const browserAction ='),source.indexOf('  useEffect(() => {',source.indexOf('const browserAction ='))).replace('(action: () => Promise<void>, success?: string)','(action, success)');
 const line=source.split('\n').find(line=>line.includes('onCancel={() => browserAction('))!;const handler=line.slice(line.indexOf('onCancel={')+10,line.lastIndexOf('}'));
 const messages:string[]=[];const notices:string[]=[];
 const click=new Function('attached','mountEpoch','append','setNotice','browserAxp',declaration+'return '+handler)({current:true},{current:1},(m:string)=>messages.push(m),(m:string)=>notices.push(m),f.app);
 click();await turn();assert.equal(f.app.held,true);assert.deepEqual(messages,[]);assert.ok(notices.some(m=>/retry|cleanup/i.test(m)));f.setDisconnect(true);await f.app.cancel(true);
});

function actualBrowserAction(app:WebAxpApplication,messages:string[],notices:string[]) {
 const source=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');const declaration=source.slice(source.indexOf('const browserAction ='),source.indexOf('  useEffect(() => {',source.indexOf('const browserAction ='))).replace('(action: () => Promise<void>, success?: string)','(action, success)');
 return new Function('attached','mountEpoch','append','setNotice','browserAxp',declaration+'return browserAction')({current:true},{current:1},(m:string)=>messages.push(m),(m:string)=>notices.push(m),app) as (action:()=>Promise<void>,success?:string)=>void;
}

test('independent: actual browserAction suppresses old cleanup success after new selection',async()=>{
 const f=hostFixture();await f.app.choose(gate());const messages:string[]=[];const notices:string[]=[];const action=actualBrowserAction(f.app,messages,notices);let newer:Promise<void>|null=null;let started=false;
 f.app.observe(()=>{if(!started&&!f.app.held&&!f.app.snapshot().cleaning){started=true;newer=f.app.choose(gate())}});
 action(()=>f.app.cancel(),'old cleanup completed');await turn();await newer;assert.deepEqual(messages,[]);assert.ok(f.app.held);assert.equal(f.manager.snapshot().state,'selected');await f.app.cancel();
});

test('independent: actual generic simulator connect rejects selected, pending and poisoned browser owners',async()=>{
 const source=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');const definition=source.slice(source.indexOf('  async function connect('),source.indexOf('  async function disconnect(')).replace('(transport: ByteTransport)','(transport)').replaceAll('next.info!', 'next.info');
 for(const state of ['selected','picker','poison']){
  const f=hostFixture();let raw:ReturnType<typeof pending<WebAxpDevice>>|undefined;let picking:Promise<unknown>|undefined;
  if(state==='picker'){raw=pending<WebAxpDevice>();f.setPick(raw.promise);picking=assert.rejects(f.app.choose(gate()))}else await f.app.choose(gate());
  if(state==='poison'){await f.app.connect(gate());f.setDisconnect(false);await assert.rejects(f.app.cancel())}
  const connect=new Function('browserAxp',stripTypeScriptTypes(definition)+'return connect')(f.app);const before=[...f.calls];await assert.rejects(connect(new SimulatorTransport()),/browser AXP ownership/);assert.deepEqual(f.calls,before);
  if(raw){await assert.rejects(f.app.cancel());raw.resolve(f.device);await picking;await turn();await f.app.cancel(true)}else {f.setDisconnect(true);await f.app.cancel(state==='poison')}
 }
});
