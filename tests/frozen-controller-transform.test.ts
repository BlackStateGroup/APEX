import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { frozenControllerFiles } from './frozen-controller-guard.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { transformFromAstSync } = require('@babel/core');
const controllers = [
  ['evidence-bundle-workbench', 'EvidenceBundleWorkbench'],
  ['hci-comparison-workbench', 'HciComparisonController'],
  ['hci-document-workbench', 'HciDocumentController'],
  ['hci-evidence-reopen', 'HciEvidenceReopenController'],
  ['hci-workbench', 'HciWorkbenchController'],
  ['iq-workbench', 'IqController'],
  ['ir-receiver-workbench', 'IrReceiverWorkbenchController'],
  ['ir-workbench', 'IrWorkbenchController'],
  ['nfc-static-workbench', 'NfcStaticWorkbenchController'],
] as const;
const hash = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// Execute real Expo Metro Babel output, not Node's native private slots.
// Relative application dependencies use the same transform and module cache.
function loader(platform: string, dev: boolean, baseline = false) {
  // Expo caches config discovery once per worker. Give each matrix loader its
  // own discovery state so the baseline cannot mask configured output.
  const transformer = require.resolve('@expo/metro-config/babel-transformer');
  delete require.cache[resolve(dirname(transformer), 'loadBabelConfig.js')];
  delete require.cache[transformer];
  const { transform } = require(transformer);
  const cache = new Map<string, { exports: any }>();
  return function load(filename: string): any {
    filename = resolve(root, filename);
    if (cache.has(filename)) return cache.get(filename)!.exports;
    const src = readFileSync(filename, 'utf8');
    const result = transform({ filename, src, plugins: [], options: {
      projectRoot: root, platform, dev, hot: false,
      enableBabelRCLookup: !baseline,
      customTransformOptions: platform === 'web' ? {} : { engine: 'hermes' },
    } });
    const { code } = transformFromAstSync(result.ast, src, { babelrc: false, configFile: false });
    const module = { exports: {} };
    cache.set(filename, module);
    const localRequire = createRequire(filename);
    const dependency = (name: string) => name.startsWith('.') && name.endsWith('.ts')
      ? load(resolve(dirname(filename), name)) : localRequire(name);
    runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(dependency, module, module.exports);
    return module.exports;
  };
}

test('Metro computes its config cache key without a source filename', () => {
  const { getCacheKey } = require('@expo/metro-config/babel-transformer');
  const options = { projectRoot: root, enableBabelRCLookup: true };
  const key = getCacheKey(options);
  assert.equal(typeof key, 'string');
  assert.ok(key.length > 0);
  assert.equal(getCacheKey(options), key);
});

test('all frozen controller modules are covered by the transformed regression matrix', () => {
  const actual = frozenControllerFiles(resolve(root, 'src'));
  assert.deepEqual(actual, controllers.map(([file]) => `${file}.ts`).sort());
});

test('unconfigured Expo web transform reproduces the CI read-only private-field crash', () => {
  const { EvidenceBundleWorkbench } = loader('web', false, true)('src/evidence-bundle-workbench.ts');
  const c = new EvidenceBundleWorkbench(false);
  assert.ok(Object.getOwnPropertyNames(c).some(n => /^__private_.*_active$/.test(n)));
  assert.throws(() => c.activate(), /read only property.*__private_.*_active/);
});

for (const platform of ['web', 'android', 'ios']) for (const dev of [false, true]) {
  const load = loader(platform, dev);
  for (const [file, name] of controllers) test(`${platform} ${dev ? 'development' : 'production'}: ${name} frozen surface and repeated lifecycle`, () => {
    const C = load(`src/${file}.ts`)[name];
    const c = name === 'HciEvidenceReopenController' ? new C({}, hash) : new C(false, hash);
    assert.ok(Object.isFrozen(c));
    // Stronger than Object.keys: no discoverable loose private storage at all.
    assert.deepEqual(Reflect.ownKeys(c), []);
    assert.throws(() => { c.injected = true; }, TypeError);
    for (let i = 0; i < 3; i++) {
      const oldLease = c.lease;
      c.deactivate();
      assert.equal(c.isActive(oldLease), false);
      c.activate();
      assert.equal(c.isActive(c.lease), true);
      assert.ok(c.lease > oldLease);
      assert.ok(Object.isFrozen(c.state));
    }
  });

  test(`${platform} ${dev ? 'development' : 'production'}: receiver inspection and stale async result fencing`, async () => {
    const { IrReceiverWorkbenchController: C } = load('src/ir-receiver-workbench.ts');
    const c = new C(true, hash);
    c.example(c.lease); await c.inspect(c.lease);
    assert.equal(c.state.report?.kind, 'offline-ir-receiver-excerpt');
    assert.equal(c.state.report.records[0].carrier.frequencyHz, null);
    let finish!: (value: string) => void;
    const slow = new C(true, () => new Promise<string>(resolve => { finish = resolve; }));
    slow.example(slow.lease); const pending = slow.inspect(slow.lease);
    // Expo async lowering can defer entry into the nested hasher by microtasks.
    for (let turn = 0; turn < 16 && !finish; turn++) await Promise.resolve();
    assert.equal(typeof finish, 'function');
    assert.equal(slow.state.pending, true);
    slow.deactivate(); slow.activate(); const afterExit = slow.state;
    finish('0'.repeat(64)); await pending;
    assert.equal(slow.state, afterExit); assert.equal(slow.state.report, null);
  });

  test(`${platform} ${dev ? 'development' : 'production'}: NFC inspection and stale async result fencing`, async () => {
    const { NfcStaticWorkbenchController: C } = load('src/nfc-static-workbench.ts');
    const c = new C(true, hash);
    c.example('static-data-48', c.lease);
    const before = c.state;
    await c.inspect(c.lease);
    assert.ok(c.state.report);
    assert.equal(before.report, null);
    assert.ok(Object.isFrozen(c.state.report));
    let finish!: (value: string) => void;
    const slow = new C(true, () => new Promise<string>(resolve => { finish = resolve; }));
    slow.example('static-data-48', slow.lease);
    const pending = slow.inspect(slow.lease);
    assert.equal(slow.state.pending, true);
    slow.deactivate(); slow.activate();
    const afterExit = slow.state;
    finish('0'.repeat(64)); await pending;
    assert.equal(slow.state, afterExit);
    assert.equal(slow.state.report, null);
    assert.equal(slow.state.pending, false);
  });
}
