/** Actual TSX static projection only: primitives mocked, effects and device behavior untested. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire,registerHooks} from 'node:module';
import React from 'react';
import {IqController} from '../src/iq-workbench.ts';
import type {IqViewProps} from '../src/IqWorkbench.tsx';
import {pair,nodeDigest} from './iq-app-review-fixture.ts';
const require=createRequire(import.meta.url),{renderToStaticMarkup}=require('react-dom/server');
const root=new URL('../',import.meta.url),owner=new URL('src/IqWorkbench.tsx',root).href,web=new URL('src/platform/iq-input.tsx',root).href,native=new URL('src/platform/iq-input.native.tsx',root).href;
const output=mkdtempSync(join(tmpdir(),'iq-independent-static-'));
(globalThis as any).__iqIndependentPrimitives={AppState:{currentState:'active'},View:({children}:any)=>React.createElement('div',null,children),Text:({children}:any)=>React.createElement('span',null,children),TextInput:({accessibilityLabel,value}:any)=>React.createElement('input',{'aria-label':accessibilityLabel,value,readOnly:true}),Pressable:({children,disabled}:any)=>React.createElement('button',{disabled},children)};
execFileSync(process.execPath,[fileURLToPath(new URL('bin/tsc',import.meta.resolve('typescript/package.json'))),'--ignoreConfig','--noCheck','--jsx','react','--target','es2022','--module','esnext','--outDir',output,'--rootDir','.','src/IqWorkbench.tsx','src/platform/iq-input.native.tsx'],{cwd:fileURLToPath(root),stdio:'pipe'});
const hook=registerHooks({resolve(s,c,next){if([owner,native].includes(c.parentURL??'')&&s==='react-native')return {url:'data:text/javascript,'+encodeURIComponent('export const {AppState,View,Text,Pressable,TextInput}=globalThis.__iqIndependentPrimitives'),shortCircuit:true};if(c.parentURL===owner&&s==='./platform/iq-input')return next('./platform/iq-input.tsx',c);if(c.parentURL===owner&&s==='./platform/iq-digest')return next('./platform/iq-digest.ts',c);return next(s,c);},load(url,c,next){if([owner,web,native].includes(url))return {format:'module',source:readFileSync(join(output,fileURLToPath(url).slice(fileURLToPath(root).length).replace(/\.tsx$/,'.js')),'utf8'),shortCircuit:true};return next(url,c);}});
let View:React.ComponentType<IqViewProps>,Owner:React.ComponentType<{active:boolean}>,NativeInput:React.ComponentType<any>;
try{({IqWorkbenchView:View,IqWorkbench:Owner}=await import('../src/IqWorkbench.tsx'));({IqInput:NativeInput}=await import('../src/platform/iq-input.native.tsx'));}finally{hook.deregister();rmSync(output,{recursive:true,force:true});delete(globalThis as any).__iqIndependentPrimitives;}
const fail=()=>assert.fail('Static projection must be inert');
function render(c:IqController){return renderToStaticMarkup(React.createElement(View,{state:c.state,showPeakPage:()=>{},hop:fail,count:fail,framePage:fail,selectFrame:fail,mode:fail,size:fail,start:fail,toneExample:fail,file:fail,inspect:fail,clear:fail,example:fail,page:fail}));}
test('independent actual web TSX renders only bounded bins and inert hostile labels with disclosure',async()=>{
 const p=pair(),c=new IqController(true,{digest:nodeDigest});for(const side of ['metadata','data'] as const)c.stageFile(side,{name:'<script>alert(1)</script> https://bad.invalid/ '+ 'x'.repeat(300),size:p[side].length,arrayBuffer:async()=>p[side].slice().buffer},c.lease,c.state);
 let html=render(c);assert.equal((html.match(/type="file"/g)??[]).length,2);assert.doesNotMatch(html,/<script|<a\b|href=|Bin -?\d+:/);assert.match(html,/&lt;script&gt;/);assert.equal(c.state.metadata!.name.length,160);
 await c.inspect(c.lease,c.state);html=render(c);assert.equal((html.match(/Bin -?\d+:/g)??[]).length,8);assert.match(html,/page 1 of 128/);assert.match(html,/not a total heap bound/);assert.match(html,/not cancellation or secure erasure/);assert.match(html,/not dBm/);assert.match(html,/not phone RF acquisition/);assert.match(html,/not paths, authenticated origins or proof of pairing/);
 c.page(127,c.lease,c.state);html=render(c);assert.match(html,/page 128 of 128/);assert.match(html,/Bin 511:/);assert.doesNotMatch(html,/Bin -512:/);
 c.example(c.lease,c.state);await c.inspect(c.lease,c.state);assert.match(render(c),/−∞ \(zero amplitude\)/);assert.match(render(c),/none \(all zero amplitudes\)/);
 c.stageFile('metadata',{name:'m',size:p.metadata.length,arrayBuffer:async()=>p.metadata.slice().buffer},c.lease,c.state);c.stageFile('data',{name:'d',size:4,arrayBuffer:async()=>new ArrayBuffer(4)},c.lease,c.state);await c.inspect(c.lease,c.state);assert.match(render(c),/Full-file statistics only; no padding/);assert.doesNotMatch(render(c),/Bin -?\d+:/);
});
test('independent actual native input explicitly lacks picker, owner inactive render is empty',()=>{const html=renderToStaticMarkup(React.createElement(NativeInput,{onFile:fail}));assert.match(html,/Arbitrary local file import is unavailable/);assert.match(html,/explicitly Inspect/);assert.doesNotMatch(html,/<input|<button/);assert.equal(renderToStaticMarkup(React.createElement(Owner,{active:false})),'');});

test('independent actual TSX window callbacks expose all choices and truthful actual report',async()=>{
 const c=new IqController(true,{digest:nodeDigest});c.toneExample(c.lease,c.state);
 const calls:unknown[]=[];const props:IqViewProps={state:c.state,showPeakPage:()=>{},hop:fail,count:fail,framePage:fail,selectFrame:fail,file:fail,inspect:fail,clear:fail,example:fail,page:fail,toneExample:()=>calls.push('tone'),mode:m=>calls.push(m),size:n=>calls.push(n),start:t=>calls.push(t)};
 function controls(node:any,found:any[]=[]):any[]{if(!node||typeof node!=='object')return found;if(node.props?.title||node.props?.accessibilityLabel==='FFT start sample')found.push(node);React.Children.forEach(node.props?.children,(child:any)=>controls(child,found));return found;}
 let tree=(View as any)(props),nodes=controls(tree);nodes.find(n=>n.props.title==='Use explicit FFT window').props.onPress();nodes.find(n=>n.props.title==='Load synthetic quarter-cycle example').props.onPress();assert.deepEqual(calls,['explicit','tone']);
 c.windowMode('explicit',c.lease,c.state);tree=(View as any)({...props,state:c.state});nodes=controls(tree);for(const n of [256,512,1024,2048,4096])nodes.find(x=>x.props.title===`Stage FFT size ${n}`).props.onPress();nodes.find(n=>n.props.accessibilityLabel==='FFT start sample').props.onChangeText('655360');assert.deepEqual(calls.slice(2),[256,512,1024,2048,4096,'655360']);
 c.fftSize(256,c.lease,c.state);c.startSample('4096',c.lease,c.state);await c.inspect(c.lease,c.state);let html=render(c);assert.match(html,/FFT: 256 samples, start 4096, end exclusive 4352/);assert.match(html,/at most 4096 retained bins/);assert.match(html,/not dBm/);assert.equal((html.match(/Bin -?\d+:/g)??[]).length,8);
 c.startSample('bad',c.lease,c.state);c.windowMode('default',c.lease,c.state);html=render(c);assert.doesNotMatch(html,/Exact metadata SHA-256/);assert.match(html,/invalid|Invalid/);
});


test('actual activity TSX has distinct visible and accessible field labels',()=>{
 const c=new IqController(true,{digest:nodeDigest});c.windowMode('activity',c.lease,c.state);
 const html=render(c);
 for(const label of ['Start sample','Window samples','Hop samples','Frame count','Threshold numerator','Threshold denominator']){
  assert.ok(html.includes(`<span>${label}</span>`),`visible ${label}`);
  assert.ok(html.includes(`aria-label="Activity ${label}"`),`accessible ${label}`);
 }
 assert.equal((html.match(/aria-label="Activity /g)??[]).length,6);
});
