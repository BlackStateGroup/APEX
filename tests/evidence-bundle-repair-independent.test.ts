import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceBundleWorkbench } from '../src/evidence-bundle-workbench.ts';
import { MAX_BUNDLE_CHARACTERS } from '../packages/core/evidence-bundle.ts';
import { bundleFixture, sha256 } from './bundle-preview-fixture.ts';

test('independent repair: frozen owner rejects state/accessor shadowing without invoking getters', async () => {
  const c = new EvidenceBundleWorkbench(); c.edit((await bundleFixture(1)).bundle); await c.inspect(sha256);
  let reads = 0; const state = c.state;
  for (const name of ['state', 'lease', 'isActive', 'inspect', 'edit']) {
    assert.throws(() => Object.defineProperty(c, name, { get() { reads++; return null; } }), TypeError);
  }
  assert.equal(reads, 0); assert.equal(c.state, state); assert.ok(Object.isFrozen(c));
  const frozen = (value: unknown): void => {
    if (value && typeof value === 'object') {
      assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozen(child);
    }
  };
  frozen(state); c.clear(); assert.ok(state.report); assert.equal(c.state.report, null);
});

test('independent repair: initial inactive and previous activation leases cannot dispatch retained callbacks', async () => {
  const c = new EvidenceBundleWorkbench(false); const initial = c.state; const initialLease = c.lease;
  c.edit('{}'); c.clear(); c.page(1); await c.inspect(() => assert.fail('inactive hashing'));
  assert.equal(c.state, initial); c.activate(); assert.equal(c.isActive(initialLease), false);
  const { bundle } = await bundleFixture(9); c.edit(bundle); await c.inspect(sha256);
  const lease = c.lease;
  // Model the TSX act guard, not React event scheduling or layout effects.
  const stale = [() => c.edit('{}'), () => c.clear(), () => c.page(2), () => { void c.inspect(() => assert.fail('stale hashing')); }]
    .map(action => () => { if (c.isActive(lease)) action(); });
  c.deactivate(); stale.forEach(action => action()); c.activate();
  const returned = c.state; stale.forEach(action => action()); assert.equal(c.state, returned);
  assert.equal(c.state.document, bundle); assert.equal(c.state.report, null);
  await c.inspect(sha256); assert.ok(c.state.report);
});

test('independent repair: an inner digest finishing across repeated tab changes cannot publish stale success/error', async () => {
  for (const fail of [false, true]) {
    const c = new EvidenceBundleWorkbench(); c.edit((await bundleFixture(4)).bundle);
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void; const atInner = new Promise<void>(resolve => { entered = resolve; });
    let calls = 0;
    const old = c.inspect(async text => {
      if (++calls === 2) { entered(); await gate; if (fail) throw new Error('obsolete inner digest'); }
      return sha256(text);
    });
    await atInner;
    for (let i = 0; i < 3; i++) { c.deactivate(); c.activate(); }
    c.edit((await bundleFixture(1)).bundle); await c.inspect(sha256); const latest = c.state;
    release(); await old; assert.equal(c.state, latest); assert.equal(c.state.report!.records.length, 1);
    // Hashing is fenced, not canceled: the successful old validation still hashes all records.
    assert.equal(calls, fail ? 2 : 5);
  }
});

test('independent repair: rejected replacement remains blocked across tab changes and has zero digest calls', async () => {
  const c = new EvidenceBundleWorkbench(); const { bundle } = await bundleFixture(1); c.edit(bundle);
  c.edit(' '.repeat(MAX_BUNDLE_CHARACTERS + 1)); c.deactivate(); c.activate();
  const rejected = c.state; await c.inspect(() => assert.fail('rejected draft hashing'));
  assert.equal(c.state, rejected); assert.equal(c.state.document, bundle); assert.equal(c.state.rejectedEdit, true);
  c.edit(bundle); await c.inspect(sha256); assert.ok(c.state.report);
});
