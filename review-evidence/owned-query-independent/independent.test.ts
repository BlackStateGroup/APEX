import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { environment, verifyInstalled, hooks } from '../../tests/plx-facade-host/loader.ts';
import { AXP_SERVICE, AXP_WRITE, AXP_NOTIFY } from '../../packages/core/ble-transport.ts';
const tick = () => new Promise<void>(r => setImmediate(r));
const turns = async () => { for(let i=0;i<12;i++) await tick(); };
verifyInstalled(); after(() => {verifyInstalled(); hooks.deregister();});
let serial=0;
async function fixture(options: {noManager?:boolean, queryThrow?: {value: unknown}, permission?: Promise<Record<string,string>>, remove?:()=>void, register?:(cb:(s:string)=>void)=>void}={}) {
 const id=`query-independent-${++serial}`, events:string[]=[], listeners=new Set<(state:string)=>void>();
 let resolve!:(s:string)=>void, reject!:(e:unknown)=>void;
 let raw=new Promise<string>((r,j)=>{resolve=r;reject=j;});
 const device={id:'AXP',mtu:23};
 const bridge={StateChangeEvent:'state',DisconnectionEvent:'disconnect',createClient(){events.push('create');},
 state(){events.push('state');if(options.queryThrow)throw options.queryThrow.value;return raw;},
 async isDeviceConnected(){return false;}, async connectToDevice(id:string){events.push('connect:'+id);return {...device,id};},
 async discoverAllServicesAndCharacteristicsForDevice(){return device;},async requestMTUForDevice(){return device;},
 async servicesForDevice(){return [{id:1,uuid:AXP_SERVICE,deviceID:'AXP',isPrimary:true}];},
 async characteristicsForDevice(){return [{uuid:AXP_WRITE,isWritableWithResponse:true},{uuid:AXP_NOTIFY,isNotifiable:true}];},
 async cancelDeviceConnection(){events.push('cancel');return device;},async destroyClient(){events.push('destroy');},
 async writeCharacteristicForDevice(){events.push('write');return {};},async stopDeviceScan(){events.push('stop');},async startDeviceScan(){events.push('scan');}};
 class Emitter{addListener(name:string,cb:(s:string)=>void){if(name==='state'){listeners.add(cb);options.register?.(cb);}return {remove(){if(name==='state'){events.push('remove');options.remove?.();listeners.delete(cb);}}};}}
 environment(id,{NativeModules:{BlePlx:bridge},NativeEventEmitter:Emitter,Platform:{OS:'android',Version:34},AppState:{currentState:'active',addEventListener(){return {remove(){}};}},PermissionsAndroid:{PERMISSIONS:{BLUETOOTH_SCAN:'scan',BLUETOOTH_CONNECT:'connect'},RESULTS:{GRANTED:'granted'},async requestMultiple(){events.push('permissions');return options.permission??{scan:'granted',connect:'granted'};}}});
 const {BleManager}=await import(`../../evidence/readiness-cleanup/sdk-owner.ts?plx-case=${id}`);
 const manager=options.noManager?undefined:new BleManager(); let sdkError:unknown;
 const originalState=manager?.state.bind(manager);
 if(manager) manager.state=()=>{const p=originalState();void p.then(()=>{},(e:unknown)=>{sdkError=e;});return p;};
 const native=await import(`../../src/platform/bluetooth.native.ts?plx-case=${id}`);
 const emit=(s:string)=>{for(const cb of [...listeners])cb(s);};
 return {native,manager,events,listeners,emit,resolve:(s:string)=>resolve(s),reject:(e:unknown)=>reject(e),nextQuery(){raw=new Promise<string>((r,j)=>{resolve=r;reject=j;});},sdkError:()=>sdkError};
}
function open(x:Awaited<ReturnType<typeof fixture>>,signal?:AbortSignal,id='AXP'){
 const attempt={};let result:any={status:'pending'};const promise=x.native.bleDriver.connect(id,signal,attempt);
 void promise.then((connection:any)=>{result={status:'resolved',connection};},(error:unknown)=>{result={status:'rejected',error};});
 return {promise,attempt,result:()=>result};
}
const fault=()=>new Error(JSON.stringify({errorCode:101,reason:'independent raw query failure',androidErrorCode:73}));
async function blocked(x:Awaited<ReturnType<typeof fixture>>){
 await assert.rejects(x.native.shutdownBluetooth());
 await assert.rejects(x.native.bleDriver.connect('OTHER'));
 assert.throws(()=>x.native.startSelectedServiceDataObservation({service:'FCD2',receiptClock:()=>''}));
 await assert.rejects(x.native.scanAccessories(()=>{},()=>{}));
 assert.equal(x.events.includes('destroy'),false);assert.equal(x.events.includes('connect:OTHER'),false);
}
test('query rejection retains exactly one SDK conversion and error identity',async()=>{
 const x=await fixture(),o=open(x);await turns();x.reject(fault());await turns();
 assert.equal(o.result().status,'rejected');assert.equal(o.result().error,x.sdkError());assert.equal(o.result().error.errorCode,101);
 assert.equal(x.listeners.size,0);assert.equal(x.native.accessoryConnectionOwnership(),'idle');
 assert.equal(x.native.bleDriver.consumeUnissuedConnection(o.attempt,'AXP',o.result().error),false);await x.native.shutdownBluetooth();
});
for(const outcome of ['resolve','reject'] as const) for(const first of ['abort','PoweredOff'] as const) test(`${first} stays responsive and fences until late ${outcome}`,async()=>{
 const x=await fixture(),a=new AbortController(),o=open(x,a.signal);await turns();
 if(first==='abort')a.abort();else x.emit(first);await turns();const error=o.result().error;
 assert.equal(o.result().status,'rejected');assert.equal(x.listeners.size,0);assert.equal(x.native.accessoryConnectionOwnership(),'owned');await blocked(x);
 if(outcome==='resolve')x.resolve('PoweredOn');else x.reject(fault());await turns();
 assert.equal(o.result().error,error);assert.equal(x.native.accessoryConnectionOwnership(),'idle');assert.equal(x.events.includes('connect:AXP'),false);
 assert.equal(x.native.bleDriver.consumeUnissuedConnection(o.attempt,'AXP',error),false);await x.native.shutdownBluetooth();
});
for(const outcome of ['resolve','reject'] as const)test(`ready event waits for ${outcome} and late query failure cannot replace success`,async()=>{
 const x=await fixture(),o=open(x);await turns();x.emit('PoweredOn');await turns();assert.equal(o.result().status,'pending');await blocked(x);
 if(outcome==='resolve')x.resolve('PoweredOff');else x.reject(fault());await turns();
 assert.equal(o.result().status,'resolved');await o.result().connection.disconnect();await x.native.shutdownBluetooth();
});
test('ready decision may still be vetoed by cancellation during query drainage',async()=>{
 const x=await fixture(),a=new AbortController(),o=open(x,a.signal);await turns();x.emit('PoweredOn');await turns();a.abort();await turns();
 assert.equal(o.result().status,'rejected');assert.match(o.result().error.message,/cancelled/);await blocked(x);x.reject(fault());await turns();assert.equal(x.events.includes('connect:AXP'),false);await x.native.shutdownBluetooth();
});
for(const state of ['Resetting','Unknown'])test(`${state} invalidates stale initial PoweredOn`,async()=>{
 const x=await fixture(),o=open(x);await turns();x.emit(state);x.resolve('PoweredOn');await turns();assert.equal(o.result().status,'pending');assert.equal(x.events.includes('connect:AXP'),false);
 x.emit('PoweredOff');await turns();assert.equal(o.result().status,'rejected');await x.native.shutdownBluetooth();
});
for(const value of [undefined,null,false,0,'',new Error('sync')])test(`synchronous raw query throw ${String(value)} is exact and separately latched`,async()=>{
 const x=await fixture({queryThrow:{value}}),o=open(x);await turns();assert.equal(o.result().status,'rejected');assert.equal(o.result().error,value);assert.equal(x.listeners.size,0);
 assert.equal(x.native.accessoryConnectionOwnership(),'unknown');await assert.rejects(x.native.shutdownBluetooth(),e=>!/readiness cleanup unknown/.test(String(e)));assert.equal(x.events.includes('destroy'),false);
});
test('cancelled scanner permission may reset before permission returns without later acquisition',async()=>{
 let release!:(v:Record<string,string>)=>void;const permission=new Promise<Record<string,string>>(r=>{release=r;});
 const x=await fixture({permission,noManager:true});const scan=x.native.startForegroundObservation({serviceUuid:'FCD2',receiptClock:()=>'',onObservation(){},onEnd(){}});
 await turns();await scan.stop();await x.native.shutdownBluetooth();release({scan:'granted',connect:'granted'});await turns();
 assert.equal(x.events.filter(e=>e==='state').length,0);assert.equal(x.events.filter(e=>e==='scan').length,0);assert.equal(x.events.includes('create'),false);
});
test('normal denial is recoverable and keeps only permission receipt',async()=>{
 const x=await fixture({permission:Promise.resolve({scan:'denied',connect:'granted'})}),o=open(x);await turns();assert.equal(o.result().status,'rejected');
 assert.equal(x.native.bleDriver.consumeUnissuedConnection(o.attempt,'AXP',o.result().error),true);assert.equal(x.events.includes('state'),false);await x.native.shutdownBluetooth();
});
test('existing owned connection writes and cancellation remain possible during a new pending query',async()=>{
 const x=await fixture(),first=open(x);await turns();x.resolve('PoweredOn');await turns();assert.equal(first.result().status,'resolved');
 x.nextQuery();const a=new AbortController(),second=open(x,a.signal,'OTHER');await turns();
 await first.result().connection.writeWithResponse(new Uint8Array([1]));await first.result().connection.disconnect();
 assert.ok(x.events.includes('write'));assert.ok(x.events.includes('cancel'));a.abort();await turns();await blocked(x);x.reject(fault());await turns();await x.native.shutdownBluetooth();
});
test('query callback observed first locks success despite later PoweredOff',async()=>{
 const x=await fixture(),o=open(x);await turns();x.resolve('PoweredOn');await turns();x.emit('PoweredOff');await turns();assert.equal(o.result().status,'resolved');await o.result().connection.disconnect();await x.native.shutdownBluetooth();
});
test('raw fulfillment is not observed before a synchronous newer event',async()=>{
 const x=await fixture(),o=open(x);await turns();x.resolve('PoweredOn');x.emit('PoweredOff');await turns();assert.equal(o.result().status,'rejected');assert.match(o.result().error.message,/poweredoff/);await x.native.shutdownBluetooth();
});
test('late drain cannot clear simultaneous remove uncertainty',async()=>{
 const cleanup=new Error('independent remove failure');const x=await fixture({remove(){throw cleanup;}}),a=new AbortController(),o=open(x,a.signal);await turns();a.abort();await turns();assert.equal(o.result().status,'rejected');assert.ok(o.result().error instanceof AggregateError);assert.equal(o.result().error.errors[1],cleanup);
 x.reject(fault());await turns();assert.equal(x.native.accessoryConnectionOwnership(),'unknown');await assert.rejects(x.native.shutdownBluetooth(),/readiness cleanup unknown/);assert.equal(x.events.filter(e=>e==='remove').length,1);
});
test('ordinary scan stop stays responsive but query prevents reset and replacement',async()=>{
 const x=await fixture();const scan=x.native.startForegroundObservation({serviceUuid:'FCD2',receiptClock:()=>'',onObservation(){},onEnd(){}});await turns();await scan.stop();await turns();await blocked(x);assert.equal(x.native.accessoryConnectionOwnership(),'owned');x.resolve('PoweredOn');await turns();assert.equal(x.events.includes('scan'),false);await x.native.shutdownBluetooth();
});
test('exclusive failed acquisition cannot destroy while query remains pending',async()=>{
 const x=await fixture();const session=x.native.startSelectedServiceDataObservation({service:'FCD2',receiptClock:()=>''});await turns();await session.stop('stopped');await turns();await assert.rejects(x.native.shutdownBluetooth());assert.equal(x.events.includes('destroy'),false);x.reject(fault());await turns();await x.native.shutdownBluetooth();assert.equal(x.events.filter(e=>e==='destroy').length,1);
});
test('real readiness deadline vetoes ready event without forgetting hung query',async()=>{
 const x=await fixture(),o=open(x);await turns();x.emit('PoweredOn');await o.promise.catch(()=>{});assert.equal(o.result().status,'rejected');assert.match(o.result().error.message,/did not become ready/);assert.equal(x.native.accessoryConnectionOwnership(),'owned');await blocked(x);x.reject(fault());await turns();assert.equal(x.events.includes('connect:AXP'),false);await x.native.shutdownBluetooth();
});
test('alternate-contract synchronous abort before terminal callback keeps first preparation veto',async()=>{
 const x=await fixture(),a=new AbortController();
 x.manager.onStateChange=(callback:(s:string)=>void)=>{a.abort();callback('PoweredOff');return {remove(){x.events.push('remove');}};};
 const o=open(x,a.signal);await turns();assert.equal(o.result().status,'rejected');assert.match(o.result().error.message,/cancelled/);assert.equal(x.events.includes('state'),false);await x.native.shutdownBluetooth();
});

for (const states of [['abort','PoweredOff'],['PoweredOff','abort'],['PoweredOn','abort']] as const) test('installed SDK synchronous emitter registration order '+states.join(' then '),async()=>{
 const a=new AbortController();const x=await fixture({register(callback){for(const state of states){if(state==='abort')a.abort();else callback(state);}}});
 const o=open(x,a.signal);await turns();assert.equal(o.result().status,'rejected');assert.match(o.result().error.message,states[0]==='PoweredOff'?/poweredoff/:/cancelled/);assert.equal(x.events.includes('state'),false);assert.equal(x.listeners.size,0);await x.native.shutdownBluetooth();
});

test('live connection permission remains reserved while shutdown is refused',async()=>{
 let release!:(v:Record<string,string>)=>void;const permission=new Promise<Record<string,string>>(r=>{release=r;});
 const x=await fixture({permission,noManager:true}),a=new AbortController(),o=open(x,a.signal);await turns();await assert.rejects(x.native.shutdownBluetooth(),/busy/);assert.equal(x.events.includes('create'),false);a.abort();release({scan:'granted',connect:'granted'});await turns();assert.equal(o.result().status,'rejected');assert.equal(x.events.includes('create'),false);await x.native.shutdownBluetooth();
});

// These execute extracted real App handlers, not mounted React or a phone UI.
for(const terminal of ['cancel','reject'] as const)test(`App and DeviceSession keep uncertain selected transport after query ${terminal}`,async()=>{
 const {harness}=await import('../../tests/support/app-acquisition.ts');
 const {BleTransport}=await import('../../packages/core/ble-transport.ts');
 const x=await fixture(),h=harness(),transport=new BleTransport(x.native.bleDriver,'AXP',{timeoutMs:1500});
 const work=h.run(()=>h.connect(transport));await turns();const selected=h.env.session.current!;const attempt=h.env.acquisition.current;
 assert.ok(selected);assert.equal(x.events.filter(e=>e==='state').length,1);
 if(terminal==='cancel')h.cancelAcquisition!(attempt);else x.reject(fault());
 await work;await turns();assert.equal(h.env.lock.current,false);assert.equal(h.env.acquisition.current,null);
 assert.equal(selected.state,'closed');assert.equal(selected.transportReleasePending,true);assert.equal(h.env.session.current,selected);
 assert.equal(h.writes.some(value=>String(value).includes('Connected:')),false);assert.equal(x.events.some(e=>e.startsWith('connect:')),false);
 if(terminal==='cancel'){assert.equal(x.native.accessoryConnectionOwnership(),'owned');await assert.rejects(x.native.shutdownBluetooth());x.reject(fault());await turns();}
 assert.equal(x.native.accessoryConnectionOwnership(),'idle');assert.equal(selected.transportReleasePending,true);assert.equal(h.env.session.current,selected);
 h.cancelAcquisition!(attempt);await h.run(h.disconnect);assert.equal(h.env.session.current,selected);assert.equal(x.events.some(e=>e.startsWith('connect:')),false);await x.native.shutdownBluetooth();
});
