import test from 'node:test';
import assert from 'node:assert/strict';
import { BleTransport, AXP_READY } from '../packages/core/ble-transport.ts';
import type { GattConnection } from '../packages/core/ble-transport.ts';
import { NfcReader, normaliseNfcTag } from '../packages/core/nfc.ts';

function peer(ready = true) {
  const writes: Uint8Array[] = []; let data = (_bytes: Uint8Array) => {}; let closed = (_error: Error) => {}; let disconnected = 0; let removed = 0;
  const connection: GattConnection = {
    mtu: 23,
    async subscribe(onData, onClosed) { data = onData; closed = onClosed; if (ready) onData(AXP_READY); return () => { ++removed; }; },
    async writeWithResponse(bytes) { writes.push(bytes); },
    async disconnect() { ++disconnected; },
  };
  const transport = new BleTransport({ connect: async () => connection }, 'owned-test-peer', { timeoutMs: 20 });
  return { connection, transport, writes, notify: (bytes: Uint8Array) => data(bytes), close: () => closed(new Error('link lost')), stats: () => ({ disconnected, removed }) };
}
test('BLE waits for notifications and serialises MTU-sized frame chunks', async () => {
  const p = peer(); await p.transport.connect();
  const input = Uint8Array.from({ length: 60 }, (_, i) => i);
  await Promise.all([p.transport.write(input), p.transport.write(Uint8Array.of(99))]);
  assert.deepEqual(p.writes.map(x => x.length), [20, 20, 20, 1]);
  assert.deepEqual(Buffer.concat(p.writes.slice(0, 3)), Buffer.from(input));
  const received: number[] = []; p.transport.onData(bytes => received.push(...bytes));
  p.notify(AXP_READY); p.notify(Uint8Array.of(5, 6)); assert.deepEqual(received, [...AXP_READY, 5, 6]);
  await p.transport.disconnect(); assert.deepEqual(p.stats(), { disconnected: 1, removed: 1 });
  await assert.rejects(p.transport.connect(), /cannot be reused/);
});
test('BLE readiness timeout and unexpected data close the peer', async () => {
  const timeout = peer(false); await assert.rejects(timeout.transport.connect(), /readiness timed out/); assert.equal(timeout.stats().disconnected, 1);
  const invalid = peer(false); const opening = invalid.transport.connect(); await new Promise(resolve => setImmediate(resolve));
  invalid.notify(Uint8Array.of(1)); await assert.rejects(opening, /READY marker/);
});
test('BLE disconnect cancels opening and drops stale notifications', async () => {
  const p = peer(false); const opening = p.transport.connect(); await new Promise(resolve => setImmediate(resolve));
  await p.transport.disconnect(); await assert.rejects(opening, /closed/);
  p.notify(AXP_READY); await assert.rejects(p.transport.write(Uint8Array.of(1)), /not connected/);
});
test('BLE bounds notifications and reports link failure once', async () => {
  const p = peer(); let failures = 0; p.transport.onDisconnect(() => { ++failures; }); await p.transport.connect();
  p.notify(new Uint8Array(513)); p.close(); assert.equal(failures, 1);
  await assert.rejects(p.transport.write(new Uint8Array(1)), /not connected/);
});
test('BLE bounded queue and failed writes prevent following writes', async () => {
  const p = peer(); p.connection.writeWithResponse = async () => { throw new Error('GATT rejected'); }; await p.transport.connect();
  const attempts = Array.from({ length: 17 }, () => p.transport.write(Uint8Array.of(1)));
  const results = await Promise.allSettled(attempts); assert.ok(results.every(x => x.status === 'rejected'));
  assert.match(String((results[16] as PromiseRejectedResult).reason), /queue full/);
});
test('NFC normalisation discards payload contents and handles iOS technology', () => {
  const tag = normaliseNfcTag({ id: 'AB12', tech: 'Ndef', ndefMessage: [{ tnf: 1, type: [84], payload: [2, 101, 110, 83] }] }, 'ios', new Date('2026-01-01Z'));
  assert.equal(tag.id, 'ab12'); assert.deepEqual(tag.technologies, ['Ndef']);
  assert.deepEqual(tag.records, [{ tnf: 1, type: 'T', payloadLength: 4 }]); assert.ok(!JSON.stringify(tag).includes('payload":'));
  assert.throws(() => normaliseNfcTag({ ndefMessage: Array(65).fill({}) }, 'ios'), /count/);
});
test('NFC stop during startup cancels before backend begins', async () => {
  let release!: () => void; let began = false;
  const reader = new NfcReader({ status: async () => { await new Promise<void>(resolve => { release = resolve; }); return { available: true, enabled: true, platform: 'ios' }; }, begin: async () => { began = true; return async () => {}; } }, { onTag: () => assert.fail(), onError: () => assert.fail() });
  const opening = reader.start(); await new Promise(resolve => setImmediate(resolve)); const stopping = reader.stop(); release();
  await Promise.all([opening, stopping]); assert.equal(began, false); assert.equal(reader.state, 'idle');
});
test('NFC drops callbacks after stop and cleans up registration exactly once', async () => {
  let callback = (_raw: unknown) => {}; let stops = 0; let observations = 0;
  const reader = new NfcReader({ status: async () => ({ available: true, enabled: true, platform: 'android' }), begin: async onTag => { callback = onTag; return async () => { ++stops; }; } }, { onTag: () => { ++observations; }, onError: () => assert.fail() });
  await reader.start(); await assert.rejects(reader.start(), /already active/); callback({}); await reader.stop(); callback({}); await reader.stop();
  assert.equal(observations, 1); assert.equal(stops, 1);
});
