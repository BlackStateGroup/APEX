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
(globalThis as any).__independentStaticRender = primitives;
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
      const source = 'export const { StyleSheet, View, Text, TextInput, Pressable } = globalThis.__independentStaticRender;';
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
finally { hooks.deregister(); rmSync(output, { recursive: true, force: true }); delete (globalThis as any).__independentStaticRender; }
function render(state: NfcStaticWorkbenchState) {
  const noAction = () => assert.fail('Static projection must not act');
  return renderToStaticMarkup(React.createElement(Projection, { state, edit: noAction, clear: noAction, inspect: noAction, page: noAction, declare: noAction, example: noAction, mode: noAction }));
}

const withoutDraft = (s: string) => s.replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g, '');
const data = (prefix: string) => prefix.padEnd(96,'0');
async function inspect(hex: string, structure=false) {
 const c=new Controller(true,hciDigest); c.mode(structure?'static-structure-64':'static-data-48',c.lease); c.declare('synthetic-fixture',c.lease); c.edit(hex,c.lease); await c.inspect(c.lease); return c;
}
test('independent actual TSX renders structure diagnostics and source-only metadata', async()=>{
 const c=await inspect('be'.repeat(12)+'e1100700'+data('fe'),true);
 const html=withoutDraft(render(c.state));
 assert.match(html,/TLV status: unsupported/); assert.match(html,/cc-outside-static-profile/);
 assert.match(html,/source offset 12; data offset not applicable/);
 assert.match(html,/NDEF handoff: not-attempted/); assert.doesNotMatch(html,/bebebebe|<a\b|href=/);
 assert.match(render(c.state),/bebebebe/); // Exact draft is deliberately visible.
});
test('independent actual TSX pages real records and quotes hostile text without actions',async()=>{
 const text='<a>!'; const payload=Buffer.from('\u0002en'+text).toString('hex');
 const ndef='d101'+(payload.length/2).toString(16).padStart(2,'0')+'54'+payload;
 const c=await inspect(data('03'+(ndef.length/2).toString(16).padStart(2,'0')+ndef+'fe'));
 let html=withoutDraft(render(c.state)); assert.match(html,/Text &quot;&lt;a&gt;!&quot;/); assert.doesNotMatch(html,/<a\b|href=|onClick=/);
 const records='900000'+'100000'.repeat(4)+'500000';
 const six=await inspect(data('0312'+records+'fe'));
 html=withoutDraft(render(six.state)); assert.equal((html.match(/>NDEF record /g)||[]).length,4);
 six.page('recordPage',1,six.lease,six.state); html=withoutDraft(render(six.state));
 assert.equal((html.match(/>NDEF record /g)||[]).length,2); assert.match(html,/NDEF record 5:/); assert.doesNotMatch(html,/NDEF record 0:/);
 const r=six.state.report!, d=r.ndef.decoder!;
 const state={...six.state, issuePage:1, report:{...r,ndef:{...r.ndef,decoder:{...d,issues:Array.from({length:9},(_,i)=>({code:'issue-'+i,offset:i,dataOffset:i+2,sourceOffset:i+2}))}}}};
 html=withoutDraft(render(state)); assert.equal((html.match(/>NDEF issue /g)||[]).length,4); assert.match(html,/issue-4/); assert.doesNotMatch(html,/issue-8/);
});
