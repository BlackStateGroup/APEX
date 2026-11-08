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
test('actual TSX initial/inactive render: exact limits, no automatic result or external actions', () => {
  const c = new Controller(), markup = render(c.state);
  assert.equal(renderToStaticMarkup(React.createElement(Owner, { active: true })), markup);
  assert.equal(renderToStaticMarkup(React.createElement(Owner, { active: false })), '');
  assert.match(markup, /262144 ASCII characters/); assert.match(markup, /128 records, 1024 timings per record and 8192 total/);
  assert.match(markup, /Leaving this inspector or Analysis clears inspection results\./); assert.match(markup, /Pending hashing is fenced, not cancelled/);
  assert.match(markup, /No journal import, save, export, share, copy action, transmission, replay, device access or provider calls/);
  assert.doesNotMatch(markup, /IR inspection:|IR record 1/);
  assert.deepEqual([...markup.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map(m => m[1]), ['Load synthetic IR example', 'Declare synthetic IR source', 'Declare imported IR source', 'Inspect ordinary IR remote', 'Clear IR draft']);
});
test('actual TSX example distinguishes parsed declaration and conditional raw recognition without carrier/capture claims', async () => {
  const c = new Controller(); c.example(c.lease); assert.doesNotMatch(render(c.state), /IR inspection:/);
  await c.inspect(c.lease); const markup = render(c.state);
  assert.match(markup, /IR inspection: 2 records/); assert.match(markup, /Declared standard NEC integers: address 4, command 8/);
  assert.match(markup, /Whole-array NEC recognition: recognized. Conditional decoded address 4, command 8/);
  assert.match(markup, /67 values, minimum 563 µs, maximum 9000 µs/);
  assert.match(markup, /Accepted draft SHA-256: [a-f0-9]{64}/);
  assert.match(markup, /This hashes the exact ASCII text received by the app/);
  assert.match(markup, /does not establish original file byte identity before paste, clipboard or text-widget processing/);
  assert.match(markup, /Line-ending normalization before the app receives the text is unverified/);
  assert.doesNotMatch(markup, /Exact source SHA-256|exact source bytes/);
  assert.match(markup, /Parsed NEC integers are declared fields, not decoded airframes/);
  assert.match(markup, /assumed first-mark alternating convention/);
  assert.match(markup, /sometimes firmware defaults, not measured carrier/);
  assert.match(markup, /Exact duty token and binary64-rounded numeric projection are distinct/);
  assert.match(markup, /Repeats are not represented in this format, not false/);
  c.declare('recorded-import', c.lease); assert.doesNotMatch(render(c.state), /IR inspection:/);
  c.edit('é', c.lease); assert.ok(disabled(render(c.state), 'Inspect ordinary IR remote'));
  assert.match(render(c.state), /Edit rejected whole/);
});
test('actual TSX bounds all four-record pages and preserves duplicate ordinals', async () => {
  const c = new Controller(); c.example(c.lease); c.edit(header + record.repeat(9), c.lease); await c.inspect(c.lease);
  for (let p = 0; p < 3; p++) {
    c.page(p, c.lease); const markup = render(c.state);
    assert.deepEqual([...markup.matchAll(/IR record (\d+) ·/g)].map(m => Number(m[1])), p === 0 ? [1,2,3,4] : p === 1 ? [5,6,7,8] : [9]);
    assert.match(markup, new RegExp(`IR record page ${p+1} of 3`));
    assert.equal(disabled(markup, 'Previous IR records'), p === 0); assert.equal(disabled(markup, 'Next IR records'), p === 2);
  }
});
test('actual TSX long duty/name excerpts and 1024-duration summary are bounded, exact source retained, strings inert', async () => {
  const c = new Controller(); c.example(c.lease);
  const name = 'https://example.invalid/<script>alert(1)</script>&' + 'x'.repeat(70), duty = '0'.repeat(12000) + '.5';
  const raw = `name: ${name}\ntype: raw\nfrequency: 10000\nduty_cycle: ${duty}\ndata: ${Array(1024).fill(4294967295).join(' ')}\n`;
  const source = header + raw.repeat(4); c.edit(source, c.lease); await c.inspect(c.lease); assert.ok(c.state.report, c.state.message);
  const markup = withoutDraft(render(c.state));
  assert.ok(markup.length < 14000, String(markup.length));
  assert.equal([...markup.matchAll(/excerpt: first 64 of 12002 ASCII characters/g)].length, 4);
  assert.equal([...markup.matchAll(/1024 values, minimum 4294967295 µs, maximum 4294967295 µs, total 4398046510080 µs/g)].length, 4);
  assert.match(markup, /binary64-rounded duty projection 0.5/);
  assert.match(markup, /Whole-array NEC recognition: not-recognized/);
  assert.doesNotMatch(markup, /<script\b|<a\b|href=|onclick=|00000000000000000000000000000000000000000000000000000000000000000/);
  assert.equal(c.state.report.originalSource, source); assert.equal(c.state.report.records[0]!.name, name);
  assert.ok(markup.includes('&lt;script&gt;'));
});
test('actual TSX errors and rejected edits never render old report; pending disables inspection', async () => {
  const c = new Controller(); c.example(c.lease); const pending = c.inspect(c.lease);
  assert.ok(disabled(render(c.state), 'Inspect ordinary IR remote')); await pending;
  c.edit(IR_EXAMPLE.replace('protocol: NEC', 'protocol: Pioneer'), c.lease); await c.inspect(c.lease);
  assert.match(render(c.state), /unsupported-protocol/); assert.doesNotMatch(render(c.state), /IR inspection:/);
  c.edit('x'.repeat(262145), c.lease); assert.ok(disabled(render(c.state), 'Inspect ordinary IR remote'));
  c.clear(c.lease); assert.doesNotMatch(render(c.state), /Subset rejected:|IR inspection:/); assert.equal(c.state.draft, '');
});
