import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectFlipperResponses as inspect, FlipperInspectionError, FLIPPER_LIMITS } from '../packages/core/flipper-offline.ts';
import { inspectFlipperCli } from '../tools/inspect-flipper-offline.ts';
const provenance = { provenance: 'synthetic' as const };
const read = (bytes: number[] | Uint8Array) => inspect(Uint8Array.from(bytes), provenance);
// Hand-authored synthetic responses. These are not device captures or compatibility evidence.
const pair = [15, 8, 7, 16, 0, 24, 0, 138, 2, 6, 10, 1, 107, 18, 1, 118];
const more = [15, 8, 7, 16, 0, 24, 1, 138, 2, 6, 10, 1, 107, 18, 1, 118];
const version = [9, 16, 0, 194, 2, 4, 8, 0, 16, 25];
const power = [9, 16, 0, 234, 2, 4, 10, 0, 18, 0];
const rejects = (bytes: number[] | Uint8Array, code: string) => assert.throws(() => read(bytes), (e: unknown) => e instanceof FlipperInspectionError && e.code === code && Number.isInteger(e.offset));
// Fixture-only length/tag notation. Never exported as an outbound codec.
const vi = (n: number): number[] => { const out: number[] = []; do { const b = n % 128; n = Math.floor(n / 128); out.push(b | (n ? 128 : 0)); } while (n); return out; };
const frame = (payload: number[]) => [...vi(payload.length), ...payload];
const opaque = (n: number) => frame([42, ...vi(n), ...Array(n).fill(0)]);

test('selected pinned interface response shapes and terminal pair', () => {
  const r = read([...more, ...pair, ...version, ...power]);
  assert.equal(r.frames.length, 4);
  assert.deepEqual(r.frames.map(f => f.content.kind), ['identity', 'identity', 'version', 'power']);
  assert.equal(r.frames[1]!.content.key?.effective, 'k'); assert.equal(r.frames[1]!.content.value?.effective, 'v');
  assert.equal(r.frames[1]!.hasNext.effective, false);
  assert.equal(r.frames[2]!.content.major?.effective, 0); assert.equal(r.frames[2]!.content.minor?.effective, 25);
  assert.equal(r.frames[3]!.content.key?.effective, ''); assert.equal(r.frames[3]!.content.value?.effective, '');
  assert.equal(r.frames[1]!.offset, pair.length);
  assert.equal(r.provenance, 'synthetic'); assert.equal(r.tail, undefined);
  assert(!r.diagnostics.some(d => d.includes('incomplete at EOF')));
});
test('presence is independent of effective defaults, including empty/no content and missing children', () => {
  const r = read([0, 2, 34, 0, 3, 138, 2, 0, 3, 194, 2, 0]);
  for (const f of r.frames) {
    assert.deepEqual(f.commandId, { present: false, effective: 0 });
    assert.deepEqual(f.status, { present: false, effective: 0, observation: 'omitted' });
    assert.deepEqual(f.hasNext, { present: false, effective: false });
  }
  assert.equal(r.frames[0]!.content.kind, 'unsupported'); assert.equal(r.frames[1]!.content.kind, 'empty');
  assert.deepEqual(r.frames[2]!.content.key, { present: false, effective: '' }); assert.deepEqual(r.frames[3]!.content.major, { present: false, effective: 0 });
  assert.equal(read([]).frames.length, 0);
});
test('errors and unknown statuses cannot become successful identity', () => {
  for (const status of [1, 2, 99]) {
    const bytes = [...pair]; bytes[4] = status;
    const f = read(bytes).frames[0]!;
    assert.equal(f.status.observation, 'nonzero-or-unknown'); assert(!Object.hasOwn(f, 'success'));
    assert(f.diagnostics.some(d => d.includes('not successful')));
  }
  const f = read([4, 16, 2, 34, 0]).frames[0]!;
  assert.equal(f.content.kind, 'empty'); assert(f.diagnostics.some(d => d.includes('unreliable')));
});
test('IDs, repeated keys and repeated terminal sequences are never pooled', () => {
  const r = read([...pair, ...pair, ...pair]);
  assert.equal(r.frames.length, 3); assert.equal(r.frames[0]!.commandId.effective, 7);
  assert.deepEqual(r.frames.map(f => f.content.key?.effective), ['k', 'k', 'k']);
  assert(!Object.hasOwn(r, 'identity'));
});
test('unknown values retain offsets and original bytes without nested interpretation', () => {
  const bytes = frame([40, 1, 49, ...Array(8).fill(7), 58, 2, 0, 255, 69, 1, 2, 3, 4]);
  const r = read(bytes); assert.equal(r.frames[0]!.unknownFields.length, 4);
  assert.deepEqual(Array.from(r.originalBytes), bytes);
  const childUnknown = read([5, 138, 2, 2, 24, 1]).frames[0]!;
  assert.equal(childUnknown.content.unknownFields[0]!.tag, 3);
  assert.equal(childUnknown.content.unknownFields[0]!.offset, 4);
});
test('reject duplicate known fields and multiple possible content, even unknown content', () => {
  for (const tag of [8, 16, 24]) rejects([4, tag, 0, tag, 1], 'duplicate-known-field');
  rejects([7, 138, 2, 4, 10, 0, 10, 0], 'duplicate-known-field');
  rejects([7, 194, 2, 4, 8, 1, 8, 2], 'duplicate-known-field');
  rejects([6, 138, 2, 0, 138, 2, 0], 'duplicate-known-field');
  rejects([6, 138, 2, 0, 194, 2, 0], 'ambiguous-content');
  rejects([5, 138, 2, 0, 40, 0], 'ambiguous-content');
});
test('known types, UTF-8, numeric widths, tag zero, unsupported wires and canonical policies', () => {
  rejects([2, 10, 0], 'wrong-known-wire-type');
  rejects([3, 136, 2, 0], 'wrong-known-wire-type');
  rejects([5, 138, 2, 2, 8, 1], 'wrong-known-wire-type');
  rejects([6, 138, 2, 3, 10, 1, 255], 'invalid-utf8');
  rejects([7, 138, 2, 4, 10, 2, 192, 128], 'invalid-utf8');
  rejects([2, 24, 2], 'noncanonical-bool');
  rejects([2, 0, 0], 'field-zero');
  for (const wire of [3, 4, 6, 7]) rejects([1, 8 | wire], 'unsupported-wire-type');
  rejects([128, 0], 'noncanonical-varint');
  rejects([3, 8, 128, 0], 'noncanonical-varint');
  rejects([128, 128, 128, 128, 16], 'varint-overflow');
  rejects([6, 8, 255, 255, 255, 255, 31], 'varint-overflow');
  rejects(frame([40, ...Array(9).fill(255), 2]), 'varint-overflow');
  rejects(frame([40, ...Array(10).fill(128)]), 'varint-overflow');
  assert.equal(read(frame([8, 255, 255, 255, 255, 15])).frames[0]!.commandId.effective, 4294967295);
  assert.equal(read(frame([40, ...Array(9).fill(255), 1])).frames.length, 1);
});
test('framing EOF tails preserve bytes while malformed complete messages throw', () => {
  assert.equal(read([128]).tail?.kind, 'incomplete-length');
  assert.equal(read([5, 8]).tail?.kind, 'incomplete-payload');
  rejects([1, 128], 'truncated-varint'); rejects([2, 10, 2], 'truncated-field');
  rejects([1, 9], 'truncated-field');
  const r = read([...pair, 10, 0, ...pair.slice(0, 3)]);
  assert.equal(r.frames.length, 1); assert.equal(r.tail?.offset, pair.length);
  assert(read(more).diagnostics.some(d => d.includes('incomplete at EOF')));
});
test('every byte split and coalesced responses: inspect reassembled bytes, prefix tails never scan ahead', () => {
  const bytes = Uint8Array.from([...more, ...pair, ...version, ...power]);
  const expected = inspect(bytes, provenance);
  for (let at = 0; at <= bytes.length; at++) {
    const first = bytes.slice(0, at), second = bytes.slice(at);
    const prefix = inspect(first, provenance);
    assert.deepEqual(Array.from(prefix.originalBytes), Array.from(first));
    const joined = new Uint8Array(first.length + second.length); joined.set(first); joined.set(second, first.length);
    assert.deepEqual(inspect(joined, provenance), expected);
  }
});
test('fixed budget boundaries: input, frame, field count, frame count, strings', () => {
  rejects(new Uint8Array(65537), 'input-budget');
  assert.equal(read(new Uint8Array(256)).frames.length, 256);
  rejects(new Uint8Array(257), 'frame-count-budget');
  assert.equal(read(opaque(8189)).frames.length, 1); rejects(opaque(8190), 'frame-budget');
  assert.equal(read(frame(Array.from({ length: 256 }, () => [40, 0]).flat())).frames[0]!.fields.length, 256);
  rejects(frame(Array.from({ length: 257 }, () => [40, 0]).flat()), 'field-budget');
  const textFrame = (n: number) => { const child = [10, ...vi(n), ...Array(n).fill(97)]; return frame([138, 2, ...vi(child.length), ...child]); };
  assert.equal(read(textFrame(1024)).frames[0]!.content.key?.effective.length, 1024); rejects(textFrame(1025), 'string-budget');
  const full = Array.from({ length: 7 }, () => opaque(8189)).flat();
  const remainder = 65536 - full.length; const last = opaque(remainder - 5);
  assert.equal(full.length + last.length, 65536); assert.equal(read([...full, ...last]).frames.length, 8);
  const dense = frame(Array.from({ length: 256 }, () => [40, 0]).flat());
  assert.equal(read(Array.from({ length: 16 }, () => dense).flat()).frames.length, 16);
  rejects(Array.from({ length: 17 }, () => dense).flat(), 'aggregate-field-budget');
  assert.equal(FLIPPER_LIMITS.input, 65536);
});
test('copies input and output, rejects missing provenance', () => {
  const bytes = Buffer.from(pair); const a = inspect(bytes, provenance); const b = inspect(bytes, provenance);
  bytes.fill(0); assert.equal(a.originalBytes[0], 15);
  a.originalBytes.fill(0); a.frames[0]!.content.key!.effective = 'changed';
  assert.equal(b.originalBytes[0], 15); assert.equal(b.frames[0]!.content.key?.effective, 'k');
  assert.throws(() => inspect(Uint8Array.from(pair), {} as never), /invalid-provenance/);
});
test('CLI: bounded local files, explicit provenance, no stdout on error, no symlinks/FIFOs/directories/URLs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'flipper-offline-'));
  try {
    const path = join(dir, 'synthetic.bin'); await writeFile(path, Uint8Array.from(pair));
    const result = JSON.parse(await inspectFlipperCli([path, '--provenance', 'synthetic']));
    assert.equal(result.frames[0].content.key?.effective, 'k'); assert.equal(result.provenance, 'synthetic');
    for (const args of [[], [path], [path, '--provenance', 'capture'], ['https://example.test', '--provenance', 'imported'], [path, '--provenance', 'synthetic', 'extra']]) await assert.rejects(inspectFlipperCli(args));
    const link = join(dir, 'link'); await symlink(path, link);
    const subdir = join(dir, 'dir'); await mkdir(subdir);
    const huge = join(dir, 'huge'); await writeFile(huge, new Uint8Array(65537));
    const empty = join(dir, 'empty'); await writeFile(empty, new Uint8Array());
    const fifo = join(dir, 'fifo'); assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
    for (const file of [link, subdir, huge, empty, fifo, join(dir, 'missing')]) await assert.rejects(inspectFlipperCli([file, '--provenance', 'imported']));
    await writeFile(path, Uint8Array.from([1, 0]));
    const cli = spawnSync(process.execPath, ['tools/inspect-flipper-offline.ts', path, '--provenance', 'imported'], { encoding: 'utf8' });
    assert.equal(cli.status, 1); assert.equal(cli.stdout, ''); assert.match(cli.stderr, /field-zero/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('host boundary snapshots only a strict own provenance data property', () => {
  let calls = 0;
  const getter = { get provenance() { calls++; return calls === 1 ? 'synthetic' : 'unvalidated'; } };
  const error = (value: unknown) => assert.throws(() => inspect(Uint8Array.from(pair), value as never), (e: unknown) => e instanceof FlipperInspectionError && e.code === 'invalid-provenance');
  error(getter); assert.equal(calls, 0);
  error(Object.create({ provenance: 'synthetic' }));
  error({ provenance: 'synthetic', extra: true });
  error({ provenance: 'synthetic', [Symbol('extra')]: true });
  error(null); error([]);
  for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) error(new Proxy({ provenance: 'synthetic' }, { [trap]: () => { throw new Error('host failure'); } }));
  let descriptorCalls = 0;
  const proxy = new Proxy({ provenance: 'synthetic' }, {
    get() { throw new Error('property value should not be read'); },
    getOwnPropertyDescriptor() { descriptorCalls++; return { configurable: true, enumerable: true, writable: true, value: descriptorCalls === 1 ? 'synthetic' : 'unvalidated' }; },
  });
  assert.equal(inspect(Uint8Array.from(pair), proxy as never).provenance, 'synthetic');
  assert.equal(descriptorCalls, 1);
});
test('host byte snapshots use intrinsic bounds and storage, rejecting shared/detached/proxy inputs', () => {
  class ShadowedBytes extends Uint8Array {
    get byteLength() { return 0; }
    get byteOffset(): number { throw new Error('shadowed offset'); }
    get buffer(): ArrayBuffer { throw new Error('shadowed buffer'); }
    [Symbol.iterator](): never { throw new Error('shadowed iterator'); }
  }
  assert.throws(() => inspect(new ShadowedBytes(65537), provenance), (e: unknown) => e instanceof FlipperInspectionError && e.code === 'input-budget');
  assert.equal(inspect(new ShadowedBytes(pair), provenance).frames[0]!.content.key?.effective, 'k');
  const wrong = (value: unknown) => assert.throws(() => inspect(value as never, provenance), (e: unknown) => e instanceof FlipperInspectionError && e.code === 'invalid-input');
  wrong(new Uint8Array(new SharedArrayBuffer(4)));
  const resizable = new ArrayBuffer(4, { maxByteLength: 8 });
  const shrinking = new Uint8Array(resizable, 2, 2);
  wrong(shrinking); resizable.resize(1); wrong(shrinking);
  wrong(new Uint16Array(4)); wrong(new DataView(new ArrayBuffer(4)));
  wrong(new Proxy(Uint8Array.from(pair), {})); wrong(Object.create(Uint8Array.prototype));
  const detached = Uint8Array.from(pair); structuredClone(detached.buffer, { transfer: [detached.buffer] }); wrong(detached);
  const padded = Buffer.concat([Buffer.from([255]), Buffer.from(pair), Buffer.from([255])]);
  assert.deepEqual(Array.from(inspect(padded.subarray(1, -1), provenance).originalBytes), pair);
});
