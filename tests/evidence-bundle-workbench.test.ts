import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BUNDLE_CHARACTERS } from '../packages/core/evidence-bundle.ts';
import { EvidenceBundleWorkbench } from '../src/evidence-bundle-workbench.ts';
import { sha256, bundleFixture } from './bundle-preview-fixture.ts';
test('exact text bound accepted; over bound rejected whole and stale output cleared', async () => {
  const { bundle, documents } = await bundleFixture(); const c = new EvidenceBundleWorkbench();
  const exact = bundle + ' '.repeat(MAX_BUNDLE_CHARACTERS - bundle.length);
  c.edit(exact); assert.equal(c.state.document, exact); await c.inspect(sha256);
  assert.deepEqual(c.state.report?.recordDocuments, documents);
  c.page(2); assert.equal(c.state.page, 2);
  c.edit(exact + ' '); assert.equal(c.state.document, exact); assert.equal(c.state.report, null); assert.equal(c.state.page, 0); assert.match(c.state.message, /rejected whole/);
  await c.inspect(sha256); assert.equal(c.state.report, null); assert.equal(c.state.rejectedEdit, true);
  c.edit(exact); await c.inspect(sha256); assert.ok(c.state.report); // Explicit accepted re-entry releases the rejection fence.
  c.edit('{}'); assert.equal(c.state.report, null); await c.inspect(sha256); assert.equal(c.state.report, null);
  c.clear(); assert.equal(c.state.document, ''); assert.equal(c.state.pending, false); assert.equal(c.state.page, 0);
});
test('duplicates, outer and inner digest failures never expose partial reports', async () => {
  const { bundle } = await bundleFixture(1); const c = new EvidenceBundleWorkbench();
  const badInner = JSON.parse(bundle); badInner.records[0] = badInner.records[0].replace('not displayed', 'tampered');
  const { sha256: _, ...base } = badInner; badInner.sha256 = await sha256(JSON.stringify(base));
  const cases = [bundle.replace('"format":', '"for\\u006dat":"apex.selected-evidence","format":'), bundle.replace('not displayed', 'tampered'), JSON.stringify(badInner)];
  for (const document of cases) { c.edit(bundle); await c.inspect(sha256); assert.ok(c.state.report); c.edit(document); await c.inspect(sha256); assert.equal(c.state.report, null); assert.match(c.state.message, /failed/); }
});
test('pagination is bounded and edit/clear/deactivation reset pages and reports', async () => {
  const { bundle } = await bundleFixture(); const c = new EvidenceBundleWorkbench();
  c.edit(bundle); await c.inspect(sha256); c.page(2); assert.equal(c.state.page, 2);
  for (const page of [-1, 3, 1.5, NaN, Infinity]) c.page(page);
  assert.equal(c.state.page, 2); c.deactivate(); assert.equal(c.state.document, bundle); assert.equal(c.state.report, null); assert.equal(c.state.page, 0);
  c.page(1); assert.equal(c.state.page, 0); c.activate(); await c.inspect(sha256); assert.ok(c.state.report); c.clear(); assert.equal(c.state.report, null);
});
test('new draft, rejected edit, clear, deactivation and newer Inspect fence stale success AND error', async () => {
  const { bundle } = await bundleFixture(1);
  for (const fail of [false, true]) for (const transition of ['edit', 'oversize', 'clear', 'deactivate', 'inspect']) {
    const c = new EvidenceBundleWorkbench(); c.edit(bundle);
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const older = c.inspect(async text => { await gate; if (fail) throw new Error('stale failure'); return sha256(text); });
    assert.equal(c.state.pending, true);
    if (transition === 'edit') c.edit('{}');
    if (transition === 'oversize') c.edit(' '.repeat(MAX_BUNDLE_CHARACTERS + 1));
    if (transition === 'clear') c.clear();
    if (transition === 'deactivate') c.deactivate();
    if (transition === 'inspect') await c.inspect(sha256);
    const expected = c.state; release(); await older;
    assert.equal(c.state, expected, `${transition}, fail=${fail}`);
    assert.doesNotMatch(c.state.message, /stale failure/);
  }
});
test('published state, nested reports and exact strings cannot be mutated or replaced', async () => {
  const c = new EvidenceBundleWorkbench(); const { bundle, documents } = await bundleFixture(1);
  c.edit(bundle); const draft = c.state; await c.inspect(sha256);
  const verified = c.state; const attempts = [
    () => { Object.defineProperty(c, 'state', { value: { document: '{}' } }); },
    () => { (c as any).state = { document: '{}' }; },
    () => { (c.state as any).document = '{}'; },
    () => { (c.state as any).message = 'forged'; },
    () => { (c.state as any).report = null; },
    () => { (c.state.report!.records[0] as any).source = 'native-ios'; },
    () => { (c.state.report!.records[0]!.payload as any).url = 'changed'; },
    () => { (c.state.report!.recordDocuments as any)[0] = '{}'; },
    () => { (c.state.report!.records as any).push({}); },
  ];
  for (const mutate of attempts) assert.throws(mutate, TypeError);
  assert.equal(c.state, verified); assert.deepEqual(c.state.report!.recordDocuments, documents);
  assert.equal(draft.report, null); c.clear(); assert.equal(verified.document, bundle); assert.ok(verified.report);
});
test('deactivated controllers reject queued actions; activation leases never revive old controls', async () => {
  const c = new EvidenceBundleWorkbench(); const { bundle } = await bundleFixture(1); c.edit(bundle);
  const oldLease = c.lease; c.deactivate(); const inactive = c.state;
  let hashes = 0; await c.inspect(async text => { hashes++; return sha256(text); });
  c.edit('{}'); c.clear(); c.page(1); assert.equal(c.state, inactive); assert.equal(hashes, 0); assert.equal(c.isActive(oldLease), false);
  c.activate(); assert.equal(c.isActive(oldLease), false); assert.equal(c.isActive(c.lease), true);
  c.edit(' '.repeat(MAX_BUNDLE_CHARACTERS + 1)); const rejected = c.state;
  await c.inspect(async text => { hashes++; return sha256(text); }); assert.equal(c.state, rejected); assert.equal(hashes, 0);
  c.deactivate(); c.activate(); assert.equal(c.state.rejectedEdit, true); await c.inspect(sha256); assert.equal(c.state.report, null);
  c.clear(); assert.equal(c.state.rejectedEdit, false); c.edit(bundle); await c.inspect(sha256); assert.ok(c.state.report);
});
