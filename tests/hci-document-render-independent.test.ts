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
    '--outDir', output, '--rootDir', '.', 'src/HciDocumentWorkbench.tsx'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', npm_config_offline: 'true',
      npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' },
    stdio: 'pipe',
  });
} catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if ([componentUrl, legacyUrl].includes(context.parentURL ?? '') && specifier === 'react-native') {
      const source = 'export const { StyleSheet, View, Text, TextInput, Pressable } = globalThis.__apexHciReviewStaticRender;';
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    if ([componentUrl, legacyUrl].includes(context.parentURL ?? '') && specifier === './platform/hci-digest') return next('./platform/hci-digest.ts', context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (![componentUrl, legacyUrl].includes(url)) return next(url, context);
    const filename = new URL(url).pathname.split('/').at(-1)!.replace(/\.tsx$/, '.js');
    return { format: 'module', source: readFileSync(join(output, 'src', filename), 'utf8'), shortCircuit: true };
  },
});
let Owner: React.ComponentType<{ active: boolean }>;
let Projection: React.ComponentType<HciDocumentViewProps>;
try { ({ HciDocumentWorkbench: Owner, HciDocumentWorkbenchView: Projection } = await import('../src/HciDocumentWorkbench.tsx')); }
finally { hooks.deregister(); rmSync(output, { recursive: true, force: true }); delete (globalThis as any).__apexHciReviewStaticRender; }
function render(state: HciDocumentState) {
  const noAction = () => assert.fail('Static projection must not act');
  return renderToStaticMarkup(React.createElement(Projection, { state, edit: noAction, clear: noAction, verify: noAction, page: noAction }));
}

function buttonDisabled(markup:string,label:string){const match=[...markup.matchAll(/<button\b([^>]*)>/g)].find(m=>m[1]!.includes(`aria-label="${label}"`));assert.ok(match,label);return match[1]!.includes('disabled=""');}
test('independent actual document TSX: inert sensitive whole-event disclosure, exact draft and paginated status summaries',async()=>{
 const bytes=Buffer.concat([header,record(event([report('050941'),report('0516d2fc41ff'),report('0416ffff00'),report('0616d2fc400164'),report('0716d2fc400164ff')]))]);
 const p=await prepareHci(bytes,{provenance:'recorded-import',label:'<script>alert("INERT")</script> https://example.invalid/'},hash);
 const document=await createHciLegacyEventDocument(p,0,hash);const c=new Controller(true,hash);c.receive({id:1,document});
 let markup=render(c.state);assert.doesNotMatch(markup,/Legacy report 0|Verified derivative binary SHA-256 and legacy structure/);assert.match(markup,/multiple advertisers and sensitive vendor identifiers/);assert.match(markup,/fenced, not cancelled/);assert.match(markup,/Original-source references are UNVERIFIED/);
 await c.verify(c.lease,c.state);markup=render(c.state);assert.match(markup,/Document reports: 5; page 1 of 2/);assert.equal((markup.match(/Legacy report [0-9]+:/g)??[]).length,4);
 assert.match(markup,/&lt;script&gt;/);assert.doesNotMatch(markup,/<script|<a\b|href=|onClick=|"advertising":|"serviceReadings":/);
 assert.match(markup,/AD framing status &quot;malformed&quot;/);assert.match(markup,/format-match 0, opaque 1, invalid 0/);assert.match(markup,/format-match 1, opaque 0, invalid 0/);assert.match(markup,/derivative-relative/);assert.match(markup,/NOT JSON, hex text or the original full capture/);assert.match(markup,/zero drops does not prove no loss/);
 assert.equal(buttonDisabled(markup,'Previous document reports'),true);assert.equal(buttonDisabled(markup,'Next document reports'),false);
 c.page(1,c.lease,c.state);markup=render(c.state);assert.equal((markup.match(/Legacy report [0-9]+:/g)??[]).length,1);assert.match(markup,/Legacy report 4:/);assert.match(markup,/unsupported-object 1/);assert.equal(buttonDisabled(markup,'Next document reports'),true);
 c.edit('x'.repeat(4097),c.lease,c.state);markup=render(c.state);assert.equal(buttonDisabled(markup,'Verify/reopen HCI document'),true);assert.doesNotMatch(markup,/Legacy report [0-9]+:/);assert.match(markup,/Prior draft retained/);
});
test('independent actual TSX owner has no inactive output and no automatic verification on static render',()=>{
 assert.equal(renderToStaticMarkup(React.createElement(Owner,{active:false})), '');
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(Owner,{active:true})),/Verified derivative binary SHA-256 and legacy structure/);
});
