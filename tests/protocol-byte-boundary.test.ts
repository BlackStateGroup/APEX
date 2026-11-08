import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc16, encode, FrameDecoder, MAX_FRAME } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';
const base: Frame = { kind: 1, opcode: 3, id: 42, payload: Uint8Array.of(1, 2, 3) };
const wire = () => encode(base);
const hooks = (bytes: Uint8Array): Uint8Array => {
  for (const key of ['length', 'byteLength', 'byteOffset', 'buffer', 'slice', 'subarray', 'constructor', Symbol.iterator, Symbol.toStringTag]) {
    Object.defineProperty(bytes, key, { get() { throw new Error(`caller hook: ${String(key)}`); } });
  }
  return bytes;
};
test('frame metadata is read once and validated as encoded', () => {
  const reads = { kind: 0, opcode: 0, id: 0, payload: 0 };
  const frame = Object.fromEntries(Object.keys(reads).map(key => [key, undefined]));
  for (const key of Object.keys(reads) as (keyof Frame)[]) Object.defineProperty(frame, key, { get() { reads[key]++; return reads[key] === 1 ? base[key] : undefined; } });
  assert.deepEqual(encode(frame as unknown as Frame), wire());
  assert.deepEqual(reads, { kind: 1, opcode: 1, id: 1, payload: 1 });
});
test('byte access ignores own hooks and preserves Buffer and subarray bytes', () => {
  class Bytes extends Uint8Array { static get [Symbol.species]() { throw new Error('species'); } }
  for (const make of [() => Uint8Array.of(1, 2, 3), () => Buffer.from([9, 1, 2, 3, 9]).subarray(1, 4), () => new Bytes([1, 2, 3])]) {
    assert.deepEqual(encode({ ...base, payload: hooks(make()) }), wire());
    assert.equal(crc16(hooks(make())), crc16(base.payload));
  }
  const frames: Frame[] = []; new FrameDecoder(f => frames.push(f)).push(hooks(wire()));
  assert.deepEqual(frames, [base]);
});
test('real payload size is bounded even with a shadowed length', () => {
  const payload = new Uint8Array(513); Object.defineProperty(payload, 'length', { value: 0 });
  assert.throws(() => encode({ ...base, payload }));
  assert.equal(encode({ ...base, payload: new Uint8Array(512) }).length, MAX_FRAME);
  assert.equal(encode({ ...base, payload: new Uint8Array() }).length, 12);
});
function invalidInputs(): unknown[] {
  const detached = new Uint8Array(2); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  return [[], {}, new Uint16Array(2), new Int8Array(2), new Uint8ClampedArray(2), new DataView(new ArrayBuffer(2)), new Proxy(new Uint8Array(2), {}), detached,
    new Uint8Array(new SharedArrayBuffer(2)), new Uint8Array(new ArrayBuffer(2, { maxByteLength: 4 }))];
}
test('unsupported byte inputs are rejected before changing partial decoder state', () => {
  for (const input of invalidInputs()) {
    const frames: Frame[] = []; const decoder = new FrameDecoder(f => frames.push(f)); const bytes = wire();
    decoder.push(bytes.subarray(0, 7));
    assert.throws(() => encode({ ...base, payload: input as Uint8Array }));
    assert.throws(() => crc16(input as Uint8Array));
    assert.throws(() => decoder.push(input as Uint8Array));
    assert.equal(decoder.bufferedBytes, 7); assert.equal(decoder.discarded, 0);
    decoder.push(bytes.subarray(7)); assert.deepEqual(frames, [base]);
  }
});
test('callback mutation of unread bytes is observed, delivered payload is independent', () => {
  const chunk = new Uint8Array([...wire(), ...wire()]); const frames: Frame[] = [];
  const decoder = new FrameDecoder(f => { frames.push(f); if (frames.length === 1) chunk.fill(0, wire().length); });
  decoder.push(chunk); assert.deepEqual(frames, [base]); assert.ok(decoder.discarded > 0);
  chunk.fill(9); assert.deepEqual(frames[0]!.payload, base.payload);
});
test('callback reentrant push is synchronous; reset and exceptions keep consumed frame removed', () => {
  const ids: number[] = []; let decoder: FrameDecoder;
  decoder = new FrameDecoder(f => { ids.push(f.id); if (ids.length === 1) { decoder.reset(); decoder.push(encode({ ...base, id: 7 })); } });
  decoder.push(new Uint8Array([...wire(), ...wire()])); assert.deepEqual(ids, [42, 7, 42]);
  const error = new Error('callback'); const throwing = new FrameDecoder(() => { throw error; });
  assert.throws(() => throwing.push(new Uint8Array([...wire(), ...wire()])), e => e === error);
  assert.equal(throwing.bufferedBytes, 0);
});
test('detachment in callback rejects remaining input without feeding undefined bytes', () => {
  const chunk = new Uint8Array([...wire(), ...wire()]); let count = 0;
  const decoder = new FrameDecoder(() => { count++; structuredClone(chunk.buffer, { transfer: [chunk.buffer] }); });
  assert.throws(() => decoder.push(chunk)); assert.equal(count, 1); assert.equal(decoder.bufferedBytes, 0); assert.equal(decoder.discarded, 0);
});
test('crc and decoder do not consume caller iterator contents', () => {
  const payload = Uint8Array.of(1, 2, 3);
  Object.defineProperty(payload, Symbol.iterator, { value: function* () { yield 99; } });
  assert.equal(crc16(payload), crc16(base.payload));
  const bytes = wire(); Object.defineProperty(bytes, Symbol.iterator, { value: function* () {} });
  const frames: Frame[] = []; new FrameDecoder(f => frames.push(f)).push(bytes); assert.deepEqual(frames, [base]);
});
test('metadata side effects are completed before byte validation and copying', () => {
  const payload = Uint8Array.of(1, 2, 3);
  const frame = { ...base, payload, get id() { structuredClone(payload.buffer, { transfer: [payload.buffer] }); return 1; } };
  assert.throws(() => encode(frame));
  const changing = Uint8Array.of(1, 2, 3);
  const encoded = encode({ ...base, get id() { changing[0] = 99; return 1; }, payload: changing });
  assert.equal(encoded[10], 99); changing.fill(0); assert.equal(encoded[10], 99);
});
test('partial frame completed by a chunk permits callback reset and nested partial input', () => {
  const bytes = wire(); const ids: number[] = []; let decoder: FrameDecoder;
  decoder = new FrameDecoder(f => { ids.push(f.id); if (ids.length === 1) { decoder.reset(); decoder.push(bytes.subarray(0, 7)); } });
  decoder.push(bytes.subarray(0, 4)); decoder.push(bytes.subarray(4));
  assert.equal(decoder.bufferedBytes, 7); decoder.push(bytes.subarray(7)); assert.deepEqual(ids, [42, 42]);
});
test('empty fixed views are accepted and invalid metadata never coerces values', () => {
  assert.equal(crc16(new Uint8Array()), 0xffff);
  const decoder = new FrameDecoder(() => assert.fail()); decoder.push(new Uint8Array()); assert.equal(decoder.bufferedBytes, 0);
  for (const id of [0, -1, 65536, 1.5, NaN, Infinity, '1', { valueOf() { throw new Error('coercion'); } }]) assert.throws(() => encode({ ...base, id: id as number }));
});
test('callback detachment at the final byte still throws after delivering the frame', () => {
  const chunk = wire(); let count = 0;
  const decoder = new FrameDecoder(() => { count++; structuredClone(chunk.buffer, { transfer: [chunk.buffer] }); });
  assert.throws(() => decoder.push(chunk)); assert.equal(count, 1); assert.equal(decoder.bufferedBytes, 0);
});
test('single large chunks have no new cap and preserve trailing partial frames', () => {
  const bytes = wire(); const chunk = new Uint8Array(1000000 + bytes.length + 7);
  chunk.set(bytes, 1000000); chunk.set(bytes.subarray(0, 7), 1000000 + bytes.length);
  const frames: Frame[] = []; const decoder = new FrameDecoder(f => frames.push(f));
  decoder.push(chunk); assert.deepEqual(frames, [base]); assert.equal(decoder.bufferedBytes, 7);
  assert.equal(decoder.discarded, 1000000); decoder.push(bytes.subarray(7)); assert.deepEqual(frames, [base, base]);
});
