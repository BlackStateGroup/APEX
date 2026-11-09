import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRadioReceiveStart, encodeRadioReceiveCaptureId, parseRadioReceiveStatus } from '../packages/core/radio-receive-protocol.ts';
function wire(state = 1, packet = false): Uint8Array {
  const b = new Uint8Array(packet ? 33 : 24); b.set([1, state, 1, Number(packet), 1]);
  if (packet) { b[8] = b[10] = 1; b[17] = 2; b.set([100, 0, 0, 0, 0x7b, 0xfc, 255, 0xab, 0xcd], 24); }
  b[18] = 200; return b;
}
test('exact little endian request vectors and bounded integers', () => {
  assert.deepEqual([...encodeRadioReceiveStart(50, 1)], [1, 1, 50, 0, 1, 0]);
  assert.deepEqual([...encodeRadioReceiveStart(30000, 64)], [1, 1, 48, 117, 64, 0]);
  assert.deepEqual([...encodeRadioReceiveCaptureId(0x89abcdef)], [239, 205, 171, 137]);
  assert.deepEqual([...encodeRadioReceiveCaptureId(1)], [1, 0, 0, 0]);
  assert.deepEqual([...encodeRadioReceiveCaptureId(0xffffffff)], [255, 255, 255, 255]);
  for (const n of [NaN, Infinity, -1, 0, 49, 30001, 50.1, '50', null]) assert.throws(() => encodeRadioReceiveStart(n as number, 1));
  for (const n of [NaN, Infinity, -1, 0, 65, 1.1, '1', null]) assert.throws(() => encodeRadioReceiveStart(1000, n as number));
  for (const n of [NaN, Infinity, -1, 0, 0x100000000, 1.1, '1', null]) assert.throws(() => encodeRadioReceiveCaptureId(n as number));
});
test('all firmware states, cold expiry and zero-capture shutdown/fault', () => {
  for (let state = 0; state <= 5; state++) { const b = wire(state); if (state === 0) b[4] = 0; assert.equal(parseRadioReceiveStatus(b).state, state); }
  for (const state of [0, 2, 5]) { const b = wire(state); b[4] = 0; assert.equal(parseRadioReceiveStatus(b).captureId, 0); }
});
test('packet vector signed fields, maximum payload and deep immutability', () => {
  const b = wire(5, true); b[22] = 255; b[23] = 127;
  const s = parseRadioReceiveStatus(b); assert.equal(s.error, 32767);
  assert.deepEqual(s.packet, { elapsedMs: 100, rssiTenthsDbm: -901, lqi: 255, payload: [171, 205] });
  b.fill(0); assert.deepEqual(s.packet!.payload, [171, 205]);
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.packet) && Object.isFrozen(s.packet!.payload));
  const max = new Uint8Array(91); max.set(wire(4, true)); max[17] = 60; max[22] = 0; max[23] = 128;
  assert.equal(parseRadioReceiveStatus(max).packet!.payload.length, 60); assert.equal(parseRadioReceiveStatus(max).error, -32768);
  const rollback = wire(5, true); rollback[18] = 0; assert.equal(parseRadioReceiveStatus(rollback).packet!.elapsedMs, 100);
});
test('reject reserved fields, impossible counters and lengths', () => {
  const mutations: [number, number][] = [[0, 2], [1, 6], [2, 2], [3, 2], [8, 65], [10, 1], [12, 1], [14, 1], [16, 9], [17, 1], [21, 1], [4, 0]];
  for (const [i, n] of mutations) { const b = wire(); b[i] = n; assert.throws(() => parseRadioReceiveStatus(b), /Invalid receive status/); }
  for (const n of [0, 61]) { const b = wire(1, true); b[17] = n; assert.throws(() => parseRadioReceiveStatus(b)); }
  for (const n of [24, 25, 31, 32, 34, 92]) { const b = new Uint8Array(n); b.set(wire(1, true).subarray(0, n)); assert.throws(() => parseRadioReceiveStatus(b)); }
  const b = wire(1, true); b[8] = b[10] = 9; b[16] = 8; assert.throws(() => parseRadioReceiveStatus(b));
  b[16] = 7; assert.equal(parseRadioReceiveStatus(b).queued, 7);
  b[12] = 2; assert.throws(() => parseRadioReceiveStatus(b));
  b[12] = 0; b[27] = 1; assert.throws(() => parseRadioReceiveStatus(b));
});
test('intrinsic byte validation ignores subclass and own property spoofing', () => {
  class Spoof extends Uint8Array {
    get buffer(): ArrayBuffer { throw new Error('secret'); }
    get byteLength(): number { throw new Error('secret'); }
    get byteOffset(): number { throw new Error('secret'); }
    get length(): number { throw new Error('secret'); }
  }
  const b = new Spoof(wire()); Object.defineProperty(b, Symbol.toStringTag, { value: 'not bytes' }); assert.equal(parseRadioReceiveStatus(b).captureId, 1);
  for (const input of [null, {}, [], new Uint8ClampedArray(24), new Int8Array(24), new DataView(new ArrayBuffer(24)), new Proxy(wire(), {}), new Uint8Array(new SharedArrayBuffer(24)), new Uint8Array(92)]) {
    assert.throws(() => parseRadioReceiveStatus(input as Uint8Array), /^Error: Invalid receive status bytes$/);
  }
  const detached = wire(); structuredClone(detached.buffer, { transfer: [detached.buffer] }); assert.throws(() => parseRadioReceiveStatus(detached), /Invalid receive status bytes/);
  const dynamic = new Uint8Array(new ArrayBuffer(24, { maxByteLength: 100 })); assert.throws(() => parseRadioReceiveStatus(dynamic), /Invalid receive status bytes/);
  const padded = new Uint8Array(100); padded.set(wire(), 3); assert.equal(parseRadioReceiveStatus(padded.subarray(3, 27)).captureId, 1);
});
test('single-byte packet, capped elapsed and full event counters remain valid', () => {
  const b = wire(4, true).slice(0, 32); b[17] = 1;
  b[8] = 64; b[10] = 40; b[12] = 32; b[14] = 24; b[16] = 7;
  b[18] = 48; b[19] = 117; b[24] = 47; b[25] = 117;
  const s = parseRadioReceiveStatus(b);
  assert.equal(s.elapsedMs, 30000); assert.equal(s.packet!.elapsedMs, 29999);
  assert.deepEqual(s.packet!.payload, [171]); assert.equal(s.observed, 64);
  b[18] = 49; assert.throws(() => parseRadioReceiveStatus(b));
  b[18] = 48; b[24] = 49; assert.throws(() => parseRadioReceiveStatus(b));
});
