/** Real installed Expo transforms for the selected-export controller on all targets. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { bundleFixture, sha256 as textHash } from './bundle-preview-fixture.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { transformFromAstSync } = require('@babel/core');
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


for (const platform of ['web', 'android', 'ios']) for (const dev of [false, true]) {
  const load = loader(platform, dev);
  test(`${platform} ${dev ? 'development' : 'production'}: selected export prepares exact records and fences stale hashes`, async () => {
    const { EvidenceExportWorkbench: C } = load('src/evidence-export-workbench.ts');
    const { documents } = await bundleFixture(2); const c = new C(true);
    await c.refresh(async () => documents, c.lease, c.state);
    c.toggle('record-1', c.lease, c.state);
    for (let i = 1; i <= 2; i++) {
      await c.prepare(textHash, undefined, '2026-11-09T00:00:00.000Z', c.lease, c.state);
      assert.deepEqual(JSON.parse(c.state.bundle).records, [documents[1]]); assert.equal(c.state.preparationId, i);
    }
    let finish!: () => void, calls = 0; const gate = new Promise<void>(resolve => { finish = resolve; });
    const pending = c.prepare(async (text: string) => { calls++; await gate; return textHash(text); }, undefined, '2026-11-09T00:00:00.000Z', c.lease, c.state);
    for (let turn = 0; turn < 16 && calls === 0; turn++) await Promise.resolve();
    assert.equal(calls, 1); c.clear(); const expected = c.state; finish(); await pending;
    assert.equal(c.state, expected); assert.equal(c.state.bundle, null); assert.equal(calls, 1);
  });
}
