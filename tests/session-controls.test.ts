import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DeviceSession } from '../packages/core/session.ts';
import { SimulatorTransport } from '../packages/core/simulator.ts';
import { clearReleasedSession, sessionControls } from '../src/session-controls.ts';

test('closed session remains explicitly releasable after capabilities disappear', async () => {
  const transport = new SimulatorTransport();
  let closed!: (error: Error) => void;
  const session = new DeviceSession({ source: 'simulator',
    connect: () => transport.connect(), disconnect: () => transport.disconnect(),
    write: bytes => transport.write(bytes), onData: listener => transport.onData(listener),
    onDisconnect(listener) { closed = listener; return () => {}; },
  });
  await session.open();
  assert.equal(session.capabilities.length, 3);
  assert.deepEqual(sessionControls(session), { held: true, closed: false });
  closed(new Error('Synthetic transport loss'));
  assert.equal(session.capabilities.length, 0);
  assert.deepEqual(sessionControls(session), { held: true, closed: true });
  await session.close();
  // Closing the object does not itself clear an App reference to that object.
  assert.equal(sessionControls(session).held, true);
  assert.deepEqual(sessionControls(null), { held: false, closed: false });
});

test('new and opening sessions with no capabilities still own their UI slot', () => {
  for (const state of ['new', 'opening', 'open', 'closed'] as const) {
    assert.deepEqual(sessionControls({ state }), { held: true, closed: state === 'closed' });
  }
});

test('failed-open UI slot survives uncertainty but clears after explicit release', () => {
  const failed = { transportReleasePending: true };
  const slot = { current: failed as typeof failed | null };
  assert.equal(clearReleasedSession(slot, failed), false);
  assert.equal(slot.current, failed);
  assert.equal(sessionControls(new DeviceSession(new SimulatorTransport())).held, true);
  failed.transportReleasePending = false;
  assert.equal(clearReleasedSession(slot, failed), true);
  assert.equal(slot.current, null);
});

test('clean failed open clears its slot but stale cleanup cannot clear a newer session', () => {
  const old = { transportReleasePending: false }; const next = { transportReleasePending: true };
  const slot = { current: old as typeof old | null };
  assert.equal(clearReleasedSession(slot, old), true);
  slot.current = next;
  assert.equal(clearReleasedSession(slot, old), false);
  assert.equal(slot.current, next);
});

test('App retention helper keeps a real failed session through failed retry', async () => {
  const transport = new SimulatorTransport();
  transport.connect = async () => { throw new Error('Open refused'); };
  transport.disconnect = async () => { throw new Error('Release failed'); };
  const failed = new DeviceSession(transport);
  const slot: { current: DeviceSession | null } = { current: failed };
  await assert.rejects(failed.open(), /Open refused/);
  assert.equal(clearReleasedSession(slot, failed), false);
  assert.deepEqual(sessionControls(slot.current), { held: true, closed: true });
  await assert.rejects(failed.close(), /Release failed/);
  assert.equal(clearReleasedSession(slot, failed), false);
  transport.disconnect = async () => {};
  await failed.close();
  assert.equal(clearReleasedSession(slot, failed), true);
  assert.deepEqual(sessionControls(slot.current), { held: false, closed: false });
});

// Source copy assertions only, not mounted React or native release validation.
test('App local session wording does not claim uncertain native cleanup completed', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(source, /No active APEX session/);
  assert.match(source, /This session is closed locally/);
  assert.match(source, /Failed USB cleanup can remain blocked/);
  assert.doesNotMatch(source, /No device connected|This session has disconnected/);
});
