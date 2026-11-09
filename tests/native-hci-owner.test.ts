/** Actual HCI owner TSX callbacks, with a narrow React/native projection. */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HCI_EXAMPLE, decodeHciHex } from '../src/hci-workbench.ts';
const root=new URL('../',import.meta.url),url=new URL('src/HciWorkbench.tsx',root).href;
const output=mkdtempSync(join(tmpdir(),'hci-owner-tsx-'));
execFileSync(process.execPath,[fileURLToPath(new URL('bin/tsc',import.meta.resolve('typescript/package.json'))),'--ignoreConfig','--noCheck','--jsx','react','--target','es2022','--module','esnext','--outDir',output,'--rootDir','.','src/HciWorkbench.tsx'],{cwd:fileURLToPath(root),stdio:'pipe'});
let slots:any[]=[],effects:{deps:any[];cleanup?:()=>void}[]=[],queue:(()=>void)[]=[],si=0,ei=0;
const mockReact={...React,
 useState(init:any){const i=si++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return[slots[i],(v:any)=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
 useLayoutEffect(action:()=>void|(()=>void),deps:any[]){const i=ei++,old=effects[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))queue.push(()=>{old?.cleanup?.();const cleanup=action();effects[i]={deps,cleanup:typeof cleanup==='function'?cleanup:undefined};});},
};
(globalThis as any).__hciOwnerReact=mockReact;
const hooks=registerHooks({resolve(s,c,next){
 if(c.parentURL===url&&s==='react')return{url:'data:text/javascript,'+encodeURIComponent('const r=globalThis.__hciOwnerReact;export default r;export const {useState,useLayoutEffect}=r;'),shortCircuit:true};
 if(c.parentURL===url&&s==='react-native')return{url:'data:text/javascript,'+encodeURIComponent('export const View="View",Text="Text",TextInput="TextInput",Pressable="Pressable",StyleSheet={create:x=>x};'),shortCircuit:true};
 if(c.parentURL===url&&s==='./platform/hci-input')return{url:'data:text/javascript,export const HciInput="NativeFileInput";',shortCircuit:true};
 if(c.parentURL===url&&s==='./platform/hci-digest')return next('./platform/hci-digest.ts',c);
 return next(s,c);
},load(u,c,next){if(u===url)return{format:'module',source:readFileSync(join(output,'src/HciWorkbench.js'),'utf8'),shortCircuit:true};return next(u,c);}});
const {HciWorkbench,HciWorkbenchView}=await import('../src/HciWorkbench.tsx');
test.after(()=>{hooks.deregister();rmSync(output,{recursive:true,force:true});delete(globalThis as any).__hciOwnerReact;});
test.afterEach(()=>unmount());
function render(active=true){si=0;ei=0;const tree=HciWorkbench({active});for(const f of queue.splice(0))f();return tree;}
function refresh(active=true){render(active);return render(active);}
function unmount(){for(const e of effects)e.cleanup?.();slots=[];effects=[];queue=[];si=0;ei=0;}
async function settledInspection() {
 const deadline=Date.now()+5000;
 while (refresh()!.props.state.pending) {
  if(Date.now()>=deadline)assert.fail('HCI owner inspection did not settle within the bounded test deadline');
  await new Promise<void>(resolve=>setTimeout(resolve,1));
 }
}

test('actual owner hands native bytes to one atomic stage and requires its separate Inspect action',async()=>{
 let view=refresh()!.props;const input=view.fileInput.props,bytes=decodeHciHex(HCI_EXAMPLE);
 assert.equal(input.sourceCurrent(),true);input.onBytes(bytes);bytes.fill(0);view=refresh()!.props;
 assert.equal(view.state.draft,HCI_EXAMPLE);assert.equal(view.state.provenance,'recorded-import');assert.equal(view.state.metadata,null);assert.ok(view.fileInput.props.resetKey>input.resetKey);
 assert.equal(input.sourceCurrent(),false);view.inspect();await settledInspection();view=refresh()!.props;assert.equal(view.state.metadata.recordCount,1);
 const old=view.fileInput.props;view.clear();view=refresh()!.props;old.onBytes(decodeHciHex(HCI_EXAMPLE));assert.equal(refresh()!.props.state.draft,'');
 unmount();
});
test('actual owner invalidates old import callback on inspector leave, newer edit and explicit inspection',async()=>{
 let view=refresh()!.props;let input=view.fileInput.props;assert.equal(refresh(false),null);input.onBytes(decodeHciHex(HCI_EXAMPLE));view=refresh()!.props;assert.equal(view.state.draft,'');
 input=view.fileInput.props;view.edit('aabb');assert.equal(input.sourceCurrent(),false);input.onBytes(decodeHciHex(HCI_EXAMPLE));view=refresh()!.props;assert.equal(view.state.draft,'aabb');
 view.example();view=refresh()!.props;input=view.fileInput.props;view.inspect();assert.equal(input.sourceCurrent(),false);input.onBytes(new Uint8Array(16));await settledInspection();view=refresh()!.props;assert.equal(view.state.draft,HCI_EXAMPLE);
 unmount();
});
test('actual view includes supplied native controls and web projection remains separate',()=>{
 const view=refresh()!.props,marker=React.createElement('NativeFileInput',{id:'native-controls'});
 const rendered=HciWorkbenchView({...view,fileInput:marker});assert.ok(React.Children.toArray(rendered.props.children).some((child:any)=>child.props?.id==='native-controls'));
 unmount();
});
