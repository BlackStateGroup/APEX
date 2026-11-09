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
    if (context.parentURL === componentUrl && specifier === './platform/hci-input') return next('./platform/hci-input.tsx', context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/src/platform/hci-input.tsx')) return {format:'module',source:readFileSync(join(output,'src/platform/hci-input.js'),'utf8'),shortCircuit:true};
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
  return renderToStaticMarkup(React.createElement(Projection, { state, edit: noAction, clear: noAction, inspect: noAction, page: noAction, declare: noAction, example: noAction, select: noAction, reportPage: noAction }));
}

const withoutDraft = (s: string) => s.replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g, '');

function disabled(markup: string,label: string){const match=[...markup.matchAll(/<button\b([^>]*)>/g)].find(m=>m[1]!.includes(`aria-label="${label}"`));assert.ok(match,label);return match[1]!.includes('disabled=""');}
test('independent actual TSX: header-only input has coherent empty paging and no select controls',async()=>{
 const c=new Controller(true,hciDigest);c.edit(HCI_EXAMPLE.slice(0,32),c.lease);c.declare('synthetic-fixture',c.lease);await c.inspect(c.lease);const markup=withoutDraft(render(c.state));assert.match(markup,/HCI metadata: 0 records/);assert.match(markup,/Metadata page 1 of 1/);assert.equal(disabled(markup,'Previous HCI records'),true);assert.equal(disabled(markup,'Next HCI records'),true);assert.doesNotMatch(markup,/Select legacy HCI event|Selected legacy event|page 1 of 0/);
});
test('independent actual TSX: dense inert AD bytes remain summarized, metadata reveals no addresses or payload',async()=>{
 const data=[30,9,...Buffer.from('PRIVATE_AD_TEXT_DO_NOT_RENDER')];assert.equal(data.length,31);
 const payload=[4,62,12+data.length,2,1,4,2,171,205,239,137,103,69,data.length,...data,127];const h=Buffer.alloc(24);h.writeUInt32BE(payload.length);h.writeUInt32BE(payload.length,4);h.writeUInt32BE(3,8);
 const c=new Controller(true,hciDigest);c.edit(HCI_EXAMPLE.slice(0,32)+h.toString('hex')+Buffer.from(payload).toString('hex'),c.lease);c.declare('recorded-import',c.lease);await c.inspect(c.lease);let markup=withoutDraft(render(c.state));assert.doesNotMatch(markup,/45:67:89:EF:CD:AB|abcdef896745|PRIVATE_AD|1e095052/);
 c.select(0,c.lease,c.state);markup=withoutDraft(render(c.state));assert.match(markup,/scan-response/);assert.match(markup,/45:67:89:EF:CD:AB/);assert.match(markup,/AD elements 1; service readings 0/);assert.match(markup,/RSSI unavailable/);assert.doesNotMatch(markup,/PRIVATE_AD_TEXT/);assert.equal(disabled(markup,'Previous legacy reports'),true);assert.equal(disabled(markup,'Next legacy reports'),true);assert.ok(markup.length<8000);
});
test('independent actual TSX: selected string projections are bounded even when passed long values',async()=>{
 const c=new Controller(true,hciDigest);c.example(c.lease);await c.inspect(c.lease);c.select(0,c.lease,c.state);const r=c.state.reports[0]!;const long='x'.repeat(20000)+'END_MARKER';
 const state={...c.state,reports:[{...r,kind:long,addressWireHex:long,addressDisplay:long,dataHex:long}],metadata:{...c.state.metadata!,records:[{...c.state.metadata!.records[0]!,classification:long,flagStatus:long,timestampRaw:long}]}} as HciWorkbenchState;
 const markup=withoutDraft(render(state));assert.doesNotMatch(markup,/END_MARKER/);assert.equal((markup.match(/first 96 of 20010 characters/g)??[]).length,7);assert.ok(markup.length<8500);
});
function withAd(hex: string){const data=Buffer.from(hex,'hex');const payload=Buffer.from([4,62,12+data.length,2,1,0,0,1,2,3,4,5,6,data.length,...data,200]);const h=Buffer.alloc(24);h.writeUInt32BE(payload.length);h.writeUInt32BE(payload.length,4);h.writeUInt32BE(3,8);return HCI_EXAMPLE.slice(0,32)+h.toString('hex')+payload.toString('hex');}
test('independent actual TSX: malformed AD is explicitly visible despite accepted HCI framing',async()=>{
 const c=new Controller(true,hciDigest);c.edit(withAd('050941'),c.lease);c.declare('synthetic-fixture',c.lease);await c.inspect(c.lease);c.select(0,c.lease,c.state);const markup=withoutDraft(render(c.state));assert.match(markup,/malformed/);assert.doesNotMatch(markup,/whole legacy event validated/);assert.match(markup,/framing/i);
});
test('independent actual TSX: encrypted, unknown, malformed, partial and complete service counts stay distinct',async()=>{
 for(const [ad,matched,opaque,invalid,incomplete] of [
  ['0516d2fc41ff',0,1,0,1], // encrypted BTHome
  ['0416ffff00',0,1,0,0], // unknown UUID
  ['0416d2fc40',0,0,1,1], // missing BTHome object
  ['0616d2fc400164',1,0,0,0], // complete battery
  ['0716d2fc400164ff',0,1,0,1], // understood prefix followed by unsupported object
 ] as const){
 const c=new Controller(true,hciDigest);c.edit(withAd(ad),c.lease);c.declare('synthetic-fixture',c.lease);await c.inspect(c.lease);c.select(0,c.lease,c.state);const r=c.state.reports[0]! as any;
 assert.deepEqual([r.serviceMatched,r.serviceOpaque,r.serviceInvalid,r.serviceIncomplete],[matched,opaque,invalid,incomplete]);const markup=withoutDraft(render(c.state));assert.ok(markup.includes(`format-match ${matched}, opaque ${opaque}, invalid ${invalid}`));assert.ok(markup.includes(`incomplete or opaque detailed parses ${incomplete}`));assert.match(markup,/not authentication or verified sensor truth/);assert.match(markup,/Unknown\/encrypted payloads can remain opaque/);
 }
});
