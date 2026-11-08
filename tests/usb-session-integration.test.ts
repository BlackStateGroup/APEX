import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { DeviceSession } from '../packages/core/session.ts';
import { AndroidUsbTransport } from '../modules/apex-device/usb-transport.ts';
import type { ApexNative, NativeEvents } from '../modules/apex-device/index.ts';
import { encode, FrameDecoder, Kind, Opcode, utf8 } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';
import { clearReleasedSession } from '../src/session-controls.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const identity = { id: 'synthetic-usb-peer', board: 'fixture-only', firmware: 'synthetic-1', protocol: 1, source: 'accessory' };
const manifest = { operations: ['system.info', 'system.capabilities', 'system.ping'] };

// Synthetic authored peer at the ApexNative boundary. Real DeviceSession and
// AndroidUsbTransport are not replaced. Protocol codecs frame the peer messages;
// this is not independent wire-format certification or Android/hardware evidence.
class SyntheticUsbPeer implements ApexNative {
  granted = true;
  permissions: number[] = []; opens: number[] = []; closes: number[] = [];
  writes: { token: number; bytes: number[] }[] = [];
  requests: Frame[] = []; callbackSizes: number[] = [];
  events = new Map<string, Set<(event: never) => void>>();
  reply = (request: Frame): Uint8Array => request.opcode === Opcode.Info ? utf8(JSON.stringify(identity))
    : request.opcode === Opcode.Capabilities ? utf8(JSON.stringify(manifest)) : request.payload;
  afterReply: (() => Promise<void>) | null = null;
  suppressReply = false;
  decoder = new FrameDecoder(request => {
    assert.equal(request.kind, Kind.Request);
    this.requests.push(request);
    if (this.suppressReply) return;
    const response = encode({ kind: Kind.Response, id: request.id, opcode: request.opcode, payload: this.reply(request) });
    for (let offset = 0; offset < response.length; offset += 512) {
      const bytes = Array.from(response.subarray(offset, offset + 512));
      this.callbackSizes.push(bytes.length);
      this.emit('onUsbData', { token: 7, bytes });
    }
  });
  addListener<E extends keyof NativeEvents>(event: E, listener: NativeEvents[E]) {
    const set = this.events.get(event) ?? new Set(); this.events.set(event, set);
    const fn = listener as (event: never) => void; set.add(fn);
    return { remove: () => { set.delete(fn); } };
  }
  emit<E extends keyof NativeEvents>(event: E, value: Parameters<NativeEvents[E]>[0]) {
    for (const fn of [...(this.events.get(event) ?? [])]) fn(value as never);
  }
  get listenerCount() { return [...this.events.values()].reduce((sum, set) => sum + set.size, 0); }
  async getStatus() { return { usbHost: true, nfcAvailable: false, nfcEnabled: false }; }
  async listUsbDevices() { return []; }
  async requestUsbPermission(id: number) { this.permissions.push(id); return this.granted; }
  async openUsb(id: number) { this.opens.push(id); return 7; }
  async writeUsb(token: number, bytes: number[]) {
    this.writes.push({ token, bytes });
    this.decoder.push(Uint8Array.from(bytes)); // Reply is emitted synchronously before settlement.
    await this.afterReply?.();
  }
  async closeUsb(token: number) { this.closes.push(token); }
  async startNfcReader() { throw new Error('No NFC in synthetic USB tests'); }
  async stopNfcReader() { throw new Error('No NFC in synthetic USB tests'); }
}
function setup(native = new SyntheticUsbPeer()) {
  const transport = new AndroidUsbTransport(native, 12);
  const session = new DeviceSession(transport);
  return { native, transport, session, slot: { current: session as DeviceSession | null } };
}
async function assertOwned(native: SyntheticUsbPeer) {
  const permissionCalls = native.permissions.length;
  await assert.rejects(new AndroidUsbTransport(native, 99).connect(), /already owned/);
  assert.equal(native.permissions.length, permissionCalls);
}

test('synthetic USB session negotiates AXP and snapshots a maximum payload with synchronous fragmented reply', async () => {
  const { native, session, slot } = setup();
  await session.open();
  assert.equal(session.source, 'usb'); assert.equal(session.state, 'open');
  assert.deepEqual(session.info, identity); assert.deepEqual(session.capabilities, manifest.operations);
  assert.deepEqual(native.requests.map(({ id, opcode, payload }) => [id, opcode, payload.length]), [[1, 1, 0], [2, 2, 0]]);
  const rawWrite = deferred<void>(); let settled = false;
  native.afterReply = () => rawWrite.promise.then(() => { settled = true; });
  const payload = Uint8Array.from({ length: 512 }, (_, i) => i % 256);
  const expected = payload.slice();
  const ping = session.request('system.ping', payload); payload.fill(0);
  assert.deepEqual(await ping, expected); assert.equal(settled, false);
  assert.deepEqual(native.callbackSizes.slice(-2), [512, 12]);
  assert.equal(native.callbackSizes.every(size => size <= 512), true);
  const write = native.writes[2]!;
  assert.equal(write.token, 7); assert.equal(write.bytes.length, 524);
  assert.deepEqual(write.bytes.slice(0, 10), [0x41, 0x58, 1, 1, 3, 0, 3, 0, 0, 2]);
  assert.deepEqual(write.bytes.slice(10, 522), Array.from(expected));
  assert.deepEqual(native.requests[2]!.payload, expected);
  assert.equal(session.pendingCount, 0);
  rawWrite.resolve(); await session.close();
  assert.equal(session.transportReleasePending, false); assert.equal(clearReleasedSession(slot, session), true);
  assert.deepEqual(native.closes, [7]); assert.equal(native.listenerCount, 0);
});

for (const malformed of ['identity', 'capabilities'] as const) {
  test(`synthetic USB ${malformed} failure retains session slot after failed close and fulfilled retry`, async () => {
    const { native, session, slot } = setup(); const normalReply = native.reply;
    native.reply = request => request.opcode === (malformed === 'identity' ? Opcode.Info : Opcode.Capabilities)
      ? utf8(JSON.stringify(malformed === 'identity' ? { ...identity, id: '' } : { operations: ['system.ping'] })) : normalReply(request);
    native.closeUsb = async token => { native.closes.push(token); if (native.closes.length === 1) throw new Error('Synthetic close rejected'); };
    await assert.rejects(session.open(), malformed === 'identity' ? /Invalid identity field/ : /Unsupported capability manifest/);
    assert.equal(session.state, 'closed'); assert.equal(session.pendingCount, 0);
    assert.equal(session.transportReleasePending, true); assert.equal(clearReleasedSession(slot, session), false);
    assert.equal(slot.current, session); assert.deepEqual(native.closes, [7]);
    assert.equal(native.writes.length, malformed === 'identity' ? 1 : 2); assert.equal(native.listenerCount, 0);
    await assertOwned(native);
    await assert.rejects(session.close(), /cleanup uncertain after failed close/);
    assert.deepEqual(native.closes, [7, 7]); assert.equal(session.transportReleasePending, true);
    assert.equal(clearReleasedSession(slot, session), false); await assertOwned(native);
  });
}

test('synthetic permission denial releases session slot without native open write or close', async () => {
  const { native, session, slot } = setup(); native.granted = false;
  await assert.rejects(session.open(), /permission denied/);
  assert.equal(session.transportReleasePending, false); assert.equal(clearReleasedSession(slot, session), true);
  assert.deepEqual(native.permissions, [12]); assert.deepEqual(native.opens, []);
  assert.deepEqual(native.writes, []); assert.deepEqual(native.closes, []); assert.equal(native.listenerCount, 0);
  native.granted = true; const next = setup(native); await next.session.open(); await next.session.close();
});

test('synthetic session close rejects pending ping but retains ownership until actual native write settles', async () => {
  const { native, session, slot } = setup(); await session.open();
  const rawWrite = deferred<void>(); native.afterReply = () => rawWrite.promise; native.suppressReply = true;
  const request = assert.rejects(session.request('system.ping', Uint8Array.of(7)), /Session closed/);
  await tick(); assert.equal(native.writes.length, 3); assert.equal(session.pendingCount, 1);
  let closed = false; const closing = session.close().then(() => { closed = true; });
  await request; await tick();
  assert.equal(session.state, 'closed'); assert.equal(session.pendingCount, 0); assert.equal(closed, false);
  assert.deepEqual(native.closes, [7]); assert.equal(session.transportReleasePending, true);
  assert.equal(clearReleasedSession(slot, session), false); await assertOwned(native);
  rawWrite.resolve(); await closing;
  assert.equal(session.transportReleasePending, false); assert.equal(clearReleasedSession(slot, session), true);
  assert.equal(native.listenerCount, 0);
  native.afterReply = null; native.suppressReply = false;
  const next = setup(native); await next.session.open(); await next.session.close();
});

for (const terminal of [false, true]) {
  test(`synthetic deferred native open with ${terminal ? 'early terminal event' : 'session cancellation'} settles without release deadlock`, async () => {
    const { native, session, slot } = setup(); const opened = deferred<number>();
    native.openUsb = async id => { native.opens.push(id); return opened.promise; };
    const opening = assert.rejects(session.open(), /closed during open/); await tick();
    let closed = false;
    if (terminal) native.emit('onUsbClosed', { token: 7, reason: 'Synthetic early detach' });
    const closing = terminal ? null : session.close().then(() => { closed = true; });
    await tick(); assert.equal(session.transportReleasePending, true);
    assert.equal(clearReleasedSession(slot, session), false); await assertOwned(native);
    assert.equal(closed, false); assert.deepEqual(native.closes, []);
    opened.resolve(7); await opening; if (closing) await closing;
    assert.equal(session.state, 'closed'); assert.equal(session.transportReleasePending, false);
    assert.equal(clearReleasedSession(slot, session), true); assert.deepEqual(native.writes, []);
    assert.deepEqual(native.closes, [7]); assert.equal(native.listenerCount, 0);
    native.openUsb = async id => { native.opens.push(id); return 7; };
    const next = setup(native); await next.session.open(); await next.session.close();
  });
}
