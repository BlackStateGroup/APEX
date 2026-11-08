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
import { NfcStaticWorkbenchController as Controller, NFC_STATIC_DATA_EXAMPLE } from '../src/nfc-static-workbench.ts';
import type { NfcStaticWorkbenchState } from '../src/nfc-static-workbench.ts';
import type { NfcStaticWorkbenchViewProps } from '../src/NfcStaticWorkbench.tsx';
const componentUrl = new URL('../src/NfcStaticWorkbench.tsx', import.meta.url).href;
// Deliberately narrow host projection, not RN layout, event or accessibility emulation.
const primitives = {
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  TextInput: ({ value, accessibilityLabel }: any) => React.createElement('textarea', { defaultValue: value, 'aria-label': accessibilityLabel }),
  Pressable: ({ children, disabled, accessibilityLabel }: any) => React.createElement('button', { disabled, 'aria-label': accessibilityLabel }, children),
};
(globalThis as any).__apexNfcStaticRender = primitives;
// TypeScript 7 provides a local CLI rather than the old transpileModule API.
// Emit to a disposable directory; load only the allowlisted TSX output.
// This is transpilation, not a replacement for the separate full typecheck.
const output = mkdtempSync(join(tmpdir(), 'apex-static-render-'));
try {
  execFileSync(process.execPath, [fileURLToPath(new URL('bin/tsc', import.meta.resolve('typescript/package.json'))),
    '--ignoreConfig', '--noCheck', '--jsx', 'react', '--target', 'es2022', '--module', 'esnext',
    '--outDir', output, '--rootDir', '.', 'src/NfcStaticWorkbench.tsx'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', npm_config_offline: 'true',
      npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' },
    stdio: 'pipe',
  });
} catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === componentUrl && specifier === 'react-native') {
      const source = 'export const { StyleSheet, View, Text, TextInput, Pressable } = globalThis.__apexNfcStaticRender;';
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
let Projection: React.ComponentType<NfcStaticWorkbenchViewProps>;
try { ({ NfcStaticWorkbench: Owner, NfcStaticWorkbenchView: Projection } = await import('../src/NfcStaticWorkbench.tsx')); }
finally { hooks.deregister(); rmSync(output, { recursive: true, force: true }); delete (globalThis as any).__apexNfcStaticRender; }
function render(state: NfcStaticWorkbenchState) {
  const noAction = () => assert.fail('Static projection must not act');
  return renderToStaticMarkup(React.createElement(Projection, { state, edit: noAction, clear: noAction, inspect: noAction, page: noAction, declare: noAction, example: noAction, mode: noAction }));
}

const withoutDraft = (s: string) => s.replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g, '');
const data = (prefix: string) => prefix.padEnd(96,'0');
async function inspect(hex: string, structure=false) {
 const c=new Controller(true,hciDigest); c.mode(structure?'static-structure-64':'static-data-48',c.lease); c.declare('synthetic-fixture',c.lease); c.edit(hex,c.lease); await c.inspect(c.lease); return c;
}
test('actual static TSX inactive and uninspected; boundaries and rejection disabled', async()=>{
 assert.equal(renderToStaticMarkup(React.createElement(Owner,{active:false})), '');
 const c=new Controller(true,hciDigest); c.example('static-data-48',c.lease); let markup=render(c.state);
 assert.doesNotMatch(markup,/Static result:/);
 for(const phrase of ['fenced, not cancelled','NOT hex text','original pre-paste','maximum 128','not generic tag compatibility','Input draft only']) assert.ok(markup.includes(phrase),phrase);
 c.edit(' ',c.lease); markup=render(c.state); assert.match(markup,/<button[^>]*disabled=""[^>]*aria-label="Inspect static NFC"/);
});
test('actual TSX separates TLV statuses from NDEF missing, ambiguous, empty and decoder failure',async()=>{
 for(const [hex,tlv,ndef] of [[data('fe'),'supported','missing'],[data('03000300fe'),'supported','ambiguous'],[data('0300fe'),'supported','empty'],[data('03ff'),'unsupported','not-attempted'],[data('0330'),'malformed','not-attempted'],[data('030100fe'),'supported','decoded-handoff']] as const) {
  const c=await inspect(hex);const markup=withoutDraft(render(c.state)); assert.ok(markup.includes(`TLV status: ${tlv}`)); assert.ok(markup.includes(`NDEF handoff: ${ndef}`));
  if(ndef==='decoded-handoff') { assert.match(markup,/NDEF decoder status: malformed/); assert.match(markup,/relative NDEF offset 0; data offset 2; source offset 2/); }
 }
});
test('actual TSX bounds TLV pages, record/issue rows and quoted inert strings',async()=>{
 const c=await inspect('00'.repeat(48)); let markup=withoutDraft(render(c.state)); assert.equal((markup.match(/>TLV \d+:/g)??[]).length,4);
 c.page('tlvPage',11,c.lease,c.state); markup=withoutDraft(render(c.state)); assert.match(markup,/TLV 47:/);
 // Manually authored single URI record, no navigation or native API.
 const ndef='d1010a55046578616d706c652e78'; const u=await inspect('ab'.repeat(12)+'e1100600'+data('030e'+ndef+'fe'),true);
 markup=withoutDraft(render(u.state)); assert.match(markup,/URI &quot;https:\/\/example.x&quot;/); assert.doesNotMatch(markup,/<a\b|href=|abababab|d1010a55/); assert.match(markup,/relative NDEF \[0, 14\); data \[2, 16\); source \[18, 32\)/);
 const report=u.state.report!, decoder=report.ndef.decoder!, long='x'.repeat(1000)+'END_MARKER';
 const fake={...u.state,report:{...report,ndef:{...report.ndef,decoder:{...decoder,records:Array.from({length:100},()=>({...decoder.records[0]!,value:{kind:'text' as const,text:long,language:long,encoding:'utf-8' as const}})),issues:Array.from({length:100},()=>({offset:0,dataOffset:2,sourceOffset:18,code:long}))}}}};
 markup=withoutDraft(render(fake)); assert.equal((markup.match(/>NDEF record \d+:/g)??[]).length,4); assert.equal((markup.match(/>NDEF issue /g)??[]).length,4); assert.doesNotMatch(markup,/END_MARKER/);
});
test('actual TSX opaque spans never echo proprietary, trailing or unknown payload bytes',async()=>{
 // Proprietary marker, one unknown NDEF type with marker payload, then opaque trailing marker.
 const ndef='d10104'+'61'+'deadbeef';
 const c=await inspect(('fd04cafebabe0308'+ndef+'fe'+'facefeed').padEnd(96,'0'));
 const markup=withoutDraft(render(c.state));
 assert.match(markup,/proprietary/); assert.match(markup,/Opaque span only/); assert.match(markup,/kind opaque/);
 assert.doesNotMatch(markup,/cafebabe|deadbeef|facefeed|payloadHex|rawHex/);
});
test('authored Text structure example loads without inspection and renders quoted inert APEX only after Inspect',async()=>{
 const c=new Controller(true,hciDigest); c.example('static-structure-64',c.lease);
 let markup=withoutDraft(render(c.state)); assert.match(markup,/Load synthetic empty data-area example/); assert.match(markup,/Load synthetic Text structure example/); assert.doesNotMatch(markup,/Static result:|Text &quot;APEX&quot;/);
 await c.inspect(c.lease); markup=withoutDraft(render(c.state));
 assert.match(markup,/Text &quot;APEX&quot;; language &quot;en&quot;; encoding utf-8/); assert.match(markup,/NDEF decoder status: parsed/); assert.doesNotMatch(markup,/<a\b|href=/);
});
