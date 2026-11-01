import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crc16, encode, FrameDecoder, Kind, MAX_FRAME, utf8 } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';

const base: Frame = { kind: Kind.Request, opcode: 3, id: 42, payload: utf8('APEX') };
const collect = (chunks: Uint8Array[]) => {
  const frames: Frame[] = []; const decoder = new FrameDecoder(frame => frames.push(frame));
  chunks.forEach(bytes => decoder.push(bytes)); return { frames, decoder };
};
test('CRC uses the independent CCITT-FALSE check value', () => assert.equal(crc16(utf8('123456789')), 0x29b1));
test('encoder matches independently generated Python golden vectors', () => {
  const vectors = JSON.parse(readFileSync(new URL('./fixtures/wire.json', import.meta.url), 'utf8')) as { id: number; opcode: number; payloadHex: string; frameHex: string }[];
  for (const vector of vectors) {
    const frame = { kind: Kind.Request, opcode: vector.opcode, id: vector.id, payload: new Uint8Array(Buffer.from(vector.payloadHex, 'hex')) };
    assert.equal(Buffer.from(encode(frame)).toString('hex'), vector.frameHex);
    assert.deepEqual(collect([new Uint8Array(Buffer.from(vector.frameHex, 'hex'))]).frames, [frame]);
  }
});
test('all possible two-chunk boundaries retain a maximum payload', () => {
  const frame = { ...base, payload: Uint8Array.from({ length: 512 }, (_, i) => i & 255) }; const wire = encode(frame);
  for (let i = 0; i <= wire.length; i++) assert.deepEqual(collect([wire.slice(0, i), wire.slice(i)]).frames, [frame]);
});
test('single-byte fragments and coalesced frames decode identically', () => {
  const wire = encode(base); const both = Uint8Array.from([...wire, ...wire]);
  assert.deepEqual(collect(Array.from(both, x => Uint8Array.of(x))).frames, [base, base]);
});
test('bad CRC and boot noise do not hide the next intact frame', () => {
  const bad = encode(base); bad[10]! ^= 1;
  const result = collect([utf8('ROM boot\r\n'), bad, encode(base)]);
  assert.deepEqual(result.frames, [base]); assert.ok(result.decoder.discarded > 0);
});
test('invalid version, flags, kinds, zero ID and oversized lengths are rejected', () => {
  for (const [offset, value] of [[2, 2], [3, 0], [3, 4], [5, 1], [6, 0], [9, 255]] as const) {
    const invalid = encode({ ...base, id: 1 }); invalid[offset] = value;
    if (offset === 6) invalid[7] = 0;
    const result = collect([invalid, encode(base)]);
    assert.deepEqual(result.frames, [base]);
  }
});
test('encoder rejects invalid bounds and reset discards partial data', () => {
  for (const frame of [{ ...base, id: 0 }, { ...base, id: 65536 }, { ...base, opcode: -1 }, { ...base, payload: new Uint8Array(513) }]) assert.throws(() => encode(frame));
  const frames: Frame[] = []; const decoder = new FrameDecoder(frame => frames.push(frame));
  decoder.push(encode(base).slice(0, 8)); decoder.reset(); decoder.push(encode(base)); assert.deepEqual(frames, [base]);
});
test('one million noise bytes retain bounded parser memory', () => {
  const decoder = new FrameDecoder(() => {}); let seed = 12345;
  const block = new Uint8Array(1000);
  for (let i = 0; i < 1000; i++) {
    for (let j = 0; j < block.length; j++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; block[j] = seed >>> 24; }
    decoder.push(block); assert.ok(decoder.bufferedBytes <= MAX_FRAME);
  }
});
