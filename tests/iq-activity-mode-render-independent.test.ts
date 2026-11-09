/** Independent activity event review on actual TSX using narrow synthetic host hooks. No browser/native acceptance. */
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
(globalThis as any).__iqActivityTsx={primitives,mockReact};
const hooks=registerHooks({resolve(s,c,next){if(s==='./platform/iq-engine')return next('./platform/iq-engine.ts',c);
 if(urls.includes(c.parentURL!)&&s==='react-native')return{url:'data:text/javascript,'+encodeURIComponent('export const {AppState,View,Text,TextInput,Pressable}=globalThis.__iqActivityTsx.primitives;'),shortCircuit:true};
 if(c.parentURL===ownerUrl&&s==='react')return{url:'data:text/javascript,'+encodeURIComponent('const r=globalThis.__iqActivityTsx.mockReact;export default r;export const {useState,useLayoutEffect}=r;'),shortCircuit:true};
 if(c.parentURL===ownerUrl&&s==='./platform/iq-digest')return next('./platform/iq-digest.ts',c);
 if(c.parentURL===ownerUrl&&s==='./platform/iq-input')return next('./platform/iq-input.tsx',c);
 return next(s,c);
},load(url,c,next){if(!urls.includes(url))return next(url,c);const relative=fileURLToPath(url).slice(fileURLToPath(root).length).replace(/\.tsx$/,'.js');return{format:'module',source:readFileSync(join(output,relative),'utf8'),shortCircuit:true};}});
const {IqWorkbench:Owner,IqWorkbenchView:Projection}=await import('../src/IqWorkbench.tsx');
const {IqInput:Input}=await import('../src/platform/iq-input.tsx');
const {IqInput:NativeInput}=await import('../src/platform/iq-input.native.tsx');
hooks.deregister();rmSync(output,{recursive:true,force:true});
test.after(()=>{delete(globalThis as any).__iqActivityTsx;});
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
test('independent actual TSX fourth mode shows exact defaults, all six fields and bounded frame/interval navigation',async()=>{reset();let p=refresh();p.toneExample();p=refresh();p=press(p,'Selected-window energy / threshold');const labels=['Start sample','Window samples','Hop samples','Frame count','Threshold numerator','Threshold denominator'];for(const field of labels){const input=nodes(Projection(p)).find(n=>n.props.accessibilityLabel===`Activity ${field}`);assert.ok(input);assert.equal(input.props.maxLength,undefined);}let html=renderToStaticMarkup(React.createElement(Projection,p));for(const phrase of ['threshold 0/1','strictly positive','not an estimated noise floor','Noise and DC can exceed','268435456/1'])assert.ok(html.includes(phrase),phrase);assert.ok(!nodes(Projection(p)).some(n=>n.props.title==='Show peak bin page'));p=edit(p,'Activity Window samples','1');p=edit(p,'Activity Hop samples','2');p=edit(p,'Activity Frame count','256');p=press(p,'Inspect staged I/Q pair');await settle();p=refresh();assert.ok(p.state.activityReport);html=renderToStaticMarkup(React.createElement(Projection,p));assert.equal((html.match(/Activity frame \d+:/g)||[]).length,4);assert.equal((html.match(/Measured interval: samples/g)||[]).length,8);assert.ok(!nodes(Projection(p)).some(n=>n.props.title==='Show peak bin page'));for(const phrase of ['exact threshold 0/1','equality is not above threshold','not RF timestamps','not physical bursts','not proof of continuous activity','raw ADC-count-squared','No DC removal','262144'])assert.ok(html.toLowerCase().includes(phrase.toLowerCase()),phrase);assert.doesNotMatch(html,/Raw I minimum|Digital normalized mean I|Show peak bin page/);assert.ok(html.includes(p.state.activityReport!.dataSha256));for(let i=0;i<63;i++)p=press(p,'Next activity frames');assert.deepEqual(p.state.activityFrames.map(f=>f.index),[252,253,254,255]);for(let i=0;i<31;i++)p=press(p,'Next activity intervals');assert.deepEqual(p.state.activityIntervals.map(i=>i.startSample),[496,498,500,502,504,506,508,510]);const before=p.state;p.showPeakPage();assert.equal(refresh().state,before);p=edit(p,'Activity Threshold denominator','1\n');assert.equal(p.state.activityReport,null);assert.equal(p.state.activitySettings.thresholdDenominator,'');assert.ok(nodes(Projection(p)).find(n=>n.props.title==='Inspect staged I/Q pair').props.disabled);reset();});
test('independent actual TSX activity all six stale setting and navigation callbacks are inert after every replacement/exit path',async()=>{for(const change of ['setting','mode','size','start','clear','zero','tone','file','background','exit']){reset();let p=refresh();p.toneExample();p=refresh();p.mode('activity');p=refresh();p.activitySetting!('windowSamples','1');p=refresh();p.activitySetting!('hopSamples','2');p=refresh();p.activitySetting!('frameCount','256');p=refresh();p.inspect();await settle();p=refresh();const stale=p,oldButtons=nodes(Projection(p)).filter(n=>n.props.title?.startsWith('Next activity')||n.props.title?.startsWith('Select activity'));if(change==='setting')p.activitySetting!('thresholdNumerator','1');if(change==='mode')p.mode('explicit');if(change==='size')p.size(256);if(change==='start')p.start('1');if(change==='clear')p.clear();if(change==='zero')p.example();if(change==='tone')p.toneExample();if(change==='file')p.file('data',null);if(change==='background'){emit('background');emit('active');}if(change==='exit'){owner(false);owner(true);}const before=refresh().state;for(const field of ['startSample','windowSamples','hopSamples','frameCount','thresholdNumerator','thresholdDenominator'] as const)stale.activitySetting!(field,'1');stale.activityFramePage!(1);stale.activityRunPage!(1);stale.selectActivityRun!(0);stale.activityIntervalPage!(1);stale.showPeakPage();stale.inspect();for(const node of oldButtons)node.props.onPress();assert.equal(refresh().state,before);assert.equal(before.activityReport,null);assert.equal(before.busy,false);}reset();});
test('independent actual TSX zero run display, exact equality and activity errors leave spectral modes usable',async()=>{reset();let p=refresh();p.example();p=refresh();p=press(p,'Selected-window energy / threshold');p=press(p,'Inspect staged I/Q pair');await settle();p=refresh();let html=renderToStaticMarkup(React.createElement(Projection,p));assert.ok(html.includes('No above-threshold runs.'));assert.ok(html.includes('strictly above threshold: false'));assert.ok(html.includes('exact mean 0/1024'));assert.equal(p.state.activityRunPageCount,0);p=edit(p,'Activity Threshold numerator','١');assert.ok(nodes(Projection(p)).find(n=>n.props.title==='Inspect staged I/Q pair').props.disabled);p.mode('explicit');p=refresh();assert.ok(!nodes(Projection(p)).find(n=>n.props.title==='Inspect staged I/Q pair').props.disabled);p.inspect();await settle();p=refresh();assert.ok(p.state.report);reset();});
test('independent actual TSX synthetic alternating run pages stay bounded and select every unique run',async()=>{reset();let p=refresh();const bytes=new Uint8Array(1024),v=new DataView(bytes.buffer);for(let k=0;k<256;k++)v.setInt16(k*4,k%2===0?1:0,true);pick(p,'metadata',new File([meta],'synthetic.sigmf-meta'));p=refresh();pick(p,'data',new File([bytes],'synthetic.sigmf-data'));p=refresh();p=press(p,'Selected-window energy / threshold');p=edit(p,'Activity Window samples','1');p=edit(p,'Activity Hop samples','1');p=edit(p,'Activity Frame count','256');p=press(p,'Inspect staged I/Q pair');await settle();p=refresh();const seen:number[]=[];for(let page=0;page<32;page++){const runButtons=nodes(Projection(p)).filter(n=>/^Select activity run \d+$/.test(n.props.title??''));assert.equal(runButtons.length,4);for(const button of runButtons){const index=Number(button.props.title.split(' ').at(-1));p=press(p,`Select activity run ${index}`);assert.equal(p.state.selectedActivityRun!.index,index);assert.deepEqual(p.state.activityIntervals,[{startSample:index*2,endSampleExclusive:index*2+1}]);seen.push(index);}if(page<31)p=press(p,'Next activity runs');}assert.deepEqual(seen,Array.from({length:128},(_,i)=>i));reset();});
test('independent actual TSX each readable activity input has corresponding visible label and exact default',()=>{reset();let p=refresh();p.mode('activity');p=refresh();const expected=[['Start sample','0'],['Window samples','1024'],['Hop samples','1024'],['Frame count','1'],['Threshold numerator','0'],['Threshold denominator','1']] as const;const groups:any[]=[];function walk(n:any){if(!n||typeof n!=='object')return;const children=React.Children.toArray(n.props?.children) as React.ReactElement<any>[];if(children.some(ch=>ch.props?.accessibilityLabel?.startsWith('Activity ')))groups.push(children);React.Children.forEach(n.props?.children,walk);}walk(Projection(p));assert.equal(groups.length,6);for(const[label,value]of expected){const group=groups.find(children=>children.some((ch:any)=>ch.props?.accessibilityLabel===`Activity ${label}`));assert.ok(group,label);assert.equal(group.length,2);assert.equal(group[0].props.children,label);assert.equal(group[1].props.accessibilityLabel,`Activity ${label}`);assert.equal(group[1].props.value,value);const rendered=renderToStaticMarkup(React.createElement(group[0].type,group[0].props));assert.ok(rendered.includes(`>${label}</span>`));}reset();});
