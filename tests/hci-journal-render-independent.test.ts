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
import { HciDocumentController as Controller } from '../src/hci-document-workbench.ts';
import { prepareHci, createHciLegacyEventDocument } from '../packages/core/hci-offline.ts';
import { hash, header, record, event, report } from './hci-selected-review-fixture.ts';
import type { HciDocumentState } from '../src/hci-document-workbench.ts';
import type { HciDocumentViewProps } from '../src/HciDocumentWorkbench.tsx';
const legacyUrl = new URL('../src/HciWorkbench.tsx', import.meta.url).href;
const componentUrl = new URL('../src/HciDocumentWorkbench.tsx', import.meta.url).href;
const reopenUrl = new URL('../src/HciEvidenceReopen.tsx', import.meta.url).href;
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
    '--outDir', output, '--rootDir', '.', 'src/HciEvidenceReopen.tsx'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', npm_config_offline: 'true',
      npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' },
    stdio: 'pipe',
  });
} catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if ([componentUrl, legacyUrl, reopenUrl].includes(context.parentURL ?? '') && specifier === 'react-native') {
      const source = 'export const { StyleSheet, View, Text, TextInput, Pressable } = globalThis.__apexHciReviewStaticRender;';
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    if ([componentUrl, legacyUrl, reopenUrl].includes(context.parentURL ?? '') && specifier === './platform/hci-digest') return next('./platform/hci-digest.ts', context);
    if ([componentUrl, legacyUrl, reopenUrl].includes(context.parentURL ?? '') && specifier === './platform/hci-input') return next('./platform/hci-input.tsx', context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/src/platform/hci-input.tsx')) return {format:'module',source:readFileSync(join(output,'src/platform/hci-input.js'),'utf8'),shortCircuit:true};
    if (![componentUrl, legacyUrl, reopenUrl].includes(url)) return next(url, context);
    const filename = new URL(url).pathname.split('/').at(-1)!.replace(/\.tsx$/, '.js');
    return { format: 'module', source: readFileSync(join(output, 'src', filename), 'utf8'), shortCircuit: true };
  },
});
let ReopenProjection: typeof import('../src/HciEvidenceReopen.tsx').HciEvidenceReopenView;
let Owner: React.ComponentType<{ active: boolean }>;
let Projection: React.ComponentType<HciDocumentViewProps>;
try { ({ HciEvidenceReopenView: ReopenProjection } = await import('../src/HciEvidenceReopen.tsx')); ({ HciDocumentWorkbench: Owner, HciDocumentWorkbenchView: Projection } = await import('../src/HciDocumentWorkbench.tsx')); }
finally { hooks.deregister(); rmSync(output, { recursive: true, force: true }); delete (globalThis as any).__apexHciReviewStaticRender; }
function render(state: HciDocumentState) {
  const noAction = () => assert.fail('Static projection must not act');
  return renderToStaticMarkup(React.createElement(Projection, { state, edit: noAction, clear: noAction, verify: noAction, page: noAction }));
}

function buttonDisabled(markup:string,label:string){const match=[...markup.matchAll(/<button\b([^>]*)>/g)].find(m=>m[1]!.includes(`aria-label="${label}"`));assert.ok(match,label);return match[1]!.includes('disabled=""');}
test('independent saved HCI actual TSX hides document before explicit reopen and renders read-only inert bounded summaries',async()=>{
 const {HciEvidenceReopenController}=await import('../src/hci-evidence-reopen.ts');
 const {EvidenceStore}=await import('../packages/core/evidence.ts');
 const {prepareHciEventEvidenceInput}=await import('../packages/core/hci-event-evidence.ts');
 const {createHash}=await import('node:crypto');
 const store=new EvidenceStore({insert:async()=>{},list:async()=>[]},{sha256:async s=>createHash('sha256').update(s).digest('hex'),sha256Bytes:hash,randomId:()=> 'render-review'});
 const bytes=Buffer.concat([header,record(event(Array.from({length:6},()=>report('020106'))))]);
 const document=await createHciLegacyEventDocument(await prepareHci(bytes,{provenance:'recorded-import',label:'<script>inert</script> https://example.invalid/'},hash),0,hash);
 const row=await store.save(prepareHciEventEvidenceInput(document));const c=new HciEvidenceReopenController(row,hash);
 const renderSaved=()=>renderToStaticMarkup(React.createElement(ReopenProjection,{state:c.state,pending:c.pending,message:c.message,reopen:()=>assert.fail('no events'),page:()=>assert.fail('no events')}));
 let markup=renderSaved();assert.match(markup,/UNVERIFIED/);assert.doesNotMatch(markup,/Exact HCI document JSON|Legacy report|derivative.recordHex|&lt;script&gt;/);
 await c.reopen(store,c.lease,c.state);markup=renderSaved();assert.match(markup,/Canonical envelope verified/);assert.match(markup,/Read-only exact saved snapshot/);assert.match(markup,/&lt;script&gt;/);assert.doesNotMatch(markup,/<script|<a\b|<textarea|Save exact verified|Clear HCI document|Verify\/reopen HCI document/);
 assert.equal((markup.match(/Legacy report [0-9]+:/g)??[]).length,4);assert.match(markup,/Original-source references are UNVERIFIED/);assert.match(markup,/Journal observedAt is declared save time/);
 c.page(1,c.lease,c.state);assert.equal((renderSaved().match(/Legacy report [0-9]+:/g)??[]).length,2);
 c.deactivate();assert.doesNotMatch(renderSaved(),/Exact HCI document JSON|Legacy report/);
});
