/** Actual installed 4.2.0 CommonJS facade; only React Native is fake.
 * The ESM bridge exposes the facade's __esModule default as Metro does. It does
 * not replace any NFC method, rewrite SDK source, or execute a native module.
 */
import { createRequire, registerHooks } from 'node:module';
import { dirname, relative, sep } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createContext, Script } from 'node:vm';
import type { NfcBackend } from '../../packages/core/nfc.ts';
const require = createRequire(import.meta.url);
const entry = require.resolve('react-native-nfc-manager');
const sdkRoot = dirname(dirname(dirname(entry))) + sep;
const manifest = JSON.parse(readFileSync(new URL('../../verification/nfc-js-facade/inputs.json', import.meta.url), 'utf8'));
let serial = 0;
type Callback = (error: unknown, result?: unknown) => void;
export async function nfcFacadeFixture(platform: 'ios' | 'android', turbo = true) {
  const id = ++serial;
  const adapterUrl = new URL(`../../src/platform/nfc.native.ts?actual-facade=${id}`, import.meta.url).href;
  const calls: { name: string; args: unknown[]; callback: Callback }[] = [];
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const routes: string[] = [];
  const subscribe = (name: string, listener: (value: unknown) => void) => {
    const set = listeners.get(name) ?? new Set(); listeners.set(name, set); set.add(listener);
    return { remove() { set.delete(listener); } };
  };
  const native: Record<string, unknown> = {};
  for (const name of ['isSupported', 'start', 'isEnabled', 'registerTagEvent', 'unregisterTagEvent']) {
    native[name] = (...args: unknown[]) => {
      const callback = args.pop() as Callback;
      calls.push({ name, args, callback });
    };
  }
  for (const [method, event] of Object.entries({onDiscoverTag:'DiscoverTag',onDiscoverBackgroundTag:'DiscoverBackgroundTag',onSessionClosed:'SessionClosed',onStateChanged:'StateChanged'})) {
    native[method] = (listener: (value: unknown) => void) => { routes.push(`codegen:${event}`); return subscribe(`NfcManager${event}`, listener); };
  }
  const rn = {
    Platform: { OS: platform }, NativeModules: { NfcManager: native },
    TurboModuleRegistry: { get(name: string) { if (name !== 'NfcManager') throw new Error('Unexpected module'); return native; } },
    NativeEventEmitter: class { addListener(name: string, listener: (value: unknown) => void) { routes.push(`legacy:${name}`); return subscribe(name, listener); } },
  };
  const globals = globalThis as any;
  const key = `__apexNfcFacade${id}`;
  // Fresh CommonJS realm per fixture avoids singleton and require-cache leakage.
  const context = createContext({ console, Error, setTimeout, clearTimeout, 'RN$Bridgeless': turbo });
  context.global = context;
  const cache = new Map<string, { exports: any }>();
  const loadSdk = (path: string): any => {
    if (!path.startsWith(sdkRoot)) throw new Error(`Unexpected SDK dependency: ${path}`);
    if (cache.has(path)) return cache.get(path)!.exports;
    const module = { exports: {} as any }; cache.set(path, module);
    const localRequire = (name: string) => name === 'react-native' ? rn : loadSdk(createRequire(path).resolve(name));
    // Node's usual CommonJS wrapper, unchanged installed JavaScript body.
    const source = readFileSync(path, 'utf8');
    assert.equal(createHash('sha256').update(source).digest('hex'), manifest.sdk.files[relative(sdkRoot, path)], `Unpinned installed SDK input: ${path}`);
    const execute = new Script('(function(exports, require, module, __filename, __dirname) {\n' + source + '\n})', { filename: path }).runInContext(context);
    execute(module.exports, localRequire, module, path, dirname(path));
    return module.exports;
  };
  globals[key] = { rn, sdk: null };
  const hooks = registerHooks({resolve(specifier, context, next) {
    if (specifier === 'react-native' && context.parentURL === adapterUrl) return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(`export const { Platform, NativeModules, TurboModuleRegistry, NativeEventEmitter } = globalThis.${key}.rn;`) };
    if (specifier === 'react-native-nfc-manager' && context.parentURL === adapterUrl) return {
      shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(`const sdk = globalThis.${key}.sdk; export default sdk.default; export const { NfcEvents, NfcError } = sdk;`),
    };
    return next(specifier, context);
  }, load(url, context, next) {
    if (url.startsWith('data:text/javascript,') && decodeURIComponent(url).includes(key)) return { shortCircuit: true, format: 'module', source: decodeURIComponent(url.slice(21)) };
    return next(url, context);
  }});
  let sdk: any; let nfcBackend: NfcBackend;
  try {
    sdk = loadSdk(entry); globals[key].sdk = sdk;
    ({ nfcBackend } = await import(adapterUrl) as { nfcBackend: NfcBackend });
  } catch (error) { hooks.deregister(); delete globals[key]; throw error; }
  return {
    backend: nfcBackend, sdk, calls, routes, entry, loadedFiles: [...cache.keys()],
    emit(event: 'DiscoverTag' | 'SessionClosed' | 'StateChanged', value: unknown) { for (const fn of listeners.get(`NfcManager${event}`) ?? []) fn(value); },
    reply(name: string, error: unknown = null, value?: unknown) {
      const call = calls.findLast(c => c.name === name); if (!call) throw new Error(`No issued ${name}`); call.callback(error, value);
    },
    dispose() { hooks.deregister(); delete globals[key]; },
  };
}
