import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceSession, validateInfo, validateCapabilities } from '../packages/core/session.ts';
import type { ByteTransport } from '../packages/core/transport.ts';
import { encode, FrameDecoder, Kind, MAX_PAYLOAD, Opcode, utf8 } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';

const info = '{"id":"fixture","board":"fixture","firmware":"1","protocol":1,"source":"accessory"}';
const capabilities = '{"operations":["system.info","system.capabilities","system.ping"]}';
const extra = (json: string, fields: string) => json.slice(0, -1) + ',' + fields + '}';
const malformedInfo = [
  extra(info, '"\\u0069d":"replacement"'),
  extra(info, '"protocol":1'),
  extra(info, '"source":"host"'),
  extra(info, '"extra":{"a":1,"\\u0061":2}'),
  ...[null, 1, true, {}, ['accessory'], [['accessory']]].map(source => JSON.stringify({ ...JSON.parse(info), source })),
];
const malformedCapabilities = [
  extra(capabilities, '"\\u006fperations":["system.info","system.capabilities","system.ping"]'),
  extra(capabilities, '"extra":{"a":1,"a":1}'),
];

for (const [index, json] of malformedInfo.entries()) {
  test(`AXP rejects ambiguous or nonstring identity case ${index + 1}`, () => {
    assert.throws(() => validateInfo(utf8(json)), json);
  });
}
for (const [index, json] of malformedCapabilities.entries()) {
  test(`AXP rejects duplicate decoded capability keys case ${index + 1}`, () => {
    assert.throws(() => validateCapabilities(utf8(json)), json);
  });
}

test('AXP preserves valid source, operation ordering, and bounded extra-field compatibility', () => {
  for (const source of ['simulator', 'host', 'accessory']) {
    const value = { ...JSON.parse(info), source, extra: { nested: ['retained'] } };
    assert.deepEqual(validateInfo(utf8(JSON.stringify(value))), value);
  }
  const operations = ['system.ping', 'system.info', 'system.capabilities'];
  assert.deepEqual(validateCapabilities(utf8(JSON.stringify({ operations, extra: true }))), operations);
});

test('AXP public validators enforce actual byte limits and strict UTF-8', () => {
  for (const [validate, json] of [[validateInfo, info], [validateCapabilities, capabilities]] as const) {
    const exact = utf8(json.padEnd(MAX_PAYLOAD));
    assert.doesNotThrow(() => validate(exact));
    const oversized = utf8(json.padEnd(MAX_PAYLOAD + 1));
    assert.throws(() => validate(oversized));
    Object.defineProperties(oversized, { byteLength: { value: 1 }, length: { value: 1 }, buffer: { value: new ArrayBuffer(1) } });
    assert.throws(() => validate(oversized));
    const multibyte = utf8(extra(json, '"extra":"' + 'é'.repeat(230) + '"'));
    assert.ok(multibyte.byteLength > MAX_PAYLOAD);
    assert.throws(() => validate(multibyte));
    assert.throws(() => validate(Uint8Array.from([...utf8(json), 0xff])));
    assert.throws(() => validate(new Proxy(utf8(json), {})));
    assert.throws(() => validate(new Uint8ClampedArray(utf8(json)) as unknown as Uint8Array));
    const shared = new Uint8Array(new SharedArrayBuffer(exact.length)); shared.set(exact);
    assert.throws(() => validate(shared));
    const resizable = new Uint8Array(new ArrayBuffer(exact.length, { maxByteLength: exact.length + 1 })); resizable.set(exact);
    assert.throws(() => validate(resizable));
    const detached = utf8(json); structuredClone(detached.buffer, { transfer: [detached.buffer] });
    assert.throws(() => validate(detached));
    const hostileMethods = utf8(json);
    Object.defineProperties(hostileMethods, {
      [Symbol.iterator]: { value: () => { throw new Error('must not iterate caller bytes'); } },
      slice: { value: () => { throw new Error('must not slice caller bytes'); } },
      subarray: { value: () => { throw new Error('must not subarray caller bytes'); } },
    });
    assert.doesNotThrow(() => validate(hostileMethods));
    const padded = utf8('xxx' + json + 'yyy');
    assert.doesNotThrow(() => validate(padded.subarray(3, padded.length - 3)));
  }
});

test('AXP bounds all extra-field nesting to eight open containers', () => {
  for (const [validate, json] of [[validateInfo, info], [validateCapabilities, capabilities]] as const) {
    assert.doesNotThrow(() => validate(utf8(extra(json, '"extra":' + '['.repeat(7) + '0' + ']'.repeat(7)))));
    assert.throws(() => validate(utf8(extra(json, '"extra":' + '['.repeat(8) + '0' + ']'.repeat(8)))));
  }
});

// Synthetic byte peer only; this does not establish native cleanup or device trust.
class Peer implements ByteTransport {
  readonly source = 'simulator' as const;
  data = new Set<(bytes: Uint8Array) => void>();
  closed = new Set<(error: Error) => void>();
  releases = 0;
  failRelease = false;
  handler = (frame: Frame): { payload: Uint8Array; kind: Frame['kind'] } => ({
    payload: frame.opcode === Opcode.Info ? utf8(info) : frame.opcode === Opcode.Capabilities ? utf8(capabilities) : frame.payload,
    kind: Kind.Response,
  });
  decoder = new FrameDecoder(frame => {
    const wire = encode({ ...frame, ...this.handler(frame) });
    for (const listener of this.data) listener(wire);
  });
  async connect() {}
  async write(bytes: Uint8Array) { this.decoder.push(bytes); }
  async disconnect() { this.releases++; if (this.failRelease) throw new Error('Release failed'); }
  onData(fn: (bytes: Uint8Array) => void) { this.data.add(fn); return () => { this.data.delete(fn); }; }
  onDisconnect(fn: (error: Error) => void) { this.closed.add(fn); return () => { this.closed.delete(fn); }; }
}

test('AXP malformed handshake closes one-use session and releases listeners', async () => {
  for (const [opcode, documents] of [[Opcode.Info, malformedInfo], [Opcode.Capabilities, malformedCapabilities]] as const) {
    for (const json of documents) {
      const peer = new Peer(); const normal = peer.handler;
      peer.handler = frame => frame.opcode === opcode ? { payload: utf8(json), kind: Kind.Response } : normal(frame);
      const session = new DeviceSession(peer);
      try {
        await assert.rejects(session.open());
        assert.equal(session.state, 'closed'); assert.equal(session.info, null); assert.deepEqual(session.capabilities, []);
        assert.equal(session.pendingCount, 0); assert.equal(peer.data.size + peer.closed.size, 0);
        assert.equal(peer.releases, 1); assert.equal(session.transportReleasePending, false);
        await assert.rejects(session.open(), /reused/);
      } finally { await session.close(); }
    }
  }
});

test('AXP malformed handshake keeps failed cleanup pending until explicit retry', async () => {
  const peer = new Peer(); peer.failRelease = true;
  peer.handler = () => ({ payload: utf8(malformedInfo[0]!), kind: Kind.Response });
  const session = new DeviceSession(peer);
  await assert.rejects(session.open(), /Duplicate/);
  assert.equal(peer.releases, 1); assert.equal(session.transportReleasePending, true);
  assert.equal(session.pendingCount, 0); assert.equal(peer.data.size + peer.closed.size, 0);
  peer.failRelease = false; await session.close();
  assert.equal(peer.releases, 2); assert.equal(session.transportReleasePending, false);
});

test('AXP malformed error JSON stays generic, with valid error and ping parity', async () => {
  const peer = new Peer(); const session = new DeviceSession(peer); await session.open();
  try {
    for (const payload of [
      utf8('{"code":"FIRST","\\u0063ode":"SECOND"}'),
      utf8('{"code":"FIRST","extra":{"x":1,"x":2}}'),
      utf8('{"code":"FIRST",}'),
      utf8('{"code":"FIRST","extra":' + '['.repeat(8) + '0' + ']'.repeat(8) + '}'),
      Uint8Array.from([...utf8('{"code":"FIRST"}'), 0xff]),
    ]) {
      peer.handler = () => ({ payload, kind: Kind.Error });
      await assert.rejects(session.request('system.ping'), { message: 'DEVICE_ERROR' });
      assert.equal(session.pendingCount, 0); assert.equal(session.state, 'open');
    }
    peer.handler = () => ({ payload: utf8('{"code":"VALID_ERROR","extra":true}'), kind: Kind.Error });
    await assert.rejects(session.request('system.ping'), { message: 'VALID_ERROR' });
    peer.handler = frame => ({ payload: frame.payload, kind: Kind.Response });
    const bytes = Uint8Array.from({ length: MAX_PAYLOAD }, (_, i) => i & 255);
    assert.deepEqual(await session.request('system.ping', bytes), bytes);
  } finally { await session.close(); }
});
