/** Independent regression tests of the actual native adapter with synthetic Expo bindings. Not iOS/Android SQLite acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { EVIDENCE_SCHEMA, INSERT_EVIDENCE, SELECT_EVIDENCE } from '../packages/core/evidence.ts';

let open: (name: string) => Promise<unknown>;
const globalKey = '__apexNativeEvidenceIndependentTest';
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
async function adapter() { return (await import(`../src/platform/evidence.native.ts?native-evidence-independent-test=${++instance}`)).evidenceStore; }
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

// Rejections may legally carry any JavaScript value, including undefined.
async function rejection(promise: Promise<unknown>) {
 const result = await promise.then(value => ({ok: true, value}), error => ({ok: false, value: error}));
 assert.equal(result.ok, false, 'operation must reject');
 return result.value;
}

test('independent: synchronous falsy open failures preserve values and permit retry', async () => {
 for (const failure of [undefined, null, false, 0, '']) {
  let opens = 0; const healthy = fakeDatabase();
  open = () => { if (++opens === 1) throw failure; return Promise.resolve(healthy); };
  const store = await adapter();
  assert.equal(await rejection(store.list()), failure);
  assert.deepEqual(await store.list(), []);
  assert.equal(opens, 2); assert.equal(healthy.calls.close, 0);
 }
});

test('independent: synchronous falsy schema and close failures retain both causes and latch', async () => {
 for (const failure of [undefined, null, false, 0, '']) {
  let opens = 0, closes = 0;
  open = async () => {opens++; return {
   execAsync() { throw failure; }, closeAsync() { closes++; throw failure; },
   getAllAsync() { assert.fail('must not query failed setup'); },
  };};
  const store = await adapter();
  const error = await rejection(store.list());
  assert.ok(error instanceof AggregateError);
  assert.deepEqual(error.errors, [failure, failure]);
  assert.equal(await rejection(store.list()), error);
  assert.equal(opens, 1); assert.equal(closes, 1);
 }
});

test('independent: synchronous schema failure retries only after one successful close', async () => {
 let opens = 0, closes = 0; const healthy = fakeDatabase();
 open = async () => ++opens === 1 ? {
  execAsync() {throw undefined;}, closeAsync() {closes++;},
 } : healthy;
 const store = await adapter();
 assert.equal(await rejection(store.list()), undefined);
 assert.deepEqual(await store.list(), []);
 assert.equal(opens, 2); assert.equal(closes, 1);
});

test('independent: synchronous reentrant acquisition shares initialization', async () => {
 const healthy = fakeDatabase(); let opens = 0;
 let reentrant!: Promise<unknown>;
 const store = await adapter();
 open = () => { opens++; reentrant = store.list(); return Promise.resolve(healthy); };
 assert.deepEqual(await store.list(), []);
 assert.deepEqual(await reentrant, []);
 assert.equal(opens, 1); assert.equal(healthy.calls.schema, 1);
 assert.equal(healthy.calls.reads, 2);
});

test('independent: a query failure preserves cached healthy handle without reinitializing', async () => {
 const failure = new Error('query failed'); let opens = 0, schemas = 0, reads = 0, closes = 0;
 open = async () => { opens++; return {
  async execAsync() {schemas++;}, async closeAsync() {closes++;},
  async getAllAsync() {if (++reads === 1) throw failure; return [];},
 };};
 const store = await adapter();
 assert.equal(await rejection(store.list()), failure);
 assert.deepEqual(await store.list(), []);
 assert.deepEqual({opens, schemas, reads, closes}, {opens:1, schemas:1, reads:2, closes:0});
});
