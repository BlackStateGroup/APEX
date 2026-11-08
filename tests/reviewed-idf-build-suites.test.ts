// The fixed checkpoint and npm test discover *.test.ts. Import each synthetic
// suite directly: node:test registers its original test cases in this process,
// so aggregate counts include the cases themselves (no hidden nested runner).
// No SDK/native build is invoked by either imported fixture suite.
await import('./reviewed-idf-build.test.mjs');
await import('./reviewed-idf-build-independent.test.mjs');
export {};

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { plan } from '../tools/verify-offline-checkpoint.mjs';

test('aggregate discovery includes these original fixture cases without adding stages', async () => {
  const stages = await plan();
  assert.equal(stages.length, 9);
  const nodeTests = stages.find(stage => stage.id === 'node-tests');
  assert.ok(nodeTests?.args.includes('tests/reviewed-idf-build-suites.test.ts'));
  assert.equal(nodeTests?.args.some((arg: string) => arg.endsWith('.test.mjs')), false);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.test, /node --test tests\/\*\.test\.ts$/);
});
