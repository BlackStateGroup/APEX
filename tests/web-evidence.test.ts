import { beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { evidenceStore } from '../src/platform/evidence.ts';
import { prepareBleEvidenceInput, readBleEvidencePayload } from '../packages/core/ble-evidence.ts';

// Tests the real browser storage adapter with an in-memory Storage substitute.
// This is host validation, not a browser, native SQLite or hardware test.
const key = 'apex-evidence-v1';
const document = readFileSync(new URL('./fixtures/bthome-observation.json', import.meta.url), 'utf8');
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
let values: Map<string, string>;
let rejectWrite: boolean;
beforeEach(() => {
  values = new Map(); rejectWrite = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(name: string) { return values.get(name) ?? null; },
    setItem(name: string, value: string) {
      if (rejectWrite) throw new Error('Simulated browser storage quota error');
      values.set(name, value);
    },
  } });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
});
afterEach(() => {
  for (const [name, descriptor] of [['localStorage', storageDescriptor], ['crypto', cryptoDescriptor]] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('web adapter retains exact BLE input and can read and verify it again', async () => {
  const saved = await evidenceStore.save(prepareBleEvidenceInput(document));
  const persisted = values.get(key)!;
  values = new Map([[key, persisted]]);
  const [reopened] = await evidenceStore.list();
  assert.deepEqual(reopened, saved);
  assert.equal((reopened!.payload as { document: string }).document, document);
  assert.equal(await evidenceStore.verify(reopened!), true);
  const observation = readBleEvidencePayload(reopened!.payload);
  assert.equal(observation.physicalReceptionVerified, false);
  assert.equal(observation.authenticatedIdentity, false);
  const reading = observation.serviceReadings[0]!.reading;
  assert.ok('format' in reading && reading.format === 'BTHome-v2');
});

test('web adapter detects valid document tampering without discarding the stored bytes', async () => {
  await evidenceStore.save(prepareBleEvidenceInput(document));
  const [entry] = JSON.parse(values.get(key)!) as string[];
  const row = JSON.parse(entry!);
  row.payload.document += '\n';
  const tampered = JSON.stringify([JSON.stringify(row)]);
  values.set(key, tampered);
  const [reopened] = await evidenceStore.list();
  assert.equal(await evidenceStore.verify(reopened!), false);
  assert.equal(values.get(key), tampered);
});

test('quota failure retains previous web evidence and surfaces the failure', async () => {
  const saved = await evidenceStore.save(prepareBleEvidenceInput(document));
  const before = values.get(key);
  rejectWrite = true;
  await assert.rejects(evidenceStore.save(prepareBleEvidenceInput(document)), /quota error/);
  assert.equal(values.get(key), before);
  assert.deepEqual(await evidenceStore.list(), [saved]);
});

test('corrupt web index is not overwritten by a new save', async () => {
  for (const corrupt of ['{', '{}', '[1]', JSON.stringify(Array(501).fill('{}'))]) {
    values.set(key, corrupt);
    await assert.rejects(evidenceStore.list());
    await assert.rejects(evidenceStore.save(prepareBleEvidenceInput(document)));
    assert.equal(values.get(key), corrupt);
  }
});

test('web capacity boundary preserves all existing records', async () => {
  const saved = await evidenceStore.save(prepareBleEvidenceInput(document));
  const entry = JSON.stringify(saved);
  values.set(key, JSON.stringify(Array(499).fill(entry)));
  await evidenceStore.save(prepareBleEvidenceInput(document));
  assert.equal((await evidenceStore.list(500)).length, 500);
  const full = values.get(key);
  await assert.rejects(evidenceStore.save(prepareBleEvidenceInput(document)), /capacity reached/);
  assert.equal(values.get(key), full);
});

test('overlapping saves in one app context preserve every record', async () => {
  const saved = await Promise.all(Array.from({ length: 12 }, () => evidenceStore.save(prepareBleEvidenceInput(document))));
  const records = await evidenceStore.list();
  assert.equal(records.length, 12);
  assert.deepEqual(new Set(records.map(row => row.id)), new Set(saved.map(row => row.id)));
  assert.ok((await Promise.all(records.map(row => evidenceStore.verify(row)))).every(Boolean));
});
