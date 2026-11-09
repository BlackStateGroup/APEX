/** Actual TSX with narrow RN and hook host mocks. Not browser/native layout or picker acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRequire, registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IqController } from '../src/iq-workbench.ts';
import { iqByteHasher } from '../src/platform/iq-digest.ts';
import type { IqViewProps } from '../src/IqWorkbench.tsx';
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server') as {renderToStaticMarkup:(e:React.ReactElement)=>string};
const root = new URL('../',import.meta.url), ownerUrl = new URL('src/IqWorkbench.tsx',root).href;
const inputUrl = new URL('src/platform/iq-input.tsx',root).href, nativeUrl = new URL('src/platform/iq-input.native.tsx',root).href;
const urls = [ownerUrl,inputUrl,nativeUrl];
const output = mkdtempSync(join(tmpdir(),'iq-tsx-'));
execFileSync(process.execPath,[fileURLToPath(new URL('bin/tsc',import.meta.resolve('typescript/package.json'))),'--ignoreConfig','--noCheck','--jsx','react','--target','es2022','--module','esnext','--outDir',output,'--rootDir','.','src/IqWorkbench.tsx','src/platform/iq-input.native.tsx'],{cwd:fileURLToPath(root),stdio:'pipe'});
let stateSlots:any[] = [], effects:{deps:any[];cleanup?:()=>void}[] = [], pending:(()=>void)[] = [], stateIndex=0, effectIndex=0;
const listeners = new Set<(s:string)=>void>();
const appState = {currentState:'active',addEventListener(_name:string,callback:(s:string)=>void){listeners.add(callback);return{remove(){listeners.delete(callback);}};}};
const primitives = {
 AppState:appState,
 TextInput:({value,accessibilityLabel}:any)=>React.createElement('input',{value,readOnly:true,'aria-label':accessibilityLabel}),
 View:({children}:any)=>React.createElement('div',null,children),
 Text:({children,selectable}:any)=>React.createElement('span',{'data-selectable':String(selectable)},children),
 Pressable:({children,disabled,accessibilityLabel}:any)=>React.createElement('button',{disabled,'aria-label':accessibilityLabel},children),
};
const mockReact = {
 ...React,
 useState(init:any){const i=stateIndex++;if(!(i in stateSlots))stateSlots[i]=typeof init==='function'?init():init;return[stateSlots[i],(value:any)=>{stateSlots[i]=typeof value==='function'?value(stateSlots[i]):value;}];},
 useLayoutEffect(action:()=>void|(()=>void),deps:any[]){const i=effectIndex++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))pending.push(()=>{old?.cleanup?.();const cleanup=action();effects[i]={deps,cleanup:typeof cleanup==='function'?cleanup:undefined};});},
};
(globalThis as any).__iqTsx={primitives,mockReact};
const hooks=registerHooks({resolve(s,c,next){if(s==='./platform/iq-engine')return next('./platform/iq-engine.ts',c);
 if(urls.includes(c.parentURL!)&&s==='react-native')return{url:'data:text/javascript,'+encodeURIComponent('export const {AppState,View,Text,TextInput,Pressable}=globalThis.__iqTsx.primitives;'),shortCircuit:true};
 if(c.parentURL===ownerUrl&&s==='react')return{url:'data:text/javascript,'+encodeURIComponent('const r=globalThis.__iqTsx.mockReact;export default r;export const {useState,useLayoutEffect}=r;'),shortCircuit:true};
 if(c.parentURL===ownerUrl&&s==='./platform/iq-digest')return next('./platform/iq-digest.ts',c);
 if(c.parentURL===ownerUrl&&s==='./platform/iq-input')return next('./platform/iq-input.tsx',c);
 return next(s,c);
},load(url,c,next){if(!urls.includes(url))return next(url,c);const relative=fileURLToPath(url).slice(fileURLToPath(root).length).replace(/\.tsx$/,'.js');return{format:'module',source:readFileSync(join(output,relative),'utf8'),shortCircuit:true};}});
const {IqWorkbench:Owner,IqWorkbenchView:Projection}=await import('../src/IqWorkbench.tsx');
const {IqInput:Input}=await import('../src/platform/iq-input.tsx');
const {IqInput:NativeInput}=await import('../src/platform/iq-input.native.tsx');
hooks.deregister();rmSync(output,{recursive:true,force:true});
test.after(()=>{delete(globalThis as any).__iqTsx;});
const no=()=>assert.fail('Static projection must not invoke actions');
function render(c:IqController){return renderToStaticMarkup(React.createElement(Projection,{state:c.state,showPeakPage:()=>{},hop:no,count:no,framePage:no,selectFrame:no,mode:no,size:no,start:no,toneExample:no,file:no,inspect:no,clear:no,example:no,page:no}));}
function reset(){for(const e of effects)e.cleanup?.();stateSlots=[];effects=[];pending=[];listeners.clear();appState.currentState='active';}
function owner(active=true):IqViewProps {stateIndex=0;effectIndex=0;const tree=Owner({active});for(const f of pending.splice(0))f();return tree?.props as IqViewProps;}
function refresh(active=true){owner(active);return owner(active);}
function emit(s:string){appState.currentState=s;for(const f of [...listeners])f(s);}
const tick=()=>new Promise<void>(r=>setTimeout(r,2));
async function settle(){for(let i=0;i<1000&&owner().state.busy;i++)await tick();assert.equal(owner().state.busy,false);}
function pick(props:IqViewProps,side:'metadata'|'data',file:File|null){
 const tree=Input({onFile:props.file}); const labels=tree.props.children as React.ReactElement<any>[];
 const input=(labels[side==='metadata'?0:1]!.props.children as React.ReactElement<any>[]).find(x=>React.isValidElement(x)&&x.type==='input')!;
 assert.equal(input.props.type,'file');
 const target={files:file?[file]:[],value:'C:\\fakepath\\untrusted'};
 input.props.onChange({currentTarget:target});assert.equal(target.value,'');
}
const meta='{"global":{"core:datatype":"ci16_le","core:version":"1.2.6","core:sample_rate":1024},"captures":[{"core:sample_start":0,"core:frequency":0}],"annotations":[]}';

test('independent actual peak button is unique, accessible and fenced across replacements',async()=>{
 reset();let p=refresh();p.toneExample();p=refresh();p.inspect();await settle();p=refresh();
 function buttons(p:IqViewProps){const out:any[]=[];function walk(n:any){if(!n||typeof n!=="object")return;if(n.props?.title==="Show peak bin page")out.push(n);React.Children.forEach(n.props?.children,walk);}walk(Projection(p));return out;}
 let b=buttons(p);assert.equal(b.length,1);const host=b[0].type(b[0].props);assert.equal(host.props.accessibilityRole,'button');assert.equal(host.props.accessibilityLabel,'Show peak bin page');
 const old=p; b[0].props.onPress();p=refresh();assert.equal(p.state.page,96);assert.equal(p.state.report,old.state.report);assert.equal(p.state.metadata,old.state.metadata);
 for(const change of [(p:IqViewProps)=>p.clear(),(p:IqViewProps)=>p.mode('explicit'),(p:IqViewProps)=>p.size(256),(p:IqViewProps)=>p.start('1'),(p:IqViewProps)=>p.toneExample(),(p:IqViewProps)=>p.file('data',null),(p:IqViewProps)=>emit('background'),(p:IqViewProps)=>owner(false)]){
  reset();p=refresh();p.toneExample();p=refresh();p.inspect();await settle();p=refresh();const stale=buttons(p)[0].props.onPress;change(p);const before=refresh().state;stale();assert.equal(refresh().state,before);
 }
 reset();p=refresh();p.toneExample();p=refresh();p.mode('time-frequency');p=refresh();p.size(256);p=refresh();p.hop('4096');p=refresh();p.count('2');p=refresh();p.inspect();await settle();p=refresh();assert.equal(buttons(p).length,1);const stale=buttons(p)[0].props.onPress;p.selectFrame(1);p=refresh();const selected=p.state;stale();assert.equal(refresh().state,selected);buttons(p)[0].props.onPress();p=refresh();assert.equal(p.state.page,8);assert.equal(p.state.selectedFrame,selected.selectedFrame);assert.equal(p.state.frames,selected.frames);assert.equal(p.state.timeFrequencyReport,selected.timeFrequencyReport);
 reset();p=refresh();p.example();p=refresh();p.inspect();await settle();p=refresh();assert.equal(buttons(p)[0].props.disabled,true);const zero=p.state;buttons(p)[0].props.onPress();assert.equal(refresh().state,zero);reset();
});

test('independent actual FFT all sizes and shifted page boundaries preserve report and bytes',async()=>{
 const {createHash}=await import('node:crypto');
 for(const n of [256,512,1024,2048,4096] as const){
  for(const bin of [-n/2,-n/2+7,-n/2+8,-9,-8,-1,0,7,8,n/2-1]){
   let reads=0,hashes=0;const c=new IqController(true,{digest:async(a,b)=>{hashes++;return createHash(a==='SHA-256'?'sha256':'sha512').update(b).digest('hex');}});
   const data=new Uint8Array(n*4),v=new DataView(data.buffer);for(let i=0;i<n;i++){v.setInt16(4*i,Math.round(16000*Math.cos(2*Math.PI*bin*i/n)),true);v.setInt16(4*i+2,Math.round(16000*Math.sin(2*Math.PI*bin*i/n)),true);}
   const metadata=new TextEncoder().encode(meta);for(const [side,bytes] of [['metadata',metadata],['data',data]] as const)c.stageFile(side,{name:side,size:bytes.length,arrayBuffer:async()=>{reads++;return bytes.slice().buffer;}},c.lease,c.state);
   c.windowMode('explicit',c.lease,c.state);c.fftSize(n,c.lease,c.state);await c.inspect(c.lease,c.state);const before=c.state;assert.equal(before.report!.spectrum!.peakBin!.signedBin,bin);assert.equal(before.page,0);const counts=[reads,hashes];c.showPeakPage(c.lease,before);const after=c.state;
   assert.equal(after.page,Math.floor((bin+n/2)/8));assert.ok(after.bins.some(b=>b.signedBin===bin));assert.equal(after.bins.length,8);assert.ok(Object.isFrozen(after.bins));assert.ok(after.bins.every(Object.isFrozen));assert.deepEqual([reads,hashes],counts);
   for(const key of Object.keys(before) as (keyof typeof before)[])if(key!=='page'&&key!=='bins')assert.equal(after[key],before[key],key);c.showPeakPage(c.lease,before);assert.equal(c.state,after);
  }
 }
});
test('independent no result, short no FFT and tied maxima retain existing selection',async()=>{
 const c=new IqController(true,iqByteHasher);let before=c.state;c.showPeakPage(c.lease,before);assert.equal(c.state,before);
 for(const [side,bytes] of [['metadata',new TextEncoder().encode(meta)],['data',new Uint8Array(4)]] as const)c.stageFile(side,{name:side,size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer},c.lease,c.state);await c.inspect(c.lease,c.state);before=c.state;assert.equal(before.report!.spectrum,null);c.showPeakPage(c.lease,before);assert.equal(c.state,before);
 const data=new Uint8Array(1024*4);new DataView(data.buffer).setInt16(512*4,16384,true);c.stageFile('data',{name:'impulse',size:data.length,arrayBuffer:async()=>data.slice().buffer},c.lease,c.state);await c.inspect(c.lease,c.state);before=c.state;const peak=before.report!.spectrum!.peakBin!;assert.equal(peak.signedBin,-512);c.page(10,c.lease,c.state);c.showPeakPage(c.lease,c.state);assert.equal(c.state.page,0);assert.equal(c.state.report,before.report);assert.equal(c.state.report!.spectrum!.peakBin,peak);
});
test('independent source contract keeps peak navigation a guarded existing-page operation',()=>{
 const controller=readFileSync(new URL('../src/iq-workbench.ts',import.meta.url),'utf8');const method=controller.slice(controller.indexOf(' showPeakPage('),controller.indexOf(' async inspect('));
 assert.match(method,/if \(!this\.#current\(lease,state\)\) return/);assert.match(method,/signedBin == null/);assert.match(method,/this\.page\(Math\.floor\(\(signedBin \+ size\/2\)\/8\),lease,state\)/);assert.doesNotMatch(method,/analyzeIq|prepareIq|digest|\.read\(|#publish|#bins\s*=/);
 const owner=readFileSync(new URL('../src/IqWorkbench.tsx',import.meta.url),'utf8');assert.match(owner,/showPeakPage=\{\(\)=>act\(\(\)=>controller\.showPeakPage\(lease,state\)\)\}/);assert.match(owner,/AppState.currentState === 'active' && controller.isActive\(lease\) && controller.state === state/);
});
