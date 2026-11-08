import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceSession } from '../packages/core/session.ts';
import { SimulatorTransport } from '../packages/core/simulator.ts';
import type { ByteTransport } from '../packages/core/transport.ts';
import { encode, FrameDecoder, Kind, utf8 } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';

class TestPeer implements ByteTransport {
  readonly source = 'simulator' as const;
  data = new Set<(bytes: Uint8Array) => void>();
  closed = new Set<(error: Error) => void>();
  frames: Frame[] = [];
  connected = false;
  failConnect = false;
  handler: ((frame: Frame) => void) | null = null;
  decoder = new FrameDecoder(frame => {
    this.frames.push(frame);
    if (this.handler) this.handler(frame);
    else this.reply(frame, frame.opcode === 1 ? utf8('{"id":"fixture","board":"fixture","firmware":"1","protocol":1,"source":"simulator"}') :
      frame.opcode === 2 ? utf8('{"operations":["system.info","system.capabilities","system.ping"]}') : frame.payload);
  });
  reply(frame: Frame, payload = frame.payload, kind: Frame['kind'] = Kind.Response, opcode = frame.opcode): void {
    const wire = encode({ ...frame, kind, opcode, payload }); for (const listener of this.data) listener(wire);
  }
  async connect() { if (this.failConnect) throw new Error('Connect failed'); this.connected = true; }
  async write(bytes: Uint8Array) { this.decoder.push(bytes); }
  async disconnect() { this.connected = false; }
  onData(fn: (bytes: Uint8Array) => void) { this.data.add(fn); return () => this.data.delete(fn); }
  onDisconnect(fn: (error: Error) => void) { this.closed.add(fn); return () => this.closed.delete(fn); }
  drop() { for (const listener of [...this.closed]) listener(new Error('Cable removed')); }
}

test('simulator handshake and synchronous-before-write-completion replies work', async t => {
  const session = new DeviceSession(new SimulatorTransport()); t.after(() => session.close());
  await session.open(); assert.equal(session.info!.id, 'apex-simulator'); assert.equal(session.source, 'simulator');
  assert.equal(session.capabilities.length, 3);
  const payload = Uint8Array.from({ length: 512 }, (_, i) => i & 255);
  assert.deepEqual(await session.request('system.ping', payload), payload);
});
test('disconnected and unavailable operations reject without transport execution', async t => {
  const peer = new TestPeer(); const session = new DeviceSession(peer); t.after(() => session.close());
  await assert.rejects(session.request('system.ping'), /not connected/); await session.open();
  const before = peer.frames.length;
  await assert.rejects(session.request('radio.transmit' as never), /not supported/); assert.equal(peer.frames.length, before);
});
test('failed connect removes listeners and closes the one-use session', async () => {
  const peer = new TestPeer(); peer.failConnect = true; const session = new DeviceSession(peer);
  await assert.rejects(session.open(), /Connect failed/); assert.equal(session.state, 'closed');
  assert.equal(peer.data.size + peer.closed.size, 0); await assert.rejects(session.open(), /reused/);
});
test('malformed identity and unrecognised capabilities fail negotiation and clean up', async () => {
  for (const invalidAt of [1, 2]) {
    const peer = new TestPeer(); const session = new DeviceSession(peer);
    peer.handler = frame => peer.reply(frame, frame.opcode === invalidAt ? utf8('{"operations":["radio.transmit"]}') :
      utf8('{"id":"fixture","board":"fixture","firmware":"1","protocol":1,"source":"simulator"}'));
    await assert.rejects(session.open()); assert.equal(peer.connected, false); assert.equal(peer.data.size, 0);
    assert.equal(session.info, null); assert.deepEqual(session.capabilities, []);
  }
});
test('timeouts remove pending work and late replies cannot satisfy the next request', async t => {
  const peer = new TestPeer(); const session = new DeviceSession(peer, { timeoutMs: 20 }); t.after(() => session.close());
  await session.open(); peer.handler = () => {};
  await assert.rejects(session.request('system.ping', utf8('old')), /timed out/);
  const old = peer.frames.at(-1)!;
  const next = session.request('system.ping', utf8('new')); peer.reply(old);
  const current = peer.frames.at(-1)!; assert.notEqual(current.id, old.id); peer.reply(current);
  assert.deepEqual(await next, utf8('new')); assert.equal(session.pendingCount, 0);
});
test('pending queue is bounded and unplug rejects every request', async t => {
  const peer = new TestPeer(); const session = new DeviceSession(peer, { maxPending: 2 }); t.after(() => session.close());
  await session.open(); peer.handler = () => {};
  const a = session.request('system.ping'); const b = session.request('system.ping');
  const rejectedA = assert.rejects(a, /Cable removed/); const rejectedB = assert.rejects(b, /Cable removed/);
  await assert.rejects(session.request('system.ping'), /queue full/); peer.drop();
  await Promise.all([rejectedA, rejectedB]); assert.equal(session.pendingCount, 0); assert.equal(session.state, 'closed');
  assert.equal(peer.data.size + peer.closed.size, 0);
});
test('wrong response opcode and device error are rejected', async t => {
  const peer = new TestPeer(); const session = new DeviceSession(peer); t.after(() => session.close()); await session.open();
  peer.handler = frame => peer.reply(frame, frame.payload, Kind.Response, 1);
  await assert.rejects(session.request('system.ping'), /opcode mismatch/);
  peer.handler = frame => peer.reply(frame, utf8('{"code":"INVALID_ARGUMENT"}'), Kind.Error);
  await assert.rejects(session.request('system.ping'), /INVALID_ARGUMENT/);
});
test('write failure rejects immediately and clears pending requests', async t => {
  const peer = new TestPeer(); const session = new DeviceSession(peer); t.after(() => session.close()); await session.open();
  peer.write = async () => { throw new Error('Write failed'); };
  await assert.rejects(session.request('system.ping'), /Write failed/); assert.equal(session.pendingCount, 0);
});
test('request IDs are never reused through the full 16-bit session space', async t => {
  const peer = new TestPeer(); const session = new DeviceSession(peer); t.after(() => session.close()); await session.open();
  for (let i = 0; i < 65533; i++) await session.request('system.ping');
  assert.equal(peer.frames.at(-1)!.id, 65535);
  await assert.rejects(session.request('system.ping'), /exhausted/);
});
test('invalid timeout and pending limits cannot create unbounded sessions', () => {
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: Infinity }, { maxPending: 0 }, { maxPending: 33 }]) assert.throws(() => new DeviceSession(new TestPeer(), options));
});
test('synchronous transport failure also clears pending state', async t => {
  const peer = new TestPeer(); const session = new DeviceSession(peer); t.after(() => session.close()); await session.open();
  peer.write = () => { throw new Error('Synchronous driver failure'); };
  await assert.rejects(session.request('system.ping'), /Synchronous driver failure/); assert.equal(session.pendingCount, 0);
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Synthetic transport promises only: these do not establish native release.
test('failed open retains cleanup uncertainty and only explicit close retries', async () => {
  const peer = new TestPeer();
  const original = new Error('Permission/open refused');
  peer.connect = async () => { throw original; };
  let calls = 0;
  peer.disconnect = async () => { ++calls; throw new Error('Release failed'); };
  const session = new DeviceSession(peer);
  await assert.rejects(session.open(), error => error === original);
  assert.equal(session.state, 'closed');
  assert.equal(session.transportReleasePending, true);
  assert.equal(calls, 1);
  await assert.rejects(session.close(), /Release failed/);
  assert.equal(session.transportReleasePending, true);
  assert.equal(calls, 2);
  peer.disconnect = async () => { ++calls; };
  await session.close();
  assert.equal(session.transportReleasePending, false);
  assert.equal(calls, 3);
  await assert.rejects(session.open(), /reused/);
});

test('terminal cleanup remains pending until resolved and simultaneous closes share it', async () => {
  const peer = new TestPeer(); const session = new DeviceSession(peer);
  assert.equal(session.transportReleasePending, false);
  await session.open(); assert.equal(session.transportReleasePending, true);
  const release = deferred(); let calls = 0;
  peer.disconnect = () => { ++calls; return release.promise; };
  peer.drop();
  assert.equal(session.state, 'closed'); assert.equal(session.transportReleasePending, true);
  const a = session.close(); const b = session.close();
  await Promise.resolve(); assert.equal(calls, 1);
  release.resolve(); await Promise.all([a, b]);
  assert.equal(session.transportReleasePending, false);
});

test('terminal cleanup failure stays pending until an explicit successful retry', async () => {
  const peer = new TestPeer(); const session = new DeviceSession(peer); await session.open();
  const release = deferred(); let calls = 0;
  peer.disconnect = () => { ++calls; return release.promise; };
  peer.drop(); const closing = assert.rejects(session.close(), /Release failed/);
  release.reject(new Error('Release failed')); await closing;
  assert.equal(session.transportReleasePending, true); assert.equal(calls, 1);
  peer.disconnect = async () => { ++calls; };
  await session.close(); assert.equal(calls, 2); assert.equal(session.transportReleasePending, false);
});

test('close during pending connect follows early successful cancellation with post-connect release', async () => {
  const peer = new TestPeer(); const connecting = deferred(); const releasing = deferred(); let calls = 0;
  peer.connect = () => connecting.promise;
  peer.disconnect = () => { ++calls; return releasing.promise; };
  const session = new DeviceSession(peer);
  const opening = assert.rejects(session.open(), /closed during open/);
  assert.equal(session.transportReleasePending, true);
  const closing = session.close();
  connecting.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(session.transportReleasePending, true);
  releasing.resolve(); await Promise.all([opening, closing]);
  assert.equal(calls, 2); assert.equal(session.transportReleasePending, false);
  assert.equal(peer.frames.length, 0); assert.equal(peer.data.size + peer.closed.size, 0);
});

test('clean refused open and explicit normal close confirm release', async () => {
  const peer = new TestPeer(); peer.failConnect = true; const session = new DeviceSession(peer);
  await assert.rejects(session.open(), /Connect failed/);
  assert.equal(session.transportReleasePending, false);
  const good = new DeviceSession(new TestPeer()); await good.open(); await good.close();
  assert.equal(good.transportReleasePending, false);
});

test('terminal event during negotiation and open failure share one failed cleanup', async () => {
  const peer = new TestPeer(); const release = deferred(); let calls = 0;
  peer.handler = () => { peer.drop(); };
  peer.disconnect = () => { ++calls; return release.promise; };
  const session = new DeviceSession(peer);
  const opening = assert.rejects(session.open(), /Cable removed/);
  // Allow negotiation, its terminal callback and open's catch to join cleanup.
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const closing = assert.rejects(session.close(), /Release failed/);
  release.reject(new Error('Release failed'));
  await Promise.all([opening, closing]);
  assert.equal(calls, 1); assert.equal(session.transportReleasePending, true);
  assert.equal(session.state, 'closed'); assert.equal(session.pendingCount, 0);
  peer.disconnect = async () => { ++calls; };
  await session.close(); assert.equal(calls, 2); assert.equal(session.transportReleasePending, false);
});
