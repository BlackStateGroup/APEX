import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { freezesThis, frozenControllerFiles } from './frozen-controller-guard.mjs';

test('freeze guard parses whitespace, comments, TS/TSX and bracket notation', () => {
  for (const source of [
    'class C { constructor() { Object.freeze(this); } }',
    'class C { constructor() { Object . freeze ( /* own surface */ this ); } }',
    'class C { #x: number = 0; constructor() { Object\n.freeze\n(\nthis\n); } }',
    'class C { constructor() { Object["freeze"](this); } render(){ return <div/>; } }',
    'class C { constructor() { Object.freeze?.(this); } }',
  ]) assert.equal(freezesThis(source, 'fixture.tsx'), true);
});

test('freeze guard ignores comments, strings and other receivers or arguments', () => {
  for (const source of [
    '// Object.freeze(this)\nconst x = 1;',
    'const example = "Object.freeze(this)";',
    'Object.freeze({state:true});',
    'Other.freeze(this);',
    'Object.seal(this);',
  ]) assert.equal(freezesThis(source, 'fixture.ts'), false);
  assert.throws(() => freezesThis('class { invalid syntax', 'broken.ts'));
});

test('freeze guard recursively includes nested TSX and detects an uncovered addition', t => {
  const root = mkdtempSync(join(tmpdir(), 'apex-freeze-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'nested', 'deeper'), { recursive: true });
  writeFileSync(join(root, 'known.ts'), 'class C { constructor() { Object.freeze(this); } }');
  writeFileSync(join(root, 'nested', 'deeper', 'new.tsx'), 'class C { constructor() { Object . freeze ( this ); } render(){return <div/>;} }');
  writeFileSync(join(root, 'nested', 'ignored.ts'), '// Object.freeze(this)');
  assert.deepEqual(frozenControllerFiles(root), ['known.ts', 'nested/deeper/new.tsx']);
  assert.throws(() => assert.deepEqual(frozenControllerFiles(root), ['known.ts']));
});
