import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
let open: (name: string) => Promise<any>;
(globalThis as any).__caseNative = { open: (name: string) => open(name), randomUUID, hash: async (_: string, text: string) => createHash('sha256').update(text).digest('hex') };
const hooks = registerHooks({ resolve(specifier, context, next) {
  const source = specifier === 'expo-sqlite' ? 'export const openDatabaseAsync=(...args)=>globalThis.__caseNative.open(...args);' : specifier === 'expo-crypto' ? 'export const randomUUID=()=>globalThis.__caseNative.randomUUID();export const CryptoDigestAlgorithm={SHA256:"SHA-256"};export const digestStringAsync=(...args)=>globalThis.__caseNative.hash(...args);' : null;
  return source ? { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(source) } : next(specifier, context);
} });
test.after(() => { hooks.deregister(); delete (globalThis as any).__caseNative; });
let serial = 0;
async function adapter() { return (await import(`../src/platform/cases.native.ts?test=${++serial}`)).caseStore; }
function sql() {
  const db = new DatabaseSync(':memory:');
  return { db, async execAsync(s: string) { db.exec(s); }, async runAsync(s: string, ...args: any[]) { return db.prepare(s).run(...args); }, async getFirstAsync(s: string, ...args: any[]) { return db.prepare(s).get(...args); }, async getAllAsync(s: string, ...args: any[]) { return db.prepare(s).all(...args); }, async closeAsync() { db.close(); } };
}
test('native adapter SQL executes real CAS, retained restart, duplicate restore and delete', async () => {
  const database = sql(); let opens = 0; open = async name => { assert.equal(name, 'apex-cases-v1.db'); opens++; return database; };
  const first = await adapter(); const c = await first.create('SQLite bench');
  const second = await adapter(); const other = await second.open(c.id); assert.equal(other.revision, 1);
  const input = { name: 'raw', kind: 'source' as const, origin: 'operator-import' as const, content: 'bytes' };
  const outcomes = await Promise.allSettled([first.append(c.id, 1, input), second.append(c.id, 1, { ...input, content: 'other' })]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1); assert.equal((await first.open(c.id)).revision, 2);
  const copy = await second.export(c.id); assert.equal((await first.restore(copy)).duplicate, true);
  await assert.rejects(second.remove(c.id, 1)); await second.remove(c.id, 2); assert.equal((await first.list()).cases.length, 0); assert.equal(opens, 2); database.db.close();
});
test('native connection initialisation is single-flight and successful close permits retry', async () => {
  let opens = 0, closes = 0; const db = sql();
  open = async () => { if (++opens === 1) return { async execAsync() { throw new Error('setup'); }, async closeAsync() { closes++; } }; return db; };
  const store = await adapter(); const failed = await Promise.allSettled([store.list(), store.list()]); assert.equal(failed.filter(r => r.status === 'rejected').length, 2);
  assert.equal(opens, 1); assert.equal(closes, 1); assert.equal((await store.list()).cases.length, 0); assert.equal(opens, 2); db.db.close();
});
test('uncertain native connection cleanup stays latched until process restart', async () => {
  let opens = 0; open = async () => { opens++; return { async execAsync() { throw new Error('schema'); }, async closeAsync() { throw new Error('close'); } }; };
  const store = await adapter(); await assert.rejects(store.list(), AggregateError); await assert.rejects(store.list(), AggregateError); assert.equal(opens, 1);
});
