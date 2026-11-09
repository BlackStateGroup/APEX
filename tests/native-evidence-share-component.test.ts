/** Actual native TSX with mocked hooks/OS bindings. Not mounted React or device acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_NATIVE_EVIDENCE_SHARE_BYTES } from '../src/native-evidence-share.ts';
import { deferred } from './iq-app-review-fixture.ts';
const root=new URL('../',import.meta.url),url=new URL('src/platform/evidence-share.native.tsx',root).href;
const output=mkdtempSync(join(tmpdir(),'native-evidence-tsx-'));
execFileSync(process.execPath,[fileURLToPath(new URL('bin/tsc',import.meta.resolve('typescript/package.json'))),'--ignoreConfig','--noCheck','--jsx','react','--target','es2022','--module','esnext','--outDir',output,'--rootDir','.','src/platform/evidence-share.native.tsx'],{cwd:fileURLToPath(root),stdio:'pipe'});
let slots:any[]=[],effects:{deps:any[];cleanup?:()=>void}[]=[],queue:(()=>void)[]=[],si=0,ei=0,updates=0;
const mockReact={...React,
 useRef(initial:any){const i=si++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
 useState(initial:any){const i=si++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],(value:any)=>{updates++;slots[i]=typeof value==='function'?value(slots[i]):value;}];},
 useLayoutEffect(action:()=>void|(()=>void),deps:any[]){const i=ei++,old=effects[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))queue.push(()=>{old?.cleanup?.();const cleanup=action();effects[i]={deps,cleanup:typeof cleanup==='function'?cleanup:undefined};});},
};
const listeners=new Set<(state:string)=>void>();
const AppState={currentState:'active',addEventListener(_event:string,callback:(state:string)=>void){listeners.add(callback);return{remove(){listeners.delete(callback);}};}};
const calls:any[]=[];
let pending=deferred<{action:string}>();
let onShare:(()=>void)|null=null;
const Share={sharedAction:'sharedAction',dismissedAction:'dismissedAction',share(content:any,options:any){calls.push({content,options});onShare?.();return pending.promise;}};
(globalThis as any).__nativeEvidence={mockReact,AppState,Share};
const isTarget=(u:string|undefined)=>u===url||u===url+'?unknown-result';
const hooks=registerHooks({resolve(s,c,next){
 if(isTarget(c.parentURL)&&s==='react')return{url:'data:text/javascript,'+encodeURIComponent('const r=globalThis.__nativeEvidence.mockReact;export default r;export const {useState,useLayoutEffect,useRef}=r;'),shortCircuit:true};
 if(isTarget(c.parentURL)&&s==='react-native')return{url:'data:text/javascript,'+encodeURIComponent('export const {AppState,Share}=globalThis.__nativeEvidence;export const View="View",Text="Text",Pressable="Pressable";'),shortCircuit:true};
 return next(s,c);
},load(u,c,next){if(isTarget(u))return{format:'module',source:readFileSync(join(output,'src/platform/evidence-share.native.js'),'utf8'),shortCircuit:true};return next(u,c);}});
const {EvidenceShare}=await import('../src/platform/evidence-share.native.tsx');
test.after(()=>{unmount();hooks.deregister();rmSync(output,{recursive:true,force:true});delete(globalThis as any).__nativeEvidence;});
type Props={document:string|null;preparationId:number;sourceCurrent:()=>boolean};
const prepared='{"payload":"é🛰️","timestamp":"2026-11-09T00:00:00Z","id":"selected"}\n';
const props=(preparationId=1,document:string|null=prepared):Props=>({document,preparationId,sourceCurrent:()=>true});
function render(p:Props,component=EvidenceShare){si=0;ei=0;const tree=component(p);for(const action of queue.splice(0))action();return tree;}
function refresh(p:Props,component=EvidenceShare){render(p,component);return render(p,component);}
function button(tree:any){return React.Children.toArray(tree.props.children).find((n:any)=>n.props?.accessibilityLabel==='Share prepared evidence text') as React.ReactElement<any>;}
function status(tree:any){return (React.Children.toArray(tree.props.children).find((n:any)=>n.props?.accessibilityLiveRegion==='polite') as React.ReactElement<any>).props.children as string;}
function unmount(){for(const effect of effects)effect.cleanup?.();slots=[];effects=[];queue=[];si=0;ei=0;AppState.currentState='active';onShare=null;}
const tick=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
function resetRequest(){pending=deferred();return pending;}
async function settle(action=Share.sharedAction){pending.resolve({action});await tick();}

test('mount and missing preparation are inert; exact complete text, title and options cross the native boundary once',async()=>{
 const before=calls.length;let tree=refresh(props(0,null));assert.equal(button(tree).props.disabled,true);button(tree).props.onPress();await tick();assert.equal(calls.length,before);
 resetRequest();tree=refresh(props());assert.equal(calls.length,before);const press=button(tree).props.onPress;press();press();await tick();
 assert.equal(calls.length,before+1);assert.deepEqual(calls.at(-1),{content:{message:prepared,title:'APEX selected evidence'},options:{dialogTitle:'Share selected APEX evidence text'}});
 await settle();press();press();await tick();assert.equal(calls.length,before+1);tree=refresh(props());assert.equal(button(tree).props.disabled,true);
 assert.match(status(tree),/Native share API returned/);assert.match(status(tree),/Delivery is not confirmed/);assert.match(status(tree),/Android may return before the chooser closes/);
 resetRequest();tree=refresh(props(2));assert.equal(button(tree).props.disabled,false);button(tree).props.onPress();button(tree).props.onPress();await settle();assert.equal(calls.length,before+2);unmount();
});
test('explicit dismissal wording makes no delivery claim and consumes the preparation',async()=>{
 resetRequest();const p=props();const tree=refresh(p);button(tree).props.onPress();await settle(Share.dismissedAction);
 const next=refresh(p);assert.equal(status(next),'System share sheet dismissed. Delivery is not confirmed.');assert.equal(button(next).props.disabled,true);unmount();
});
test('oversized UTF-8 bundle is refused whole even if a disabled handler is invoked',async()=>{
 const text='🛰'.repeat(MAX_NATIVE_EVIDENCE_SHARE_BYTES/4+1);assert.ok(text.length<MAX_NATIVE_EVIDENCE_SHARE_BYTES);assert.ok(Buffer.byteLength(text,'utf8')>MAX_NATIVE_EVIDENCE_SHARE_BYTES);
 const p=props(1,text),before=calls.length;const tree=refresh(p);assert.equal(button(tree).props.disabled,true);button(tree).props.onPress();await tick();assert.equal(calls.length,before);assert.match(status(refresh(p)),/nothing was truncated or sent/);unmount();
});
test('foreground is checked live without AppState listener delivery, and stale source never dispatches',async()=>{
 let current=true;const p={...props(),sourceCurrent:()=>current};const tree=refresh(p),press=button(tree).props.onPress,before=calls.length;AppState.currentState='background';press();await tick();assert.equal(calls.length,before);
 AppState.currentState='inactive';press();await tick();assert.equal(calls.length,before);AppState.currentState='active';current=false;press();await tick();assert.equal(calls.length,before);unmount();assert.equal(listeners.size,0);
});
test('old preparation handlers and handlers retained after unmount cannot dispatch',async()=>{
 const before=calls.length;const old=button(refresh(props())).props.onPress;refresh(props(2));old();await tick();assert.equal(calls.length,before);
 const current=button(refresh(props(2))).props.onPress;unmount();current();await tick();assert.equal(calls.length,before);
});
test('late completion after stale source, replacement preparation or unmount never sets state',async()=>{
 for(const invalidate of ['source','preparation','unmount']){
  resetRequest();let current=true;const p={...props(),sourceCurrent:()=>current};button(refresh(p)).props.onPress();await tick();
  if(invalidate==='source')current=false;else if(invalidate==='preparation')refresh(props(2));else unmount();
  const before=updates;await settle();assert.equal(updates,before,`${invalidate} completion must be inert`);unmount();
 }
});
test('pending native API gate survives remount; settle releases only API ownership, not proof of chooser closure',async()=>{
 const first=resetRequest(),before=calls.length;button(refresh(props())).props.onPress();await tick();unmount();
 const p=props(2);button(refresh(p)).props.onPress();await tick();assert.equal(calls.length,before+1);assert.match(status(refresh(p)),/earlier native share API request is still pending/);
 const beforeUpdates=updates;first.resolve({action:Share.sharedAction});await tick();assert.equal(updates,beforeUpdates);button(refresh(p)).props.onPress();assert.equal(calls.length,before+1);
 resetRequest();button(refresh(props(3))).props.onPress();await settle();assert.equal(calls.length,before+2);unmount();
});
test('source invalidated during gate checks cannot reach the native boundary or publish a late state',async()=>{
 let checks=0;const p={...props(),sourceCurrent:()=>++checks<=2},before=calls.length;
 button(refresh(p)).props.onPress();const beforeUpdates=updates;await tick();
 assert.equal(calls.length,before);assert.equal(updates,beforeUpdates);assert.ok(checks>=3);unmount();
});
test('synchronous native-boundary reentry cannot dispatch twice and unmount on dispatch suppresses settlement',async()=>{
 resetRequest();const p=props(),tree=refresh(p),press=button(tree).props.onPress,before=calls.length;onShare=()=>{press();unmount();};press();await tick();assert.equal(calls.length,before+1);const beforeUpdates=updates;await settle();assert.equal(updates,beforeUpdates);unmount();
});
// Last: each terminal outcome poisons its own actual component module for app lifetime.
test('dispatch rejection and unrecognized result latch terminal native gates across remount',async()=>{
 const unknownModule=await import(url+'?unknown-result');
 for(const [kind,component] of [['reject',EvidenceShare],['unknown',unknownModule.EvidenceShare]] as const){
  resetRequest();const p=props(),before=calls.length;button(refresh(p,component)).props.onPress();await tick();assert.equal(calls.length,before+1);
  if(kind==='reject')pending.reject(Error('private native failure'));else pending.resolve({action:'unexpected-native-action'});
  await tick();assert.match(status(refresh(p,component)),/Delivery is unknown; restart the app/);assert.doesNotMatch(status(refresh(p,component)),/private native failure/);unmount();
  resetRequest();button(refresh(props(2),component)).props.onPress();await tick();assert.equal(calls.length,before+1);assert.match(status(refresh(props(2),component)),/restart the app/);unmount();
 }
});
