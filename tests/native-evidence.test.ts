/** Actual native adapter, synthetic Expo bindings. Not iOS/Android SQLite acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVIDENCE_SCHEMA, INSERT_EVIDENCE, SELECT_EVIDENCE } from '../packages/core/evidence.ts';

function deferred<T>() {
 let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
 const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
 return {promise, resolve, reject};
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const schemaFailure = new Error('schema initialization refused');
let open: (name: string) => Promise<unknown>;
const globalKey = '__apexNativeEvidenceTest';
(globalThis as any)[globalKey] = {
 open: (name: string) => open(name), randomUUID,
 hash: async (_algorithm: string, value: string) => createHash('sha256').update(value).digest('hex'),
};
const hooks = registerHooks({resolve(specifier, context, next) {
 if (specifier === 'expo-sqlite') return {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(`export const openDatabaseAsync = (...args) => globalThis.${globalKey}.open(...args);`)};
 if (specifier === 'expo-crypto') return {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(`export const randomUUID = () => globalThis.${globalKey}.randomUUID(); export const CryptoDigestAlgorithm = {SHA256:'SHA-256'}; export const digestStringAsync = (...args) => globalThis.${globalKey}.hash(...args);`)};
 return next(specifier, context);
}});
test.after(() => {hooks.deregister(); delete (globalThis as any)[globalKey];});
let instance = 0;
async function adapter() { return (await import(`../src/platform/evidence.native.ts?native-evidence-test=${++instance}`)).evidenceStore; }
function fakeDatabase(options: {schema?: () => Promise<void>; close?: () => Promise<void>} = {}) {
 const documents: string[] = [];
 const calls = {schema: 0, close: 0, reads: 0, writes: 0};
 return {calls, documents,
  async execAsync(sql: string) {assert.equal(sql, EVIDENCE_SCHEMA); calls.schema++; await options.schema?.();},
  async closeAsync() {calls.close++; await options.close?.();},
  async runAsync(sql: string, _id: string, document: string) {assert.equal(sql, INSERT_EVIDENCE); calls.writes++; documents.unshift(document);},
  async getAllAsync(sql: string, limit: number) {assert.equal(sql, SELECT_EVIDENCE); calls.reads++; return documents.slice(0, limit).map(document => ({document}));},
 };
}
const input = () => ({kind: 'analysis.nec' as const, source: 'offline-fixture' as const, payload: {signal: 'synthetic'}, observedAt: '2026-11-08T00:00:00Z'});

test('native journal closes the acquired database after schema setup fails', async () => {
 const db = fakeDatabase({schema: async () => {throw schemaFailure;}});
 let opens = 0; open = async name => {assert.equal(name, 'apex-evidence.db'); opens++; return db;};
 const store = await adapter();
 await assert.rejects(store.list(), error => error === schemaFailure);
 assert.equal(db.calls.close, 1, 'a successfully opened database must not leak after schema failure');
 assert.equal(opens, 1); assert.equal(db.calls.reads, 0); assert.equal(db.calls.writes, 0);
});

test('native journal shares setup and does not reopen while failed setup is closing', async () => {
 const closing = deferred<void>();
 const failed = fakeDatabase({schema: async () => {throw schemaFailure;}, close: () => closing.promise});
 const healthy = fakeDatabase(); let opens = 0;
 open = async () => ++opens === 1 ? failed : healthy;
 const store = await adapter(); let settled = 0;
 const first = store.list().catch((error: unknown) => {settled++; return error;});
 await tick();
 const second = store.save(input()).catch((error: unknown) => {settled++; return error;});
 await tick();
 assert.equal(failed.calls.close, 1); assert.equal(opens, 1); assert.equal(settled, 0);
 assert.equal(failed.calls.reads + failed.calls.writes + healthy.calls.reads + healthy.calls.writes, 0);
 closing.resolve(); assert.deepEqual(await Promise.all([first, second]), [schemaFailure, schemaFailure]);
 const saved = await store.save(input());
 assert.equal(opens, 2); assert.equal(healthy.calls.schema, 1); assert.equal(healthy.calls.close, 0);
 assert.deepEqual(await store.list(), [saved]); assert.equal(await store.verify(saved), true);
});

test('native journal refuses later acquisition if failed setup cannot close its database', async () => {
 const closeFailure = new Error('close outcome uncertain');
 const db = fakeDatabase({schema: async () => {throw schemaFailure;}, close: async () => {throw closeFailure;}});
 let opens = 0; open = async () => {opens++; return db;}; const store = await adapter();
 const first = await store.list().catch((error: unknown) => error);
 assert.ok(first instanceof AggregateError); assert.deepEqual(first.errors, [schemaFailure, closeFailure]);
 assert.match(first.message, /restart/i);
 const second = await store.save(input()).catch((error: unknown) => error);
 assert.equal(second, first); assert.equal(opens, 1); assert.equal(db.calls.close, 1);
 assert.equal(db.calls.reads + db.calls.writes, 0);
});

test('native journal healthy initialization is lazy and single-flight across concurrent saves and reads', async () => {
 const opening = deferred<ReturnType<typeof fakeDatabase>>(), schema = deferred<void>();
 const db = fakeDatabase({schema: () => schema.promise}); let opens = 0;
 open = async () => {opens++; return opening.promise;}; const store = await adapter(); assert.equal(opens, 0);
 const reads = store.list(); const writes = Array.from({length: 12}, () => store.save(input()));
 await tick(); assert.equal(opens, 1); assert.equal(db.calls.schema, 0);
 opening.resolve(db); await tick(); assert.equal(db.calls.schema, 1); assert.equal(db.calls.reads + db.calls.writes, 0);
 schema.resolve(); await reads; const saved = await Promise.all(writes);
 const loaded = await store.list(500); assert.equal(loaded.length, 12);
 assert.deepEqual(new Set(loaded.map((r: any) => r.id)), new Set(saved.map((r: any) => r.id)));
 assert.ok((await Promise.all(loaded.map((r: any) => store.verify(r)))).every(Boolean));
 assert.equal(opens, 1); assert.equal(db.calls.close, 0);
});

test('native journal open failures remain retryable without attempting to close an unreturned handle', async () => {
 const failure = new Error('open failed'); const db = fakeDatabase(); let opens = 0;
 open = async () => {if (++opens === 1) throw failure; return db;}; const store = await adapter();
 await assert.rejects(store.list(), error => error === failure);
 assert.deepEqual(await store.list(), []); assert.equal(opens, 2); assert.equal(db.calls.close, 0);
});

test('native journal never replays a failed write or closes a healthy shared connection', async () => {
 const failure = new Error('write outcome uncertain'), db = fakeDatabase();
 let opens = 0, writes = 0;
 const originalWrite = db.runAsync.bind(db);
 db.runAsync = async (...args) => {writes++; await originalWrite(...args); throw failure;};
 open = async () => {opens++; return db;}; const store = await adapter();
 await assert.rejects(store.save(input()), error => error === failure);
 const rows = await store.list(); assert.equal(rows.length, 1); assert.equal(await store.verify(rows[0]!), true);
 assert.equal(writes, 1); assert.equal(opens, 1); assert.equal(db.calls.close, 0);
});

test('native journal uses real host SQLite to persist, reopen and detect tampering without rewriting evidence', async () => {
 const directory = mkdtempSync(join(tmpdir(), 'apex-native-evidence-'));
 const path = join(directory, 'apex-evidence.db'), handles: DatabaseSync[] = [];
 open = async name => {
  assert.equal(name, 'apex-evidence.db');
  const sql = new DatabaseSync(path); handles.push(sql);
  return {
   async execAsync(source: string) {sql.exec(source);},
   async closeAsync() {sql.close();},
   async runAsync(source: string, id: string, document: string) {return sql.prepare(source).run(id, document);},
   async getAllAsync(source: string, limit: number) {return sql.prepare(source).all(limit);},
  };
 };
 try {
  const store = await adapter(), original = await store.save(input());
  const exact = JSON.stringify(original);
  const reopened = await adapter(); assert.deepEqual(await reopened.list(), [original]);
  assert.equal(await reopened.verify(original), true);
  assert.equal(handles[0]!.prepare('SELECT document FROM apex_evidence WHERE id = ?').get(original.id)!.document, exact);
  const changed = JSON.stringify({...original, payload: {signal: 'modified'}});
  handles[0]!.prepare('UPDATE apex_evidence SET document = ? WHERE id = ?').run(changed, original.id);
  const [tampered] = await reopened.list(); assert.equal(await reopened.verify(tampered!), false);
  assert.equal(handles[0]!.prepare('SELECT document FROM apex_evidence WHERE id = ?').get(original.id)!.document, changed);
 } finally {
  for (const handle of handles) handle.close();
  rmSync(directory, {recursive: true, force: true});
 }
});
