import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceSession } from '../packages/core/session.ts';
import { BleTransport, AXP_READY } from '../packages/core/ble-transport.ts';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('rejected cleanup remains visible across BLE setup and session catch', async () => {
  let releases = 0;
  const transport = new BleTransport({ connect: async () => ({
    mtu: 23,
    subscribe: async data => { data(AXP_READY); throw new Error('Subscribe failed'); },
    writeWithResponse: async () => {},
    disconnect: async () => { releases++; throw new Error('Native release failed'); },
  }) }, 'synthetic');
  const session = new DeviceSession(transport);
  await assert.rejects(session.open(), /Subscribe failed/);
  assert.equal(releases, 1);
  assert.equal(session.transportReleasePending, true);
  await assert.rejects(session.close(), /Native release failed/);
  assert.equal(releases, 2);
  assert.equal(session.transportReleasePending, true);
});

test('terminal callback and connect catch never retry failed release before explicit close', async () => {
  let terminal!: (error: Error) => void;
  let releases = 0;
  const transport = new BleTransport({ connect: async () => ({
    mtu: 23,
    subscribe: async (_data, closed) => { terminal = closed; closed(new Error('Terminal during setup')); return () => {}; },
    writeWithResponse: async () => {},
    disconnect: async () => { if (++releases === 1) throw new Error('Release uncertain'); },
  }) }, 'synthetic');
  const session = new DeviceSession(transport);
  await assert.rejects(session.open(), /Terminal during setup/);
  assert.equal(releases, 1);
  terminal(new Error('Stale terminal')); await tick();
  assert.equal(releases, 1); assert.equal(session.transportReleasePending, true);
  await Promise.all([session.close(), session.close()]);
  assert.equal(releases, 2); assert.equal(session.transportReleasePending, false);
});
