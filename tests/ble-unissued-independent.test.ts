/** Independent host-only installed PLX facade review. No native SDK or radio. */
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {environment, hooks, verifyInstalled, loaded} from './plx-facade-host/loader.ts';
import {BleTransport,AXP_WRITE,AXP_NOTIFY} from '../packages/core/ble-transport.ts';
verifyInstalled(); after(()=>{verifyInstalled(); hooks.deregister();});
let serial=10000;
const tick=()=>new Promise<void>(r=>setImmediate(r));
function gate(){let resolve!:(v:any)=>void,reject!:(v:any)=>void;const promise=new Promise<any>((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
async function fixture(options: {createFailure?: boolean; state?: string; connectFailure?: boolean; stopGate?: Promise<void>} = {}){
 const id=String(++serial),events:string[]=[], permission=gate();let grants:any=permission.promise;
 const bus=new Map<string,Set<Function>>();
 class Emitter{addListener(name:string,cb:Function){const set=bus.get(name)??new Set();bus.set(name,set);set.add(cb);return {remove(){set.delete(cb)}}}}
 const device={id:'A',mtu:23};
 const module={ScanEvent:'ScanEvent',async startDeviceScan(){events.push('scan-start')},async stopDeviceScan(){events.push('scan-stop');await options.stopGate},StateChangeEvent:'StateChangeEvent',DisconnectionEvent:'DisconnectionEvent',ReadEvent:'ReadEvent',
 createClient(){events.push('create');if(options.createFailure)throw Error('partial construction')},async state(){events.push('state');return options.state ?? 'PoweredOn'},
 async isDeviceConnected(){return false},async connectToDevice(){events.push('connect');if(options.connectFailure)throw Error(JSON.stringify({errorCode:201,reason:'issued connect failure'}));return device},async discoverAllServicesAndCharacteristicsForDevice(){return device},async requestMTUForDevice(){return device},
 async servicesForDevice(){return []},async characteristicsForDevice(){return [{uuid:AXP_WRITE,isWritableWithResponse:true},{uuid:AXP_NOTIFY,isNotifiable:true}]},
 async cancelDeviceConnection(){events.push('cancel');return device},async destroyClient(){events.push('destroy')}};
 environment(id,{NativeModules:{BlePlx:module},NativeEventEmitter:Emitter,Platform:{OS:'android',Version:34},AppState:{currentState:'active'},PermissionsAndroid:{PERMISSIONS:{BLUETOOTH_SCAN:'scan',BLUETOOTH_CONNECT:'connect'},RESULTS:{GRANTED:'granted',DENIED:'denied',NEVER_ASK_AGAIN:'never_ask_again'},requestMultiple(){events.push('permission');return grants}}});
 const native=await import(`../src/platform/bluetooth.native.ts?plx-case=${id}`);
 return {native,events,permission,setGrants(value:any){grants=value},transport:new BleTransport(native.bleDriver,'A')};
}
for(const mode of ['deny','never-ask','cancel'])test(`installed PLX normal ${mode} releases and permits fresh real-facade connection`,async()=>{
 const x=await fixture();const opening=x.transport.connect().catch((e:unknown)=>e);await tick();
 const closing=mode==='cancel'?x.transport.disconnect():undefined;
 x.permission.resolve({scan:mode==='deny'?'denied':mode==='never-ask'?'never_ask_again':'granted',connect:'granted'});
 assert.ok(await opening instanceof Error);await closing;await x.transport.disconnect();assert.deepEqual(x.events,['permission']);
 x.setGrants({scan:'granted',connect:'granted'});const connection=await x.native.bleDriver.connect('A');assert.ok(x.events.includes('create'));assert.ok(x.events.includes('connect'));await connection.disconnect();await x.native.shutdownBluetooth();assert.ok(loaded.size>0);
});
const malformed: [string,()=>any][]=[['proxy-descriptor-throw',()=>new Proxy({scan:'denied',connect:'granted'},{getOwnPropertyDescriptor(){throw Error('descriptor')}})],['proxy-prototype-throw',()=>new Proxy({scan:'denied',connect:'granted'},{getPrototypeOf(){throw Error('prototype')}})],['missing',()=>({})],['unknown',()=>({scan:'unexpected',connect:'granted'})],['partial',()=>({scan:'denied'})],['inherited',()=>Object.create({scan:'denied',connect:'granted'})],['accessor',()=>({get scan(){return 'denied'},connect:'granted'})],['later-getter',()=>({scan:'denied',get connect(){throw Error('getter')}})],['array',()=>Object.assign([],{scan:'denied',connect:'granted'})]];
for(const [name,build] of malformed)test(`malformed permission ${name} must never certify`,async()=>{
 const x=await fixture();const token=Object.freeze({});const opening=x.native.bleDriver.connect('A',undefined,token).catch((e:unknown)=>e);await tick();x.permission.resolve(build());const error=await opening;assert.ok(error instanceof Error);assert.equal(x.native.bleDriver.consumeUnissuedConnection!(token,'A',error),false);assert.deepEqual(x.events,['permission']);
});
test('unexpected permission rejection keeps exact identity and transport hold',async()=>{const x=await fixture();const reason={name:'AbortError',released:true};const opening=x.transport.connect().catch((e:unknown)=>e);await tick();x.permission.reject(reason);assert.equal(await opening,reason);await assert.rejects(x.transport.disconnect(),/unknown/);assert.deepEqual(x.events,['permission']);});
test('duplicate token cannot restore first pending receipt through late continuation',async()=>{const x=await fixture();const token={};const first=x.native.bleDriver.connect('A',undefined,token).catch((e:unknown)=>e);await tick();const abort=new AbortController();abort.abort();const second=await x.native.bleDriver.connect('A',abort.signal,token).catch((e:unknown)=>e);assert.equal(x.native.bleDriver.consumeUnissuedConnection!(token,'A',second),false);assert.equal(x.native.accessoryConnectionOwnership(),'owned');x.permission.resolve({scan:'denied',connect:'granted'});const error=await first;assert.equal(x.native.bleDriver.consumeUnissuedConnection!(token,'A',error),false);});

for(const phase of ['construction','readiness','issued'] as const)test(`installed PLX ${phase} rejection cannot certify`,async()=>{const x=await fixture(phase==='construction'?{createFailure:true}:phase==='readiness'?{state:'PoweredOff'}:{connectFailure:true});const opening=x.transport.connect().catch((e:unknown)=>e);await tick();x.permission.resolve({scan:'granted',connect:'granted'});assert.ok(await opening instanceof Error);await assert.rejects(x.transport.disconnect(),/unknown/);assert.equal(x.events.includes('connect'),phase==='issued');if(phase==='construction')await assert.rejects(x.native.shutdownBluetooth(),/construction state unknown/);});

test('installed PLX held raw scan stop stays fenced before and after late settlement',async()=>{const stop=gate();const x=await fixture({stopGate:stop.promise});x.setGrants({scan:'granted',connect:'granted'});await x.native.scanAccessories(()=>{},()=>{});await tick();assert.ok(x.events.includes('scan-start'));x.setGrants({scan:'denied',connect:'granted'});const rejection=await x.transport.connect().catch((e:unknown)=>e);assert.match(String(rejection),/did not settle/);await assert.rejects(x.transport.disconnect(),/unknown/);await assert.rejects(x.native.shutdownBluetooth(),/busy/);assert.equal(x.events.includes('connect'),false);stop.resolve(undefined);await tick();await assert.rejects(x.transport.disconnect(),/unknown/);await assert.rejects(x.native.bleDriver.connect('B'),/unknown/);});
