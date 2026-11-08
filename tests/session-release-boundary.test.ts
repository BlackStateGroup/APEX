import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceSession } from '../packages/core/session.ts';
import { SimulatorTransport } from '../packages/core/simulator.ts';
import { clearReleasedSession } from '../src/session-controls.ts';
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => resolve = r); return { promise, resolve }; }
test('preconnected transport remains held when listener setup throws and cleanup rejects', async () => {
  const peer = new SimulatorTransport(); await peer.connect();
  peer.onData = () => { throw new Error('Listener setup failed'); };
  let calls = 0; peer.disconnect = () => { calls++; throw new Error('Release uncertain'); };
  const session = new DeviceSession(peer); const slot = { current: session as DeviceSession | null };
  await assert.rejects(session.open(), /Listener setup failed/);
  assert.equal(calls, 1);
  assert.equal(session.transportReleasePending, true);
  assert.equal(clearReleasedSession(slot, session), false);
});
test('close must not confirm release before deferred connect can acquire transport', async () => {
  const peer = new SimulatorTransport(); const gate = deferred(); let connected = false; let calls = 0;
  peer.connect = async () => { await gate.promise; connected = true; };
  peer.disconnect = async () => { calls++; connected = false; };
  const session = new DeviceSession(peer); const opening = assert.rejects(session.open(), /closed during open/);
  await session.close(); gate.resolve(); await opening;
  assert.equal(connected, false);
  assert.equal(session.transportReleasePending, false);
  assert.equal(calls >= 1, true);
});
test('sync throwing connect and cleanup retain uncertainty and preserve original error', async () => {
  const peer = new SimulatorTransport(); const error = new Error('Sync connect');
  peer.connect = () => { throw error; }; let calls = 0;
  peer.disconnect = () => { calls++; throw new Error('Sync release'); };
  const session = new DeviceSession(peer);
  await assert.rejects(session.open(), e => e === error); assert.equal(calls, 1);
  assert.equal(session.transportReleasePending, true);
  await assert.rejects(session.close(), /Sync release/); assert.equal(calls, 2);
});
test('explicit close of preconnected new session releases exactly once', async () => {
  const peer = new SimulatorTransport(); await peer.connect(); let calls = 0;
  peer.disconnect = async () => { calls++; }; const session = new DeviceSession(peer);
  await Promise.all([session.close(), session.close()]); await session.close();
  assert.equal(calls, 1); assert.equal(session.transportReleasePending, false);
  await assert.rejects(session.open(), /reused/);
});

test('late terminal callback cannot retry successful old release or failed explicit release', async () => {
  const peer = new SimulatorTransport(); let terminal!: (e: Error) => void; let calls = 0;
  peer.onDisconnect = fn => { terminal = fn; return () => {}; };
  peer.disconnect = async () => { calls++; throw new Error('Release uncertain'); };
  const session = new DeviceSession(peer); await session.open();
  terminal(new Error('Cable lost')); await assert.rejects(session.close(), /Release uncertain/);
  terminal(new Error('Stale event')); await Promise.resolve(); assert.equal(calls, 1);
  peer.disconnect = async () => { calls++; }; await session.close();
  terminal(new Error('Stale again')); await session.close(); assert.equal(calls, 2);
  assert.equal(session.transportReleasePending, false);
});
test('terminal callback synchronously inside close joins the same attempt', async () => {
  const peer = new SimulatorTransport(); let terminal!: (e: Error) => void; let calls = 0;
  peer.onDisconnect = fn => { terminal = fn; return () => {}; };
  peer.disconnect = async () => { calls++; terminal(new Error('Closed')); };
  const session = new DeviceSession(peer); await session.open();
  await session.close(); assert.equal(calls, 1); assert.equal(session.transportReleasePending, false);
});

test('early successful disconnect keeps slot pending until late acquisition is released', async () => {
  const peer = new SimulatorTransport(); const gate = deferred(); let calls = 0;
  peer.connect = () => gate.promise;
  peer.disconnect = async () => { ++calls; };
  const session = new DeviceSession(peer); const slot = { current: session as DeviceSession | null };
  const opening = assert.rejects(session.open(), /closed during open/);
  await session.close();
  assert.equal(session.transportReleasePending, true);
  assert.equal(clearReleasedSession(slot, session), false);
  gate.resolve(); await opening;
  assert.equal(calls, 2); assert.equal(session.transportReleasePending, false);
});

test('failed early disconnect is not automatically retried after connect settles', async () => {
  const peer = new SimulatorTransport(); const gate = deferred(); let calls = 0;
  peer.connect = () => gate.promise;
  peer.disconnect = async () => { ++calls; throw new Error('Release uncertain'); };
  const session = new DeviceSession(peer);
  const opening = assert.rejects(session.open(), /closed during open/);
  await assert.rejects(session.close(), /Release uncertain/);
  gate.resolve(); await opening;
  assert.equal(calls, 1); assert.equal(session.transportReleasePending, true);
  peer.disconnect = async () => { ++calls; };
  await session.close(); assert.equal(calls, 2); assert.equal(session.transportReleasePending, false);
});

test('synchronous terminal registration prevents connect and removes late registered listener', async () => {
  const peer = new SimulatorTransport(); let connects = 0; let removes = 0; let releases = 0;
  peer.connect = async () => { ++connects; };
  peer.onData = () => () => { ++removes; throw new Error('Unsubscribe failed'); };
  peer.onDisconnect = fn => { fn(new Error('Already closed')); return () => { ++removes; }; };
  peer.disconnect = async () => { ++releases; };
  const session = new DeviceSession(peer);
  await assert.rejects(session.open(), /closed during listener setup/);
  assert.equal(connects, 0); assert.equal(removes, 2); assert.equal(releases, 1);
  assert.equal(session.transportReleasePending, false);
});

test('throwing unsubscribe does not prevent other removal, pending rejection or transport cleanup', async () => {
  const peer = new SimulatorTransport(); let removes = 0; let releases = 0;
  const data = peer.onData.bind(peer); const terminal = peer.onDisconnect.bind(peer);
  peer.onData = fn => { const remove = data(fn); return () => { remove(); ++removes; throw new Error('Listener removal failed'); }; };
  peer.onDisconnect = fn => { const remove = terminal(fn); return () => { remove(); ++removes; }; };
  const session = new DeviceSession(peer); await session.open();
  peer.write = async () => {};
  const request = assert.rejects(session.request('system.ping'), /Session closed/);
  peer.disconnect = async () => { ++releases; throw new Error('Release failed'); };
  await assert.rejects(session.close(), /Release failed/); await request;
  assert.equal(removes, 2); assert.equal(releases, 1); assert.equal(session.pendingCount, 0);
  assert.equal(session.transportReleasePending, true);
});
