/** Independent actual-native-TSX lifecycle regression review; mocked OS, not device acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IqController } from '../src/iq-workbench.ts';
import type { IqPair } from '../src/iq-workbench.ts';
import { pair, deferred, nodeDigest } from './iq-app-review-fixture.ts';
import type { NativeIqPickResult } from '../src/native-iq-files.ts';
const root=new URL('../',import.meta.url),url=new URL('src/platform/iq-input.native.tsx',root).href;
const output=mkdtempSync(join(tmpdir(),'native-iq-tsx-'));
execFileSync(process.execPath,[fileURLToPath(new URL('bin/tsc',import.meta.resolve('typescript/package.json'))),'--ignoreConfig','--noCheck','--jsx','react','--target','es2022','--module','esnext','--outDir',output,'--rootDir','.','src/platform/iq-input.native.tsx'],{cwd:fileURLToPath(root),stdio:'pipe'});
let slots:any[]=[],effects:{deps:any[];cleanup?:()=>void}[]=[],queue:(()=>void)[]=[],si=0,ei=0;
const listeners=new Set<(state:string)=>void>();
const AppState={currentState:'active',addEventListener(_event:string,callback:(state:string)=>void){listeners.add(callback);return {remove(){listeners.delete(callback);}};}};
const mockReact={...React,
 useState(init:any){const i=si++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return[slots[i],(value:any)=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
 useLayoutEffect(action:()=>void|(()=>void),deps:any[]){const i=ei++,old=effects[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))queue.push(()=>{old?.cleanup?.();const cleanup=action();effects[i]={deps,cleanup:typeof cleanup==='function'?cleanup:undefined};});},
};
const fixture=pair(1024,true),pickerCalls:any[]=[],opens:{uri:string;mode:string}[]=[],requests:number[]=[];
let pending=deferred<NativeIqPickResult>(),closed=0;
class FileMock {
 uri:string;constructor(uri:string){this.uri=uri;}
 open(mode:string){opens.push({uri:this.uri,mode});assert.equal(mode,'r');const bytes=this.uri.endsWith('meta')?fixture.metadata:fixture.data;let offset=0;
  return {size:bytes.length,async readBytes(length:number){requests.push(length);const chunk=bytes.slice(offset,offset+length);offset+=chunk.length;return chunk;},close(){closed++;}};
 }
}
(globalThis as any).__nativeIq={mockReact,AppState,FileMock,getDocumentAsync:(options:unknown)=>{pickerCalls.push(options);return pending.promise;}};
const hooks=registerHooks({resolve(s,c,next){
 if(c.parentURL===url&&s==='react')return {url:'data:text/javascript,'+encodeURIComponent('const r=globalThis.__nativeIq.mockReact;export default r;export const {useState,useLayoutEffect}=r;'),shortCircuit:true};
 if(c.parentURL===url&&s==='react-native')return {url:'data:text/javascript,'+encodeURIComponent('export const AppState=globalThis.__nativeIq.AppState;export const View="View",Text="Text",Pressable="Pressable";'),shortCircuit:true};
 if(c.parentURL===url&&s==='expo-document-picker')return {url:'data:text/javascript,'+encodeURIComponent('export const getDocumentAsync=globalThis.__nativeIq.getDocumentAsync;'),shortCircuit:true};
 if(c.parentURL===url&&s==='expo-file-system')return {url:'data:text/javascript,'+encodeURIComponent('export const File=globalThis.__nativeIq.FileMock;export const FileMode={ReadOnly:"r"};'),shortCircuit:true};
 return next(s,c);
},load(u,c,next){if(u===url)return {format:'module',source:readFileSync(join(output,'src/platform/iq-input.native.js'),'utf8'),shortCircuit:true};return next(u,c);}});
const {IqInput}=await import('../src/platform/iq-input.native.tsx');
test.after(()=>{hooks.deregister();rmSync(output,{recursive:true,force:true});delete(globalThis as any).__nativeIq;});
function render(onPair:(p:IqPair)=>void,resetKey=0){si=0;ei=0;const tree=IqInput({onFile:()=>assert.fail('pair action required'),onPair,resetKey});for(const f of queue.splice(0))f();return tree;}
function refresh(onPair:(p:IqPair)=>void,resetKey=0){render(onPair,resetKey);return render(onPair,resetKey);}
function button(tree:any,label:string){return React.Children.toArray(tree.props.children).find((n:any)=>n.props?.accessibilityLabel===label) as React.ReactElement<any>;}
function emit(state:string){AppState.currentState=state;for(const f of [...listeners])f(state);}
const tick=()=>new Promise<void>(r=>setTimeout(r,0));
function unmount(){for(const e of effects)e.cleanup?.();slots=[];effects=[];queue=[];si=0;ei=0;}
const result=()=>({canceled:false,assets:[{name:'selected.sigmf-data',uri:'content://provider/data',size:fixture.data.length},{name:'selected.sigmf-meta',uri:'file:///selected/meta',size:fixture.metadata.length}]});

test('independent native picker does not launch twice across true input unmount/remount',async()=>{
 const before=pickerCalls.length,first=deferred<NativeIqPickResult>();pending=first;let stages=0;const onPair=()=>{stages++;};
 let tree=refresh(onPair);button(tree,'Choose native I/Q pair').props.onPress();await tick();
 assert.equal(pickerCalls.length,before+1);unmount();
 tree=refresh(onPair);button(tree,'Choose native I/Q pair').props.onPress();await tick();
 const launches=pickerCalls.length-before;
 first.resolve(result());await tick();tree=refresh(onPair);
 const disabled=button(tree,'Stage selected I/Q pair').props.disabled;
 unmount();assert.equal(stages,0);assert.equal(launches,1,'A remounted native input must not request another OS picker before the first settles.');assert.equal(disabled,true);
});

test('independent stale Stage callback cannot consume a replacement candidate',async()=>{
 const staged:IqPair[]=[];const onPair=(p:IqPair)=>{staged.push(p);};pending=deferred();
 let tree=refresh(onPair);button(tree,'Choose native I/Q pair').props.onPress();await tick();
 pending.resolve(result());await tick();tree=refresh(onPair);
 const staleStage=button(tree,'Stage selected I/Q pair').props.onPress;
 pending=deferred();button(tree,'Choose native I/Q pair').props.onPress();await tick();
 const replacement=result();replacement.assets[0]!.name='replacement.sigmf-data';
 pending.resolve(replacement);await tick();tree=refresh(onPair);
 staleStage();const staleStages=staged.length;
 tree=refresh(onPair);button(tree,'Stage selected I/Q pair').props.onPress();
 unmount();assert.equal(staleStages,0,'An old Stage callback must not consume the newly selected pair.');
 assert.equal(staged.length,1);assert.equal(staged[0]!.data.name,'replacement.sigmf-data');
});

test('independent picker return preserves candidate through background to inactive to active',async()=>{
 pending=deferred();let stages=0;const onPair=()=>{stages++;};let tree=refresh(onPair);
 button(tree,'Choose native I/Q pair').props.onPress();await tick();emit('background');
 pending.resolve(result());await tick();emit('inactive');emit('active');tree=refresh(onPair);
 const enabled=!button(tree,'Stage selected I/Q pair').props.disabled;
 button(tree,'Stage selected I/Q pair').props.onPress();unmount();
 assert.equal(enabled,true,'Intermediate inactive event during picker return must not discard the candidate.');
 assert.equal(stages,1);
});

test('independent stale Choose callback cannot reopen picker after candidate or lifecycle state changes',async()=>{
 pending=deferred();let tree=refresh(()=>{});const oldChoose=button(tree,'Choose native I/Q pair').props.onPress;
 oldChoose();await tick();pending.resolve(result());await tick();tree=refresh(()=>{});
 const before=pickerCalls.length;oldChoose();await tick();const afterCandidate=pickerCalls.length;
 emit('background');emit('active');refresh(()=>{});oldChoose();await tick();const afterReturn=pickerCalls.length;
 unmount();assert.equal(afterCandidate,before);assert.equal(afterReturn,before);
});
