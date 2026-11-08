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
import { HciDocumentController } from '../src/hci-document-workbench.ts';
import type { HciDocumentState } from '../src/hci-document-workbench.ts';
import type { HciDocumentViewProps } from '../src/HciDocumentWorkbench.tsx';
const componentUrl = new URL('../src/HciDocumentWorkbench.tsx', import.meta.url).href;
const reopenUrl = new URL('../src/HciEvidenceReopen.tsx', import.meta.url).href;
const comparisonUrl = new URL('../src/HciComparisonWorkbench.tsx', import.meta.url).href;
const urls = [comparisonUrl, reopenUrl, componentUrl, new URL('../src/HciWorkbench.tsx', import.meta.url).href];
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
    '--outDir', output, '--rootDir', '.', 'src/HciDocumentWorkbench.tsx', 'src/HciEvidenceReopen.tsx', 'src/HciComparisonWorkbench.tsx'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', npm_config_offline: 'true',
      npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' },
    stdio: 'pipe',
  });
} catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (urls.includes(context.parentURL!) && specifier === 'react-native') {
      const source = 'export const { StyleSheet, View, Text, TextInput, Pressable } = globalThis.__apexHciStaticRender;';
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    if (urls.includes(context.parentURL!) && specifier === './platform/hci-digest') return next('./platform/hci-digest.ts', context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!urls.includes(url)) return next(url, context);
    const filename = new URL(url).pathname.split('/').at(-1)!.replace(/\.tsx$/, '.js');
    return { format: 'module', source: readFileSync(join(output, 'src', filename), 'utf8'), shortCircuit: true };
  },
});
let CompareProjection: typeof import('../src/HciComparisonWorkbench.tsx').HciComparisonWorkbenchView;
let Owner: React.ComponentType<{ active: boolean }>;
let Projection: React.ComponentType<HciDocumentViewProps>;
let ReopenProjection: typeof import('../src/HciEvidenceReopen.tsx').HciEvidenceReopenView;
try { ({ HciComparisonWorkbenchView: CompareProjection } = await import('../src/HciComparisonWorkbench.tsx')); ({ HciEvidenceReopenView: ReopenProjection } = await import('../src/HciEvidenceReopen.tsx')); ({ HciDocumentWorkbench: Owner, HciDocumentWorkbenchView: Projection } = await import('../src/HciDocumentWorkbench.tsx')); }
finally { hooks.deregister(); rmSync(output, { recursive: true, force: true }); delete (globalThis as any).__apexHciStaticRender; }
function render(state: HciDocumentState) {
  const noAction = () => assert.fail('Static projection must not act');
  return renderToStaticMarkup(React.createElement(Projection, { state, edit: noAction, clear: noAction, verify: noAction, page: noAction }));
}


import { HciComparisonController } from '../src/hci-comparison-workbench.ts';
import { HCI_COMPARISON_EXAMPLES } from '../src/hci-comparison-examples.ts';
function compareRender(c:HciComparisonController) { const no=()=>assert.fail('Static render must not act'); return renderToStaticMarkup(React.createElement(CompareProjection,{state:c.state,canCompare:c.canCompare(),edit:no,clear:no,verify:no,select:no,page:no,resultPage:no,compare:no,example:no})); }
test('actual comparison TSX shows exact drafts, explicit controls, bounded rows and provenance before result',async()=>{
 const c=new HciComparisonController(true,hciDigest);c.example(...HCI_COMPARISON_EXAMPLES,c.lease,c.state);const before=compareRender(c);assert.match(before,/requested report none/);assert.doesNotMatch(before,/Data-byte offset 0:/);assert.match(before,/multiple advertisers/);
 for(const side of ['left','right'] as const){await c.verify(side,c.lease,c.state);c.select(side,0,c.lease,c.state);}await c.compare(c.lease,c.state);const html=compareRender(c);
 for(const phrase of ['left UNVERIFIED original-source','right UNVERIFIED original-source','operator','Data-byte offset 0','absent (null)','NOT service-payload','statistical significance','experimental control','AD framing','physical validation']) assert.ok(html.toLowerCase().includes(phrase.toLowerCase()),phrase);
 assert.ok(html.indexOf('right UNVERIFIED original-source')<html.indexOf('Data-byte offset 0'));assert.doesNotMatch(html,/<a |href=|serviceReadings/);assert.equal((html.match(/Data-byte offset /g)||[]).length,4);
 c.deactivate();assert.doesNotMatch(compareRender(c),/Data-byte offset 0|verified derivative binary/);
});
test('stage controls are absent without callback or in read-only journal projection',async()=>{const d=new HciDocumentController(true,hciDigest);d.receive({id:1,document:HCI_COMPARISON_EXAMPLES[0]});await d.verify(d.lease,d.state);assert.doesNotMatch(render(d.state),/Stage report/);const no=()=>{};const props={state:d.state,edit:no,clear:no,verify:no,page:no,stage:no};assert.match(renderToStaticMarkup(React.createElement(Projection,props)),/Stage report 0 as left/);assert.doesNotMatch(renderToStaticMarkup(React.createElement(Projection,{...props,readonly:true})),/Stage report/);});
