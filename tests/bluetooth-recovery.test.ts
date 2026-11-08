import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverBluetooth } from '../src/bluetooth-recovery.ts';
import { BleTransport, AXP_READY } from '../packages/core/ble-transport.ts';
import { DeviceSession } from '../packages/core/session.ts';

test('Bluetooth recovery changes state only after confirmed manager shutdown', async () => {
  let release!: () => void;
  const order: string[] = [];
  const pending = recoverBluetooth(() => new Promise<void>(resolve => { release = resolve; }),
    { source: 'ble', async close() { order.push('session-close'); } }, clear => { assert.equal(clear, true); order.push('confirmed'); });
  await Promise.resolve(); assert.deepEqual(order, []);
  release(); assert.deepEqual(await pending, { sessionCleanupFailed: false });
  assert.deepEqual(order, ['confirmed', 'session-close']);
});
test('failed manager shutdown preserves session and UI ownership', async () => {
  let closes = 0; let confirms = 0;
  await assert.rejects(recoverBluetooth(async () => { throw new Error('manager busy'); },
    { source: 'ble', async close() { ++closes; } }, () => { ++confirms; }), /manager busy/);
  assert.equal(closes, 0); assert.equal(confirms, 0);
});
test('Bluetooth recovery does not close USB, simulator or absent sessions', async () => {
  for (const source of ['usb', 'host', 'simulator', null] as const) {
    let closes = 0; let confirms = 0;
    const session = source ? { source, async close() { ++closes; } } : null;
    assert.deepEqual(await recoverBluetooth(async () => {}, session, clear => { assert.equal(clear, false); ++confirms; }), { sessionCleanupFailed: false });
    assert.equal(closes, 0); assert.equal(confirms, 1);
  }
});
test('post-destruction JS cleanup failure remains distinct from native shutdown failure', async () => {
  let confirms = 0;
  assert.deepEqual(await recoverBluetooth(async () => {}, { source: 'ble', async close() { throw new Error('old handle cleanup'); } }, clear => { assert.equal(clear, true); ++confirms; }), { sessionCleanupFailed: true });
  assert.equal(confirms, 1);
});
test('real session and BLE transport close locally after simulated manager epoch invalidation', async () => {
  let available = true; let nativeDisconnects = 0; let confirmed = false;
  const transport = new BleTransport({ async connect() { return {
    mtu: 23,
    async subscribe(onBytes) { onBytes(AXP_READY); return () => {}; },
    async writeWithResponse() {},
    async disconnect() { ++nativeDisconnects; if (!available) throw new Error('Bluetooth connection belongs to an unavailable manager'); },
  }; } }, 'owned-synthetic-device');
  await transport.connect();
  const session = new DeviceSession(transport);
  const result = await recoverBluetooth(async () => { available = false; }, session, clear => { assert.equal(clear, true); confirmed = true; });
  assert.equal(confirmed, true); assert.equal(result.sessionCleanupFailed, true);
  assert.equal(session.state, 'closed'); assert.equal(nativeDisconnects, 1);
  await assert.rejects(session.request('system.ping'), /not connected/);
  await assert.rejects(transport.write(new Uint8Array([1])), /not connected/);
});
