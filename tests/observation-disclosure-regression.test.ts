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


test('each observation mode renders its own complete validation warning exactly once', () => {
  const advertisedWarning = "10-second foreground window including permission preparation, at most 25 callbacks and 65536 serialized characters. No pairing, connections, writes or automatic saves. Leaving Devices or backgrounding stops collection. No native phone validation has been performed for this build.";
  const serviceDataWarning = "Receipt times are app callback times, not hardware transmission times. Repeated callbacks need not be distinct radio packets. No matches does not prove absence, identity, ownership or complete capture. No native phone validation has been performed.";
  const advertised = render(ForegroundBleWorkbench, 'web');
  const serviceData = render(ServiceDataWorkbench, 'web');
  const count = (markup: string, warning: string) => markup.split('<span>' + warning + '</span>').length - 1;
  assert.equal(count(advertised, advertisedWarning), 1, 'Advertised-UUID warning must be complete and unique');
  assert.equal(count(serviceData, serviceDataWarning), 1, 'Service-data warning must be complete and unique');
  assert.equal(count(advertised, serviceDataWarning), 0, 'Service-data warning must not be substituted into advertised-UUID mode');
  assert.equal(count(serviceData, advertisedWarning), 0, 'Advertised-UUID warning must not be substituted into service-data mode');
  assert.equal((advertised + serviceData).split('No native phone validation has been performed').length - 1, 2);
  assert.equal(acquisitions, 0, 'Static warning checks must not start observation');
  assert.equal(subscriptions, 0, 'Static rendering does not execute effects');
});
