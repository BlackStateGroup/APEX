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
const hooks=registerHooks({resolve(s,c,next){
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

test('actual IQ TSX projects bounded immutable results, selectable full hashes and honest zero/short states',async()=>{
 const c=new IqController(true,iqByteHasher);c.example(c.lease,c.state);
 let html=render(c);assert.doesNotMatch(html,/Exact metadata SHA-256:/);assert.equal((html.match(/type="file"/g)||[]).length,2);
 await c.inspect(c.lease,c.state);html=render(c);
 for(const phrase of ['not phone RF acquisition','327680 source bytes, not a total heap bound','not paths','periodic Hann']) assert.ok(html.includes(phrase),phrase);
 assert.equal((html.match(/<span data-selectable="true">Bin /g)||[]).length,8);
 assert.ok(html.includes(c.state.report!.metadataSha256));assert.ok(html.includes(c.state.report!.dataSha256));assert.match(html,/−∞ \(zero amplitude\)/);assert.match(html,/none \(all zero amplitudes\)/);assert.doesNotMatch(html,/<a\b|href=|<script/);
 c.page(127,c.lease,c.state);assert.match(render(c),/page 128 of 128/);
 c.stageFile('metadata',{name:'<script>evil</script>https://evil.invalid/'+('x'.repeat(200)),size:new TextEncoder().encode(meta).length,arrayBuffer:async()=>new TextEncoder().encode(meta).buffer},c.lease,c.state);
 c.stageFile('data',{name:'short',size:4,arrayBuffer:async()=>new ArrayBuffer(4)},c.lease,c.state);await c.inspect(c.lease,c.state);html=render(c);
 assert.match(html,/Insufficient samples for default 1024-sample FFT/);assert.match(html,/Full-file statistics only; no padding/);assert.doesNotMatch(html,/data-selectable="true">Bin /);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script|<a\b/);
});
test('native input renders inert explicit controls without a paste fallback',()=>{
 const html=renderToStaticMarkup(React.createElement(NativeInput,{onFile:no}));assert.match(html,/Choose native I\/Q pair/);assert.match(html,/Synthetic examples/);assert.doesNotMatch(html,/<input|<textarea/);
});
test('actual web input events stage real synthetic File handles only and canceled picker leaves stage unchanged',async()=>{
 reset();let p=refresh();let reads=0;
 const m=new File([meta],'exact metadata'),d=new File([new Uint8Array(4096)],'exact data');
 for(const f of [m,d]){const original=f.arrayBuffer.bind(f);Object.defineProperty(f,'arrayBuffer',{value:()=>{reads++;return original();}});}
 pick(p,'metadata',m);p=refresh();pick(p,'data',d);p=refresh();assert.equal(reads,0);assert.equal(p.state.report,null);
 const before=p.state;pick(p,'metadata',null);p=refresh();assert.equal(p.state,before);
 p.inspect();await settle();p=refresh();assert.equal(reads,2);assert.equal(p.state.report!.origin,'external-file');assert.equal(p.state.bins.length,8);
 p.clear();p=refresh();assert.equal(p.state.metadata,null);assert.equal(p.state.report,null);reset();
});
test('actual owner callbacks fence stale events and retain single job across background and inspector reentry',async()=>{
 reset();let p=refresh();let resolve!:(b:ArrayBuffer)=>void;let reads=0;
 const delayed=new File([meta],'delayed metadata');Object.defineProperty(delayed,'arrayBuffer',{value:()=>{reads++;return new Promise<ArrayBuffer>(r=>{resolve=r;});}});
 pick(p,'metadata',delayed);p=refresh();pick(p,'data',new File([new Uint8Array(4096)],'data'));p=refresh();p.inspect();p=refresh();assert.equal(p.state.busy,true);const stale=p;
 for(let i=0;i<5;i++){
  emit('background');assert.equal(owner().state.report,null);assert.equal(owner().state.metadata,null);emit('active');
  owner(false);p=refresh();p.example();p=refresh();p.inspect();assert.equal(reads,1);assert.equal(p.state.busy,true);
 }
 stale.clear();stale.example();stale.file('data',new File([new Uint8Array(4)],'old'));p=refresh();assert.equal(p.state.origin,'synthetic-fixture');
 resolve(new TextEncoder().encode(meta).buffer);await settle();p=refresh();assert.equal(p.state.report,null);assert.equal(p.state.data!.name,'synthetic-zero.sigmf-data');
 p.inspect();await settle();p=refresh();assert.equal(p.state.report!.origin,'synthetic-fixture');
 // Synchronous currentState guard fences a callback before the AppState listener is delivered.
 const old=p;appState.currentState='background';old.example();assert.equal(owner().state.report,p.state.report);emit('background');emit('active');p=refresh();assert.equal(p.state.report,null);reset();
});
test('IQ source wiring keeps one stable mounted owner and excludes save/network/device and unrelated analyses',()=>{
 const read=(path:string)=>readFileSync(new URL(path,root),'utf8');
 const app=read('App.tsx');assert.equal((app.match(/<IqWorkbench /g)||[]).length,1);assert.match(app,/\n\s*<IqWorkbench active=\{tab === 'Analysis' && inspector === 'iq'\} \/>/);
 for(const path of ['src/iq-workbench.ts','src/IqWorkbench.tsx','src/platform/iq-input.tsx','src/platform/iq-input.native.tsx','src/platform/iq-digest.ts','src/platform/iq-digest.native.ts'])assert.doesNotMatch(read(path),/\bfetch\s*\(|XMLHttpRequest|\.save\(|AsyncStorage|Clipboard|Linking|digestStringAsync|requestPermission/);
 assert.match(read('src/iq-workbench.ts'),/analyzeIq\(prepared,options\)/);assert.doesNotMatch(read('src/iq-workbench.ts'),/analyzeIqLag|analyzeIqPhase/);
});


test('actual owner stages window controls, rejects whole input, fences stale callbacks and resets examples',async()=>{
 reset();let p=refresh();p.toneExample();p=refresh();p.mode('explicit');p=refresh();p.size(256);p=refresh();
 const tree=Projection(p);const children=React.Children.toArray(tree.props.children) as React.ReactElement<any>[];
 const fragment=children.find(x=>x.type===React.Fragment && React.Children.toArray(x.props.children).some((y:any)=>y.type===primitives.TextInput))!;
 const input=(React.Children.toArray(fragment.props.children) as React.ReactElement<any>[]).find(x=>x.type===primitives.TextInput)!;
 assert.equal(input.props.maxLength,undefined);input.props.onChangeText('4096');p=refresh();assert.equal(p.state.startSample,4096);
 const stale=p;p.inspect();await settle();p=refresh();assert.equal(p.state.report!.spectrum!.peakBin!.signedBin,-64);
 p.start('4096junk');p=refresh();assert.equal(p.state.startText,'');assert.equal(p.state.startSample,null);assert.equal(p.state.report,null);
 stale.start('0');stale.size(4096);stale.mode('default');stale.toneExample();p=refresh();assert.equal(p.state.startSample,null);
 p.start('00000');p=refresh();p.inspect();await settle();p=refresh();assert.equal(p.state.report!.spectrum!.peakBin!.signedBin,64);
 p.example();p=refresh();assert.equal(p.state.windowMode,'default');assert.equal(p.state.fftSize,1024);assert.equal(p.state.startText,'0');reset();
});

test('actual TF owner events stage strict geometry, select frames/pages and fence prior callbacks with native synthetic availability',async()=>{
 reset();let p=refresh();p.toneExample();p=refresh();p.mode('time-frequency');p=refresh();p.size(256);p=refresh();p.hop('256');p=refresh();p.count('32');p=refresh();assert.equal(p.state.timeFrequencyReport,null);assert.equal(p.state.busy,false);p.inspect();await settle();p=refresh();assert.equal(p.state.report,null);assert.equal(p.state.timeFrequencyReport!.cellCount,8192);assert.equal(p.state.frames.length,4);
 const stale=p;p.framePage(7);p=refresh();assert.deepEqual(p.state.frames.map(f=>f.index),[28,29,30,31]);p.selectFrame(31);p=refresh();assert.equal(p.state.selectedFrame!.peakSignedBin,-64);p.page(31);p=refresh();assert.equal(p.state.bins.at(-1)!.signedBin,127);stale.count('1');stale.selectFrame(0);stale.framePage(0);stale.page(0);assert.equal(refresh().state,p.state);
 p.hop('655360');p=refresh();assert.equal(p.state.hopText,'');assert.equal(p.state.hopSamples,null);assert.equal(p.state.timeFrequencyReport,null);assert.equal(p.state.frames.length,0);p.inspect();await settle();assert.equal(refresh().state.timeFrequencyReport,null);
 p=refresh();p.example();p=refresh();assert.equal(p.state.windowMode,'default');assert.equal(p.state.hopSamples,1024);assert.equal(p.state.frameCount,1);p.mode('time-frequency');p=refresh();p.inspect();await settle();p=refresh();assert.equal(p.state.selectedFrame!.peakSignedBin,null);assert.match(renderToStaticMarkup(React.createElement(NativeInput,{onFile:no})),/Choose native I\/Q pair/);
 emit('background');p=refresh();assert.equal(p.state.timeFrequencyReport,null);assert.equal(p.state.windowMode,'default');assert.equal(p.state.data,null);reset();
});
test('actual TF projection bounded frame/bin rows, exact source provenance and no incidental statistics',async()=>{
 const c=new IqController(true,iqByteHasher);c.toneExample(c.lease,c.state);c.windowMode('time-frequency',c.lease,c.state);c.fftSize(256,c.lease,c.state);c.hopSamples('256',c.lease,c.state);c.frameCount('32',c.lease,c.state);await c.inspect(c.lease,c.state);let html=render(c);
 for(const phrase of ['sample positions not covered by the selected windows between frames when gapped.','Full-file statistics omitted','8192 cells','not a heap bound','Pagination limits rendered rows only','signed offset','declared RF','linear magnitude','raw relative-unit dB','display dB','not physical noise','Overlapping frames are correlated','Hann neighbors and leakage'])assert.ok(html.includes(phrase),phrase);
 assert.doesNotMatch(html,/unsampled positions|Raw I minimum|Digital normalized mean|Insufficient samples|FFT: 1024/);assert.equal((html.match(/Select time-frequency frame \d+/g)??[]).length,8); // label and visible text for exactly four buttons
 assert.equal((html.match(/Bin -?\d+:/g)??[]).length,8);assert.ok(html.includes(c.state.timeFrequencyReport!.metadataSha256));assert.ok(html.includes(c.state.timeFrequencyReport!.dataSha256));
 c.framePage(7,c.lease,c.state);c.selectFrame(31,c.lease,c.state);c.page(31,c.lease,c.state);html=render(c);assert.match(html,/Frame 31: samples \[7936, 8192\)/);assert.match(html,/Selected frame 31/);assert.match(html,/page 32 of 32/);assert.match(html,/Bin 127:/);assert.doesNotMatch(html,/Frame 0:|Bin -128:/);
 c.example(c.lease,c.state);c.windowMode('time-frequency',c.lease,c.state);await c.inspect(c.lease,c.state);html=render(c);assert.match(html,/none \(all transformed amplitudes zero\)/);assert.match(html,/null \(−∞, zero amplitude\)/);assert.match(html,/display dB -160/);
});
test('actual TF projection wires mode/hop/count/frame controls with full untruncated edits',async()=>{
 const c=new IqController(true,iqByteHasher);c.toneExample(c.lease,c.state);c.windowMode('time-frequency',c.lease,c.state);c.fftSize(256,c.lease,c.state);c.frameCount('8',c.lease,c.state);await c.inspect(c.lease,c.state);
 const calls:unknown[]=[];const props:IqViewProps={state:c.state,showPeakPage:()=>{},mode:m=>{calls.push(['mode',m]);},size:no,start:no,toneExample:no,file:no,inspect:no,clear:no,example:no,page:p=>{calls.push(['bin',p]);},hop:t=>{calls.push(['hop',t]);},count:t=>{calls.push(['count',t]);},framePage:p=>{calls.push(['overview',p]);},selectFrame:i=>{calls.push(['frame',i]);}};
 const nodes:any[]=[];function walk(node:any){if(!node||typeof node!=='object')return;if(node.props?.title||node.props?.accessibilityLabel)nodes.push(node);React.Children.forEach(node.props?.children,walk);}walk(Projection(props));
 const button=(title:string)=>nodes.find(n=>n.props.title===title).props.onPress();const input=(label:string,value:string)=>nodes.find(n=>n.props.accessibilityLabel===label).props.onChangeText(value);
 button('Use explicit time-frequency windows');input('Time-frequency hop samples','655360');input('Time-frequency frame count','0'.repeat(1000));button('Next time-frequency overview');button('Select time-frequency frame 3');button('Next selected time-frequency frame');button('Next I/Q FFT bins');assert.deepEqual(calls,[['mode','time-frequency'],['hop','655360'],['count','0'.repeat(1000)],['overview',1],['frame',3],['frame',1],['bin',1]]);
});

test('actual peak control is accessible, null-disabled and navigates current single/TF frames with stale event fencing',async()=>{
 function control(p:IqViewProps){const found:any[]=[];function walk(n:any){if(!n||typeof n!=='object')return;if(n.props?.title==='Show peak bin page')found.push(n);React.Children.forEach(n.props?.children,walk);}walk(Projection(p));assert.equal(found.length,1);return found[0];}
 for(const mode of ['explicit','time-frequency'] as const){
  reset();let p=refresh();p.toneExample();p=refresh();p.mode(mode);p=refresh();p.size(256);p=refresh();if(mode==='time-frequency'){p.hop('4096');p=refresh();p.count('2');p=refresh();}p.inspect();await settle();p=refresh();
  const before=p.state,button=control(p);assert.equal(button.props.disabled,false);assert.match(renderToStaticMarkup(React.createElement(Projection,p)),/aria-label="Show peak bin page"/);button.props.onPress();p=refresh();assert.equal(p.state.page,24);assert.equal(p.state.report,before.report);assert.equal(p.state.timeFrequencyReport,before.timeFrequencyReport);
  if(mode==='time-frequency'){p.selectFrame(1);p=refresh();const selected=p.state;button.props.onPress();assert.equal(refresh().state,selected);control(p).props.onPress();p=refresh();assert.equal(p.state.page,8);assert.equal(p.state.selectedFrame!.index,1);}
  for(const action of ['edit','mode','clear','exit']){const old=control(p);if(action==='edit')p.start('1');if(action==='mode')p.mode('default');if(action==='clear')p.clear();if(action==='exit')emit('background');const current=refresh().state;old.props.onPress();assert.equal(refresh().state,current);if(action!=='exit'){p=refresh();p.toneExample();p=refresh();p.inspect();await settle();p=refresh();}}
  reset();p=refresh();p.example();p=refresh();p.mode(mode);p=refresh();p.inspect();await settle();p=refresh();assert.equal(control(p).props.disabled,true);const zero=p.state;control(p).props.onPress();assert.equal(refresh().state,zero);reset();
 }
});


test('actual owner accepts only fresh atomic pair staging callbacks',()=>{
 reset();let p=refresh();const stale=p.pair!;
 const files={metadata:{name:'m',size:meta.length,arrayBuffer:async()=>new TextEncoder().encode(meta).buffer},data:{name:'d',size:4096,arrayBuffer:async()=>new ArrayBuffer(4096)}};
 emit('background');emit('active');p=refresh();stale(files);p=refresh();assert.equal(p.state.metadata,null);
 p.pair!(files);p=refresh();assert.equal(p.state.metadata!.name,'m');assert.equal(p.state.data!.name,'d');assert.equal(p.state.report,null);reset();
});
