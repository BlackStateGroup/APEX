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
(globalThis as any).__apexHciStaticRender = primitives;
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
      const source = 'export const { StyleSheet, View, Text, TextInput, Pressable } = globalThis.__apexHciStaticRender;';
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
finally { hooks.deregister(); rmSync(output, { recursive: true, force: true }); delete (globalThis as any).__apexHciStaticRender; }
function render(state: HciWorkbenchState) {
  const noAction = () => assert.fail('Static projection must not act');
  return renderToStaticMarkup(React.createElement(Projection, { state, edit: noAction, clear: noAction, inspect: noAction, page: noAction, declare: noAction, example: noAction, select: noAction, reportPage: noAction }));
}

const withoutDraft = (s: string) => s.replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g, '');
test('actual TSX exposes all source/hash/time/address caveats before inspection', () => {
 const c = new Controller(true, hciDigest), markup = render(c.state);
 assert.equal(renderToStaticMarkup(React.createElement(Owner, { active: false })), '');
 for(const phrase of ['65536 hex characters / 32768 decoded bytes','No whitespace or normalization','Odd-length hex','host/controller bytes, not physical RF','caller-declared','NOT hex text','original capture bytes before paste','truthful capture history','receiver identity','physical reception','device identity','producer-declared claims','Zero cumulative drops','not necessarily over-air','Scan responses stay separate','extended advertising data remain opaque','fenced, not cancelled']) assert.ok(markup.includes(phrase),phrase);
 assert.doesNotMatch(markup,/HCI metadata:|Selected legacy event/);
});
test('actual TSX separates metadata from explicit legacy result and clears on edits', async () => {
 const c = new Controller(true,hciDigest); c.example(c.lease);
 assert.doesNotMatch(render(c.state),/HCI metadata:/);
 await c.inspect(c.lease); const metadata=withoutDraft(render(c.state));
 assert.match(metadata,/HCI metadata: 1 records/); assert.match(metadata,/Select legacy HCI event 0/);
 assert.doesNotMatch(metadata,/06:05:04:03:02:01|wire address/);
 c.select(0,c.lease,c.state); const selected=withoutDraft(render(c.state));
 assert.match(selected,/Selected legacy event 0: 1 reports/); assert.match(selected,/06:05:04:03:02:01/);
 assert.match(selected,/AD elements 0; service readings 0/);
 c.edit('zz',c.lease); const refused=render(c.state); assert.doesNotMatch(refused,/HCI metadata:|Selected legacy event/);
 assert.match(refused,/<button[^>]*disabled=""[^>]*aria-label="Inspect HCI metadata"/);
});
test('actual TSX bounds metadata and selected legacy pages independently', async () => {
 const c = new Controller(true,hciDigest); c.example(c.lease);
 const record = HCI_EXAMPLE.slice(32);
 c.edit(HCI_EXAMPLE.slice(0,32)+record.repeat(9),c.lease); await c.inspect(c.lease);
 let markup=withoutDraft(render(c.state));
 assert.equal((markup.match(/>HCI record /g)??[]).length,4);
 assert.doesNotMatch(markup,/HCI record 4:/);
 c.page(8,c.lease,c.state); markup=withoutDraft(render(c.state));
 assert.equal((markup.match(/>HCI record /g)??[]).length,1);
 assert.match(markup,/HCI record 8:/);
 // Authored five-report event; no harvested packets.
 const payload=[4,62,52,2,5,...Array.from({length:5},()=>[0,0,1,2,3,4,5,6,0,192]).flat()];
 const b=Buffer.alloc(24+payload.length); b.writeUInt32BE(payload.length,0); b.writeUInt32BE(payload.length,4); b.writeUInt32BE(3,8); b.set(payload,24);
 c.edit(HCI_EXAMPLE.slice(0,32)+b.toString('hex'),c.lease); await c.inspect(c.lease); c.select(0,c.lease,c.state);
 markup=withoutDraft(render(c.state)); assert.equal((markup.match(/>Legacy report \d:/g)??[]).length,4);
 c.reportPage(1,c.lease,c.state); markup=withoutDraft(render(c.state)); assert.equal((markup.match(/>Legacy report \d:/g)??[]).length,1);
 assert.match(markup,/Legacy report 4:/);
});
test('actual TSX distinguishes malformed AD and opaque service data from transport acceptance', async () => {
 for(const dataHex of ['050941','0416d2fc41']) {
  const data=Buffer.from(dataHex,'hex');const payload=Buffer.from([4,62,12+data.length,2,1,0,0,1,2,3,4,5,6,data.length,...data,192]);
  const b=Buffer.alloc(24+payload.length);b.writeUInt32BE(payload.length,0);b.writeUInt32BE(payload.length,4);b.writeUInt32BE(3,8);b.set(payload,24);
  const c=new Controller(true,hciDigest);c.example(c.lease);c.edit(HCI_EXAMPLE.slice(0,32)+b.toString('hex'),c.lease);await c.inspect(c.lease);c.select(0,c.lease,c.state);
  const markup=withoutDraft(render(c.state));assert.match(markup,/transport framing accepted/);assert.match(markup,/transport acceptance does not mean payload decoding succeeded/);
  if(dataHex==='050941') assert.match(markup,/AD framing status &quot;malformed&quot;; issues 1; unparsed bytes 3/);
  else assert.match(markup,/format-match 0, opaque 1, invalid 0/);
 }
});

test('actual extended TSX renders exact bounded header states and applicable addresses, never marker data', async()=>{
 const {header,record,source,marker}=await import('./hci-extended-workbench-fixture.ts');
 for(let status=0;status<4;status++) {
 const row=header(status);const c=new Controller(true,hciDigest);c.edit(source([record([row])]),c.lease);c.declare('synthetic-fixture',c.lease);await c.inspect(c.lease);
 let markup=withoutDraft(render(c.state));assert.match(markup,/Select extended HCI metadata 0/);assert.doesNotMatch(markup,/Extended report 0:|Advertiser address span/);
 c.selectExtended(0,c.lease,c.state);markup=withoutDraft(render(c.state));
 for(const phrase of ['Selected extended event 0: 1 header reports','report offset 45; length 48','Data offset 69; length 24','Terminal complete may be the last fragment only','structural acceptance','Host-feature and scanner','No ADI','feature-context-unknown','S=2 only with Advertising Coding Selection Host Support; otherwise reserved','LE Coded: unspecified coding without Advertising Coding Selection Host Support; S=8 with that support','value -64','value 7.5','no address interpretation','Ignored because directed flag is clear'])assert.ok(markup.toLowerCase().includes(phrase.toLowerCase()),phrase);
 assert.doesNotMatch(markup,/A6:A5:A4:A3:A2:A1|B6:B5:B4:B3:B2:B1|PRIVATE_EXTENDED_PAYLOAD|dataHex/);assert.ok(!markup.includes(Buffer.from(marker).toString('hex')));
 }
 for(const type of [2,3]) {const row=header();row[0]=4;row[2]=2;row[16]=type;
 const c=new Controller(true,hciDigest);c.edit(source([record([row])]),c.lease);c.declare('synthetic-fixture',c.lease);await c.inspect(c.lease);c.selectExtended(0,c.lease,c.state);const markup=withoutDraft(render(c.state));
 assert.match(markup,/A6:A5:A4:A3:A2:A1/);assert.match(markup,/B6:B5:B4:B3:B2:B1/);assert.match(markup,/TargetA or corresponding scanner address, depending on scanner Own_Address_Type/);assert.doesNotMatch(markup,/first 192/);
 }
});
test('actual extended TSX bounds reports, excerpts and diagnostics; reserved values and contradictions stay visible',async()=>{
 const {header,record,source}=await import('./hci-extended-workbench-fixture.ts');const rows=Array.from({length:7},()=>header(0,Buffer.alloc(0)));rows[0]!.writeUInt16LE(0x8090);rows[0]![2]=4;rows[0]![9]=2;rows[0]![11]=16;rows[0]![12]=21;
 const c=new Controller(true,hciDigest);c.edit(source([record(rows)]),c.lease);c.declare('synthetic-fixture',c.lease);await c.inspect(c.lease);c.selectExtended(0,c.lease,c.state);
 let markup=withoutDraft(render(c.state));assert.equal((markup.match(/>Extended report \d:/g)??[]).length,4);assert.match(markup,/Reserved event bits 32896/);assert.match(markup,/contradictory/);assert.match(markup,/Reserved PHY/);assert.match(markup,/raw 21; state &quot;reserved/);assert.match(markup,/Diagnostic offset 45/);
 c.extendedPage(1,c.lease,c.state);markup=withoutDraft(render(c.state));assert.equal((markup.match(/>Extended report \d:/g)??[]).length,3);assert.match(markup,/Extended report 6:/);
 const r=c.state.extendedReports[0]!,long='x'.repeat(20000)+'END_MARKER';const adversarial={...r,primaryPhy:{...r.primaryPhy,meaning:long},diagnostics:Array.from({length:1000},()=>({offset:0,state:long,meaning:long}))};
 markup=withoutDraft(render({...c.state,extendedReports:Array.from({length:1000},()=>adversarial)}));assert.equal((markup.match(/>Extended report \d:/g)??[]).length,4);assert.equal((markup.match(/Diagnostic offset/g)??[]).length,16);assert.doesNotMatch(markup,/END_MARKER/);assert.ok(markup.length<25000);
});
