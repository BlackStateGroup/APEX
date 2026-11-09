import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRadioReceiveClient, RadioReceiveCancelledError } from '../packages/core/radio-receive-client.ts';
import type { RadioReceiveSession } from '../packages/core/radio-receive-client.ts';

function status(state = 1, elapsed = 0, accepted = 0, queued = 0, packet = false, id = 1) {
 const b = new Uint8Array(packet ? 32 : 24), v = new DataView(b.buffer);
 b.set([1, state, 1, Number(packet)]); v.setUint32(4, id, true);
 v.setUint16(8, accepted, true); v.setUint16(10, accepted, true);
 b[16] = queued; b[17] = Number(packet); v.setUint32(18, elapsed, true);
 if (packet) { v.setUint32(24, Math.min(elapsed, 10), true); b[31] = 0x55; }
 return b;
}
function peer(reply: (op: string) => Promise<Uint8Array> | Uint8Array) {
 const calls: string[] = [];
 const session: RadioReceiveSession = { state: 'open', capabilities: ['radio.rx.start', 'radio.rx.poll', 'radio.rx.stop'],
  request: async (op) => { calls.push(op); return reply(op); } };
 return { session, calls, client: createRadioReceiveClient(session) };
}
test('independent: factory is retained per exact identity and does no work', () => {
 const p = peer(() => status());
 assert.equal(p.client, createRadioReceiveClient(p.session)); assert.deepEqual(p.calls, []);
 assert.ok(Object.isFrozen(p.client.state));
});
test('independent: stop before deferred start dispatch cancels with zero requests', async () => {
 const p = peer(() => status()); const started = p.client.start(1000, 10);
 const stopped = p.client.stop(); assert.equal(stopped, p.client.stop());
 await assert.rejects(started, RadioReceiveCancelledError); assert.equal(await stopped, null);
 assert.deepEqual(p.calls, []); assert.equal(p.client.state.uncertain, false);
});
test('independent: reentrant stop inside dispatched start joins exactly one cleanup', async () => {
 let cleanup: Promise<unknown> | undefined;
 const p = peer(op => { if(op === 'radio.rx.start') { cleanup = p.client.stop(); return status(); } return status(2); });
 await p.client.start(1000, 10); await cleanup;
 assert.deepEqual(p.calls, ['radio.rx.start', 'radio.rx.stop']); assert.equal(p.client.state.pending, null);
});
test('independent: lost poll preserves evidence and allows only explicit known-ID cleanup', async () => {
 const p = peer(op => { if(op === 'radio.rx.poll') throw new Error('lost'); return status(op === 'radio.rx.stop' ? 2 : 1); });
 await p.client.start(1000, 10); const saved = p.client.state.status;
 await assert.rejects(p.client.poll()); assert.equal(p.client.state.status, saved);
 await assert.rejects(p.client.start(1000, 10)); await assert.rejects(p.client.poll());
 await p.client.stop(); assert.equal(p.client.state.uncertain, true);
 assert.deepEqual(p.calls, ['radio.rx.start', 'radio.rx.poll', 'radio.rx.stop']);
});
test('independent: invalid unknown Start ID is never used for cleanup', async () => {
 const p = peer(() => status(1, 0, 0, 0, false, 0));
 await assert.rejects(p.client.start(1000, 10)); assert.equal(await p.client.stop(), null);
 assert.deepEqual(p.calls, ['radio.rx.start']); assert.equal(p.client.state.uncertain, true);
});
test('independent: terminal fault allows queue drain with explicit clock rollback evidence', async () => {
 let n = 0;
 const p = peer(() => [status(), status(1, 100, 2, 1, true), status(5, 50, 2, 0, true)][n++]!);
 await p.client.start(1000, 10); await p.client.poll(); await p.client.poll();
 assert.equal(p.client.state.clockMonotonic, false); assert.equal(p.client.state.uncertain, false);
 assert.equal(p.client.state.packets.length, 2); await assert.rejects(p.client.start(1000, 10));
});
test('independent: future capture cannot silently reuse previous capture ID', async () => {
 let n = 0; const p = peer(() => [status(), status(2), status()][n++]!);
 await p.client.start(1000, 10); await p.client.stop(); await assert.rejects(p.client.start(1000, 10));
 assert.equal(p.client.state.uncertain, true);
});
test('independent: elapsed expiry before the requested deadline is contradictory', async () => {
 const p = peer(() => status(3, 0));
 await assert.rejects(p.client.start(1000, 10)); assert.equal(p.client.state.uncertain, true);
});
test('independent: a stopped capture cannot acquire more accepted packets', async () => {
 let n = 0;
 const p = peer(() => [status(), status(2, 10, 1, 1), status(2, 10, 2, 1, true)][n++]!);
 await p.client.start(1000, 10); await p.client.stop();
 await assert.rejects(p.client.poll()); assert.equal(p.client.state.uncertain, true);
});
test('independent: FIFO packet timestamps cannot regress even when status time advances', async () => {
 let n = 0; const first = status(1, 200, 2, 1, true), second = status(1, 250, 2, 0, true);
 new DataView(first.buffer).setUint32(24, 100, true); new DataView(second.buffer).setUint32(24, 50, true);
 const p = peer(() => [status(), first, second][n++]!);
 await p.client.start(1000, 10); await p.client.poll();
 await assert.rejects(p.client.poll()); assert.equal(p.client.state.uncertain, true);
});
test('independent: distinct FIFO packets may share the same millisecond timestamp', async () => {
 let n = 0; const p = peer(() => [status(), status(1, 200, 2, 1, true), status(1, 250, 2, 0, true)][n++]!);
 await p.client.start(1000, 10); await p.client.poll(); await p.client.poll();
 assert.equal(p.client.state.packets.length, 2); assert.equal(p.client.state.uncertain, false);
});
