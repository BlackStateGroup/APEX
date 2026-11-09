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
import { HciWorkbenchController, HCI_EXAMPLE, decodeHciHex } from '../src/hci-workbench.ts';
import { createHash } from 'node:crypto';
import { deferred } from './iq-app-review-fixture.ts';
import type { NativeHciPickResult } from '../src/native-hci-file.ts';
const root=new URL('../',import.meta.url),url=new URL('src/platform/hci-input.native.tsx',root).href;
const output=mkdtempSync(join(tmpdir(),'native-hci-tsx-'));
execFileSync(process.execPath,[fileURLToPath(new URL('bin/tsc',import.meta.resolve('typescript/package.json'))),'--ignoreConfig','--noCheck','--jsx','react','--target','es2022','--module','esnext','--outDir',output,'--rootDir','.','src/platform/hci-input.native.tsx'],{cwd:fileURLToPath(root),stdio:'pipe'});
let slots:any[]=[],effects:{deps:any[];cleanup?:()=>void}[]=[],queue:(()=>void)[]=[],si=0,ei=0;
const listeners=new Set<(state:string)=>void>();
const AppState={currentState:'active',addEventListener(_event:string,callback:(state:string)=>void){listeners.add(callback);return {remove(){listeners.delete(callback);}};}};
const mockReact={...React,
 useState(init:any){const i=si++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return[slots[i],(value:any)=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
 useLayoutEffect(action:()=>void|(()=>void),deps:any[]){const i=ei++,old=effects[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))queue.push(()=>{old?.cleanup?.();const cleanup=action();effects[i]={deps,cleanup:typeof cleanup==='function'?cleanup:undefined};});},
};
const fixture=decodeHciHex(HCI_EXAMPLE),pickerCalls:any[]=[],opens:{uri:string;mode:string}[]=[],requests:number[]=[];
let heldRead:ReturnType<typeof deferred<Uint8Array>>|null=null,failClose=false;
let pending=deferred<NativeHciPickResult>(),closed=0;
class FileMock {
 uri:string;constructor(uri:string){this.uri=uri;}
 open(mode:string){opens.push({uri:this.uri,mode});assert.equal(mode,'r');const bytes=fixture;let offset=0;
  return {size:bytes.length,async readBytes(length:number){requests.push(length);if(heldRead){const gate=heldRead;heldRead=null;return gate.promise;}const chunk=bytes.slice(offset,offset+length);offset+=chunk.length;return chunk;},close(){closed++;if(failClose)throw Error('private native close error');}};
 }
}
(globalThis as any).__nativeHci={mockReact,AppState,FileMock,getDocumentAsync:(options:unknown)=>{pickerCalls.push(options);return pending.promise;}};
const hooks=registerHooks({resolve(s,c,next){
 if(c.parentURL===url&&s==='react')return {url:'data:text/javascript,'+encodeURIComponent('const r=globalThis.__nativeHci.mockReact;export default r;export const {useState,useLayoutEffect}=r;'),shortCircuit:true};
 if(c.parentURL===url&&s==='react-native')return {url:'data:text/javascript,'+encodeURIComponent('export const AppState=globalThis.__nativeHci.AppState;export const View="View",Text="Text",Pressable="Pressable";'),shortCircuit:true};
 if(c.parentURL===url&&s==='expo-document-picker')return {url:'data:text/javascript,'+encodeURIComponent('export const getDocumentAsync=globalThis.__nativeHci.getDocumentAsync;'),shortCircuit:true};
 if(c.parentURL===url&&s==='expo-file-system')return {url:'data:text/javascript,'+encodeURIComponent('export const File=globalThis.__nativeHci.FileMock;export const FileMode={ReadOnly:"r"};'),shortCircuit:true};
 return next(s,c);
},load(u,c,next){if(u===url)return {format:'module',source:readFileSync(join(output,'src/platform/hci-input.native.js'),'utf8'),shortCircuit:true};return next(u,c);}});
const {HciInput}=await import('../src/platform/hci-input.native.tsx');
test.after(()=>{hooks.deregister();rmSync(output,{recursive:true,force:true});delete(globalThis as any).__nativeHci;});
function render(controller:HciWorkbenchController){
 si=0;ei=0;const state=controller.state,lease=controller.lease;
 const tree=HciInput({resetKey:state.inputRevision,sourceCurrent:()=>controller.isActive(lease)&&state===controller.state,
 onBytes:bytes=>{controller.stageFileBytes(bytes,lease,state);}});
 for(const f of queue.splice(0))f();return tree;
}
function refresh(controller:HciWorkbenchController){render(controller);return render(controller);}
function button(tree:any,label:string){return React.Children.toArray(tree.props.children).find((n:any)=>n.props?.accessibilityLabel===label) as React.ReactElement<any>;}
function emit(state:string){AppState.currentState=state;for(const f of [...listeners])f(state);}
const tick=()=>new Promise<void>(r=>setTimeout(r,0));
function unmount(){for(const e of effects)e.cleanup?.();slots=[];effects=[];queue=[];si=0;ei=0;}
const result=():NativeHciPickResult=>({canceled:false,assets:[{name:'selected.btsnoop',uri:'content://provider/selected',size:fixture.length}]});
const make=()=>new HciWorkbenchController(true,async bytes=>createHash('sha256').update(bytes).digest('hex'));

test('actual mobile HCI controls choose once, survive OS background and require Load then Inspect',async()=>{
 const c=make();let tree=refresh(c);const before=opens.length;
 button(tree,'Choose native HCI file').props.onPress();button(tree,'Choose native HCI file').props.onPress();await tick();
 assert.deepEqual(pickerCalls,[{type:'*/*',multiple:false,copyToCacheDirectory:false}]);assert.equal(opens.length,before);
 emit('background');pending.resolve(result());await tick();tree=refresh(c);
 assert.equal(button(tree,'Load selected HCI bytes').props.disabled,true);assert.equal(c.state.draft,'');
 emit('inactive');emit('active');tree=refresh(c);assert.equal(button(tree,'Load selected HCI bytes').props.disabled,false);
 button(tree,'Load selected HCI bytes').props.onPress();await tick();tree=refresh(c);
 assert.equal(opens.length,before+1);assert.equal(closed,1);assert.deepEqual(requests,[fixture.length,1]);
 assert.equal(c.state.draft,HCI_EXAMPLE);assert.equal(c.state.provenance,'recorded-import');assert.equal(c.state.metadata,null);
 await c.inspect(c.lease);assert.equal(c.state.metadata!.source.sha256,createHash('sha256').update(fixture).digest('hex'));
 unmount();assert.equal(listeners.size,0);
});
test('actual mobile controls suppress stale Load and delayed picker return after Clear or navigation',async()=>{
 const c=make();pending=deferred();let tree=refresh(c);button(tree,'Choose native HCI file').props.onPress();await tick();
 pending.resolve(result());await tick();tree=refresh(c);const staleLoad=button(tree,'Load selected HCI bytes').props.onPress,before=opens.length;
 c.clear(c.lease);refresh(c);staleLoad();await tick();assert.equal(opens.length,before);assert.equal(c.state.draft,'');
 pending=deferred();tree=refresh(c);button(tree,'Choose native HCI file').props.onPress();await tick();unmount();
 pending.resolve(result());await tick();assert.equal(opens.length,before);assert.equal(c.state.draft,'');
});
test('actual component remount cannot launch another HCI OS picker until old picker settles',async()=>{
 const c=make();pending=deferred();const first=pending;let tree=refresh(c);const before=pickerCalls.length;
 button(tree,'Choose native HCI file').props.onPress();await tick();unmount();
 tree=refresh(c);button(tree,'Choose native HCI file').props.onPress();await tick();assert.equal(pickerCalls.length,before+1);
 first.resolve(result());await tick();tree=refresh(c);assert.equal(button(tree,'Load selected HCI bytes').props.disabled,true);assert.equal(c.state.draft,'');unmount();
});
test('actual native bounded read drains and closes after a newer draft without publishing or extra reads',async()=>{
 const c=make();pending=deferred();let tree=refresh(c);button(tree,'Choose native HCI file').props.onPress();await tick();pending.resolve(result());await tick();tree=refresh(c);
 const held=deferred<Uint8Array>();heldRead=held;const beforeRequests=requests.length,beforeClosed=closed;
 button(tree,'Load selected HCI bytes').props.onPress();await tick();assert.equal(requests.length,beforeRequests+1);
 c.edit('aabb',c.lease);refresh(c);held.resolve(fixture);await tick();
 assert.equal(c.state.draft,'aabb');assert.equal(closed,beforeClosed+1);assert.equal(requests.length,beforeRequests+1);assert.equal(c.state.metadata,null);unmount();
});
test('actual controls check foreground before listener delivery and fence a queued lazy picker after unmount',async()=>{
 const c=make();pending=deferred();let tree=refresh(c);button(tree,'Choose native HCI file').props.onPress();await tick();pending.resolve(result());await tick();tree=refresh(c);
 const before=opens.length;AppState.currentState='background';button(tree,'Load selected HCI bytes').props.onPress();await tick();assert.equal(opens.length,before);emit('background');emit('active');unmount();
 pending=deferred();tree=refresh(c);const picks=pickerCalls.length;button(tree,'Choose native HCI file').props.onPress();unmount();await tick();assert.equal(pickerCalls.length,picks);
});
test('actual native reader latches failed close across remount without publishing source bytes',async()=>{
 const c=make();pending=deferred();let tree=refresh(c);button(tree,'Choose native HCI file').props.onPress();await tick();pending.resolve(result());await tick();tree=refresh(c);
 failClose=true;const before=opens.length;button(tree,'Load selected HCI bytes').props.onPress();await tick();assert.equal(opens.length,before+1);assert.equal(c.state.draft,'');unmount();failClose=false;
 pending=deferred();tree=refresh(c);button(tree,'Choose native HCI file').props.onPress();await tick();pending.resolve(result());await tick();tree=refresh(c);
 button(tree,'Load selected HCI bytes').props.onPress();await tick();assert.equal(opens.length,before+1);assert.equal(c.state.draft,'');unmount();
});
