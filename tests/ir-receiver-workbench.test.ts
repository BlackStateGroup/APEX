import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IrReceiverWorkbenchController as Controller, IR_RECEIVER_EXAMPLE as EXAMPLE } from '../src/ir-receiver-workbench.ts';
const hash = async (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const raw = 'uint16_t rawData[1] = {1};\n';
const state = (c: Controller) => c.state;
test('explicit provenance, immutable state and no automatic inspection', async () => {
  const c = new Controller(); assert.ok(Object.isFrozen(c)); assert.ok(Object.isFrozen(c.state));
  c.edit(EXAMPLE, c.lease); await c.inspect(c.lease); assert.equal(c.state.report, null); assert.match(c.state.message, /Declare/);
  c.declare('recorded-import', c.lease); assert.equal(c.state.report, null); await c.inspect(c.lease);
  assert.equal(state(c).report?.context.provenance, 'recorded-import'); assert.equal(state(c).report?.originalSource, EXAMPLE);
  const retained = c.state; c.example(c.lease); assert.equal(state(c).report, null); assert.equal(state(c).provenance, 'synthetic-fixture');
  assert.equal(retained.report?.context.provenance, 'recorded-import');
  assert.throws(() => { (retained as any).draft = 'wrong'; });
});
test('whole-edit rejection retains previous draft and remains blocked across declarations and activation', async () => {
  let calls = 0; const c = new Controller(true, async s => { calls++; return hash(s); }); c.example(c.lease); await c.inspect(c.lease);
  for (const bad of ['é', '\ud800', 'x'.repeat(262145), {} as any]) {
    c.edit(bad, c.lease); assert.equal(c.state.draft, EXAMPLE); assert.equal(c.state.report, null); assert.equal(c.state.rejectedEdit, true);
    c.declare('recorded-import', c.lease); c.deactivate(); c.activate(); await c.inspect(c.lease);
    assert.equal(calls, 1); assert.equal(c.state.rejectedEdit, true);
  }
  c.edit(EXAMPLE.replaceAll('\n', '\r\n'), c.lease); assert.equal(c.state.rejectedEdit, false); await c.inspect(c.lease); assert.equal(calls, 2);
  assert.equal(state(c).report?.originalSource, EXAMPLE.replaceAll('\n', '\r\n'));
  c.clear(c.lease); assert.equal(c.state.draft, ''); assert.equal(c.state.provenance, null); assert.equal(c.state.report, null);
});
test('edits, rejected edits, declaration, example, clear and activation fence both late success and error', async () => {
  for (const outcome of ['success', 'error']) for (const action of ['edit', 'reject-edit', 'declare', 'example', 'clear', 'tab']) {
    const gate = deferred<string>(); const c = new Controller(true, () => gate.promise); c.example(c.lease);
    const pending = c.inspect(c.lease); assert.equal(c.state.pending, true);
    switch (action) {
      case 'edit': c.edit(raw, c.lease); break;
      case 'reject-edit': c.edit('é', c.lease); break;
      case 'declare': c.declare('recorded-import', c.lease); break;
      case 'example': c.example(c.lease); break;
      case 'clear': c.clear(c.lease); break;
      case 'tab': c.deactivate(); c.activate(); break;
    }
    const expected = c.state;
    if (outcome === 'success') gate.resolve(await hash(EXAMPLE)); else gate.reject(Error('late'));
    await pending; assert.equal(c.state, expected, `${outcome}/${action}`); assert.equal(c.state.report, null); assert.equal(c.state.pending, false);
  }
});
test('latest inspection wins and duplicate pending call is ignored', async () => {
  for (const outcome of ['success', 'error']) {
    const first = deferred<string>(), second = deferred<string>(); let calls = 0;
    const c = new Controller(true, () => ++calls === 1 ? first.promise : second.promise); c.example(c.lease);
    const old = c.inspect(c.lease); await c.inspect(c.lease); assert.equal(calls, 1);
    c.edit(raw, c.lease); const newer = c.inspect(c.lease); second.resolve(await hash(raw)); await newer; const expected = c.state;
    if (outcome === 'success') first.resolve(await hash(EXAMPLE)); else first.reject(Error('late'));
    await old; assert.equal(c.state, expected); assert.equal(c.state.report?.originalSource, raw);
  }
});
test('stale activation callbacks cannot edit, inspect, clear, page or declare; draft persists in memory', async () => {
  const c = new Controller(); c.example(c.lease); const lease = c.lease;
  const actions = [() => c.edit('stale', lease), () => c.inspect(lease), () => c.example(lease), () => c.declare('recorded-import', lease), () => c.clear(lease), () => c.page(1, lease)];
  c.deactivate(); for (const action of actions) await action(); c.activate();
  assert.equal(c.state.draft, EXAMPLE); assert.equal(c.state.provenance, 'synthetic-fixture'); assert.equal(c.state.report, null);
  c.edit(raw.repeat(9), c.lease); await c.inspect(c.lease); const expected = c.state;
  for (const action of actions) await action(); assert.equal(c.state, expected);
});
test('bounded pages and invalid reports never leave stale results visible', async () => {
  const c = new Controller(); c.example(c.lease); c.edit(raw.repeat(32), c.lease); await c.inspect(c.lease);
  c.page(7, c.lease); assert.equal(c.state.page, 7);
  for (const page of [-1, NaN, Infinity, .5, 8]) { c.page(page, c.lease); assert.equal(c.state.page, 7); }
  c.edit(raw.repeat(33), c.lease); await c.inspect(c.lease); assert.equal(c.state.report, null); assert.equal(c.state.page, 0); assert.match(c.state.message, /record-limit/);
  c.edit('\0', c.lease); await c.inspect(c.lease); assert.match(c.state.message, /non-ascii-or-control/);
  const broken = new Controller(true, () => { throw Error('no hash'); }); broken.example(broken.lease); await broken.inspect(broken.lease);
  assert.equal(broken.state.pending, false); assert.equal(broken.state.report, null); assert.match(broken.state.message, /hashing failed/);
});
