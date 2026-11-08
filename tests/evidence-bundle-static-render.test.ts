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

import { EvidenceBundleWorkbench as Controller } from '../src/evidence-bundle-workbench.ts';
import { sha256, bundleFixture } from './bundle-preview-fixture.ts';
import type { BundleState } from '../src/evidence-bundle-workbench.ts';
const componentUrl = new URL('../src/EvidenceBundleWorkbench.tsx', import.meta.url).href;
// Deliberately narrow host projection, not RN layout, event or accessibility emulation.
const primitives = {
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  TextInput: ({ value, accessibilityLabel }: any) => React.createElement('textarea', { defaultValue: value, 'aria-label': accessibilityLabel }),
  Pressable: ({ children, disabled, accessibilityLabel }: any) => React.createElement('button', { disabled, 'aria-label': accessibilityLabel }, children),
};
(globalThis as any).__apexBundleStaticRender = primitives;
// TypeScript 7 provides a local CLI rather than the old transpileModule API.
// Emit to a disposable directory; load only the allowlisted TSX output.
// This is transpilation, not a replacement for the separate full typecheck.
const output = mkdtempSync(join(tmpdir(), 'apex-static-render-'));
try {
  execFileSync(process.execPath, [fileURLToPath(new URL('bin/tsc', import.meta.resolve('typescript/package.json'))),
    '--ignoreConfig', '--noCheck', '--jsx', 'react', '--target', 'es2022', '--module', 'esnext',
    '--outDir', output, '--rootDir', '.', 'src/EvidenceBundleWorkbench.tsx'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', npm_config_offline: 'true',
      npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' },
    stdio: 'pipe',
  });
} catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === componentUrl && specifier === 'react-native') {
      const source = 'export const { StyleSheet, View, Text, TextInput, Pressable } = globalThis.__apexBundleStaticRender;';
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    if (context.parentURL === componentUrl && specifier === './platform/hci-digest') return next('./platform/hci-digest.ts', context);
    if (context.parentURL === componentUrl && specifier === './platform/bundle-digest') return next('./platform/bundle-digest.ts', context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url !== componentUrl) return next(url, context);
    const filename = new URL(url).pathname.split('/').at(-1)!.replace(/\.tsx$/, '.js');
    return { format: 'module', source: readFileSync(join(output, 'src', filename), 'utf8'), shortCircuit: true };
  },
});
let Owner: React.ComponentType<{ active: boolean }>;
let Projection: React.ComponentType<{ state: BundleState; edit: (text: string) => void; clear: () => void; inspect: () => void; page: (page: number) => void }>;
try { ({ EvidenceBundleWorkbench: Owner, EvidenceBundleWorkbenchView: Projection } = await import('../src/EvidenceBundleWorkbench.tsx')); }
finally { hooks.deregister(); rmSync(output, { recursive: true, force: true }); delete (globalThis as any).__apexBundleStaticRender; }
function render(state: BundleState) {
  const noAction = () => assert.fail('Static projection must not act');
  return renderToStaticMarkup(React.createElement(Projection, { state, edit: noAction, clear: noAction, inspect: noAction, page: noAction }));
}
test('actual TSX initial/inactive renders and precise limits', () => {
  const c = new Controller(); const markup = render(c.state);
  assert.equal(renderToStaticMarkup(React.createElement(Owner, { active: true })), markup);
  assert.equal(renderToStaticMarkup(React.createElement(Owner, { active: false })), '');
  assert.match(markup, /2097152/); assert.match(markup, /16384/); assert.match(markup, /1–100/);
  assert.doesNotMatch(markup, /Verified bundle summary/); assert.match(markup, /No restore, import, save, export/);
});
test('actual TSX projects four bounded metadata rows and inert provenance/digest caveats', async () => {
  const c = new Controller(); c.edit((await bundleFixture()).bundle); await c.inspect(sha256);
  for (let page = 0; page < 3; page++) {
    c.page(page); const markup = render(c.state);
    assert.deepEqual([...markup.matchAll(/Listed record (\d+) ·/g)].map(m => Number(m[1])), page === 0 ? [1,2,3,4] : page === 1 ? [5,6,7,8] : [9]);
    assert.match(markup, new RegExp(`Record page ${page + 1} of 3`));
    assert.match(markup, /Whole-bundle SHA-256/); assert.match(markup, /Individual canonical content SHA-256 verified/);
    assert.match(markup, /not outer JSON formatting/); assert.match(markup, /author, source, timestamps/); assert.match(markup, /does not establish a complete journal/);
    assert.doesNotMatch(markup, /<a\b|<script\b/);
    for (const [label, disabled] of [['Previous bundle records', page === 0], ['Next bundle records', page === 2]] as const) {
      const button = [...markup.matchAll(/<button\b([^>]*)>/g)].find(m => m[1]!.includes(`aria-label="${label}"`)); assert.ok(button); assert.equal(button[1]!.includes('disabled=""'), disabled);
    }
  }
  c.edit('{}'); assert.doesNotMatch(render(c.state), /Verified bundle summary|Listed record/);
  await c.inspect(sha256); assert.match(render(c.state), /Bundle inspection failed/);
  c.clear(); assert.doesNotMatch(render(c.state), /Bundle inspection failed/);
});
test('actual TSX bounds valid long legacy timestamps without changing retained data', async () => {
  const observedAt = 'Sun, 08 Nov 2026 01:02:03 GMT' + ' '.repeat(12000);
  const { bundle, documents } = await bundleFixture(4, observedAt);
  const c = new Controller(); c.edit(bundle); await c.inspect(sha256); assert.ok(c.state.report);
  const markup = render(c.state).replace(/<textarea[\s\S]*?<\/textarea>/g, '');
  assert.ok(markup.length < 10000, String(markup.length));
  assert.equal([...markup.matchAll(new RegExp(`truncated display: first 120 of ${observedAt.length} UTF-16 code units`, 'g'))].length, 4);
  assert.equal(c.state.report.records[0]!.observedAt, observedAt); assert.deepEqual(c.state.report.recordDocuments, documents);
  c.edit(' '.repeat(2097153));
  const rejected = render(c.state); assert.match(rejected, /Inspect is blocked/);
  const button = [...rejected.matchAll(/<button\b([^>]*)>/g)].find(m => m[1]!.includes('aria-label="Inspect evidence bundle"'));
  assert.ok(button?.[1]!.includes('disabled=""'));
});

// Independent review regression: record-count pagination alone does not bound
// metadata text. The unchanged core accepts Date.parse-finite padded timestamps.
test('independent: valid long timestamp metadata uses a bounded display excerpt', async () => {
  const { EvidenceStore } = await import('../packages/core/evidence.ts');
  const { createEvidenceBundle } = await import('../packages/core/evidence-bundle.ts');
  const documents: string[] = [];
  const padded = 'Sun, 08 Nov 2026 01:02:03 GMT' + ' '.repeat(12000);
  assert.ok(Number.isFinite(Date.parse(padded)));
  const store = new EvidenceStore({ insert: async (_, text) => { documents.push(text); }, list: async () => documents }, { randomId: () => `long-${documents.length}`, sha256 });
  for (let i = 0; i < 4; ++i) await store.save({ kind: 'analysis.can', source: 'offline-import', observedAt: padded, payload: { note: '</textarea><script>evil()</script>', url: 'javascript:evil()' } });
  const c = new Controller(); c.edit(await createEvidenceBundle(documents, '2026-11-08T01:02:03.000Z', sha256)); await c.inspect(sha256);
  assert.ok(c.state.report);
  assert.deepEqual(c.state.report.recordDocuments, documents);
  const markup = render(c.state).replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g, '');
  assert.doesNotMatch(markup, /<script\b|<a\b|javascript:evil/);
  assert.ok(markup.length < 12000, `Metadata projection flooded rendering: ${markup.length} characters excluding exact draft`);
});
test('actual bundle TSX separately reports HCI envelope and binary checks without decoded advertisers', async()=>{
 const {HciWorkbenchController}=await import('../src/hci-workbench.ts');const {hciDigest}=await import('../src/platform/hci-digest.ts');const {EvidenceStore}=await import('../packages/core/evidence.ts');const {saveHciDocument}=await import('../src/hci-document-workbench.ts');const {createEvidenceBundle}=await import('../packages/core/evidence-bundle.ts');
 const h=new HciWorkbenchController(true,hciDigest);h.example(h.lease);await h.inspect(h.lease);h.select(0,h.lease,h.state);await h.prepareDocument(h.lease,h.state);
 const docs:string[]=[];const store=new EvidenceStore({insert:async(_,s)=>{docs.push(s);},list:async()=>docs},{sha256,sha256Bytes:hciDigest,randomId:()=> 'render-hci'});await saveHciDocument(store,h.state.preparedDocument!);
 const c=new Controller();c.edit(await createEvidenceBundle(docs,'2026-11-08T01:02:03.000Z',sha256,hciDigest));await c.inspect(sha256,hciDigest);const markup=render(c.state);
 assert.match(markup,/HCI canonical envelope verified separately from binary derivative SHA-256/);assert.match(markup,/Original capture hash, size, index and offset remain UNVERIFIED/);assert.doesNotMatch(markup,/Legacy report|AD framing status|Exact HCI document JSON/);
});
