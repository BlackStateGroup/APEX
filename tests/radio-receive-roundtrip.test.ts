import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceSession } from '../packages/core/session.ts';
import { encodeRadioReceiveStart, encodeRadioReceiveCaptureId, parseRadioReceiveStatus } from '../packages/core/radio-receive-protocol.ts';
import { encode, FrameDecoder, Kind, text } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';
import { buildRadioReceiveHost, RadioReceiveHostTransport } from './helpers/radio-receive-host.ts';
import type { RadioReceiveHostMode } from './helpers/radio-receive-host.ts';

let fixture: ReturnType<typeof buildRadioReceiveHost>;
before(() => { fixture = buildRadioReceiveHost(); });
after(() => fixture?.dispose());
const bounds = { timeout: 5000 };
function setup(mode: RadioReceiveHostMode = 'enabled', allowRadioReceive = true) {
  const transport = new RadioReceiveHostTransport(fixture.binary, mode);
  return { transport, session: new DeviceSession(transport, { allowRadioReceive, timeoutMs: 1000 }) };
}
const start = async (session: DeviceSession, duration = 1000, limit = 5) => parseRadioReceiveStatus(await session.request('radio.rx.start', encodeRadioReceiveStart(duration, limit)));
const poll = async (session: DeviceSession, id: number) => parseRadioReceiveStatus(await session.request('radio.rx.poll', encodeRadioReceiveCaptureId(id)));
const stop = async (session: DeviceSession, id: number) => parseRadioReceiveStatus(await session.request('radio.rx.stop', encodeRadioReceiveCaptureId(id)));
function frames(writes: Uint8Array[]) {
  const result: Frame[] = []; const decoder = new FrameDecoder(frame => result.push(frame));
  for (const bytes of writes) decoder.push(bytes);
  return result;
}

test('real receive service negotiates explicitly; handshake and ping never initialize receiver', bounds, async () => {
  const { transport, session } = setup();
  try {
    await session.open();
    assert.equal(session.source, 'host');
    assert.deepEqual(session.info, { id: 'apex-radio-rx-dev', board: 'esp32s3-cc1101', firmware: '0.1.0-rx', protocol: 1, source: 'accessory' });
    assert.deepEqual(session.capabilities, ['system.info', 'system.capabilities', 'system.ping', 'radio.rx.start', 'radio.rx.poll', 'radio.rx.stop']);
    const bytes = Uint8Array.of(0, 255, 128, 65);
    assert.deepEqual(await session.request('system.ping', bytes), bytes);
    assert.deepEqual(frames(transport.writes).map(f => f.opcode), [1, 2, 3]);
  } finally { await session.close(); }
  assert.deepEqual(JSON.parse(transport.diagnostics), { initializes: 0, arms: 0, polls: 0, stops: 0 });
});

test('default session rejects real six-operation manifest without initiating receive', bounds, async () => {
  const { transport, session } = setup('enabled', false);
  try { await assert.rejects(session.open(), /Unsupported capability manifest/); }
  finally { await session.close(); }
  assert.deepEqual(frames(transport.writes).map(f => f.opcode), [1, 2]);
  assert.equal(JSON.parse(transport.diagnostics).initializes, 0);
});

for (const allow of [false, true]) test(`disabled real service accepts base negotiation, opt-in=${allow}`, bounds, async () => {
  const { transport, session } = setup('disabled', allow);
  try {
    await session.open(); assert.equal(session.capabilities.length, 3);
    await assert.rejects(session.request('radio.rx.start', encodeRadioReceiveStart(1000, 5)), /not supported/);
    assert.equal(transport.writes.length, 2);
  } finally { await session.close(); }
});

test('cold 50 ms expiry spends initialization budget; next capture reuses initialized receiver', bounds, async () => {
  const { transport, session } = setup('quiet');
  try {
    await session.open();
    const cold = await start(session, 50);
    assert.deepEqual(cold, { version: 1, profile: 1, state: 3, captureId: 1, observed: 0, accepted: 0, dropped: 0, rejected: 0, queued: 0, elapsedMs: 150, error: 0, packet: null });
    const warm = await start(session, 50);
    assert.equal(warm.captureId, 2); assert.equal(warm.state, 1); assert.equal(warm.elapsedMs, 0);
    const stopped = await stop(session, 2);
    assert.equal(stopped.state, 2); assert.equal(stopped.elapsedMs, 10);
  } finally { await session.close(); }
  assert.equal(JSON.parse(transport.diagnostics).initializes, 1);
});

test('real service accounts two ticks per poll, rejection, exact packet metadata, event limit and queue drainage', bounds, async () => {
  const { session } = setup();
  try {
    await session.open(); const begun = await start(session);
    assert.equal(begun.captureId, 1); assert.equal(begun.state, 1); assert.equal(begun.elapsedMs, 150);
    const one = await poll(session, 1);
    assert.deepEqual([one.observed, one.accepted, one.rejected, one.queued, one.dropped], [2, 1, 1, 0, 0]);
    assert.deepEqual(one.packet, { elapsedMs: 155, rssiTenthsDbm: -735, lqi: 201, payload: [0, 255, 128, 0] });
    const two = await poll(session, 1);
    assert.deepEqual([two.observed, two.accepted, two.rejected], [4, 2, 2]);
    assert.deepEqual(two.packet, { elapsedMs: 165, rssiTenthsDbm: -737, lqi: 203, payload: [0, 255, 128, 2] });
    // A new START ticks once, reaches the limit, but must not discard its queued record.
    await assert.rejects(start(session), /BUSY/);
    const last = await poll(session, 1);
    assert.deepEqual([last.state, last.observed, last.accepted, last.rejected, last.queued], [4, 5, 3, 2, 0]);
    assert.deepEqual(last.packet, { elapsedMs: 175, rssiTenthsDbm: -739, lqi: 205, payload: [0, 255, 128, 4] });
    assert.equal((await poll(session, 1)).packet, null);
    assert.equal((await start(session)).captureId, 2);
    await assert.rejects(poll(session, 1), /INVALID_ARGUMENT/);
    assert.equal((await stop(session, 2)).state, 2);
  } finally { await session.close(); }
});

for (const mode of ['initialize-failure', 'stop-failure'] as const) test(`real ${mode} returns signed error and sticky fault`, bounds, async () => {
  const { session } = setup(mode);
  try {
    await session.open(); const begun = await start(session);
    const fault = mode === 'initialize-failure' ? begun : await stop(session, begun.captureId);
    assert.equal(fault.state, 5); assert.equal(fault.error, mode === 'initialize-failure' ? -701 : -702);
    assert.equal((await poll(session, begun.captureId)).state, 5);
    await assert.rejects(start(session), /SESSION_CLOSED/);
  } finally { await session.close(); }
});

test('disabled service itself returns NOT_CONFIGURED even for raw unnegotiated START', bounds, async () => {
  const transport = new RadioReceiveHostTransport(fixture.binary, 'disabled');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe = () => {};
  try {
    const response = new Promise<Frame>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Raw response timeout')), 1000);
      const decoder = new FrameDecoder(resolve); unsubscribe = transport.onData(b => decoder.push(b));
    });
    await transport.connect();
    await transport.write(encode({ kind: Kind.Request, opcode: 0x60, id: 23, payload: encodeRadioReceiveStart(1000, 5) }));
    const frame = await response;
    assert.equal(frame.kind, Kind.Error); assert.equal(frame.id, 23); assert.equal(frame.opcode, 0x60);
    assert.equal(text(frame.payload), '{"code":"NOT_CONFIGURED"}');
  } finally { clearTimeout(timer); unsubscribe(); await transport.disconnect(); }
});

test('quiet warm capture expires on its finite service clock without producing packets', bounds, async () => {
  const { session } = setup('quiet');
  try {
    await session.open(); await start(session, 50);
    const warm = await start(session, 50);
    for (let index = 1; index <= 5; index++) {
      const status = await poll(session, warm.captureId);
      assert.equal(status.state, index === 5 ? 3 : 1);
      assert.equal(status.elapsedMs, index * 10);
      assert.equal(status.packet, null); assert.equal(status.observed, 0);
    }
  } finally { await session.close(); }
});

test('actual service rejects malformed start and unknown capture without initializing hardware abstraction', bounds, async () => {
  const { transport, session } = setup();
  try {
    await session.open();
    await assert.rejects(session.request('radio.rx.start', Uint8Array.of(1, 1, 49, 0, 1, 0)), /INVALID_ARGUMENT/);
    await assert.rejects(poll(session, 1), /INVALID_ARGUMENT/);
  } finally { await session.close(); }
  assert.equal(JSON.parse(transport.diagnostics).initializes, 0);
});
