// Independent execution of exact production handlers; host-only, not mounted React.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import React from 'react';
import {stripTypeScriptTypes} from 'node:module';
import {DeviceSession} from '../packages/core/session.ts';
import {SimulatorTransport} from '../packages/core/simulator.ts';
import {clearReleasedSession} from '../src/session-controls.ts';
const source=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
const turn=()=>new Promise<void>(r=>setImmediate(r));
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};}
function harness(observer:(name:string,value:any)=>void=()=>{},browserAxp:any=null){
 const writes:any[]=[];const setter=(name:string)=>(value?:any)=>{writes.push([name,value]);observer(name,value);};
 const env={nativeBackground:{current:null as any},setNativeBackgroundPending:()=>{},foreground:{current:true},AppState:{currentState:'active'},browserAxp,attached:{current:true},mountEpoch:{current:1},lock:{current:false},operation:{current:null as object|null},session:{current:null as DeviceSession|null},disconnectListener:{current:null as (()=>void)|null},acquisition:{current:null as any},setAcquisitionView:setter('view'),refreshAcquisition:setter('refresh'),captureBusy:{current:false},serviceDataBusy:{current:false},serviceDataUncertain:{current:false},observationBusy:{current:false},observationUncertain:{current:false},setBusy:setter('busy'),setNotice:setter('notice'),append:setter('append'),clearSession:setter('clear'),setIdentity:setter('identity'),setSource:setter('source'),setCaps:setter('caps'),DeviceSession,clearReleasedSession};
 const code=source.slice(source.indexOf('  async function run('),source.indexOf('  const runForeground'))+source.slice(source.indexOf('  async function connect('),source.indexOf('  async function resetBluetooth('));
 const methods=new Function(...Object.keys(env),stripTypeScriptTypes(code)+';return {run,connect,disconnect,cancelAcquisition};')(...Object.values(env));
 return {...methods,env,writes};
}
function transport(){const peer=new SimulatorTransport();const calls:string[]=[];let close:Promise<void>|null=null;const value={source:'usb' as const,connect:async()=>{calls.push('connect');await peer.connect();},disconnect:async()=>{calls.push('disconnect');if(close)await close;await peer.disconnect();},write:(b:Uint8Array)=>peer.write(b),onData:peer.onData.bind(peer),onDisconnect:peer.onDisconnect.bind(peer)};return {value,calls,delayClose(p:Promise<void>){close=p;}};}

test('independent: cancellation accepted in successful-open finalization must drain cleanup before releasing run',async()=>{
 const closing=deferred();const t=transport();t.delayClose(closing.promise);let requested=false;let attempt:any;
 const h=harness((name,value)=>{if(name==='append'&&String(value).startsWith('Connected:')){attempt=h.env.acquisition.current;queueMicrotask(()=>{h.cancelAcquisition(attempt);requested=true;});}});
 const work=h.run(()=>h.connect(t.value));await turn();
 try{assert.ok(requested);if(attempt.cancelled){assert.equal(h.env.session.current?.state,'closed');assert.equal(h.env.lock.current,true,'run must retain lock across cancellation cleanup');assert.notEqual(h.env.acquisition.current,null);}else{assert.equal(h.env.session.current?.state,'open');assert.equal(h.env.acquisition.current,null);assert.deepEqual(t.calls,['connect']);}}finally{closing.resolve();await work;await h.env.session.current?.close();}
});

test('independent: reentrant cancellation before previous close dispatch cannot acquire a replacement',async()=>{
 const closing=deferred();const t=transport();const previous=new DeviceSession(t.value);await previous.open();t.delayClose(closing.promise);
 const next=transport();const h=harness((name,value)=>{if(name==='view'&&value)h.cancelAcquisition(value);});h.env.session.current=previous;
 const work=h.run(()=>h.connect(next.value));await turn();assert.equal(h.env.lock.current,true);assert.deepEqual(next.calls,[]);closing.resolve();await work;assert.deepEqual(next.calls,[]);assert.equal(h.env.session.current,null);
});

test('independent: browser-backed simulator never publishes native cancellation handle',async()=>{
 const h=harness(()=>{},{refresh(){},owns(){return false;}});const t=transport();await h.run(()=>h.connect(t.value));assert.equal(h.env.session.current?.state,'open');assert.equal(h.env.acquisition.current,null);assert.equal(h.writes.some(([n]:any[])=>n==='view'),false);await h.run(h.disconnect);
});


test('independent: actual global TSX cancel control is enabled while busy on every tab, disabled after request and absent for browser ownership',()=>{
 const start=source.indexOf('        {!browserAxp && acquisitionView && <View');
 const end=source.indexOf("        {tab === 'Console'",start);
 assert.ok(start>source.indexOf('<ScrollView'));assert.ok(end>start);
 const fragment=source.slice(start,end);assert.doesNotMatch(fragment,/tab ===/);
 const tmp=mkdtempSync(join(tmpdir(),'apex-cancel-render-'));
 try{
  writeFileSync(join(tmp,'view.tsx'),`function render(React, View, Label, Text, Button, styles, browserAxp, acquisitionView, cancelAcquisition, busy, tab) { return (<>${fragment}</>); }`);
  execFileSync(process.execPath,[fileURLToPath(new URL('bin/tsc',import.meta.resolve('typescript/package.json'))),'--ignoreConfig','--noCheck','--jsx','react','--target','es2022','--module','esnext','--outDir',join(tmp,'out'),join(tmp,'view.tsx')],{stdio:'pipe'});
  const render=new Function(readFileSync(join(tmp,'out/view.js'),'utf8')+';return render;')();
  const styles={card:{},description:{}};const selected={cancelled:false};const calls:any[]=[];
  function tree(browser:any,attempt:any,tab:string){return render(React,'View','Label','Text','Button',styles,browser,attempt,(v:any)=>calls.push(v),true,tab);}
  function buttons(node:any):any[]{if(!node||typeof node!=='object')return [];return [...(node.type==='Button'?[node]:[]),...React.Children.toArray(node.props?.children).flatMap(buttons)];}
  for(const tab of ['Console','Devices','Analysis','Evidence','Research']){
   const control=buttons(tree(null,selected,tab));assert.equal(control.length,1);assert.equal(control[0].props.disabled,false);assert.equal(control[0].props.title,'Cancel connection attempt');control[0].props.onPress();assert.equal(calls.at(-1),selected);
  }
  selected.cancelled=true;const cancelled=buttons(tree(null,selected,'Devices'))[0];assert.equal(cancelled.props.disabled,true);assert.match(cancelled.props.title,/waiting for cleanup/);
  assert.equal(buttons(tree({},selected,'Devices')).length,0);assert.equal(buttons(tree(null,null,'Console')).length,0);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
