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

import { flipperWorkbenchReducer as reduce, initialFlipperWorkbench as initial } from '../src/flipper-workbench.ts';
import type { FlipperWorkbenchState, FlipperWorkbenchAction } from '../src/flipper-workbench.ts';
const componentUrl = new URL('../src/FlipperWorkbench.tsx', import.meta.url).href;
// Deliberately narrow host projection, not RN layout, event or accessibility emulation.
const primitives = {
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  TextInput: ({ value, accessibilityLabel }: any) => React.createElement('textarea', { defaultValue: value, 'aria-label': accessibilityLabel }),
  Pressable: ({ children, disabled, accessibilityLabel }: any) => React.createElement('button', { disabled, 'aria-label': accessibilityLabel }, children),
};
(globalThis as any).__apexFlipperStaticRender = primitives;
// TypeScript 7 provides a local CLI rather than the old transpileModule API.
// Emit to a disposable directory; load only the allowlisted TSX output.
// This is transpilation, not a replacement for the separate full typecheck.
const output = mkdtempSync(join(tmpdir(), 'apex-static-render-'));
try {
  execFileSync(process.execPath, [fileURLToPath(new URL('bin/tsc', import.meta.resolve('typescript/package.json'))),
    '--ignoreConfig', '--noCheck', '--jsx', 'react', '--target', 'es2022', '--module', 'esnext',
    '--outDir', output, '--rootDir', '.', 'src/FlipperWorkbench.tsx'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', npm_config_offline: 'true',
      npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' },
    stdio: 'pipe',
  });
} catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === componentUrl && specifier === 'react-native') {
      const source = 'export const { StyleSheet, View, Text, TextInput, Pressable } = globalThis.__apexFlipperStaticRender;';
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url !== componentUrl) return next(url, context);
    const filename = new URL(url).pathname.split('/').at(-1)!.replace(/\.tsx$/, '.js');
    return { format: 'module', source: readFileSync(join(output, 'src', filename), 'utf8'), shortCircuit: true };
  },
});
let FlipperWorkbench: React.ComponentType<{ active: boolean }>;
let FlipperWorkbenchView: React.ComponentType<{ state: FlipperWorkbenchState; send: React.Dispatch<FlipperWorkbenchAction> }>;
try {
  ({ FlipperWorkbench, FlipperWorkbenchView } = await import('../src/FlipperWorkbench.tsx'));
} finally {
  hooks.deregister();
  rmSync(output, { recursive: true, force: true });
  delete (globalThis as any).__apexFlipperStaticRender;
}
function inspect(draft: string, provenance: 'imported' | 'synthetic' = 'imported') {
  const state = reduce(reduce(reduce(initial, { type: 'edit', draft }), { type: 'provenance', provenance }), { type: 'inspect' });
  assert.ok(state.report, state.message);
  return state;
}
function render(state: FlipperWorkbenchState) {
  assert.ok(Object.isFrozen(state));
  if (state.report) assert.ok(Object.isFrozen(state.report.frames));
  return renderToStaticMarkup(React.createElement(FlipperWorkbenchView, { state, send() { assert.fail('Static projection must not dispatch'); } }));
}
function buttonDisabled(markup: string, title: string) {
  const matches = [...markup.matchAll(/<button\b([^>]*)>/g)].filter(match => match[1]!.includes(`aria-label="${title}"`));
  assert.equal(matches.length, 1, `Exactly one ${title} control`);
  return /\bdisabled=""/.test(matches[0]![1]!);
}
function frameNumbers(markup: string) { return [...markup.matchAll(/Response frame (\d+) ·/g)].map(m => Number(m[1])); }
function fields(markup: string) { return [...markup.matchAll(/(?:envelope|content): tag \d+, wire \d+, bytes \d+–\d+, value bytes \d+–\d+/g)].map(m => m[0]); }

test('actual owning component initial and inactive static renders', () => {
  const markup = renderToStaticMarkup(React.createElement(FlipperWorkbench, { active: true }));
  assert.equal(markup, render(initial));
  assert.match(markup, /Caller-declared provenance: not selected/);
  assert.match(markup, /Paste complete hex pairs and declare provenance, then Inspect/);
  assert.match(markup, /Memory only: retained across tabs, cleared on reload/);
  assert.match(markup, /No save, export or URL opening/);
  assert.match(markup, /<textarea aria-label="Offline Flipper hex draft"><\/textarea>/);
  assert.doesNotMatch(markup, /Flipper inspection:|Response frame|field metadata/);
  assert.equal(renderToStaticMarkup(React.createElement(FlipperWorkbench, { active: false })), '');
  // Server rendering does not exercise retention, events, effects or tab transitions.
});

test('actual JSX projects all dense frame pages with at most four frames and boundary controls', () => {
  const original = inspect('00 '.repeat(9));
  for (let page = 0; page < 3; page++) {
    const state = reduce(original, { type: 'frame-page', page });
    const markup = render(state);
    assert.deepEqual(frameNumbers(markup), page === 0 ? [1, 2, 3, 4] : page === 1 ? [5, 6, 7, 8] : [9]);
    assert.match(markup, new RegExp(`Frame page ${page + 1} of 3`));
    assert.match(markup, new RegExp(`Frame ${page * 4 + 1} field metadata`));
    assert.equal(buttonDisabled(markup, 'Previous Flipper frames'), page === 0);
    assert.equal(buttonDisabled(markup, 'Next Flipper frames'), page === 2);
  }
});

test('actual JSX projects dense metadata pages with at most eight rows and exact offsets', () => {
  // One version envelope with ten unknown child scalars and two known fields.
  const original = inspect('1b c2 02 18 ' + '28 00 '.repeat(10) + '08 01 10 00');
  const first = render(original);
  const second = render(reduce(original, { type: 'field-page', page: 1 }));
  const expected = ['envelope: tag 40, wire 2, bytes 1–28, value bytes 4–28',
    ...Array.from({ length: 10 }, (_, i) => `content: tag 5, wire 0, bytes ${4 + i * 2}–${6 + i * 2}, value bytes ${5 + i * 2}–${6 + i * 2}`),
    'content: tag 1, wire 0, bytes 24–26, value bytes 25–26',
    'content: tag 2, wire 0, bytes 26–28, value bytes 27–28'];
  assert.deepEqual(fields(first), expected.slice(0, 8));
  assert.deepEqual(fields(second), expected.slice(8));
  for (const [markup, page] of [[first, 0], [second, 1]] as const) {
    assert.match(markup, new RegExp(`Field page ${page + 1} of 2`));
    assert.match(markup, /Offsets only, no byte dump/);
    assert.equal(buttonDisabled(markup, 'Previous Flipper fields'), page === 0);
    assert.equal(buttonDisabled(markup, 'Next Flipper fields'), page === 1);
  }
});

test('declared provenance, omitted versus explicit zero and partial tails remain visible observations', () => {
  for (const provenance of ['imported', 'synthetic'] as const) {
    const markup = render(inspect('03 c2 02 00 0d 08 00 10 00 18 00 c2 02 04 08 00 10 00 02 10 7f 80', provenance));
    assert.match(markup, new RegExp(`Caller-declared provenance: ${provenance}\\.`));
    assert.match(markup, new RegExp(`Flipper inspection: 3 frames · 22 bytes · ${provenance}`));
    assert.match(markup, /Neither declaration proves origin or physical reception/);
    assert.match(markup, /ID: present false, effective 0. Status: present false, effective 0 \(omitted\). has_next: present false, effective false/);
    assert.match(markup, /ID: present true, effective 0. Status: present true, effective 0 \(explicit-zero\). has_next: present true, effective false/);
    for (const name of ['major', 'minor']) for (const present of ['false', 'true']) assert.ok(markup.includes(`${name}: present ${present}, effective 0`));
    assert.match(markup, /Status: present true, effective 127 \(nonzero-or-unknown\)/);
    assert.match(markup, /Incomplete tail: incomplete-length at byte 21; expected payload bytes unknown/);
  }
  const strings = render(inspect('03 8a 02 00 07 8a 02 04 0a 00 12 00'));
  for (const name of ['key', 'value']) for (const present of ['false', 'true']) {
    assert.ok(strings.includes(`${name}: present ${present}, effective &quot;&quot;`));
  }
  assert.match(render(inspect('00 05 08')), /Incomplete tail: incomplete-payload at byte 1; expected payload bytes 5/);
});

test('decoded URL, markup and control strings are JSON-quoted escaped inert text without value-derived actions', () => {
  const value = 'https://example.invalid/<script>alert("x")</script>&\n\t\u0000';
  const bytes = [...new TextEncoder().encode(value)];
  const payload = [0x8a, 2, bytes.length + 2, 0x12, bytes.length, ...bytes];
  const draft = [payload.length, ...payload].map(v => v.toString(16).padStart(2, '0')).join(' ');
  const markup = render(inspect(draft));
  const escaped = JSON.stringify(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
  assert.ok(markup.includes(`value: present true, effective ${escaped}`));
  assert.match(markup, /key: present false, effective &quot;&quot;/);
  assert.doesNotMatch(markup, /<a\b|<script\b|href=|onclick=|https:\/\/example[^<]*aria-label=/i);
  const labels = [...markup.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(labels, ['Load synthetic Flipper response', 'Declare synthetic Flipper bytes', 'Declare imported Flipper bytes', 'Inspect offline Flipper responses', 'Previous Flipper frames', 'Next Flipper frames', 'Select Flipper frame 1 fields', 'Previous Flipper fields', 'Next Flipper fields']);
});
