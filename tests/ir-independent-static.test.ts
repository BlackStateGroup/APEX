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

import { IrWorkbenchController as Controller, IR_EXAMPLE } from '../src/ir-workbench.ts';
import type { IrWorkbenchState } from '../src/ir-workbench.ts';
import type { IrWorkbenchViewProps } from '../src/IrWorkbench.tsx';
const componentUrl = new URL('../src/IrWorkbench.tsx', import.meta.url).href;
// Deliberately narrow host projection, not RN layout, event or accessibility emulation.
const primitives = {
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  TextInput: ({ value, accessibilityLabel }: any) => React.createElement('textarea', { defaultValue: value, 'aria-label': accessibilityLabel }),
  Pressable: ({ children, disabled, accessibilityLabel }: any) => React.createElement('button', { disabled, 'aria-label': accessibilityLabel }, children),
};
(globalThis as any).__apexIrStaticRender = primitives;
// TypeScript 7 provides a local CLI rather than the old transpileModule API.
// Emit to a disposable directory; load only the allowlisted TSX output.
// This is transpilation, not a replacement for the separate full typecheck.
const output = mkdtempSync(join(tmpdir(), 'apex-static-render-'));
try {
  execFileSync(process.execPath, [fileURLToPath(new URL('bin/tsc', import.meta.resolve('typescript/package.json'))),
    '--ignoreConfig', '--noCheck', '--jsx', 'react', '--target', 'es2022', '--module', 'esnext',
    '--outDir', output, '--rootDir', '.', 'src/IrWorkbench.tsx'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', npm_config_offline: 'true',
      npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' },
    stdio: 'pipe',
  });
} catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === componentUrl && specifier === 'react-native') {
      const source = 'export const { StyleSheet, View, Text, TextInput, Pressable } = globalThis.__apexIrStaticRender;';
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
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
let Projection: React.ComponentType<IrWorkbenchViewProps>;
try { ({ IrWorkbench: Owner, IrWorkbenchView: Projection } = await import('../src/IrWorkbench.tsx')); }
finally { hooks.deregister(); rmSync(output, { recursive: true, force: true }); delete (globalThis as any).__apexIrStaticRender; }
function render(state: IrWorkbenchState) {
  const noAction = () => assert.fail('Static projection must not act');
  return renderToStaticMarkup(React.createElement(Projection, { state, edit: noAction, clear: noAction, inspect: noAction, page: noAction, declare: noAction, example: noAction }));
}
const header = 'Filetype: IR signals file\nVersion: 1\n';
const record = 'name: Same\ntype: parsed\nprotocol: NEC\naddress: 04 00 00 00\ncommand: 08 00 00 00\n';
const withoutDraft = (s: string) => s.replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g, '');
function disabled(markup: string, label: string) {
  const button = [...markup.matchAll(/<button\b([^>]*)>/g)].find(m => m[1]!.includes(`aria-label="${label}"`));
  assert.ok(button); return button[1]!.includes('disabled=""');
}
test('independent actual TSX states limit identity to accepted draft, not original clipboard/file bytes', async () => {
  const c = new Controller();
  for (const inspected of [false, true]) {
    if (inspected) { c.example(c.lease); await c.inspect(c.lease); }
    const markup = withoutDraft(render(c.state));
    assert.match(markup, /accepted (?:ASCII )?(?:JavaScript )?draft/i);
    if (inspected) {
      assert.match(markup, /(?:original|pre-paste) (?:file|clipboard)/i);
      assert.match(markup, /(?:normaliz|transform|line.ending)/i);
      assert.match(markup, /Accepted draft SHA-256: [a-f0-9]{64}/);
      assert.doesNotMatch(markup, /Exact source SHA-256/);
    }
  }
});
test('independent actual TSX 128-record final page and escaped exact field spellings', async () => {
  const c = new Controller(); c.example(c.lease);
  c.edit(header + record.replace('Same', '<img src=x onerror=evil()>').replace('04 00', 'aF 00').repeat(128), c.lease);
  await c.inspect(c.lease); assert.ok(c.state.report);
  c.page(31, c.lease); const markup = withoutDraft(render(c.state));
  assert.match(markup, /IR record page 32 of 32/);
  assert.deepEqual([...markup.matchAll(/IR record (\d+) ·/g)].map(m => Number(m[1])), [125,126,127,128]);
  assert.match(markup, /address 175/); assert.match(markup, /aF 00 00 00/);
  assert.match(markup, /&lt;img/); assert.doesNotMatch(markup, /<img|<a\b|href=/);
  assert.equal(disabled(markup, 'Next IR records'), true);
  c.edit(header + record.repeat(129), c.lease); await c.inspect(c.lease);
  assert.doesNotMatch(render(c.state), /IR inspection:/); assert.match(render(c.state), /record-limit/);
});
