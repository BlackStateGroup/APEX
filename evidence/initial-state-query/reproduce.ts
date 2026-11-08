// Standalone process intentionally observes unhandledRejection; never a phone test.
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { environment, verifyInstalled, hooks } from '../../tests/plx-facade-host/loader.ts';
const turn = () => new Promise<void>(r => setImmediate(r));
const turns = async () => { for (let i=0;i<12;i++) await turn(); };
verifyInstalled();
const reports: any[] = [];
for (const mode of ['reject-timeout', 'abort-then-reject', 'event-then-reject', 'abort-destroy-then-reject', 'sync-state-throw', 'owned-query-reject', 'owned-query-remove-then-reject']) {
  const id = `query-${mode}`, events: string[] = [], unhandled: any[] = [];
  const original = new Error(JSON.stringify({errorCode: 101, reason: 'synthetic state fault', androidErrorCode: 73}));
  let rejectState!: (e: unknown) => void;
  const raw = new Promise<string>((_, reject) => { rejectState = reject; });
  const listeners = new Set<(state: string) => void>();
  const listener = (e: any) => unhandled.push(e);
  process.on('unhandledRejection', listener);
  const bridge = {StateChangeEvent:'state', DisconnectionEvent:'disconnect', createClient(){events.push('create');},
    state(){events.push('state'); if(mode==='sync-state-throw') throw original; return raw;},
    async isDeviceConnected(){return false;}, connectToDevice(){events.push('connect'); return new Promise(()=>{});},
    async destroyClient(){events.push('destroy');}, async stopDeviceScan(){events.push('stop');}};
  class Emitter { addListener(name: string, cb: (state: string)=>void){
    if(name==='state'){listeners.add(cb); events.push('listen');}
    return {remove(){if(name==='state'){events.push('remove');listeners.delete(cb);}}};
  }}
  environment(id,{NativeModules:{BlePlx:bridge},NativeEventEmitter:Emitter,Platform:{OS:'android',Version:34},AppState:{currentState:'active'},
    PermissionsAndroid:{PERMISSIONS:{BLUETOOTH_SCAN:'scan',BLUETOOTH_CONNECT:'connect'},RESULTS:{GRANTED:'granted'},async requestMultiple(){return {scan:'granted',connect:'granted'};}}});
  const {BleManager}=await import(`../readiness-cleanup/sdk-owner.ts?plx-case=${id}`);
  const manager=new BleManager();
  if(mode.startsWith('owned-query')) {
    let caught: any;
    const sub=manager.onStateChange(()=>events.push('callback'),false);
    assert.deepEqual(events,['create','listen']);
    const query=manager.state();
    void query.then(()=>events.push('query-success'),(e:any)=>{caught=e;events.push('query-error');});
    if(mode==='owned-query-remove-then-reject')sub.remove();
    const pendingBefore=Object.keys(manager._activePromises).length;
    rejectState(original);await turns();
    if(mode==='owned-query-reject')sub.remove();
    assert.equal(unhandled.length,0);assert.equal(caught.errorCode,101);assert.notEqual(caught,original);
    reports.push({mode,events,pendingBefore,unhandled:unhandled.length,error:{name:caught.name,message:caught.message,reason:caught.reason,errorCode:caught.errorCode},errorIsNativeOriginal:caught===original,pendingAfter:Object.keys(manager._activePromises).length});
  } else {
    const native=await import(`../../src/platform/bluetooth.native.ts?plx-case=${id}`);
    const controller=new AbortController(),attempt={};let outcome='pending',error:any;
    const opening=native.bleDriver.connect('AXP',controller.signal,attempt);
    void opening.then(()=>{outcome='resolved';},(e:any)=>{outcome='rejected';error=e;});
    await turns();
    const pendingBefore=Object.keys(manager._activePromises).length;
    if(mode==='abort-then-reject' || mode==='abort-destroy-then-reject')controller.abort();
    if(mode==='event-then-reject')for(const cb of [...listeners])cb('PoweredOff');
    await turns();
    const beforeRawReject={outcome,ownership:native.accessoryConnectionOwnership(),listeners:listeners.size,pendingSdk:Object.keys(manager._activePromises).length};
    if(mode==='abort-destroy-then-reject'){await native.shutdownBluetooth();await turns();}
    if(mode!=='sync-state-throw')rejectState(original);
    await turns();
    const afterFailure={outcome,ownership:native.accessoryConnectionOwnership(),listeners:listeners.size,sdkSubscriptions:Object.keys(manager._activeSubscriptions).length,pendingSdk:Object.keys(manager._activePromises).length};
    if(mode==='reject-timeout') {assert.equal(outcome,'pending');await opening.catch(()=>{});}
    assert.equal(outcome,'rejected');assert.equal(events.includes('connect'),false);
    assert.equal(native.bleDriver.consumeUnissuedConnection(attempt,'AXP',error),false);
    if(mode==='sync-state-throw'){assert.equal(error,original);assert.equal(unhandled.length,0);assert.equal(afterFailure.ownership,'unknown');assert.equal(listeners.size,1);}
    else {assert.equal(unhandled.length,1);assert.notEqual(unhandled[0],original);assert.equal(unhandled[0].errorCode,0);assert.equal(native.accessoryConnectionOwnership(),'idle');assert.equal(listeners.size,0);}
    reports.push({mode,events,pendingBefore,beforeRawReject,afterFailure,final:{outcome,ownership:native.accessoryConnectionOwnership(),listeners:listeners.size,error:{name:error?.name,message:error?.message},errorIsNativeOriginal:error===original},unhandled:unhandled.map(e=>({name:e.name,message:e.message,reason:e.reason,errorCode:e.errorCode,isNativeOriginal:e===original,isAdapterRejection:e===error})),receipt:false});
  }
  process.removeListener('unhandledRejection',listener);
}
verifyInstalled();hooks.deregister();
const inputs=Object.fromEntries(['src/platform/bluetooth.native.ts','node_modules/react-native-ble-plx/lib/module/BleManager.js','node_modules/react-native-ble-plx/lib/module/BleError.js'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const result={sourceCommit:'deb5f27a8a0781f518479c1e84aee26e316a29df',scope:'Exact unchanged installed PLX 3.5.1 ESM and exact adapter. Synthetic RN/native failures; real Node ten-second readiness timer; no device evidence. Owned-query modes are SDK API probes, not adapter corrections.',inputs,reports};
writeFileSync('evidence/initial-state-query/results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
