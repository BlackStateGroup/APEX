/**
 * Actual repository TSX rendered by React DOM server, with only RN primitives mocked. Static rendering does NOT execute effects,
 * events or native callbacks. This is not browser or phone acceptance coverage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire, registerHooks } from 'node:module';
import React from 'react';
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server') as { renderToStaticMarkup(element: React.ReactElement): string };

import { hciDigest } from '../src/platform/hci-digest.ts';
import { HciWorkbenchController as Controller, HCI_EXAMPLE } from '../src/hci-workbench.ts';
import type { HciWorkbenchState } from '../src/hci-workbench.ts';
import type { HciWorkbenchViewProps } from '../src/HciWorkbench.tsx';
const componentUrl = new URL('../src/HciWorkbench.tsx', import.meta.url).href;
// Deliberately narrow host projection, not RN layout, event or accessibility emulation.
const primitives = {
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  TextInput: ({ value, accessibilityLabel }: any) => React.createElement('textarea', { defaultValue: value, 'aria-label': accessibilityLabel }),
  Pressable: ({ children, disabled, accessibilityLabel }: any) => React.createElement('button', { disabled, 'aria-label': accessibilityLabel }, children),
};
(globalThis as any).__apexHciReviewStaticRender = primitives;
// TypeScript 7 provides a local CLI rather than the old transpileModule API.
// Emit to a disposable directory; load only the allowlisted TSX output.
// This is transpilation, not a replacement for the separate full typecheck.
const output = mkdtempSync(join(tmpdir(), 'apex-static-render-'));
try {
  execFileSync(process.execPath, [fileURLToPath(new URL('bin/tsc', import.meta.resolve('typescript/package.json'))),
    '--ignoreConfig', '--noCheck', '--jsx', 'react', '--target', 'es2022', '--module', 'esnext',
    '--outDir', output, '--rootDir', '.', 'src/HciWorkbench.tsx'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', npm_config_offline: 'true',
      npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' },
    stdio: 'pipe',
  });
} catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === componentUrl && specifier === 'react-native') {
      const source = 'export const { StyleSheet, View, Text, TextInput, Pressable } = globalThis.__apexHciReviewStaticRender;';
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    if (context.parentURL === componentUrl && specifier === './platform/hci-digest') return next('./platform/hci-digest.ts', context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url !== componentUrl) return next(url, context);
    const filename = new URL(url).pathname.split('/').at(-1)!.replace(/\.tsx$/, '.js');
    return { format: 'module', source: readFileSync(join(output, 'src', filename), 'utf8'), shortCircuit: true };
  },
});
let Owner: React.ComponentType<{ active: boolean }>;
let Projection: React.ComponentType<HciWorkbenchViewProps>;
try { ({ HciWorkbench: Owner, HciWorkbenchView: Projection } = await import('../src/HciWorkbench.tsx')); }
finally { hooks.deregister(); rmSync(output, { recursive: true, force: true }); delete (globalThis as any).__apexHciReviewStaticRender; }
function render(state: HciWorkbenchState) {
  const noAction = () => assert.fail('Static projection must not act');
  return renderToStaticMarkup(React.createElement(Projection, { state, edit: noAction, clear: noAction, inspect: noAction, page: noAction, declare: noAction, example: noAction, select: noAction, reportPage: noAction, selectExtended: noAction, extendedPage: noAction }));
}

const withoutDraft = (s: string) => s.replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g, '');


// Independently authored byte layout, not builder fixtures.
function row(word=0, data=Buffer.from('PRIVATE_EXT_PAYLOAD'), at=0, dt=255) {
 const b=Buffer.alloc(24+data.length);b.writeUInt16LE(word,0);b[2]=at;b.set([17,34,51,68,85,102],3);
 b[9]=3;b[10]=4;b[11]=255;b[12]=127;b[13]=128;b.writeUInt16LE(6,14);b[16]=dt;b.set([161,162,163,164,165,166],17);b[23]=data.length;b.set(data,24);return b;
}
function event(rows:Buffer[]){const body=Buffer.concat([Buffer.from([13,rows.length]),...rows]);assert.ok(body.length<=255);return Buffer.concat([Buffer.from([4,62,body.length]),body]);}
function capture(events:Buffer[]){return Buffer.concat([Buffer.from(HCI_EXAMPLE.slice(0,32),'hex'),...events.map(e=>{const h=Buffer.alloc(24);h.writeUInt32BE(e.length);h.writeUInt32BE(e.length,4);h.writeUInt32BE(3,8);return Buffer.concat([h,e]);})]).toString('hex');}
const legacy=Buffer.from(HCI_EXAMPLE.slice(80),'hex');
async function setup(events:Buffer[]) {const c=new Controller(true,hciDigest);c.edit(capture(events),c.lease);c.declare('synthetic-fixture',c.lease);await c.inspect(c.lease);return c;}
function deepFrozen(value:unknown){if(value&&typeof value==='object'){assert.equal(Object.isFrozen(value),true);for(const v of Object.values(value))deepFrozen(v);}}
function empty(c:Controller){assert.equal(c.state.selectedIndex,null);assert.equal(c.state.extendedIndex,null);assert.equal(c.state.reportCount,0);assert.equal(c.state.extendedCount,0);assert.equal(c.state.reportPage,0);assert.equal(c.state.extendedPage,0);assert.deepEqual(c.state.reports,[]);assert.deepEqual(c.state.extendedReports,[]);}
test('independent extended UI: all status values preserve numbers and omit payload including status zero',async()=>{
 for(let status=0;status<4;status++){
 const c=await setup([event([row(status<<5)])]);empty(c);
 const meta=withoutDraft(render(c.state));assert.match(meta,/Select extended HCI metadata 0/);assert.doesNotMatch(meta,/PRIVATE_EXT|66:55:44:33:22:11|Extended report 0:/);
 c.selectExtended(0,c.lease,c.state);const text=withoutDraft(render(c.state));
 assert.equal(c.state.extendedReports[0]!.dataStatus.raw,status);assert.match(text,new RegExp(`Data status: offset 45; length 2; raw ${status};`));
 assert.match(text,/last fragment only/);assert.match(text,/not exhaustive semantic legality/);assert.match(text,/scanner configuration context is unknown/);assert.match(text,/Data is not returned or interpreted/);
 assert.doesNotMatch(text,/PRIVATE_EXT_PAYLOAD|505249564154455f4558545f5041594c4f4144/);assert.equal('dataHex' in c.state.extendedReports[0]!,false);
 assert.match(text,/Primary PHY:.*raw 3; state &quot;feature-context-unknown&quot;/);assert.match(text,/Secondary PHY:.*raw 4; state &quot;feature-context-unknown&quot;/);
 assert.match(text,/SID:.*raw 255; state &quot;unavailable&quot;/);assert.match(text,/Tx power:.*raw 127; state &quot;unavailable&quot;/);assert.match(text,/RSSI:.*raw 128; state &quot;reserved&quot;/);assert.match(text,/Periodic interval:.*raw 6;.*value 7.5/);
 }
});
test('independent extended UI: addresses have conditional absence and directed context is not target identity',async()=>{
 for(const at of [255,254])for(const dt of [0,2,3,255])for(const word of [0,4]){
 const c=await setup([event([row(word,Buffer.alloc(0),at,dt)])]);c.selectExtended(0,c.lease,c.state);const t=withoutDraft(render(c.state));
 assert.doesNotMatch(t,/66:55:44:33:22:11|112233445566/);assert.match(t,/Advertiser address span: offset 48; length 6; no address interpretation/);
 if(!word||dt===255)assert.doesNotMatch(t,/A6:A5:A4:A3:A2:A1|a1a2a3a4a5a6/);
 if(word&&[2,3].includes(dt)){assert.match(t,/feature-context-unknown/);assert.match(t,/TargetA or corresponding scanner address, depending on scanner Own_Address_Type/);}
 }
});
test('independent extended controller: whole-event failure, both kind switches, bounded pages and stale controls',async()=>{
 const malformed=event([row(0,Buffer.alloc(0)),row(0,Buffer.alloc(0))]);malformed[malformed.length-1]=1;
 const c=await setup([event(Array.from({length:8},()=>row(0,Buffer.alloc(0)))),legacy,malformed,event([row()]),event([row()])]);
 assert.equal(c.state.metadata!.records.length,4);let old=c.state;c.selectExtended(4,c.lease,old);assert.equal(c.state,old);
 c.selectExtended(0,c.lease,c.state);assert.equal(c.state.extendedReports.length,4);assert.equal(c.state.extendedCount,8);assert.equal(c.state.extendedReports[0]!.index,0);
 c.extendedPage(1,c.lease,c.state);assert.equal(c.state.extendedReports[0]!.index,4);const second=c.state;
 c.extendedPage(0,c.lease,old);assert.equal(c.state,second);c.select(1,c.lease,old);assert.equal(c.state,second);
 c.select(1,c.lease,c.state);assert.equal(c.state.selectedIndex,1);assert.equal(c.state.extendedCount,0);assert.equal(c.state.extendedPage,0);
 c.selectExtended(0,c.lease,c.state);assert.equal(c.state.selectedIndex,null);assert.deepEqual(c.state.reports,[]);
 c.selectExtended(2,c.lease,c.state);empty(c);assert.match(c.state.message,/refused/);assert.doesNotMatch(withoutDraft(render(c.state)),/Extended report 0:|Selected legacy event/);
 c.page(4,c.lease,c.state);assert.equal(c.state.metadata!.records.length,1);old=c.state;c.page(0,c.lease,c.state);c.selectExtended(4,c.lease,old);assert.notEqual(c.state,old);assert.equal(c.state.extendedIndex,null);
});
test('independent extended controller: deep immutable aliases, exact bytes and all reset fences',async()=>{
 for(const reset of ['edit','declare','clear','reject','deactivate'] as const){
 const c=await setup([event(Array.from({length:8},()=>row(0,Buffer.alloc(0))))]);c.selectExtended(0,c.lease,c.state);c.extendedPage(1,c.lease,c.state);const old=c.state,lease=c.lease;deepFrozen(old);assert.deepEqual(Object.keys(c),[]);
 assert.throws(()=>{(old.extendedReports[0]!.eventType as any).raw=999;},TypeError);assert.throws(()=>{(old.extendedReports as any).push({});},TypeError);
 if(reset==='edit')c.edit(old.draft,lease);else if(reset==='declare')c.declare('recorded-import',lease);else if(reset==='clear')c.clear(lease);else if(reset==='reject')c.edit('zz',lease);else c.deactivate();empty(c);assert.equal(c.state.metadata,null);
 c.selectExtended(0,lease,old);c.extendedPage(0,lease,old);empty(c);assert.equal(old.extendedReports[0]!.index,4);
 }
});
test('independent extended controller: stale hashes success/failure cannot resurrect or replace newer result',async()=>{
 for(const fail of [false,true])for(const reset of ['edit','declare','clear','reject','deactivate'] as const){
 let resolve!:(s:string)=>void,reject!:(e:Error)=>void;let seen!:Uint8Array;let calls=0;
 const hex=capture([event([row()])]);const c=new Controller(true,async bytes=>{seen=bytes;calls++;return new Promise<string>((a,b)=>{resolve=a;reject=b;});});
 c.edit(hex,c.lease);c.declare('synthetic-fixture',c.lease);const lease=c.lease;const pending=c.inspect(lease);assert.equal(Buffer.from(seen).toString('hex'),hex);assert.equal(calls,1);
 if(reset==='edit')c.edit(hex,lease);else if(reset==='declare')c.declare('recorded-import',lease);else if(reset==='clear')c.clear(lease);else if(reset==='reject')c.edit('zz',lease);else {c.deactivate();c.activate();}
 const after=c.state;if(fail)reject(new Error('late'));else resolve(await hciDigest(seen));await pending;assert.equal(c.state,after);empty(c);
 }
});

test('independent extended UI: unknown flags and contradictory legacy status diagnostics are explicit',async()=>{
 for(const word of [0x8000,0x30,0xffff]){
 const c=await setup([event([row(word)])]);c.selectExtended(0,c.lease,c.state);const t=withoutDraft(render(c.state));const r=c.state.extendedReports[0]!;
 assert.match(t,new RegExp(`Event type: offset 45; length 2; raw ${word};`));assert.match(t,new RegExp(`Reserved event bits ${word&0xff80}`));
 if(word&16){assert.match(t,/contradictory/);assert.match(t,/Diagnostics: 1/);assert.match(t,/Diagnostic offset 45/);}else assert.match(t,/state &quot;reserved&quot;/);
 assert.doesNotMatch(t,/PRIVATE_EXT_PAYLOAD/);assert.equal(r.dataStatus.raw,(word>>5)&3);
 }
});
test('independent extended UI: large forged strings and arrays never escape bounded selected projection',async()=>{
 const c=await setup([event([row(0x30)])]);c.selectExtended(0,c.lease,c.state);const r=c.state.extendedReports[0]!;const long='x'.repeat(10000)+'END_MARKER';
 const altered={...r,eventType:{...r.eventType,state:long,meaning:long},advertiserAddress:{...r.advertiserAddress,wireHex:long,display:long},diagnostics:Array.from({length:100},()=>({...r.diagnostics[0]!,state:long,meaning:long}))};
 const state={...c.state,extendedReports:Array.from({length:100},(_,index)=>({...altered,index}))} as HciWorkbenchState;const t=withoutDraft(render(state));
 assert.doesNotMatch(t,/END_MARKER/);assert.match(t,/first 96 of 10010 characters/);assert.match(t,/first 192 of 10010 characters/);assert.equal((t.match(/Extended report [0-9]+:/g)??[]).length,4);assert.equal((t.match(/Diagnostic offset/g)??[]).length,16);assert.ok(t.length<30000);
});
test('independent extended controller: newer inspection wins when old hash completes after it',async()=>{
 const resolves:Array<(s:string)=>void>=[],buffers:Uint8Array[]=[];const c=new Controller(true,async b=>{buffers.push(b);return new Promise<string>(resolve=>resolves.push(resolve));});
 const source=capture([event([row()])]);c.edit(source,c.lease);c.declare('synthetic-fixture',c.lease);const old=c.inspect(c.lease);
 c.edit(source.toUpperCase(),c.lease);const fresh=c.inspect(c.lease);assert.deepEqual(buffers[0],buffers[1]);resolves[1]!(await hciDigest(buffers[1]!));await fresh;c.selectExtended(0,c.lease,c.state);const selected=c.state;
 resolves[0]!(await hciDigest(buffers[0]!));await old;assert.equal(c.state,selected);assert.equal(c.state.metadata!.source.sha256,await hciDigest(Buffer.from(source,'hex')));
});
