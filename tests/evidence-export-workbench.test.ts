import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EvidenceStore } from '../packages/core/evidence.ts';
import { readEvidenceBundle } from '../packages/core/evidence-bundle.ts';
import { EvidenceExportWorkbench } from '../src/evidence-export-workbench.ts';
const time = '2026-11-08T01:02:03.000Z';
const sha256 = async (s: string) => createHash('sha256').update(s).digest('hex');
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function fixture() {
  const docs: string[] = [];
  const store = new EvidenceStore({ insert: async (_, d) => { docs.push(d); }, list: async () => docs }, { sha256, randomId: () => `id-${docs.length}` });
  for (let i = 0; i < 6; i++) await store.save({ kind: 'analysis.can', source: 'offline-fixture', observedAt: time, payload: { note: `private-${i}` } });
  return docs.map(d => '\n ' + JSON.stringify(JSON.parse(d), null, 2) + '\t');
}
const refresh = (w: EvidenceExportWorkbench, docs: readonly string[]) => w.refresh(async () => docs, w.lease, w.state);
const toggle = (w: EvidenceExportWorkbench, id = 'id-0') => w.toggle(id, w.lease, w.state);
const prepare = (w: EvidenceExportWorkbench, hash = sha256) => w.prepare(hash, undefined, time, w.lease, w.state);

test('explicit exact selection exports only captured strings; public surfaces are frozen metadata only', async () => {
  const docs = await fixture(); const exact = [...docs]; const w = new EvidenceExportWorkbench();
  assert.equal(w.state.records.length, 0); await refresh(w, docs);
  assert.deepEqual(w.state.selectedIds, []); assert.match(w.state.message, /unverified/);
  assert.equal(JSON.stringify(w.state).includes('private-'), false);
  assert.equal(Object.isFrozen(w), true); assert.equal(Object.isFrozen(w.state), true);
  assert.equal(Object.isFrozen(w.state.records), true); assert.equal(Object.isFrozen(w.state.records[0]), true);
  assert.throws(() => { (w.state.records[0] as any).id = 'forged'; });
  assert.deepEqual(Object.keys(w), []);
  await prepare(w); assert.equal(w.state.bundle, null);
  toggle(w, 'id-1'); toggle(w); assert.equal(Object.isFrozen(w.state.selectedIds), true);
  docs[0] = '{}'; docs.reverse(); await prepare(w);
  const preview = await readEvidenceBundle(w.state.bundle!, sha256);
  assert.deepEqual(preview.recordDocuments, [exact[1], exact[0]]);
  w.page(1); assert.equal(w.state.page, 1); assert.ok(w.state.bundle);
  toggle(w); assert.equal(w.state.bundle, null); assert.deepEqual(w.state.selectedIds, ['id-1']);
  w.clear(); assert.equal(w.state.records.length, 0); assert.deepEqual(w.state.selectedIds, []);
  toggle(w, 'id-1'); assert.deepEqual(w.state.selectedIds, []);
});

test('invalid list responses fail whole with safe errors and no previous selection or bundle', async () => {
  const docs = await fixture(); const w = new EvidenceExportWorkbench();
  for (const invalid of [null, {}, [null], new Array(1), ['{}'], [' '.repeat(16385)], [docs[0], docs[0]], Array(101).fill(docs[0])]) {
    await refresh(w, docs); toggle(w); await prepare(w); assert.ok(w.state.bundle);
    await refresh(w, invalid as string[]);
    assert.equal(w.state.bundle, null); assert.equal(w.state.records.length, 0); assert.equal(w.state.pending, null); assert.deepEqual(w.state.selectedIds, []);
  }
  await w.refresh(async () => { throw Error('SECRET payload'); }, w.lease, w.state);
  assert.equal(w.state.message.includes('SECRET'), false);
});

test('only selected records are verified, tampering yields no partial bundle, both bundle verification passes run', async () => {
  const docs = await fixture(); docs[1] = docs[1]!.replace('private-1', 'tampered');
  const w = new EvidenceExportWorkbench(); await refresh(w, docs); toggle(w); await prepare(w); assert.ok(w.state.bundle);
  toggle(w, 'id-1'); await prepare(w); assert.equal(w.state.bundle, null); assert.equal(w.state.pending, null);
  toggle(w, 'id-1'); let calls = 0;
  await prepare(w, async s => { if (++calls === 3) throw Error('SECRET'); return sha256(s); });
  assert.equal(calls, 3); assert.equal(w.state.bundle, null); assert.equal(w.state.message.includes('SECRET'), false);
});

test('stale callbacks and prior activation leases cannot read, select or prepare', async () => {
  const docs = await fixture(); const w = new EvidenceExportWorkbench(false); const old = w.state; const lease = w.lease;
  let reads = 0; const read = async () => { reads++; return docs; };
  await w.refresh(read, lease, old); assert.equal(reads, 0);
  w.activate(); await w.refresh(read, lease, old); assert.equal(reads, 0);
  await refresh(w, docs); const stale = w.state; w.page(1);
  w.toggle('id-0', w.lease, stale); await w.refresh(read, w.lease, stale); await w.prepare(sha256, undefined, time, w.lease, stale);
  assert.equal(reads, 0); assert.deepEqual(w.state.selectedIds, []);
  const before = w.state; const priorLease = w.lease; w.deactivate(); w.activate();
  w.toggle('id-0', priorLease, before); await w.refresh(read, priorLease, before);
  assert.equal(reads, 0); assert.equal(w.state.records.length, 0);
});

test('late list success and failure cannot overwrite refresh, clear or deactivation', async () => {
  const docs = await fixture();
  for (const reject of [false, true]) for (const action of ['refresh', 'clear', 'deactivate'] as const) {
    const w = new EvidenceExportWorkbench(); const gate = deferred<readonly string[]>();
    const pending = w.refresh(() => gate.promise, w.lease, w.state);
    assert.equal(w.state.pending, 'list');
    if (action === 'refresh') await refresh(w, docs); else w[action]();
    const expected = w.state;
    if (reject) gate.reject(Error('SECRET')); else gate.resolve(docs);
    await pending; assert.equal(w.state, expected);
  }
});

test('late prepare success and failure cannot overwrite selection, refresh, clear or unmount', async () => {
  const docs = await fixture();
  for (const reject of [false, true]) for (const action of ['toggle', 'refresh', 'clear', 'deactivate'] as const) {
    const w = new EvidenceExportWorkbench(); await refresh(w, docs); toggle(w);
    const gate = deferred<void>(); const pending = prepare(w, async s => { await gate.promise; return sha256(s); });
    assert.equal(w.state.pending, 'prepare'); assert.equal(w.state.bundle, null);
    if (action === 'toggle') toggle(w, 'id-1'); else if (action === 'refresh') await refresh(w, docs); else w[action]();
    const expected = w.state;
    if (reject) gate.reject(Error('SECRET')); else gate.resolve();
    await pending; assert.equal(w.state, expected); assert.equal(w.state.bundle, null);
  }
});

test('superseding preparation stops additional hash work after an in-flight hash returns', async () => {
  const w = new EvidenceExportWorkbench(); await refresh(w, await fixture()); toggle(w); toggle(w, 'id-1');
  const gate = deferred<void>(); let calls = 0;
  const pending = prepare(w, async text => { calls++; await gate.promise; return sha256(text); });
  toggle(w, 'id-2'); gate.resolve(); await pending;
  assert.equal(calls, 1); assert.equal(w.state.bundle, null);
});

test('100-record listing limit accepts exactly 100 unique records and valid pages only', async () => {
  const base = JSON.parse((await fixture())[0]!);
  const docs = Array.from({ length: 100 }, (_, i) => JSON.stringify({ ...base, id: `row-${i}` }));
  const w = new EvidenceExportWorkbench(); await refresh(w, docs);
  assert.equal(w.state.records.length, 100); assert.deepEqual(w.state.selectedIds, []);
  w.page(24); assert.equal(w.state.page, 24);
  for (const page of [-1, 25, NaN, Infinity, 1.5]) { const state = w.state; w.page(page); assert.equal(w.state, state); }
});
