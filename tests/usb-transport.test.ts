import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { MAX_FRAME } from '../packages/protocol/index.ts';
import { AndroidUsbTransport } from '../modules/apex-device/usb-transport.ts';
import type { ApexNative, NativeEvents } from '../modules/apex-device/index.ts';

class NativeFixture implements ApexNative {
  granted = true; failOpen = false; writes: number[][] = []; closes: number[] = [];
  // A fake of the JS/native boundary only, not an Android hardware test.
  events = new Map<string, Set<(event: never) => void>>();
  addListener<E extends keyof NativeEvents>(event: E, listener: NativeEvents[E]) {
    const set = this.events.get(event) ?? new Set(); this.events.set(event, set);
    const callback = listener as (event: never) => void; set.add(callback); return { remove: () => { set.delete(callback); } };
  }
  emit<E extends keyof NativeEvents>(event: E, value: Parameters<NativeEvents[E]>[0]) { for (const fn of [...(this.events.get(event) ?? [])]) fn(value as never); }
  async getStatus() { return { usbHost: true, nfcAvailable: false, nfcEnabled: false }; }
  async listUsbDevices() { return []; }
  async requestUsbPermission() { return this.granted; }
  async openUsb() { if (this.failOpen) throw new Error('CDC not supported'); return 7; }
  async writeUsb(_token: number, bytes: number[]) { this.writes.push(bytes); }
  async closeUsb(token: number) { this.closes.push(token); }
  async startNfcReader() {}
  async stopNfcReader() {}
  get listenerCount() { return [...this.events.values()].reduce((sum, set) => sum + set.size, 0); }
}
test('USB permission denial does not open a connection or install listeners', async () => {
  const native = new NativeFixture(); native.granted = false;
  const transport = new AndroidUsbTransport(native, 12);
  await assert.rejects(transport.connect(), /denied/); assert.equal(native.listenerCount, 0); assert.deepEqual(native.closes, []);
});
test('USB failed open cleans up native subscriptions', async () => {
  const native = new NativeFixture(); native.failOpen = true;
  await assert.rejects(new AndroidUsbTransport(native, 12).connect(), /not supported/); assert.equal(native.listenerCount, 0);
});
test('USB data validates bytes and ignores stale connection generations', async () => {
  const native = new NativeFixture(); const transport = new AndroidUsbTransport(native, 12);
  const received: number[][] = []; transport.onData(bytes => received.push(Array.from(bytes))); await transport.connect();
  native.emit('onUsbData', { token: 6, bytes: [9] }); native.emit('onUsbData', { token: 7, bytes: [256] });
  native.emit('onUsbData', { token: 7, bytes: [0, 255, 1] }); assert.deepEqual(received, [[0, 255, 1]]);
  await transport.disconnect(); assert.equal(native.listenerCount, 0); assert.deepEqual(native.closes, [7]);
});
test('USB writes are ordered and detach rejects subsequent writes', async () => {
  const native = new NativeFixture(); let complete!: () => void;
  native.writeUsb = async (_token, bytes) => { native.writes.push(bytes); if (native.writes.length === 1) await new Promise<void>(resolve => { complete = resolve; }); };
  const transport = new AndroidUsbTransport(native, 12); let disconnected = false;
  transport.onDisconnect(() => { disconnected = true; }); await transport.connect();
  const first = transport.write(Uint8Array.of(1)); const second = transport.write(Uint8Array.of(2));
  await setImmediate(); assert.deepEqual(native.writes, [[1]]); complete(); await Promise.all([first, second]); assert.deepEqual(native.writes, [[1], [2]]);
  native.emit('onUsbClosed', { token: 6, reason: 'old event' }); assert.equal(disconnected, false);
  native.emit('onUsbClosed', { token: 7, reason: 'detached' }); assert.equal(disconnected, true); assert.equal(native.listenerCount, 0);
  await assert.rejects(transport.write(Uint8Array.of(3)), /closed/);
});

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
test('pending permission owns the module across instances and cancellation waits without opening', async () => {
  const native = new NativeFixture(); const permission = deferred<boolean>(); let opens = 0;
  native.requestUsbPermission = () => permission.promise;
  native.openUsb = async () => { opens++; return 7; };
  const transport = new AndroidUsbTransport(native, 12);
  const opening = assert.rejects(transport.connect(), /cancelled/); await setImmediate();
  let finished = false; const closing = transport.disconnect().then(() => { finished = true; });
  await assert.rejects(new AndroidUsbTransport(native, 12).connect(), /owned/);
  await setImmediate(); assert.equal(finished, false);
  permission.resolve(true); await Promise.all([opening, closing]); assert.equal(opens, 0);
  native.requestUsbPermission = async () => true;
  const replacement = new AndroidUsbTransport(native, 12); await replacement.connect(); await replacement.disconnect();
});
test('disconnect waits for delayed open then closes its token once', async () => {
  const native = new NativeFixture(); const open = deferred<number>(); native.openUsb = () => open.promise;
  const transport = new AndroidUsbTransport(native, 12);
  const opening = assert.rejects(transport.connect(), /closed during open/); await setImmediate();
  const closing = transport.disconnect(); const closingAgain = transport.disconnect();
  await setImmediate(); assert.deepEqual(native.closes, []);
  open.resolve(9); await Promise.all([opening, closing, closingAgain]);
  assert.deepEqual(native.closes, [9]); assert.equal(native.listenerCount, 0);
});
test('early terminal event cannot resurrect a connection and stale early tokens are ignored', async () => {
  const native = new NativeFixture(); const open = deferred<number>(); native.openUsb = () => open.promise;
  const transport = new AndroidUsbTransport(native, 12); let notifications = 0;
  transport.onDisconnect(() => { notifications++; throw new Error('consumer failure'); });
  const opening = assert.rejects(transport.connect(), /closed during open/); await setImmediate();
  native.emit('onUsbClosed', { token: 6, reason: 'stale' });
  native.emit('onUsbClosed', { token: 7, reason: 'detached before resolution' }); open.resolve(7);
  await opening; await transport.disconnect(); assert.equal(notifications, 1); assert.equal(native.listenerCount, 0);
  await assert.rejects(transport.write(Uint8Array.of(1)), /closed/);
});
test('failed close retains ownership and token for same-owner retry', async () => {
  const native = new NativeFixture(); let attempts = 0;
  native.closeUsb = async token => { native.closes.push(token); if (++attempts === 1) throw new Error('close failed'); };
  const transport = new AndroidUsbTransport(native, 12); await transport.connect();
  await assert.rejects(transport.disconnect(), /close failed/);
  await assert.rejects(new AndroidUsbTransport(native, 12).connect(), /owned/);
  await assert.rejects(transport.write(Uint8Array.of(1)), /closed/);
  await assert.rejects(transport.disconnect(), /cleanup uncertain/); assert.deepEqual(native.closes, [7, 7]); assert.equal(native.listenerCount, 0);
  await assert.rejects(new AndroidUsbTransport(native, 12).connect(), /owned/);
});
test('native open rejection and invalid token preserve unknown-ownership fence', async () => {
  for (const token of [null, NaN, 0, -1, 1.5, 0x80000000]) {
    const native = new NativeFixture(); native.openUsb = async () => { if (token === null) throw new Error('open failed'); return token; };
    const transport = new AndroidUsbTransport(native, 12);
    await assert.rejects(transport.connect(), /open failed|Invalid USB/);
    await assert.rejects(transport.disconnect(), /cleanup uncertain/);
    await assert.rejects(new AndroidUsbTransport(native, 12).connect(), /owned/);
    assert.deepEqual(native.closes, []); assert.equal(native.listenerCount, 0);
  }
});
test('disconnect rejects active and queued writes promptly but retains lease until native write settles', async () => {
  const native = new NativeFixture(); const write = deferred<void>();
  native.writeUsb = async (_token, bytes) => { native.writes.push(bytes); await write.promise; };
  const transport = new AndroidUsbTransport(native, 12); await transport.connect();
  const first = assert.rejects(transport.write(Uint8Array.of(1)), /closed/);
  const second = assert.rejects(transport.write(Uint8Array.of(2)), /closed/); await setImmediate();
  let done = false; const closing = transport.disconnect().then(() => { done = true; });
  await Promise.all([first, second]); await setImmediate(); assert.equal(done, false);
  await assert.rejects(new AndroidUsbTransport(native, 12).connect(), /owned/);
  write.resolve(); await closing; assert.deepEqual(native.writes, [[1]]);
});
test('bounded early terminal overflow fails closed and permits explicit known-token cleanup', async () => {
  const native = new NativeFixture(); const open = deferred<number>(); native.openUsb = () => open.promise;
  const transport = new AndroidUsbTransport(native, 12);
  const opening = assert.rejects(transport.connect(), /overflow/); await setImmediate();
  for (let token = 100; token < 140; token++) native.emit('onUsbClosed', { token, reason: 'stale' });
  open.resolve(7); await opening;
  await assert.rejects(new AndroidUsbTransport(native, 12).connect(), /owned/);
  await transport.disconnect(); assert.deepEqual(native.closes, [7]);
});
test('listener installation failure removes partial subscription and releases pre-open ownership', async () => {
  const native = new NativeFixture(); const add = native.addListener.bind(native); let calls = 0;
  native.addListener = ((event, listener) => { if (++calls === 2) throw new Error('subscribe failed'); return add(event, listener); }) as typeof native.addListener;
  const transport = new AndroidUsbTransport(native, 12);
  await assert.rejects(transport.connect(), /subscribe failed/); assert.equal(native.listenerCount, 0);
  native.addListener = add; const replacement = new AndroidUsbTransport(native, 12); await replacement.connect(); await replacement.disconnect();
});
test('terminal event plus rejected explicit close cannot release ownership', async () => {
  const native = new NativeFixture(); const transport = new AndroidUsbTransport(native, 12);
  native.closeUsb = async token => { native.emit('onUsbClosed', { token, reason: 'closed event' }); throw new Error('close uncertain'); };
  transport.onDisconnect(() => { throw new Error('consumer failure'); }); await transport.connect();
  await assert.rejects(transport.disconnect(), /close uncertain/); await setImmediate();
  await assert.rejects(new AndroidUsbTransport(native, 12).connect(), /owned/);
  native.closeUsb = async token => { native.closes.push(token); }; await assert.rejects(transport.disconnect(), /cleanup uncertain/); assert.deepEqual(native.closes, [7]);
});
test('removed callbacks are fenced even if a native emitter already queued them', async () => {
  const native = new NativeFixture(); const transport = new AndroidUsbTransport(native, 12); let received = 0;
  transport.onData(() => { received++; }); await transport.connect();
  const callbacks = [...native.events.get('onUsbData')!]; await transport.disconnect();
  await transport.connect();
  for (const callback of callbacks) callback({ token: 7, bytes: [1] } as never);
  assert.equal(received, 0); await transport.disconnect();
});

test('failed close followed by delayed closed event must retain ownership', async () => {
  const native = new NativeFixture(); const transport = new AndroidUsbTransport(native, 12);
  native.closeUsb = async () => { throw new Error('cleanup failed'); };
  await transport.connect(); await assert.rejects(transport.disconnect(), /cleanup failed/);
  native.emit('onUsbClosed', {token: 7, reason:'delayed close event'});
  await setImmediate();
  await assert.rejects(new AndroidUsbTransport(native, 12).connect(), /owned/);
});
test('terminal release task must not outrun failed close after outstanding write settles', async () => {
  const native = new NativeFixture(); const transport = new AndroidUsbTransport(native, 12);
  const write = deferred<void>(); native.writeUsb = () => write.promise;
  native.closeUsb = async () => { throw new Error('cleanup failed'); };
  await transport.connect(); const writing = assert.rejects(transport.write(Uint8Array.of(1)));
  await setImmediate(); native.emit('onUsbClosed', {token:7, reason:'detached'});
  await writing; await assert.rejects(transport.disconnect(), /cleanup failed/);
  write.resolve(); await setImmediate();
  await assert.rejects(new AndroidUsbTransport(native,12).connect(), /owned/);
});
test('sparse bytes must not silently become zero-valued valid data', async () => {
  const native = new NativeFixture(); const transport = new AndroidUsbTransport(native, 12); const received: number[][]=[];
  transport.onData(b=>received.push([...b])); await transport.connect();
  native.emit('onUsbData', {token:7, bytes:new Array(3)});
  assert.deepEqual(received, []);
});
test('null malformed native events do not throw into emitter', async () => {
  const native = new NativeFixture(); const transport = new AndroidUsbTransport(native, 12); await transport.connect();
  assert.doesNotThrow(()=>native.emit('onUsbData', null as never));
  assert.doesNotThrow(()=>native.emit('onUsbClosed', null as never));
  await transport.disconnect();
});
test('matching early event plus overflow cannot auto-release cleanup-required lease', async () => {
  const native = new NativeFixture(); const open = deferred<number>(); native.openUsb=()=>open.promise;
  const transport = new AndroidUsbTransport(native,12); const opening=assert.rejects(transport.connect(), /overflow/);
  await setImmediate(); native.emit('onUsbClosed',{token:7,reason:'early match'});
  for(let token=100;token<140;token++) native.emit('onUsbClosed',{token,reason:'stale'});
  open.resolve(7); await opening; await setImmediate();
  await assert.rejects(new AndroidUsbTransport(native,12).connect(), /owned/);
});
test('listener removal failures cannot revive cancelled callbacks or block known-token retry', async () => {
  const native=new NativeFixture(); const add=native.addListener.bind(native);
  native.addListener=((event,listener)=>{add(event,listener);return {remove(){throw new Error('removal failed')}}}) as typeof native.addListener;
  const transport=new AndroidUsbTransport(native,12); let count=0; transport.onData(()=>count++);
  await transport.connect(); await transport.disconnect(); native.emit('onUsbData',{token:7,bytes:[1]}); assert.equal(count,0);
  const next=new AndroidUsbTransport(native,12); await next.connect(); await next.disconnect();
});
test('terminal waits for native pending rejected write while queued write never invokes native', async () => {
  const native=new NativeFixture(); const pending=deferred<void>(); native.writeUsb=async(_token,bytes)=>{native.writes.push(bytes);await pending.promise};
  const transport=new AndroidUsbTransport(native,12);await transport.connect();
  const first=assert.rejects(transport.write(Uint8Array.of(1))); const second=assert.rejects(transport.write(Uint8Array.of(2)));
  await setImmediate();native.emit('onUsbClosed',{token:7,reason:'detached'});await Promise.all([first,second]);
  await assert.rejects(new AndroidUsbTransport(native,12).connect(), /owned/);
  pending.reject(new Error('late write rejection'));await setImmediate();assert.deepEqual(native.writes,[[1]]);
  const next=new AndroidUsbTransport(native,12);await next.connect();await next.disconnect();
});
test('invalid tokens cannot terminate active ownership', async () => {
  const native=new NativeFixture(); const transport=new AndroidUsbTransport(native,12); await transport.connect();
  for(const token of [NaN,Infinity,0,-1,1.2,0x80000000,'7',null,undefined]) native.emit('onUsbClosed',{token:token as number,reason:'bad token'});
  await setImmediate();await assert.rejects(new AndroidUsbTransport(native,12).connect(),/owned/);await transport.disconnect();
});
test('native link-null before physical-close failure makes fulfilled retry no proof of release', async () => {
  const native = new NativeFixture(); let linked = true; let physicalReleased = false; let calls = 0;
  // Models ApexDeviceModule.closeLink source ordering, not native execution:
  // link = null precedes releaseInterface/connection.close; subsequent close is a no-op.
  native.closeUsb = async token => {
    native.closes.push(token); calls++;
    if (!linked) return;
    linked = false;
    throw new Error('physical close failed');
  };
  const transport = new AndroidUsbTransport(native, 12); await transport.connect();
  await assert.rejects(transport.disconnect(), /physical close failed/);
  await assert.rejects(transport.disconnect(), /cleanup uncertain/);
  assert.equal(calls, 2); assert.equal(linked, false); assert.equal(physicalReleased, false);
  assert.deepEqual(native.closes, [7, 7]);
  await assert.rejects(new AndroidUsbTransport(native, 12).connect(), /owned/);
});
test('USB writes enforce native frame bounds and fixed Uint8Array input before enqueue', async () => {
  const native = new NativeFixture(); const transport = new AndroidUsbTransport(native, 12); await transport.connect();
  const shared = new Uint8Array(new SharedArrayBuffer(1));
  const resizable = new Uint8Array(new ArrayBuffer(1, { maxByteLength: 8 }));
  const detached = Uint8Array.of(1); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  for (const input of [new Uint8Array(), new Uint8Array(MAX_FRAME + 1), null, undefined, [1], new Uint16Array([1]),
    new DataView(new ArrayBuffer(1)), new Proxy(Uint8Array.of(1), {}), shared, resizable, detached]) {
    await assert.rejects(transport.write(input as Uint8Array), /input|bounds/);
  }
  assert.equal(native.writes.length, 0);
  await transport.write(Uint8Array.of(255)); await transport.write(new Uint8Array(MAX_FRAME).fill(7));
  assert.deepEqual(native.writes.map(bytes => bytes.length), [1, MAX_FRAME]); await transport.disconnect();
});
test('USB write queue includes active work, caps at sixteen, and reuses settled slots', async () => {
  const native = new NativeFixture(); const gate = deferred<void>();
  native.writeUsb = async (_token, bytes) => { native.writes.push(bytes); if (native.writes.length === 1) await gate.promise; };
  const transport = new AndroidUsbTransport(native, 12); await transport.connect();
  const accepted = Array.from({ length: 16 }, (_, i) => transport.write(Uint8Array.of(i)));
  await setImmediate(); assert.deepEqual(native.writes, [[0]]);
  await assert.rejects(transport.write(Uint8Array.of(16)), /queue full/);
  gate.resolve(); await Promise.all(accepted);
  await transport.write(Uint8Array.of(17)); assert.equal(native.writes.length, 17);
  assert.deepEqual(native.writes.map(bytes => bytes[0]), [...Array.from({ length: 16 }, (_, i) => i), 17]);
  await transport.disconnect();
});
test('USB write snapshot ignores caller mutation and overridable view hooks', async () => {
  const native = new NativeFixture(); const gate = deferred<void>();
  native.writeUsb = async (_token, bytes) => { native.writes.push(bytes); if (native.writes.length === 1) await gate.promise; };
  const transport = new AndroidUsbTransport(native, 12); await transport.connect();
  const first = transport.write(Uint8Array.of(1));
  const backing = Uint8Array.of(8, 2, 3, 9); const input = backing.subarray(1, 3);
  Object.defineProperties(input, {
    length: { get() { throw new Error('caller length hook'); } },
    buffer: { get() { throw new Error('caller buffer hook'); } },
    [Symbol.iterator]: { value() { throw new Error('caller iterator hook'); } },
    slice: { value() { throw new Error('caller slice hook'); } },
  });
  const second = transport.write(input); backing.fill(0); gate.resolve(); await Promise.all([first, second]);
  assert.deepEqual(native.writes, [[1], [2, 3]]); await transport.disconnect();
});
test('saturated cancelled write queue cannot reset or reenter while native work is pending', async () => {
  const native = new NativeFixture(); const gate = deferred<void>();
  native.writeUsb = async (_token, bytes) => { native.writes.push(bytes); await gate.promise; };
  const transport = new AndroidUsbTransport(native, 12); await transport.connect();
  const rejected = Array.from({ length: 16 }, (_, i) => assert.rejects(transport.write(Uint8Array.of(i)), /closed/));
  await setImmediate(); const closing = transport.disconnect(); await Promise.all(rejected);
  await assert.rejects(transport.write(Uint8Array.of(16)), /closed/);
  await assert.rejects(transport.connect(), /owned/);
  await assert.rejects(new AndroidUsbTransport(native, 12).connect(), /owned/);
  gate.resolve(); await closing; assert.deepEqual(native.writes, [[0]]);
  await transport.connect(); await transport.write(Uint8Array.of(17)); await transport.disconnect();
  assert.deepEqual(native.writes, [[0], [17]]);
});
