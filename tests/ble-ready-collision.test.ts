import test from 'node:test';
import assert from 'node:assert/strict';
import { BleTransport, AXP_READY } from '../packages/core/ble-transport.ts';
import type { GattConnection } from '../packages/core/ble-transport.ts';
import { DeviceSession } from '../packages/core/session.ts';
import { encode, FrameDecoder, Kind, Opcode, utf8 } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';

const payload = Uint8Array.from(Buffer.from('80a700000000000000004158505f524541', 'hex'));
const response = encode({ kind: Kind.Response, opcode: Opcode.Ping, id: 3, payload });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function fixture(mtu = 23) {
  let notify!: (bytes: Uint8Array) => void;
  let removed = 0; let disconnected = 0;
  const connection: GattConnection = {
    mtu, async subscribe(callback) { notify = callback; callback(AXP_READY.slice()); return () => { removed++; }; },
    async writeWithResponse() {}, async disconnect() { disconnected++; },
  };
  const transport = new BleTransport({ async connect() { return connection; } }, 'synthetic-ready', { timeoutMs: 1000 });
  return { transport, connection, notify: (b: Uint8Array) => notify(b), counts: () => ({ removed, disconnected }) };
}

test('CRC-valid MTU23 response tail is exactly READY and reaches the decoder', async () => {
  assert.equal(Buffer.from(response).toString('hex'), '4158010203000300110080a700000000000000004158505f5245414459');
  assert.deepEqual(response.slice(20), AXP_READY);
  const p = fixture(); const frames: Frame[] = [];
  const decoder = new FrameDecoder(frame => frames.push(frame)); p.transport.onData(b => decoder.push(b));
  await p.transport.connect();
  try { p.notify(response.slice(0, 20)); p.notify(response.slice(20)); assert.equal(frames.length, 1); assert.deepEqual(frames[0]!.payload, payload); }
  finally { await p.transport.disconnect(); }
});

test('every uniform notification size and every two-way frame split preserves bytes', async () => {
  const p = fixture(); let received: number[] = []; p.transport.onData(b => received.push(...b)); await p.transport.connect();
  try {
    for (let size = 1; size <= 512; size++) {
      received = []; for (let offset = 0; offset < response.length; offset += size) p.notify(response.slice(offset, offset + size));
      assert.deepEqual(received, [...response], `uniform size ${size}`);
    }
    for (let split = 1; split < response.length; split++) {
      received = []; p.notify(response.slice(0, split)); p.notify(response.slice(split));
      assert.deepEqual(received, [...response], `split ${split}`);
    }
  } finally { await p.transport.disconnect(); }
});

test('session ping succeeds using firmware MTU-minus-three / 244-byte capped splitting for every supported MTU', async () => {
  for (let mtu = 23; mtu <= 517; mtu++) {
    const p = fixture(mtu);
    const decoder = new FrameDecoder(frame => {
      const body = frame.opcode === Opcode.Info ? utf8('{"id":"synthetic","board":"host","firmware":"1","protocol":1,"source":"accessory"}') :
        frame.opcode === Opcode.Capabilities ? utf8('{"operations":["system.info","system.capabilities","system.ping"]}') : frame.payload;
      const wire = encode({ ...frame, kind: Kind.Response, payload: body });
      for (let offset = 0; offset < wire.length; offset += Math.min(mtu - 3, 244)) p.notify(wire.slice(offset, offset + Math.min(mtu - 3, 244)));
    });
    p.connection.writeWithResponse = async bytes => { decoder.push(bytes); };
    const session = new DeviceSession(p.transport, { timeoutMs: 100 });
    try { await session.open(); assert.deepEqual(await session.request('system.ping', payload), payload, `MTU ${mtu}`); }
    finally { await session.close(); }
  }
});

test('first READY alone is consumed while subscription is pending; all later marker placements are data', async () => {
  const p = fixture(); const gate = deferred<() => void>(); const subscribed = deferred<void>();
  p.connection.subscribe = callback => { p.notify = callback; subscribed.resolve(); return gate.promise; };
  const received: Uint8Array[] = []; p.transport.onData(b => received.push(b));
  const opening = p.transport.connect(); await subscribed.promise;
  p.notify(AXP_READY.slice()); assert.equal(received.length, 0);
  const chunks = [AXP_READY.slice(), Uint8Array.of(1), AXP_READY.slice(), Uint8Array.of(2), AXP_READY.slice()];
  for (const chunk of chunks) p.notify(chunk);
  assert.deepEqual(received, chunks); await assert.rejects(p.transport.write(Uint8Array.of(1)), /not connected/);
  gate.resolve(() => {}); await opening;
  p.notify(AXP_READY.slice()); assert.equal(received.length, 6);
  await p.transport.disconnect(); p.notify(AXP_READY.slice()); p.notify(response); assert.equal(received.length, 6);
  await assert.rejects(p.transport.connect(), /cannot be reused/);
});

test('post-READY marker delivery keeps independent copies for driver and listeners', async () => {
  const p = fixture(); const captured: Uint8Array[] = [];
  p.transport.onData(b => b.fill(0)); p.transport.onData(b => captured.push(b)); await p.transport.connect();
  const input = AXP_READY.slice(); p.notify(input); assert.deepEqual(captured[0], AXP_READY); assert.deepEqual(input, AXP_READY);
  input.fill(1); assert.deepEqual(captured[0], AXP_READY); await p.transport.disconnect();
});

test('non-exact first notifications still reject setup and cannot be rescued by READY', async () => {
  for (const invalid of [new Uint8Array(), AXP_READY.slice(1), Uint8Array.from([...AXP_READY, 0]), response, new Uint8Array(513)]) {
    const p = fixture(); let received = 0; p.transport.onData(() => { received++; });
    p.connection.subscribe = async callback => { callback(invalid); callback(AXP_READY.slice()); return () => {}; };
    await assert.rejects(p.transport.connect(), /did not send the AXP READY marker/); assert.equal(received, 0);
    assert.equal(p.counts().disconnected, 1);
  }
});

test('post-READY empty and oversized notifications fail closed, including pending subscription', async () => {
  for (const pending of [false, true]) for (const size of [0, 513]) {
    const p = fixture(); const gate = deferred<() => void>(); let received = 0; let failures = 0;
    p.transport.onData(() => { received++; }); p.transport.onDisconnect(e => { assert.match(e.message, /bounds/); failures++; });
    if (pending) p.connection.subscribe = callback => { p.notify = callback; callback(AXP_READY.slice()); return gate.promise; };
    const opening = p.transport.connect(); const outcome = pending ? assert.rejects(opening, /closed/) : opening;
    if (pending) await tick(); else await opening;
    p.notify(new Uint8Array(size)); p.notify(AXP_READY.slice()); p.notify(response);
    gate.resolve(() => {}); await outcome; await p.transport.disconnect();
    assert.equal(received, 0); assert.equal(failures, 1); assert.equal(p.counts().disconnected, 1);
  }
});
