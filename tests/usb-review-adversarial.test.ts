import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
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
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
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
test('successful close waits for both close acknowledgement and pending write despite terminal event', async () => {
  const native=new NativeFixture(); const close=deferred<void>(); const write=deferred<void>();
  native.writeUsb=()=>write.promise; native.closeUsb=()=>close.promise;
  const transport=new AndroidUsbTransport(native,12);await transport.connect();
  const writing=assert.rejects(transport.write(Uint8Array.of(1)));await setImmediate();
  let done=false;const closing=transport.disconnect().then(()=>{done=true});await writing;
  native.emit('onUsbClosed',{token:7,reason:'close event ahead of promise'}); await setImmediate();
  await assert.rejects(new AndroidUsbTransport(native,12).connect(),/owned/);assert.equal(done,false);
  close.resolve();await setImmediate();assert.equal(done,false);await assert.rejects(new AndroidUsbTransport(native,12).connect(),/owned/);
  write.resolve();await closing;const next=new AndroidUsbTransport(native,12);await next.connect();await next.disconnect();
});
test('unsolicited early terminal waits for open settlement before releasing', async () => {
  const native=new NativeFixture();const open=deferred<number>();native.openUsb=()=>open.promise;
  const transport=new AndroidUsbTransport(native,12);const opening=assert.rejects(transport.connect(),/closed during open/);
  await setImmediate();native.emit('onUsbClosed',{token:7,reason:'closed before open settled'});await setImmediate();
  await assert.rejects(new AndroidUsbTransport(native,12).connect(),/owned/);
  open.resolve(7);await opening;await setImmediate();native.openUsb=async()=>8;
  const next=new AndroidUsbTransport(native,12);await next.connect();await next.disconnect();
});
test('removal failure cannot acknowledge pending or failed native close', async () => {
  const native=new NativeFixture();const close=deferred<void>();native.closeUsb=()=>close.promise;
  const add=native.addListener.bind(native);native.addListener=((event,listener)=>{add(event,listener);return {remove(){throw new Error('remove failed')}}}) as typeof native.addListener;
  const transport=new AndroidUsbTransport(native,12);await transport.connect();
  const closing=assert.rejects(transport.disconnect(),/close failed/);native.emit('onUsbClosed',{token:7,reason:'event'});await setImmediate();
  await assert.rejects(new AndroidUsbTransport(native,12).connect(),/owned/);close.reject(new Error('close failed'));await closing;
  native.emit('onUsbClosed',{token:7,reason:'delayed repeat'});await setImmediate();await assert.rejects(new AndroidUsbTransport(native,12).connect(),/owned/);
  native.closeUsb=async()=>{};await assert.rejects(transport.disconnect(),/cleanup uncertain/);await assert.rejects(new AndroidUsbTransport(native,12).connect(),/owned/);
});
test('overflow requires explicit successful close even with matching early terminal', async () => {
  const native=new NativeFixture(); const open=deferred<number>();native.openUsb=()=>open.promise;
  const transport=new AndroidUsbTransport(native,12);const opening=assert.rejects(transport.connect(),/overflow/);await setImmediate();
  native.emit('onUsbClosed',{token:7,reason:'match'});for(let token=100;token<140;token++)native.emit('onUsbClosed',{token,reason:'other'});
  open.resolve(7);await opening;await setImmediate();await assert.rejects(new AndroidUsbTransport(native,12).connect(),/owned/);
  await transport.disconnect();assert.deepEqual(native.closes,[7]);native.openUsb=async()=>8;const next=new AndroidUsbTransport(native,12);await next.connect();await next.disconnect();
});
test('Buffer, subarray, and Uint8Array subclasses snapshot intrinsic bytes without caller hooks', async () => {
  const native=new NativeFixture();const transport=new AndroidUsbTransport(native,12);await transport.connect();
  const buffer=Buffer.from([9,1,2,8]).subarray(1,3);await transport.write(buffer);
  class HostileBytes extends Uint8Array {
    get byteLength(): number {throw new Error('byteLength hook')}
    get byteOffset(): number {throw new Error('byteOffset hook')}
    get buffer(): ArrayBuffer {throw new Error('buffer hook')}
    get [Symbol.toStringTag](): "Uint8Array" {throw new Error('tag hook')}
  }
  const input=new HostileBytes([3,4]);Object.defineProperty(input,'constructor',{get(){throw new Error('constructor hook')}});
  await transport.write(input);assert.deepEqual(native.writes,[[1,2],[3,4]]);await transport.disconnect();
});
test('oversized intrinsic view rejects before iterator, length, or species access', async () => {
  const native=new NativeFixture();const transport=new AndroidUsbTransport(native,12);await transport.connect();
  const input=new Uint8Array(525);let hooks=0;
  for(const key of ['length','buffer','byteLength','byteOffset','constructor',Symbol.iterator,Symbol.toStringTag]) Object.defineProperty(input,key,{get(){hooks++;throw new Error('hook')}});
  await assert.rejects(transport.write(input),/bounds/);assert.equal(hooks,0);assert.deepEqual(native.writes,[]);await transport.disconnect();
});
test('snapshot survives caller detaching backing buffer before native invocation', async () => {
  const native=new NativeFixture();const transport=new AndroidUsbTransport(native,12);await transport.connect();
  const input=Uint8Array.of(1,2,3);const writing=transport.write(input);structuredClone(input.buffer,{transfer:[input.buffer]});
  await writing;assert.deepEqual(native.writes,[[1,2,3]]);await transport.disconnect();
});
test('rejected native write settles its queue slot and preserves ordered remaining writes', async () => {
  const native=new NativeFixture();const gate=deferred<void>();native.writeUsb=async(_token,bytes)=>{native.writes.push(bytes);if(native.writes.length===1)await gate.promise};
  const transport=new AndroidUsbTransport(native,12);await transport.connect();const first=assert.rejects(transport.write(Uint8Array.of(0)),/write failed/);
  const rest=Array.from({length:15},(_,i)=>transport.write(Uint8Array.of(i+1)));await setImmediate();
  await assert.rejects(transport.write(Uint8Array.of(99)),/queue full/);gate.reject(new Error('write failed'));await Promise.all([first,...rest]);
  await transport.write(Uint8Array.of(16));assert.deepEqual(native.writes.map(b=>b[0]),Array.from({length:17},(_,i)=>i));await transport.disconnect();
});
