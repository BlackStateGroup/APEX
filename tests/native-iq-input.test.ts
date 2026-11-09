/** Execute actual native TSX with mocked OS/Expo bindings, not device acceptance. */
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
import type { IqPair, IqInputProfile } from '../src/iq-workbench.ts';
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
let sourceBytes:{metadata:Uint8Array;data:Uint8Array}=fixture;
class FileMock {
 uri:string;constructor(uri:string){this.uri=uri;}
 open(mode:string){opens.push({uri:this.uri,mode});assert.equal(mode,'r');const bytes=this.uri.endsWith('meta')?sourceBytes.metadata:sourceBytes.data;let offset=0;
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
function render(onPair:(p:IqPair)=>void,resetKey=0,profile:IqInputProfile='sigmf'){si=0;ei=0;const tree=IqInput({onFile:()=>assert.fail('pair action required'),onPair,resetKey,profile});for(const f of queue.splice(0))f();return tree;}
function refresh(onPair:(p:IqPair)=>void,resetKey=0,profile:IqInputProfile='sigmf'){render(onPair,resetKey,profile);return render(onPair,resetKey,profile);}
function button(tree:any,label:string){return React.Children.toArray(tree.props.children).find((n:any)=>n.props?.accessibilityLabel===label) as React.ReactElement<any>;}
function emit(state:string){AppState.currentState=state;for(const f of [...listeners])f(state);}
const tick=()=>new Promise<void>(r=>setTimeout(r,0));
function unmount(){for(const e of effects)e.cleanup?.();slots=[];effects=[];queue=[];si=0;ei=0;}
const result=()=>({canceled:false,assets:[{name:'selected.sigmf-data',uri:'content://provider/data',size:fixture.data.length},{name:'selected.sigmf-meta',uri:'file:///selected/meta',size:fixture.metadata.length}]});

test('actual native controls choose both files without copying, survive OS background, stage atomically, then Inspect read-only',async()=>{
 const c=new IqController(true,{digest:nodeDigest});const staged:IqPair[]=[];const onPair=(p:IqPair)=>{staged.push(p);c.stagePair(p,c.lease,c.state);};
 let tree=refresh(onPair,c.state.inputRevision);assert.equal(pickerCalls.length,0);assert.equal(opens.length,0);
 button(tree,'Choose native I/Q pair').props.onPress();button(tree,'Choose native I/Q pair').props.onPress();await tick();
 assert.deepEqual(pickerCalls,[{type:'*/*',multiple:true,copyToCacheDirectory:false}]);
 emit('background');c.deactivate();tree=refresh(onPair,c.state.inputRevision);assert.equal(c.state.metadata,null);
 pending.resolve(result());await tick();tree=refresh(onPair,c.state.inputRevision);assert.equal(button(tree,'Stage selected I/Q pair').props.disabled,true);assert.equal(staged.length,0);assert.equal(opens.length,0);
 emit('active');c.activate();tree=refresh(onPair,c.state.inputRevision);assert.equal(button(tree,'Stage selected I/Q pair').props.disabled,false);
 button(tree,'Stage selected I/Q pair').props.onPress();tree=refresh(onPair,c.state.inputRevision);assert.equal(staged.length,1);assert.equal(opens.length,0);assert.equal(c.state.report,null);
 await c.inspect(c.lease,c.state);assert.equal((()=>c.state)().report?.sha512Status,'byte-match-only');assert.equal(opens.length,2);assert.equal(closed,2);assert.ok(requests.every(n=>n<=16384));
 pending=deferred();tree=refresh(onPair,c.state.inputRevision);button(tree,'Choose native I/Q pair').props.onPress();await tick();
 c.clear(c.lease,c.state);refresh(onPair,c.state.inputRevision);pending.resolve(result());await tick();tree=refresh(onPair,c.state.inputRevision);
 assert.equal(button(tree,'Stage selected I/Q pair').props.disabled,true);assert.equal(staged.length,1);assert.equal(opens.length,2);
 unmount();assert.equal(listeners.size,0);
});

test('actual native UI ignores picker completion after unmount and never stages in background before listener delivery',async()=>{
 pending=deferred();let stages=0;const onPair=()=>{stages++;};let tree=refresh(onPair);button(tree,'Choose native I/Q pair').props.onPress();await tick();unmount();pending.resolve(result());await tick();assert.equal(stages,0);
 pending=deferred();tree=refresh(onPair);button(tree,'Choose native I/Q pair').props.onPress();await tick();pending.resolve(result());await tick();tree=refresh(onPair);
 assert.equal(button(tree,'Stage selected I/Q pair').props.disabled,false);AppState.currentState='background';button(tree,'Stage selected I/Q pair').props.onPress();assert.equal(stages,0);emit('background');emit('active');tree=refresh(onPair);assert.equal(button(tree,'Stage selected I/Q pair').props.disabled,true);unmount();
});


test('actual native C8 selector stages only after Stage and preserves provenance after bounded reads',async()=>{
 sourceBytes={metadata:Uint8Array.from('sample_rate=1024\ncenter_frequency=0\nformat=c8 (signed int8 I,Q)\n',c=>c.charCodeAt(0)),data:new Uint8Array(2048)};
 pending=deferred();const before=opens.length,c=new IqController(true,{digest:nodeDigest});c.inputProfile('mayhem-c8',c.lease,c.state);
 const onPair=(p:IqPair)=>c.stagePair(p,c.lease,c.state);
 let tree=refresh(onPair,c.state.inputRevision,c.state.inputProfile);button(tree,'Choose native I/Q pair').props.onPress();await tick();
 pending.resolve({canceled:false,assets:[{name:'selected.c8',uri:'content://provider/data',size:sourceBytes.data.length},{name:'selected.txt',uri:'file:///selected/meta',size:sourceBytes.metadata.length}]});await tick();
 tree=refresh(onPair,c.state.inputRevision,c.state.inputProfile);assert.equal(button(tree,'Stage selected I/Q pair').props.disabled,false);assert.equal(opens.length,before);
 button(tree,'Stage selected I/Q pair').props.onPress();assert.equal(opens.length,before);await c.inspect(c.lease,c.state);
 assert.equal(opens.length,before+2);assert.equal(c.state.report?.c8Import?.original.dataLength,2048);assert.equal(c.state.report?.dataLength,4096);
 pending=deferred();tree=refresh(onPair,c.state.inputRevision,c.state.inputProfile);button(tree,'Choose native I/Q pair').props.onPress();await tick();
 c.inputProfile('sigmf',c.lease,c.state);refresh(onPair,c.state.inputRevision,c.state.inputProfile);
 pending.resolve({canceled:false,assets:[{name:'selected.c8',uri:'content://provider/data',size:2048},{name:'selected.txt',uri:'file:///selected/meta',size:sourceBytes.metadata.length}]});await tick();
 tree=refresh(onPair,c.state.inputRevision,c.state.inputProfile);assert.equal(button(tree,'Stage selected I/Q pair').props.disabled,true);assert.equal(opens.length,before+2);
 unmount();sourceBytes=fixture;
});
