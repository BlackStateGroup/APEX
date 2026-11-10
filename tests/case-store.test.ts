import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { CaseStore, CaseConflict, parseCase } from '../packages/core/case-store.ts';
import type { CaseBackend } from '../packages/core/case-store.ts';
const crypto = { randomId: randomUUID, sha256: async (s: string) => createHash('sha256').update(s).digest('hex') };
function setup() {
  const rows = new Map<string, { revision: number; document: string }>();
  const backend: CaseBackend = {
    async read(id) { return rows.get(id)?.document ?? null; }, async list() { return [...rows.values()].map(r => r.document); },
    async put(id, expected, revision, document) { const row = rows.get(id); if (expected === null ? !!row : row?.revision !== expected) return false; rows.set(id, { revision, document }); return true; },
    async remove(id, expected) { if (rows.get(id)?.revision !== expected) return false; return rows.delete(id); },
  };
  return { rows, backend, store: new CaseStore(backend, crypto) };
}
const source = { name: 'Original', kind: 'source' as const, origin: 'operator-import' as const, content: '{ "raw" : "é🧪" }\n' };
test('case retains original text, closes derivation lineage and survives restart/export/restore', async () => {
  const { store, backend } = setup(); const c = await store.create('Bench');
  const a = (await store.append(c.id, c.revision, source)).case;
  const b = (await store.append(a.id, a.revision, { name: 'Analysis', kind: 'analysis', origin: 'derived', content: '{"result":1}', parents: [a.artifacts[0]!.id] })).case;
  const reopened = await new CaseStore(backend, crypto).open(c.id);
  assert.equal(reopened.artifacts[0]!.content, source.content); assert.deepEqual(reopened, b);
  const portable = await store.export(c.id); const target = setup(); const restored = await target.store.restore(portable);
  assert.deepEqual(restored.case, b); assert.equal((await target.store.restore(portable)).duplicate, true);
  assert.equal((await target.store.list()).cases.length, 1);
});
test('concurrent stale updates cannot discard a winning artifact', async () => {
  const { store } = setup(); const c = await store.create('Race');
  const outcomes = await Promise.allSettled([store.append(c.id, 1, source), store.append(c.id, 1, { ...source, content: 'other' })]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = outcomes.find(r => r.status === 'rejected') as PromiseRejectedResult; assert.ok(rejected.reason instanceof CaseConflict);
  assert.equal((await store.open(c.id)).artifacts.length, 1);
});
test('duplicates do not inflate revisions and stale deletion fails', async () => {
  const { store } = setup(); const c = await store.create('Deduplicate'); const a = (await store.append(c.id, 1, source)).case;
  const duplicate = await store.append(c.id, a.revision, source); assert.equal(duplicate.duplicate, true); assert.equal(duplicate.case.revision, 2);
  await assert.rejects(store.remove(c.id, 1), CaseConflict); await store.remove(c.id, 2); await assert.rejects(store.open(c.id), /not found/);
});
test('restore refuses altered source, altered outer digest, duplicate keys and newer schema', async () => {
  const { store } = setup(); const c = await store.create('Import'); await store.append(c.id, 1, source); const text = await store.export(c.id);
  const raw = JSON.parse(text); raw.artifacts[0].content += 'x'; await assert.rejects(store.verify(JSON.stringify(raw)), /source digest/);
  const outer = JSON.parse(text); outer.title = 'Changed'; await assert.rejects(store.verify(JSON.stringify(outer)), /Case digest/);
  assert.throws(() => parseCase(text.replace('"schema":', '"schema":"apex.case.v1","schema":')), /Duplicate/);
  assert.throws(() => parseCase(text.replace('apex.case.v1', 'apex.case.v2')), /Unsupported/);
});
test('missing lineage, source parents, wrong origin, oversize and title controls are rejected', async () => {
  const { store } = setup(); const c = await store.create('Bounds');
  await assert.rejects(store.append(c.id, 1, { ...source, kind: 'analysis' }), /Derived/);
  await assert.rejects(store.append(c.id, 1, { ...source, origin: 'derived' }), /Derived/);
  await assert.rejects(store.append(c.id, 1, { ...source, parents: ['a'.repeat(64)] }), /parent/);
  await assert.rejects(store.append(c.id, 1, { ...source, content: 'x'.repeat(65537) }), /65536/);
  await assert.rejects(store.create('bad\u202ename'), /label/);
  await assert.rejects(store.append(c.id, 1, { ...source, content: '\ud800' }), /surrogate/);
});
test('restore never overwrites a conflicting revision, corruption is retained and reported', async () => {
  const { store, rows } = setup(); const c = await store.create('Recovery'); const old = await store.export(c.id);
  await store.append(c.id, 1, source); await assert.rejects(store.restore(old), /cannot overwrite/);
  rows.set('damaged', { revision: 1, document: '{' }); const list = await store.list(); assert.equal(list.rejected, 1); assert.equal(rows.has('damaged'), true);
});
test('write failure is observable and leaves prior revision intact', async () => {
  const { store, backend } = setup(); const c = await store.create('Durability');
  const broken = new CaseStore({ ...backend, async put() { throw new Error('disk full'); } }, crypto);
  await assert.rejects(broken.append(c.id, 1, source), /disk full/); assert.equal((await store.open(c.id)).revision, 1);
});
test('caller mutations after append dispatch cannot change retained lineage or source', async () => {
  const { store } = setup(); const c = await store.create('Snapshot'); const input = { ...source, parents: [] as string[] };
  const saving = store.append(c.id, 1, input); input.content = 'changed'; input.parents.push('fake');
  assert.equal((await saving).case.artifacts[0]!.content, source.content);
});
