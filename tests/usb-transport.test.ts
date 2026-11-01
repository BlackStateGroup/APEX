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
