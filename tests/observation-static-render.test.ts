/**
 * Actual repository TSX rendered by React DOM server, with only RN primitives and
 * the Bluetooth boundary mocked. Static rendering does NOT execute effects,
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

const componentUrls = new Set([
  new URL('../src/ServiceDataWorkbench.tsx', import.meta.url).href,
  new URL('../src/ForegroundBleWorkbench.tsx', import.meta.url).href,
]);
let acquisitions = 0;
let subscriptions = 0;
const platform = { OS: 'android' };
// Explicitly project only the properties under test; this is not RN layout,
// accessibility-tree or event-dispatch emulation.
const primitives = {
  Platform: platform,
  AppState: { currentState: 'active', addEventListener() { subscriptions++; return { remove() {} }; } },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  Pressable: ({ children, disabled, accessibilityLabel }: any) => React.createElement('button', { disabled, 'aria-label': accessibilityLabel }, children),
};
const bluetooth = {
  startSelectedServiceDataObservation() { acquisitions++; throw new Error('Unexpected acquisition during static render'); },
  startForegroundObservation() { acquisitions++; throw new Error('Unexpected acquisition during static render'); },
};
(globalThis as any).__apexStaticRender = { primitives, bluetooth };
// TypeScript 7 provides a local CLI rather than the old transpileModule API.
// Emit to a disposable directory; load only the two allowlisted TSX outputs.
// This is transpilation, not a replacement for the separate full typecheck.
const output = mkdtempSync(join(tmpdir(), 'apex-static-render-'));
try {
  execFileSync(process.execPath, [fileURLToPath(new URL('bin/tsc', import.meta.resolve('typescript/package.json'))),
    '--ignoreConfig', '--noCheck', '--jsx', 'react', '--target', 'es2022', '--module', 'esnext',
    '--outDir', output, '--rootDir', '.', 'src/ServiceDataWorkbench.tsx', 'src/ForegroundBleWorkbench.tsx'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', npm_config_offline: 'true',
      npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' },
    stdio: 'pipe',
  });
} catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    // Restrict injection to the two actual components, not arbitrary imports.
    if (componentUrls.has(context.parentURL ?? '')) {
      const source = specifier === 'react-native'
        ? 'export const { Platform, AppState, StyleSheet, View, Text, Pressable } = globalThis.__apexStaticRender.primitives;'
        : specifier === './platform/bluetooth'
          ? 'export const { startSelectedServiceDataObservation, startForegroundObservation } = globalThis.__apexStaticRender.bluetooth;'
          : undefined;
      if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!componentUrls.has(url)) return next(url, context);
    const filename = new URL(url).pathname.split('/').at(-1)!.replace(/\.tsx$/, '.js');
    return { format: 'module', source: readFileSync(join(output, 'src', filename), 'utf8'), shortCircuit: true };
  },
});
let ServiceDataWorkbench: React.ComponentType<any>;
let ForegroundBleWorkbench: React.ComponentType<any>;
try {
  ({ ServiceDataWorkbench } = await import('../src/ServiceDataWorkbench.tsx'));
  ({ ForegroundBleWorkbench } = await import('../src/ForegroundBleWorkbench.tsx'));
} finally {
  hooks.deregister();
  rmSync(output, { recursive: true, force: true });
  delete (globalThis as any).__apexStaticRender;
}
const props = { active: true, blocked: false, resetVersion: 0, canStart: () => true, onBusy() {}, onUncertainty() {}, onInspect() {} };
function render(component: React.ComponentType<any>, os: string, overrides = {}) {
  platform.OS = os;
  return renderToStaticMarkup(React.createElement(component, { ...props, ...overrides }));
}
function buttonDisabled(markup: string, title: string) {
  const buttons = [...markup.matchAll(/<button\b([^>]*)>/g)];
  const matches = buttons.filter(match => match[1]!.includes(`aria-label="${title}"`));
  assert.equal(matches.length, 1, `Actual render must contain exactly one ${title} button`);
  return /\bdisabled=""/.test(matches[0]![1]!);
}

test('actual service-data initial renders gate Start on consent and platform', () => {
  for (const os of ['android', 'ios', 'web']) {
    const markup = render(ServiceDataWorkbench, os);
    assert.match(markup, /Experimental Android service-data observation/);
    assert.match(markup, /Selected service-data: FCD2/);
    assert.equal(buttonDisabled(markup, 'Start service-data observation'), true);
    assert.equal(buttonDisabled(markup, 'Opt in to broad SDK reception for one session'), os !== 'android');
    assert.equal(buttonDisabled(markup, 'Stop service-data observation'), true);
    assert.equal(buttonDisabled(markup, 'Clear unsaved service-data sources'), true);
    if (os === 'ios') assert.match(markup, /Unavailable on iOS: the pinned native bridge lacks destruction completion acknowledgement\./);
    if (os === 'web') assert.match(markup, /Unavailable on web: this mode requires a native Android development build\./);
    if (os === 'android') assert.doesNotMatch(markup, /Unavailable on (iOS|web)/);
  }
  assert.equal(acquisitions, 0, 'No acquisition during initial render (effects are not run)');
  assert.equal(subscriptions, 0, 'Server renderer must not execute lifecycle effects');
});

test('service-data render retains separate mode, cooperative bounds and privacy disclosures', () => {
  const markup = render(ServiceDataWorkbench, 'android');
  for (const copy of [
    'Separate from advertised-UUID observation',
    'the SDK receives all nearby advertisements transiently, then JavaScript selects FCD2 or FEAA service-data matches',
    'Matching selected sources can include unrelated fields.',
    '10 seconds including preparation, 100 total callbacks, 25 retained matches, 65536 serialized characters',
    'not hard native cache or bridge queue bounds',
    'cannot guarantee wall-clock stopping during JavaScript suspension',
    'No OS cache erasure or RF-passive guarantee.',
    'No connections, writes, automatic saves or provider submission.',
    'No matches does not prove absence, identity, ownership or complete capture.',
    'No native phone validation has been performed.',
  ]) assert.ok(markup.includes(copy), `Missing rendered disclosure: ${copy}`);
  assert.doesNotMatch(markup, /Inspect service-data source|Total callbacks:/);
});

test('inactive service-data renders nothing; blocked Android disables consent and Start', () => {
  assert.equal(render(ServiceDataWorkbench, 'android', { active: false }), '');
  const blocked = render(ServiceDataWorkbench, 'android', { blocked: true });
  assert.equal(buttonDisabled(blocked, 'Opt in to broad SDK reception for one session'), true);
  assert.equal(buttonDisabled(blocked, 'Start service-data observation'), true);
  assert.match(blocked, /Stop other observation, NFC and accessory work and disconnect device sessions first\./);
});

test('actual advertised-UUID render remains a separate mode with web acquisition unavailable', () => {
  for (const os of ['android', 'ios', 'web']) {
    const markup = render(ForegroundBleWorkbench, os);
    assert.match(markup, /Experimental advertised-UUID observation/);
    assert.match(markup, /Stop ends local collection and requests SDK scan stop\./);
    assert.match(markup, /iOS provides no native stop completion acknowledgment\./);
    assert.match(markup, /Native radio behavior remains unverified\./);
    assert.match(markup, /filters the OS-advertised service UUID list, not all service-data fields/);
    assert.match(markup, /BTHome service-data-only broadcasts can be missed/);
    assert.match(markup, /at most 25 callbacks and 65536 serialized characters/);
    assert.equal(buttonDisabled(markup, 'Start advertised-UUID BLE observation'), os === 'web');
    assert.equal(buttonDisabled(markup, 'Stop advertised-UUID BLE observation'), true);
    assert.doesNotMatch(markup, /Opt in to broad SDK reception|Start service-data observation/);
    if (os === 'web') assert.match(markup, /Observation is unavailable in this web console/);
  }
  assert.equal(acquisitions, 0, 'Only initial rendering is covered, not mounted behavior');
  assert.equal(subscriptions, 0);
});
