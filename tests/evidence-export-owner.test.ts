/** Actual export owner TSX with narrow hooks/RN projections, not mounted React or phones. */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvidenceStore } from '../packages/core/evidence.ts';
import { readEvidenceBundle } from '../packages/core/evidence-bundle.ts';
import { bundleFixture, sha256 } from './bundle-preview-fixture.ts';
import { MAX_NATIVE_EVIDENCE_SHARE_BYTES } from '../src/native-evidence-share.ts';
const root=new URL('../',import.meta.url),url=new URL('src/EvidenceExportWorkbench.tsx',root).href;
const output=mkdtempSync(join(tmpdir(),'evidence-export-owner-'));
execFileSync(process.execPath,[fileURLToPath(new URL('bin/tsc',import.meta.resolve('typescript/package.json'))),'--ignoreConfig','--noCheck','--jsx','react','--target','es2022','--module','esnext','--outDir',output,'--rootDir','.','src/EvidenceExportWorkbench.tsx'],{cwd:fileURLToPath(root),stdio:'pipe'});
let slots:any[]=[],effects:{deps:any[];cleanup?:()=>void}[]=[],queue:(()=>void)[]=[],si=0,ei=0;
const listeners=new Set<()=>void>();
const AppState={currentState:'active',addEventListener(_name:string,callback:()=>void){listeners.add(callback);return{remove(){listeners.delete(callback);}};}};
const useState=(init:any)=>{const i=si++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return[slots[i],(v:any)=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];};
const mockReact={...React,useState,useRef:(value:any)=>useState(()=>({current:value}))[0],
 useLayoutEffect(action:()=>void|(()=>void),deps:any[]){const i=ei++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))queue.push(()=>{old?.cleanup?.();const cleanup=action();effects[i]={deps,cleanup:typeof cleanup==='function'?cleanup:undefined};});},
};
(globalThis as any).__evidenceExportOwner={mockReact,AppState};
const hooks=registerHooks({resolve(s,c,next){
 if(c.parentURL===url&&s==='react')return{url:'data:text/javascript,'+encodeURIComponent('const r=globalThis.__evidenceExportOwner.mockReact;export default r;export const {useState,useRef,useLayoutEffect}=r;'),shortCircuit:true};
 if(c.parentURL===url&&s==='react-native')return{url:'data:text/javascript,'+encodeURIComponent('export const AppState=globalThis.__evidenceExportOwner.AppState;export const View="View",Text="Text",TextInput="TextInput",Pressable="Pressable",StyleSheet={create:x=>x};'),shortCircuit:true};
 if(c.parentURL===url&&s==='./platform/evidence-share')return{url:'data:text/javascript,export const EvidenceShare="NativeShareProjection";',shortCircuit:true};
 if(c.parentURL===url&&s==='./platform/bundle-digest')return next('./platform/bundle-digest.ts',c);
 if(c.parentURL===url&&s==='./platform/hci-digest')return next('./platform/hci-digest.ts',c);
 return next(s,c);
},load(u,c,next){if(u===url)return{format:'module',source:readFileSync(join(output,'src/EvidenceExportWorkbench.js'),'utf8'),shortCircuit:true};return next(u,c);}});
const {EvidenceExportWorkbench,EvidenceExportWorkbenchView}=await import('../src/EvidenceExportWorkbench.tsx');
test.after(()=>{hooks.deregister();rmSync(output,{recursive:true,force:true});delete(globalThis as any).__evidenceExportOwner;});
test.afterEach(()=>{unmount();AppState.currentState='active';});
function render(store:EvidenceStore,active=true){si=0;ei=0;const tree=EvidenceExportWorkbench({active,store});for(const f of queue.splice(0))f();return tree;}
function refresh(store:EvidenceStore,active=true){render(store,active);return render(store,active);}
function unmount(){for(const e of effects)e.cleanup?.();slots=[];effects=[];queue=[];si=0;ei=0;}
function emit(state:string){AppState.currentState=state;for(const listener of [...listeners])listener();}
async function settled(store:EvidenceStore){const end=Date.now()+5000;while(refresh(store)!.props.state.pending!==null){if(Date.now()>end)assert.fail('Owner did not settle within test deadline');await new Promise(r=>setTimeout(r,1));}return refresh(store)!.props;}
async function fixture(count=6){const{documents}=await bundleFixture(count);let reads=0;const store=new EvidenceStore({list:async limit=>{assert.equal(limit,100);reads++;return documents;},insert:async()=>assert.fail('Export must not write')},{sha256,randomId:()=>assert.fail('Export must not generate record IDs')});return{store,documents,reads:()=>reads};}

test('actual owner is inert until Load and selects exact records before explicit Prepare',async()=>{
 const f=await fixture();let p=refresh(f.store)!.props;assert.equal(f.reads(),0);assert.equal(p.share.props.document,null);
 p.refresh();p=await settled(f.store);assert.equal(f.reads(),1);assert.deepEqual(p.state.selectedIds,[]);assert.equal(p.share.props.document,null);
 const stalePrepare=p.prepare;p.toggle('record-1');stalePrepare();p=refresh(f.store)!.props;assert.equal(p.state.bundle,null);
 p.prepare();p=await settled(f.store);assert.deepEqual((await readEvidenceBundle(p.share.props.document,sha256)).recordDocuments,[f.documents[1]]);
 assert.equal(p.share.props.preparationId,1);assert.equal(p.share.props.sourceCurrent(),true);const old=p.share.props;
 p.prepare();p=await settled(f.store);assert.equal(p.share.props.preparationId,2);assert.equal(old.sourceCurrent(),false);
 p.clear();p=refresh(f.store)!.props;assert.equal(p.state.records.length,0);assert.equal(p.share.props.document,null);assert.equal(f.reads(),1);
});
test('live foreground guard, background, tab exit and stale state cannot expose or dispatch a replacement',async()=>{
 const f=await fixture();let p=refresh(f.store)!.props;
 AppState.currentState='background';p.refresh();assert.equal(f.reads(),0);emit('background');emit('active');p=refresh(f.store)!.props;
 p.refresh();p=await settled(f.store);const stale=p;p.toggle('record-0');p=refresh(f.store)!.props;p.prepare();p=await settled(f.store);const share=p.share.props;
 stale.clear();assert.ok(refresh(f.store)!.props.state.bundle);emit('background');assert.equal(share.sourceCurrent(),false);
 p=refresh(f.store)!.props;assert.equal(p.state.records.length,0);assert.equal(p.state.bundle,null);emit('active');p=refresh(f.store)!.props;assert.equal(p.state.records.length,0);
 const oldRefresh=p.refresh;assert.equal(refresh(f.store,false),null);oldRefresh();assert.equal(f.reads(),1);
 p=refresh(f.store)!.props;oldRefresh();assert.equal(f.reads(),1);p.refresh();p=await settled(f.store);assert.equal(f.reads(),2);
});
test('actual owner discards a late journal read after unmount without reviving private text',async()=>{
 const f=await fixture();let release!:(docs:string[])=>void,reads=0;
 const store=new EvidenceStore({insert:async()=>assert.fail(),list:()=>{reads++;return new Promise(r=>{release=r;});}},{sha256,randomId:()=>assert.fail()});
 let p=refresh(store)!.props;p.refresh();assert.equal(reads,1);unmount();release(f.documents);await new Promise(r=>setTimeout(r,0));
 p=refresh(store)!.props;assert.equal(p.state.records.length,0);assert.equal(p.state.bundle,null);assert.equal(reads,1);assert.equal(listeners.size,1);
});
test('actual projection bounds metadata and whole text display, never turns payloads into links',async()=>{
 const f=await fixture();let p=refresh(f.store)!.props;p.refresh();p=await settled(f.store);
 const projection=EvidenceExportWorkbenchView(p);const text=JSON.stringify(projection);
 assert.equal((text.match(/"accessibilityRole":"checkbox"/g)||[]).length,4);assert.doesNotMatch(text,/https:\/\/example|not displayed/);
 p.toggle('record-0');p=refresh(f.store)!.props;p.prepare();p=await settled(f.store);
 const prepared=EvidenceExportWorkbenchView(p);const children=React.Children.toArray(prepared.props.children).flatMap((n:any)=>n.type===React.Fragment?React.Children.toArray(n.props.children):[n]) as any[];
 const input=children.find(n=>n.props?.accessibilityLabel==='Exact prepared evidence bundle text');assert.equal(input.props.value,p.state.bundle);assert.equal(input.props.editable,false);
 const oversized=EvidenceExportWorkbenchView({...p,state:{...p.state,bundle:'a'.repeat(MAX_NATIVE_EVIDENCE_SHARE_BYTES+1)}});
 assert.doesNotMatch(JSON.stringify(oversized),/Exact prepared evidence bundle text/);assert.match(JSON.stringify(oversized),/No partial text is displayed or sent/);
 assert.doesNotMatch(JSON.stringify(prepared),/"type":"a"|onOpenURL|onLinkPress/);
});
