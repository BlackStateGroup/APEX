import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceSession, validateCapabilities } from '../packages/core/session.ts';
import type { ByteTransport } from '../packages/core/transport.ts';
import { encode, FrameDecoder, Kind, utf8 } from '../packages/protocol/index.ts';
const base = ['system.info', 'system.capabilities', 'system.ping'];
const rx = ['radio.rx.start', 'radio.rx.poll', 'radio.rx.stop'];
const manifest = (operations: unknown[]) => utf8(JSON.stringify({ operations }));
class Peer implements ByteTransport {
  readonly source = 'host' as const;
  ops: string[]; sent: number[] = []; listeners = new Set<(bytes: Uint8Array) => void>();
  constructor(ops: string[]) { this.ops = ops; }
  decoder = new FrameDecoder(frame => {
    this.sent.push(frame.opcode);
    const payload = frame.opcode === 1 ? utf8('{"id":"apex-radio-rx-dev","board":"fixture","firmware":"1","protocol":1,"source":"accessory"}') : frame.opcode === 2 ? manifest(this.ops) : frame.payload;
    for (const fn of this.listeners) fn(encode({ ...frame, kind: Kind.Response, payload }));
  });
  async connect() {} async disconnect() {} async write(bytes: Uint8Array) { this.decoder.push(bytes); }
  onData(fn: (bytes: Uint8Array) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onDisconnect(_fn: (error: Error) => void) { return () => {}; }
}
test('default is exactly base three, explicit opt-in permits exact three or six', () => {
  assert.deepEqual(validateCapabilities(manifest(base)), base);
  for (const allowRadioReceive of [undefined, false, true]) {
    assert.deepEqual(validateCapabilities(manifest(base), { allowRadioReceive }), base);
    if (allowRadioReceive) assert.deepEqual(validateCapabilities(manifest([...rx, ...base]), { allowRadioReceive }), [...rx, ...base]);
    else assert.throws(() => validateCapabilities(manifest([...base, ...rx]), { allowRadioReceive }));
    for (const list of [[], rx, [...base, rx[0]], [...base, ...rx.slice(0, 2)], [...base, ...rx, 'radio.tx'], [...base, rx[0], rx[0], rx[2]], [...base.slice(0, 2), ...rx, 'unknown']]) assert.throws(() => validateCapabilities(manifest(list), { allowRadioReceive }));
  }
});
test('invalid opt-in types fail before connection', () => {
  for (const allowRadioReceive of [null, 0, 1, 'true', {}, []]) {
    assert.throws(() => validateCapabilities(manifest(base), { allowRadioReceive: allowRadioReceive as boolean }), /Invalid radio receive option/);
    assert.throws(() => new DeviceSession(new Peer(base), { allowRadioReceive: allowRadioReceive as boolean }), /Invalid radio receive option/);
  }
});
test('handshake sends only info/capabilities, never infers permission from identity', async () => {
  const peer = new Peer([...base, ...rx]); const rejected = new DeviceSession(peer);
  await assert.rejects(rejected.open(), /Unsupported capability/); assert.deepEqual(peer.sent, [1, 2]);
  const permittedPeer = new Peer([...base, ...rx]); const session = new DeviceSession(permittedPeer, { allowRadioReceive: true });
  await session.open(); assert.deepEqual(permittedPeer.sent, [1, 2]);
  for (const operation of rx) await session.request(operation as 'radio.rx.start');
  assert.deepEqual(permittedPeer.sent, [1, 2, 0x60, 0x61, 0x62]); await session.close();
});
test('captured opt-in and negotiated set cannot be broadened by public mutation', async () => {
  for (const allowRadioReceive of [false, true]) {
    const peer = new Peer(base); const options = { allowRadioReceive }; const session = new DeviceSession(peer, options);
    options.allowRadioReceive = true; await session.open(); session.capabilities.push(...rx as ('radio.rx.start')[]);
    for (const operation of [...rx, 'radio.tx']) await assert.rejects(session.request(operation as 'radio.rx.start'), /not supported/);
    assert.deepEqual(peer.sent, [1, 2]); await session.close();
  }
  const peer = new Peer([...base, ...rx]); const options = { allowRadioReceive: true }; const session = new DeviceSession(peer, options);
  options.allowRadioReceive = false; await session.open(); await session.request('radio.rx.stop'); await session.close();
});
