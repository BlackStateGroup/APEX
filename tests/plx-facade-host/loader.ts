// Execute the installed published ESM artifact, with no rewriting/transpilation.
// Node needs an explicit module format and .js for PLX's extensionless imports.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = pathToFileURL(resolve('node_modules/react-native-ble-plx') + '/');
const pins = JSON.parse(readFileSync('tests/plx-facade-host/inputs.sha256.json', 'utf8'));
export function verifyInstalled() {
  assert.equal(JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version, '3.5.1');
  for (const [path, hash] of Object.entries(pins)) assert.equal(createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex'), hash, path);
}
export const loaded = new Set<string>();
const environments = new Map<string, object>();
(globalThis as any).__plxFacadeEnvironments = environments;
export function environment(id: string, value: object) { environments.set(id, value); }
export const hooks = registerHooks({
  resolve(specifier, context, next) {
    const parent = new URL(context.parentURL ?? 'file:///');
    const id = parent.searchParams.get('plx-case');
    if (id && specifier === 'react-native') return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(`export const {NativeModules, NativeEventEmitter, Platform, AppState, PermissionsAndroid} = globalThis.__plxFacadeEnvironments.get(${JSON.stringify(id)});`)}` };
    if (id && specifier === 'react-native-ble-plx') return { shortCircuit: true, url: new URL(`lib/module/index.js?plx-case=${id}`, root).href };
    if (id && parent.href.startsWith(new URL('lib/module/', root).href) && specifier.startsWith('.')) return { shortCircuit: true, url: new URL(`${specifier}.js?plx-case=${id}`, parent).href };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(new URL('lib/module/', root).href)) {
      const path = new URL(url); path.search = ''; loaded.add(fileURLToPath(path));
      return { shortCircuit: true, format: 'module', source: readFileSync(path, 'utf8') };
    }
    return next(url, context);
  },
});
