import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceSession } from '../packages/core/session.ts';
import { BleTransport, AXP_READY } from '../packages/core/ble-transport.ts';
import type { GattConnection } from '../packages/core/ble-transport.ts';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }

test('failed automatic BLE setup release waits for explicit session close before retry', async () => {
  let calls = 0;
  const transport = new BleTransport({ connect: async () => ({
    mtu: 23,
    subscribe: async data => { data(AXP_READY); throw new Error('Setup failed'); },
    writeWithResponse: async () => {},
    disconnect: async () => { if (++calls === 1) throw new Error('Native failed'); },
  }) }, 'synthetic');
  const session = new DeviceSession(transport);
  await assert.rejects(session.open(), /Setup failed/);
  assert.equal(calls, 1); assert.equal(session.transportReleasePending, true);
  await session.close(); assert.equal(calls, 2); assert.equal(session.transportReleasePending, false);
});
test('combined session cancellation waits late BLE handle without recursive deadlock', async () => {
  const gate = deferred<GattConnection>(); let calls = 0;
  const transport = new BleTransport({ connect: () => gate.promise }, 'synthetic');
  const session = new DeviceSession(transport);
  const opening = assert.rejects(session.open(), /cancelled/); const closing = session.close(); await tick();
  assert.equal(session.transportReleasePending, true);
  gate.resolve({ mtu: 23, subscribe: async () => { throw new Error('Must not subscribe'); },
    writeWithResponse: async () => {}, disconnect: async () => { calls++; } });
  await Promise.all([opening, closing]); assert.equal(calls, 1); assert.equal(session.transportReleasePending, false);
});
test('combined session no-handle BLE acquisition rejection stays pending through explicit retry', async () => {
  const transport = new BleTransport({ connect: async () => { throw new Error('Driver failure'); } }, 'synthetic');
  const session = new DeviceSession(transport);
  await assert.rejects(session.open(), /Driver failure/); assert.equal(session.transportReleasePending, true);
  await assert.rejects(session.close(), /release unknown/); assert.equal(session.transportReleasePending, true);
});
test('terminal callback inside subscribe waits raw registration and releases once', async () => {
  const subscription = deferred<() => void>(); let removes = 0; let calls = 0;
  const transport = new BleTransport({ connect: async () => ({
    mtu: 23,
    subscribe: (data, closed) => { data(AXP_READY); closed(new Error('Terminal')); return subscription.promise; },
    writeWithResponse: async () => {}, disconnect: async () => { calls++; },
  }) }, 'synthetic');
  const session = new DeviceSession(transport); const opening = assert.rejects(session.open(), /closed/); await tick();
  assert.equal(session.transportReleasePending, true); assert.equal(calls, 0);
  subscription.resolve(() => { removes++; }); await opening;
  assert.equal(calls, 1); assert.equal(removes, 1); assert.equal(session.transportReleasePending, false);
});
