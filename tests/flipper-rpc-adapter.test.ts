import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFlipperReadRequest, FlipperFrameDecoder, FlipperReadOnlyClient, type FlipperRpcTransport } from '../packages/adapters/flipper-rpc.ts';
import { decodeFlipperCredit, FlipperBleCreditTransport, FLIPPER_SERIAL_UUIDS, type FlipperBleSerialPort } from '../packages/adapters/flipper-ble-credit.ts';

// Synthetic schema-derived fixtures, never captured hardware evidence.
const hex = (s: string) => Uint8Array.from(Buffer.from(s.replaceAll(' ', ''), 'hex'));
const cat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap(p => [...p]));
const vint = (n: number): number[] => n < 128 ? [n] : [(n & 127) | 128, ...vint(Math.floor(n / 128))];
const block = (tag: number, payload: number[]) => [...vint(tag * 8 + 2), ...vint(payload.length), ...payload];
const utf = (s: string) => [...new TextEncoder().encode(s)];
const frame = (body: number[]) => Uint8Array.from([...vint(body.length), ...body]);
const pair = (id: number, kind: number, key: string, value: string, more = false) => frame([8, ...vint(id), ...(more ? [24, 1] : []), ...block(kind, [...block(1, utf(key)), ...block(2, utf(value))])]);
const version = (id = 1, minor = 25, major = 0) => frame([8, ...vint(id), ...block(40, [8, major, 16, minor])]);
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const never = () => new Promise<void>(() => {});
class FakeTransport implements FlipperRpcTransport {
  data: (b: Uint8Array) => void = () => {};
  failure: (e: Error) => void = () => {};
  writes: Uint8Array[] = []; closed = 0; unsubscribed = 0;
  onWrite: (b: Uint8Array, s: AbortSignal) => Promise<void> = async () => {};
  subscribe(data: (b: Uint8Array) => void, failure: (e: Error) => void) { this.data = data; this.failure = failure; return () => { this.unsubscribed++; }; }
  async write(bytes: Uint8Array, signal: AbortSignal) { this.writes.push(bytes); await this.onWrite(bytes, signal); }
  close() { this.closed++; }
}
const responding = () => {
  const port = new FakeTransport();
  port.onWrite = async b => {
    const id = b[2]!;
    if (b[3] === 0xba) port.data(version(id));
    else if (b[3] === 0x82) port.data(cat(pair(id, 33, 'name', 'Synthetic Flipper', true), pair(id, 33, 'hardware', 'fixture')));
    else port.data(pair(id, 45, 'charge', '72'));
  }; return port;
};
test('three request encodings match schema-derived golden bytes; arbitrary commands and invalid IDs are denied', () => {
  for (const [op, bytes] of [['version', '05082aba0200'], ['identity', '05082a820200'], ['power', '05082ae20200']] as const) assert.deepEqual(encodeFlipperReadRequest(op, 42), hex(bytes));
  for (const bad of ['reboot', 'constructor', '__proto__', 31, null]) assert.throws(() => encodeFlipperReadRequest(bad as never, 42), /unsupported-operation/);
  for (const bad of [0, -1, 1.5, NaN, Infinity, 0x100000000]) assert.throws(() => encodeFlipperReadRequest('power', bad), /invalid-command-id/);
  assert.equal(encodeFlipperReadRequest('version', 0xffffffff).length, 10);
});
test('decoder accepts every split, byte chunks and coalescing', () => {
  const bytes = cat(version(), pair(2, 33, 'hello', 'κόσμε 🧪'));
  for (let split = 0; split <= bytes.length; split++) {
    const decoder = new FlipperFrameDecoder(); const ids: number[] = [];
    decoder.push(bytes.slice(0, split), f => ids.push(f.commandId.effective)); decoder.push(bytes.slice(split), f => ids.push(f.commandId.effective));
    decoder.finish(); assert.deepEqual(ids, [1, 2]);
  }
  const decoder = new FlipperFrameDecoder(); let count = 0;
  for (const byte of bytes) decoder.push(Uint8Array.of(byte), () => count++);
  assert.equal(count, 2); assert.equal(decoder.hasPartialFrame, false);
});
test('multi-byte length prefix works at all boundaries', () => {
  const bytes = pair(1, 33, 'firmware', 'v'.repeat(512));
  for (let split = 0; split < bytes.length; split++) {
    const decoder = new FlipperFrameDecoder(); let count = 0;
    decoder.push(bytes.slice(0, split), () => count++); decoder.push(bytes.slice(split), () => count++); assert.equal(count, 1); decoder.finish();
  }
});
test('malformed, overlong, zero, oversized and truncated frames fail closed', () => {
  for (const bytes of ['00', '8000', 'ffffffff1f', '8180808080', '8140', '0100', '03088000']) {
    const decoder = new FlipperFrameDecoder(); assert.throws(() => decoder.push(hex(bytes), () => {})); assert.throws(() => decoder.push(version(), () => {}), /decoder-closed/);
  }
  for (const bytes of ['80', '050801']) { const decoder = new FlipperFrameDecoder(); decoder.push(hex(bytes), () => {}); assert.throws(() => decoder.finish(), /truncated-frame/); }
  assert.throws(() => new FlipperFrameDecoder().push(new Uint8Array(65537), () => {}), /chunk-budget/);
});
test('strict known-field, oneof and UTF8 validation; unknown nested fields stay compatible', () => {
  for (const body of [[10, 0, ...block(40, [])], [8, 1, 8, 1, ...block(40, [])], [8, 1, ...block(40, []), ...block(33, [])], [8, 1, ...block(33, [10, 1, 0xff])]]) assert.throws(() => new FlipperFrameDecoder().push(frame(body), () => {}));
  let minor = -1; new FlipperFrameDecoder().push(frame([8, 1, ...block(40, [16, 25, 24, 7])]), f => { minor = f.content.minor!.effective; }); assert.equal(minor, 25);
});
test('snapshot negotiates before identity/power and accepts the terminal pair without extra empty response', async () => {
  const transport = responding(); const client = new FlipperReadOnlyClient(transport);
  assert.deepEqual(await client.readSnapshot(), { version: { major: 0, minor: 25 }, identity: [{ key: 'name', value: 'Synthetic Flipper' }, { key: 'hardware', value: 'fixture' }], power: [{ key: 'charge', value: '72' }] });
  assert.deepEqual(transport.writes.map(b => b[3]), [0xba, 0x82, 0xe2]); client.close(); assert.equal(transport.closed, 1); assert.equal(transport.unsubscribed, 1);
});
test('older, newer, other-major and missing versions fail before identity', async () => {
  for (const [major, minor] of [[0, 24], [0, 26], [1, 25], [0, 0]]) {
    const transport = new FakeTransport(); transport.onWrite = async () => transport.data(version(1, minor, major)); const client = new FlipperReadOnlyClient(transport);
    await assert.rejects(client.readIdentity(), /unsupported-version/); assert.equal(transport.writes.length, 1); await assert.rejects(client.readPower(), /unsupported-version/);
  }
});
test('ID mismatch, decode/status errors, wrong content and continued version are terminal', async () => {
  for (const [bytes, expected] of [[version(9), /unexpected-command-id/], [frame([8, 9, 16, 2, ...block(4, [])]), /device-decode-error/], [frame([8, 1, 16, 4, ...block(4, [])]), /device-status-4/], [pair(1, 33, 'x', 'y'), /unexpected-response-kind/], [frame([8, 1, 24, 1, ...block(40, [16, 25])]), /continued-version/]] as const) {
    const transport = new FakeTransport(); transport.onWrite = async () => transport.data(bytes); const client = new FlipperReadOnlyClient(transport); await assert.rejects(client.readVersion(), expected); assert.equal(transport.closed, 1);
  }
});
test('duplicate terminal and trailing partial cannot produce successful snapshots', async () => {
  for (const bytes of [cat(version(), version()), cat(version(), hex('8001'))]) {
    const transport = new FakeTransport(); transport.onWrite = async () => transport.data(bytes); const client = new FlipperReadOnlyClient(transport); await assert.rejects(client.readVersion(), /duplicate-terminal|trailing-partial/);
  }
});
test('timeout bounds absent responses and hung writes even after receiving the terminal response', async () => {
  for (const reply of [false, true]) {
    const transport = new FakeTransport(); transport.onWrite = async () => { if (reply) transport.data(version()); await never(); }; const client = new FlipperReadOnlyClient(transport, { timeoutMs: 15 });
    await assert.rejects(client.readVersion(), /timeout/); assert.equal(transport.closed, 1); transport.data(version()); await assert.rejects(client.readVersion(), /timeout/);
  }
});
test('abort, disconnect and failed write release pending work', async () => {
  for (const mode of ['abort', 'disconnect', 'write']) {
    const transport = new FakeTransport(); const client = new FlipperReadOnlyClient(transport); if (mode === 'write') transport.onWrite = async () => { throw new Error('write failed'); };
    const controller = new AbortController(); const result = assert.rejects(client.readVersion(controller.signal), /aborted|disconnect|write failed/);
    if (mode === 'abort') controller.abort(); if (mode === 'disconnect') transport.failure(new Error('disconnect')); await result; assert.equal(transport.closed, 1);
  }
});
test('pre-abort sends nothing, session stays usable, parallel calls reject busy', async () => {
  const transport = responding(); const client = new FlipperReadOnlyClient(transport); const controller = new AbortController(); controller.abort();
  await assert.rejects(client.readVersion(controller.signal), /aborted/); assert.equal(transport.writes.length, 0);
  const first = client.readVersion(); await assert.rejects(client.readIdentity(), /busy/); await first; await assert.rejects(client.readVersion(controller.signal), /aborted/); client.close();
});
test('pair/aggregate budgets reject unbounded streams; repeated keys are preserved without object assignment', async () => {
  for (const big of [false, true]) {
    const transport = responding(); const client = new FlipperReadOnlyClient(transport); await client.readVersion();
    transport.onWrite = async () => { for (let i = 0; i < 129; i++) transport.data(pair(2, 33, '__proto__', big ? 'x'.repeat(1024) : 'value', i < 128)); };
    await assert.rejects(client.readIdentity(), big ? /response-budget/ : /pair-budget/);
  }
  const transport = responding(); const client = new FlipperReadOnlyClient(transport); await client.readVersion();
  transport.onWrite = async () => transport.data(cat(pair(2, 33, '__proto__', 'a', true), pair(2, 33, '__proto__', 'b')));
  assert.deepEqual(await client.readIdentity(), [{ key: '__proto__', value: 'a' }, { key: '__proto__', value: 'b' }]); client.close();
});
class FakeBle implements FlipperBleSerialPort {
  data: (b: Uint8Array) => void = () => {}; credit: (b: Uint8Array) => void = () => {}; disconnect: (e: Error) => void = () => {};
  writes: Uint8Array[] = []; closed = 0; unsubscribed = 0; reads = 0;
  onRead: () => Promise<Uint8Array> = async () => hex('00000010'); onWrite: (b: Uint8Array, s: AbortSignal) => Promise<void> = async () => {};
  subscribeData(fn: (b: Uint8Array) => void) { this.data = fn; return () => { this.unsubscribed++; }; }
  subscribeCredit(fn: (b: Uint8Array) => void) { this.credit = fn; return () => { this.unsubscribed++; }; }
  subscribeDisconnect(fn: (e: Error) => void) { this.disconnect = fn; return () => { this.unsubscribed++; }; }
  async readCredit() { this.reads++; return await this.onRead(); }
  async writeChunk(b: Uint8Array, s: AbortSignal) { this.writes.push(b); return await this.onWrite(b, s); }
  close() { this.closed++; }
}
const openBle = (port = new FakeBle(), options = {}) => { const transport = new FlipperBleCreditTransport(port, options); const errors: Error[] = []; transport.subscribe(() => {}, e => errors.push(e)); return { port, transport, errors }; };
test('canonical UUIDs match official client; credit is 4-byte big-endian', () => {
  assert.equal(FLIPPER_SERIAL_UUIDS.service, '8fe5b3d5-2e7f-4a98-2a48-7acc60fe0000'); assert.equal(decodeFlipperCredit(hex('00000100')), 256); assert.equal(decodeFlipperCredit(hex('00000000')), 0);
  assert.throws(() => decodeFlipperCredit(hex('01000000')), /credit-budget/); assert.throws(() => decodeFlipperCredit(hex('000001')), /invalid-credit-length/);
});
test('BLE respects credit, packet length and refill during last write acknowledgement', async () => {
  const port = new FakeBle(); port.onRead = async () => hex('00000003'); port.onWrite = async () => { if (port.writes.length === 2) port.credit(hex('00000004')); };
  const { transport } = openBle(port, { packetBytes: 2 }); await transport.write(hex('01020304050607'), new AbortController().signal); assert.deepEqual(port.writes.map(b => [...b]), [[1, 2], [3], [4, 5], [6, 7]]); transport.close();
});
test('notification wins initial read race and cannot restore already-spent credit', async () => {
  const port = new FakeBle(); let resolveRead!: (b: Uint8Array) => void; port.onRead = () => new Promise(resolve => { resolveRead = resolve; });
  const { transport } = openBle(port); port.credit(hex('00000002')); await transport.write(hex('0102'), new AbortController().signal); resolveRead(hex('00000010')); await turn();
  const next = transport.write(hex('03'), new AbortController().signal); await turn(); assert.equal(port.writes.length, 1); port.credit(hex('00000002')); await next; assert.equal(port.writes.length, 2); transport.close();
});
test('synchronous initial notification prevents a stale initial read', async () => {
  const port = new FakeBle(); const subscribe = port.subscribeCredit.bind(port); port.subscribeCredit = fn => { const stop = subscribe(fn); fn(hex('00000002')); return stop; };
  const { transport } = openBle(port); await transport.write(hex('0102'), new AbortController().signal); assert.equal(port.reads, 0); transport.close();
});
test('credit is not additive; duplicate grant while unspent bytes remain fails closed', async () => {
  const { port, transport, errors } = openBle(); await turn(); await transport.write(hex('0102'), new AbortController().signal); port.credit(hex('00000010')); assert.match(errors[0]!.message, /unexpected-credit-window/); assert.equal(port.closed, 1);
  await assert.rejects(transport.write(hex('01'), new AbortController().signal), /unexpected-credit-window/);
});
test('zero credit, hung reads and hung write acknowledgements time out', async () => {
  for (const kind of ['zero', 'read', 'write']) {
    const port = new FakeBle(); if (kind === 'zero') port.onRead = async () => hex('00000000'); if (kind === 'read') port.onRead = () => new Promise(() => {}); if (kind === 'write') port.onWrite = never;
    const { transport } = openBle(port, { timeoutMs: 15 }); await assert.rejects(transport.write(hex('010203'), new AbortController().signal), /transport-timeout/); assert.equal(port.closed, 1);
  }
});
test('abort/disconnect/uncertain write stop subsequent chunks without retry and release subscriptions', async () => {
  for (const mode of ['abort', 'disconnect', 'reject']) {
    const port = new FakeBle(); const controller = new AbortController(); port.onWrite = async () => { if (mode === 'abort') controller.abort(); if (mode === 'disconnect') port.disconnect(new Error('disconnected')); if (mode === 'reject') throw new Error('uncertain write'); await never(); };
    const { transport } = openBle(port, { packetBytes: 1 }); await assert.rejects(transport.write(hex('010203'), controller.signal), /aborted|disconnected|uncertain write/); assert.equal(port.writes.length, 1); assert.equal(port.closed, 1); assert.equal(port.unsubscribed, 3);
  }
});
test('input is snapshotted, concurrent writers rejected and whole write has finite deadline', async () => {
  const port = new FakeBle(); let release!: () => void; port.onWrite = () => new Promise<void>(resolve => { release = resolve; });
  const { transport } = openBle(port, { packetBytes: 1, timeoutMs: 40 }); const bytes = hex('010203'); const result = assert.rejects(transport.write(bytes, new AbortController().signal), /transport-timeout/);
  await turn(); bytes.fill(9); await assert.rejects(transport.write(hex('01'), new AbortController().signal), /transport-busy/); release(); await turn(); assert.deepEqual(port.writes.map(b => [...b]), [[1], [2]]); await result;
});
test('end-to-end client and BLE credit transport work with fragmented synthetic frames', async () => {
  const port = new FakeBle(); let buffer: number[] = []; port.onRead = async () => hex('00000006');
  port.onWrite = async bytes => { buffer.push(...bytes); if (buffer.length !== buffer[0]! + 1) return; const id = buffer[2]!; const opcode = buffer[3]!; buffer = []; const response = opcode === 0xba ? version(id) : pair(id, opcode === 0x82 ? 33 : 45, 'fixture', 'ok'); for (const byte of response) port.data(Uint8Array.of(byte)); port.credit(hex('00000006')); };
  const transport = new FlipperBleCreditTransport(port, { packetBytes: 2 }); const client = new FlipperReadOnlyClient(transport); const result = await client.readSnapshot(); assert.equal(result.power[0]!.value, 'ok'); assert.equal(port.writes.length, 9); client.close();
});

test('winning notification supersedes rejected and timed-out initial credit reads', async () => {
  for (const kind of ['rejected', 'hung']) {
    const port = new FakeBle(); let rejectRead!: (e: Error) => void;
    port.onRead = () => new Promise((_resolve, reject) => { rejectRead = reject; });
    const { transport, errors } = openBle(port, { timeoutMs: 15 });
    port.credit(hex('00000003')); await transport.write(hex('01'), new AbortController().signal);
    if (kind === 'rejected') rejectRead(new Error('stale read failed'));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(errors.length, 0); assert.equal(port.closed, 0);
    await transport.write(hex('02'), new AbortController().signal); transport.close();
  }
});

test('expiration before a delayed ACK continuation never permits an additional GATT side effect', async () => {
  const originalNow = Date.now; let now = 0; Date.now = () => now;
  try {
    const port = new FakeBle();
    port.onWrite = () => new Promise(resolve => queueMicrotask(() => { now = 1001; resolve(); }));
    const { transport } = openBle(port, { packetBytes: 1, timeoutMs: 1000 });
    await assert.rejects(transport.write(hex('0102'), new AbortController().signal), /transport-timeout/);
    assert.equal(port.writes.length, 1);
  } finally { Date.now = originalNow; }
});

test('synchronous subscription failure closes client resources rather than leaving a half-open session', () => {
  const transport = new FakeTransport(); transport.subscribe = () => { throw new Error('cannot subscribe'); };
  assert.throws(() => new FlipperReadOnlyClient(transport), /cannot subscribe/); assert.equal(transport.closed, 1);
});
