import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { crc16, encode, FrameDecoder, MAX_FRAME } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';

const base: Frame = { kind: 1, opcode: 3, id: 65535, payload: Uint8Array.of(0, 255, 65, 88) };
function collect(bytes: Uint8Array): Frame[] {
  const frames: Frame[] = []; new FrameDecoder(f => frames.push(f)).push(bytes); return frames;
}
function poisoned(bytes: Uint8Array): Uint8Array {
  for (const key of ['length', 'buffer', 'byteLength', 'byteOffset', 'constructor', 'values', 'slice', 'subarray', Symbol.iterator, Symbol.toStringTag]) {
    Object.defineProperty(bytes, key, { get() { assert.fail(`Unexpected input hook ${String(key)}`); } });
  }
  return bytes;
}

test('independent golden parity across realms, Buffer slices, subclasses and poisoned view properties', () => {
  const vectors = JSON.parse(readFileSync(new URL('./fixtures/wire.json', import.meta.url), 'utf8')) as { id: number; opcode: number; payloadHex: string; frameHex: string }[];
  const factories = [
    (xs: number[]) => Uint8Array.from(xs),
    (xs: number[]) => Buffer.from([99, ...xs, 99]).subarray(1, xs.length + 1),
    (xs: number[]) => runInNewContext('Uint8Array.from(xs)', { xs }) as Uint8Array,
    (xs: number[]) => { class Bytes extends Uint8Array { static get [Symbol.species]() { throw new Error('species'); } } return new Bytes(xs); },
  ];
  for (const vector of vectors) for (const make of factories) {
    const payload = [...Buffer.from(vector.payloadHex, 'hex')];
    const wire = [...Buffer.from(vector.frameHex, 'hex')];
    assert.equal(Buffer.from(encode({ kind: 1, opcode: vector.opcode, id: vector.id, payload: poisoned(make(payload)) })).toString('hex'), vector.frameHex);
    assert.equal(crc16(poisoned(make(wire))), crc16(Uint8Array.from(wire)));
    const decoded = collect(poisoned(make(wire)));
    assert.equal(decoded.length, 1); assert.deepEqual([...decoded[0]!.payload], payload);
  }
});

test('captured metadata uses property-read order even when payload getter rewrites earlier fields', () => {
  const order: string[] = []; const values = { kind: 1, opcode: 3, id: 65535 };
  const frame = {
    get kind() { order.push('kind'); return values.kind; },
    get opcode() { order.push('opcode'); return values.opcode; },
    get id() { order.push('id'); return values.id; },
    get payload() { order.push('payload'); values.kind = 9; values.opcode = -1; values.id = 0; return base.payload; },
  };
  assert.deepEqual(encode(frame as Frame), encode(base));
  assert.deepEqual(order, ['kind', 'opcode', 'id', 'payload']);
  const sentinel = new Error('metadata getter');
  assert.throws(() => encode({ ...base, get payload(): Uint8Array { throw sentinel; } }), e => e === sentinel);
});

test('actual view extent and storage win over shadows including cross-realm invalid storage', () => {
  const backing = new Uint8Array(4096).fill(17);
  const slice = backing.subarray(123, 635);
  Object.defineProperties(slice, { length: { value: 999999 }, byteOffset: { value: 0 }, byteLength: { value: 0 }, buffer: { value: new ArrayBuffer(0) } });
  assert.equal(encode({ ...base, payload: slice }).length, MAX_FRAME);
  assert.deepEqual(collect(encode({ ...base, payload: slice }))[0]!.payload, new Uint8Array(512).fill(17));
  const invalid = [
    runInNewContext('new Uint8Array(new SharedArrayBuffer(0))'),
    runInNewContext('new Uint8Array(new ArrayBuffer(0, {maxByteLength: 4}))'),
    runInNewContext('new Uint8Array(new ArrayBuffer(4, {maxByteLength: 4}), 1, 2)'),
    runInNewContext('new Uint16Array(1)'),
    new Proxy(new Uint8Array(), { get() { assert.fail('proxy trap'); } }),
  ] as Uint8Array[];
  const detached = new Uint8Array(0); structuredClone(detached.buffer, { transfer: [detached.buffer] }); invalid.push(detached);
  for (const bytes of invalid) {
    Object.defineProperty(bytes, 'buffer', { value: new ArrayBuffer(1) });
    const wire = encode(base); const frames: Frame[] = []; const decoder = new FrameDecoder(f => frames.push(f));
    decoder.push(Uint8Array.of(0, 0)); decoder.push(wire.subarray(0, 9));
    const state = [decoder.bufferedBytes, decoder.discarded];
    assert.throws(() => encode({ ...base, payload: bytes })); assert.throws(() => crc16(bytes)); assert.throws(() => decoder.push(bytes));
    assert.deepEqual([decoder.bufferedBytes, decoder.discarded], state);
    decoder.push(wire.subarray(9)); assert.deepEqual(frames, [base]);
  }
});

test('callback nested partial state survives outer callback throw and outer chunk detachment', () => {
  for (const detach of [false, true]) {
    const outer = encode(base); const nested = encode({ ...base, id: 7 }); const ids: number[] = [];
    const sentinel = new Error('callback'); let decoder: FrameDecoder;
    decoder = new FrameDecoder(f => {
      ids.push(f.id);
      if (ids.length === 1) {
        decoder.push(nested.subarray(0, 8));
        if (detach) structuredClone(outer.buffer, { transfer: [outer.buffer] });
        else throw sentinel;
      }
    });
    assert.throws(() => decoder.push(outer), e => detach || e === sentinel);
    assert.equal(decoder.bufferedBytes, 8); assert.equal(decoder.discarded, 0);
    decoder.push(nested.subarray(8)); assert.deepEqual(ids, [65535, 7]);
  }
});

test('callback can replace unread bytes with another valid frame and reset nested partial state', () => {
  const first = encode(base); const next = encode({ ...base, id: 7 }); const chunk = new Uint8Array([...first, ...first]);
  const ids: number[] = []; let decoder: FrameDecoder;
  decoder = new FrameDecoder(f => {
    ids.push(f.id);
    if (ids.length === 1) { decoder.push(first.subarray(0, 5)); decoder.reset(); chunk.set(next, first.length); f.payload.fill(99); }
  });
  decoder.push(chunk); assert.deepEqual(ids, [65535, 7]); assert.equal(decoder.bufferedBytes, 0);
  assert.deepEqual(first, encode(base));
});

test('bounded deterministic fragmentation keeps a single fixed retained buffer across maximum frames', () => {
  const frames: Frame[] = []; const decoder = new FrameDecoder(f => frames.push(f));
  // Runtime inspection is deliberate: bufferedBytes alone does not prove fixed retained capacity.
  const storage = (decoder as unknown as { buffer: Uint8Array }).buffer;
  let seed = 19731;
  const random = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  for (let round = 0; round < 64; round++) {
    const payload = Uint8Array.from({ length: round % 2 ? 512 : random() % 513 }, () => random() >>> 24);
    const expected = { ...base, id: round + 1, payload }; const wire = encode(expected);
    decoder.push(new Uint8Array(1024));
    for (let offset = 0; offset < wire.length;) {
      const end = Math.min(wire.length, offset + 1 + random() % 37);
      decoder.push(wire.subarray(offset, end)); offset = end;
      assert.ok(decoder.bufferedBytes <= MAX_FRAME);
      assert.equal((decoder as unknown as { buffer: Uint8Array }).buffer, storage);
      assert.equal(storage.byteLength, 524);
    }
    assert.deepEqual(frames.at(-1), expected);
  }
  assert.equal(frames.length, 64); assert.equal(decoder.bufferedBytes, 0);
});
