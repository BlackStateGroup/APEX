/** Independent TF event review on actual TSX using narrow synthetic host hooks. No browser/native acceptance. */
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

function nodes(node:any,found:any[]=[]):any[]{if(!node||typeof node!=='object')return found;if(node.props?.title||node.props?.accessibilityLabel)found.push(node);React.Children.forEach(node.props?.children,(x:any)=>nodes(x,found));return found;}
function press(p:IqViewProps,title:string){const n=nodes(Projection(p)).find(n=>n.props.title===title);assert.ok(n,title);assert.ok(!n.props.disabled,title+' must be enabled');n.props.onPress();return refresh();}
function edit(p:IqViewProps,label:string,text:string){const n=nodes(Projection(p)).find(n=>n.props.accessibilityLabel===label);assert.ok(n,label);assert.equal(n.props.maxLength,undefined,'Do not silently truncate invalid input');n.props.onChangeText(text);return refresh();}
test('independent actual TSX stages TF controls and exposes complete bounded navigation',async()=>{reset();let p=refresh();p.toneExample();p=refresh();p=press(p,'Use explicit time-frequency windows');p=press(p,'Stage FFT size 256');p=edit(p,'Time-frequency hop samples','256');p=edit(p,'Time-frequency frame count','32');assert.equal(p.state.timeFrequencyReport,null);p=press(p,'Inspect staged I/Q pair');await settle();p=refresh();assert.ok(p.state.timeFrequencyReport);assert.equal(p.state.report,null);let html=renderToStaticMarkup(React.createElement(Projection,p));assert.equal((html.match(/Select time-frequency frame /g)||[]).length,8);assert.equal((html.match(/>Bin /g)||[]).length,8);for(const phrase of ['Full-file statistics omitted','not a heap bound','not RF timestamps','not physical noise','declared RF','not transmitter identities'])assert.ok(html.includes(phrase),phrase);assert.doesNotMatch(html,/Raw I minimum|Digital normalized mean I/);assert.ok(html.includes(p.state.timeFrequencyReport!.dataSha256));for(let i=0;i<7;i++)p=press(p,'Next time-frequency overview');assert.deepEqual(p.state.frames.map(f=>f.index),[28,29,30,31]);p=press(p,'Select time-frequency frame 31');assert.equal(p.state.selectedFrame!.peakSignedBin,-64);for(let i=0;i<31;i++)p=press(p,'Next I/Q FFT bins');assert.equal(p.state.bins.at(-1)!.signedBin,127);p=press(p,'Previous selected time-frequency frame');assert.equal(p.state.selectedFrame!.index,30);assert.equal(p.state.page,0);assert.equal(p.state.framePage,7);p=press(p,'Previous time-frequency overview');assert.equal(p.state.selectedFrame!.index,30);p=edit(p,'Time-frequency frame count','32\n');assert.equal(p.state.timeFrequencyReport,null);assert.equal(p.state.frameCount,null);assert.ok(nodes(Projection(p)).find(n=>n.props.title==='Inspect staged I/Q pair').props.disabled);reset();});
test('independent actual owner TF callbacks fence stale events after edit, Clear and background',async()=>{reset();let p=refresh();p.toneExample();p=refresh();p.mode('time-frequency');p=refresh();const stale=p;p.hop('127');p=refresh();for(const old of [stale]){old.count('64');old.mode('explicit');old.size(4096);old.inspect();old.selectFrame(1);old.framePage(1);old.page(1);}assert.equal(refresh().state.hopSamples,127);assert.equal(refresh().state.frameCount,1);assert.equal(refresh().state.busy,false);const beforeClear=p;p.clear();p=refresh();beforeClear.hop('1');beforeClear.count('64');beforeClear.inspect();assert.equal(refresh().state.hopSamples,1024);p.toneExample();p=refresh();p.mode('time-frequency');p=refresh();p.inspect();await settle();p=refresh();const old=p;emit('background');emit('active');p=refresh();for(const f of [()=>old.hop('1'),()=>old.count('64'),()=>old.framePage(1),()=>old.selectFrame(1),()=>old.inspect()])f();p=refresh();assert.equal(p.state.timeFrequencyReport,null);assert.equal(p.state.metadata,null);assert.equal(p.state.windowMode,'default');assert.equal(p.state.busy,false);reset();});
