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
import { HciComparisonController as Controller } from '../src/hci-comparison-workbench.ts';
import { prepareHci, createHciLegacyEventDocument } from '../packages/core/hci-offline.ts';
import { hash, header, record, event, report } from './hci-selected-review-fixture.ts';
import type { ComparisonState } from '../src/hci-comparison-workbench.ts';
import { doc as comparisonDoc, report as comparisonReport } from './hci-comparison-review-fixture.ts';
import type { ComparisonViewProps } from '../src/HciComparisonWorkbench.tsx';
const legacyUrl = new URL('../src/HciWorkbench.tsx', import.meta.url).href;
const componentUrl = new URL('../src/HciComparisonWorkbench.tsx', import.meta.url).href;
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
    '--outDir', output, '--rootDir', '.', 'src/HciComparisonWorkbench.tsx'], {
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
let Owner: React.ComponentType<{active:boolean}>;
let Projection: React.ComponentType<ComparisonViewProps>;
try { ({HciComparisonWorkbench:Owner,HciComparisonWorkbenchView:Projection}=await import('../src/HciComparisonWorkbench.tsx')); }
finally {hooks.deregister();rmSync(output,{recursive:true,force:true});delete (globalThis as any).__apexHciReviewStaticRender;}
function render(c:Controller){const noAction=()=>assert.fail('Static rendering cannot act');return renderToStaticMarkup(React.createElement(Projection,{state:c.state,canCompare:c.canCompare(),edit:noAction,clear:noAction,verify:noAction,select:noAction,page:noAction,resultPage:noAction,compare:noAction,example:noAction}));}
test('independent actual comparison TSX: exact drafts inert, selected rows only, bounded four-report pages',async()=>{
 const left=await comparisonDoc(Array.from({length:6},(_,i)=>comparisonReport(i===0?[2,1,0]:[0xaa,0xbb,0xcc])), '<PRIVATE><script>bad</script> https://example.invalid/');const right=await comparisonDoc([comparisonReport([2,1,0,0],4,7)]);
 const c=new Controller(true,hash);c.edit('left',' \n'+left+'\t',c.lease,c.state);c.edit('right',right,c.lease,c.state);let markup=render(c);assert.doesNotMatch(markup,/Report 0:|Data-byte offset 0:/);assert.match(markup,/ \n\{&quot;schemaVersion/);
 await c.verify('left',c.lease,c.state);await c.verify('right',c.lease,c.state);markup=render(c);assert.equal((markup.match(/Report \d+:/g)??[]).length,5);assert.match(markup,/&lt;PRIVATE&gt;&lt;script&gt;/);assert.doesNotMatch(markup,/<script|<PRIVATE>|<a\b|href=/);assert.match(markup,/UNVERIFIED original-source/);assert.match(markup,/AD length\/type headers/);assert.match(markup,/not independent observations/);
 c.select('left',0,c.lease,c.state);c.select('right',0,c.lease,c.state);await c.compare(c.lease,c.state);markup=render(c);assert.match(markup,/left absent \(null\).*right hex 00/);assert.match(markup,/Data-byte offset 0: left hex 02 at derivative 54/);assert.match(markup,/event type false/);
 const outsideDraft=markup.replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g,'');assert.doesNotMatch(outsideDraft,/aabbcc|serviceReadings|"advertising"|recordHex/);assert.ok(outsideDraft.length<20000);
 c.reportPage('left',1,c.lease,c.state);markup=render(c);assert.equal((markup.match(/Report \d+:/g)??[]).length,3);assert.match(markup,/Report 4:/);assert.doesNotMatch(markup,/Report 1:/);
 c.edit('left','x'.repeat(4097),c.lease,c.state);markup=render(c);assert.doesNotMatch(markup,/Data-byte offset 0:/);assert.match(markup,/Whole edit rejected/);
});
test('independent actual comparison TSX owner is inert and invisible when inactive',()=>{assert.equal(renderToStaticMarkup(React.createElement(Owner,{active:false})),'');assert.doesNotMatch(renderToStaticMarkup(React.createElement(Owner,{active:true})),/Report 0:|Data-byte offset 0:/);});
