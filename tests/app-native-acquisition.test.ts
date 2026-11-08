// Actual App handler/effect source execution with real DeviceSession and software
// transport doubles. Not a mounted React app, native module, browser or radio test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './support/app-acquisition.ts';
import { DeviceSession } from '../packages/core/session.ts';
import { SimulatorTransport } from '../packages/core/simulator.ts';
import type { ByteTransport } from '../packages/core/transport.ts';
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
function transport() {
  const peer = new SimulatorTransport();
  const calls: string[] = [];
  const callbacks: ((error: Error) => void)[] = [];
  let closeDelay: Promise<void> | null = null;
  let openDelay: Promise<void> | null = null;
  const value: ByteTransport = {
    source: 'usb',
    async connect() { calls.push('connect'); if (openDelay) await openDelay; await peer.connect(); },
    write: bytes => peer.write(bytes),
    async disconnect() { calls.push('disconnect'); if (closeDelay) await closeDelay; await peer.disconnect(); },
    onData: callback => peer.onData(callback),
    onDisconnect(callback) { calls.push('listen'); callbacks.push(callback); return peer.onDisconnect(callback); },
  };
  return { value, calls, callbacks, delayClose(p: Promise<void>) { closeDelay = p; }, delayOpen(p: Promise<void>) { openDelay = p; } };
}

test('native detached retained run does not invoke an action or publish state', async () => {
  const h = harness(); h.unmount(); const t = transport();
  await h.run(() => h.connect(t.value));
  assert.deepEqual(t.calls, []); assert.deepEqual(h.writes, []); assert.equal(h.env.session.current, null);
});

test('native prior-close wait cannot acquire after unmount cleanup has already run', async () => {
  const h = harness(); const old = transport(); const next = transport();
  const previous = new DeviceSession(old.value); await previous.open(); h.env.session.current = previous;
  const closing = deferred(); old.delayClose(closing.promise);
  const work = h.run(() => h.connect(next.value)); await turn();
  h.unmount(); const writes = h.writes.length; closing.resolve(); await work;
  // Keep failure runs tidy too, without hiding the leaked acquisition assertion.
  const leaked = h.env.session.current;
  try {
    assert.equal(next.calls.includes('connect'), false);
    assert.equal(h.env.session.current, previous); assert.equal(h.writes.length, writes);
  } finally { await leaked?.close(); }
});

test('direct retained connect is inert before removing the existing listener', async () => {
  const h = harness(); h.env.attached.current = false; const t = transport();
  let removed = 0; h.env.disconnectListener.current = () => { removed++; };
  await h.connect(t.value);
  assert.equal(removed, 0); assert.deepEqual(t.calls, []); assert.deepEqual(h.writes, []);
});

for (const invalidation of ['remount', 'operation', 'session'] as const) {
  test(`prior-close continuation is inert after ${invalidation} replacement`, async () => {
    const h = harness(); const old = transport(); const next = transport();
    const previous = new DeviceSession(old.value); await previous.open(); h.env.session.current = previous;
    const closing = deferred(); old.delayClose(closing.promise);
    const work = h.run(() => h.connect(next.value)); await turn();
    const replacement = new DeviceSession(new SimulatorTransport());
    if (invalidation === 'remount') { h.unmount(); h.env.attached.current = true; ++h.env.mountEpoch.current; }
    if (invalidation === 'operation') h.env.operation.current = {};
    if (invalidation === 'session') h.env.session.current = replacement;
    closing.resolve(); await work;
    assert.deepEqual(next.calls, []);
    assert.equal(h.env.session.current, invalidation === 'session' ? replacement : previous);
    if (invalidation === 'operation') { assert.notEqual(h.env.operation.current, null); assert.equal(h.env.lock.current, true); }
  });
}

test('normal native replacement negotiates and run lock excludes duplicate acquisition', async () => {
  const h = harness(); const old = transport(); const next = transport(); const duplicate = transport();
  const previous = new DeviceSession(old.value); await previous.open(); h.env.session.current = previous;
  const closing = deferred(); old.delayClose(closing.promise);
  const work = h.run(() => h.connect(next.value));
  await h.run(() => h.connect(duplicate.value)); assert.deepEqual(duplicate.calls, []);
  closing.resolve(); await work;
  assert.equal(h.env.session.current?.state, 'open'); assert.notEqual(h.env.session.current, previous);
  assert.equal(h.env.lock.current, false); assert.equal(h.env.operation.current, null);
  assert.ok(h.writes.some(values => String(values).includes('Connected:')));
  // The App listener must remain usable after run has released its token.
  const count = h.writes.length; next.callbacks[0]!(new Error('live disconnect'));
  assert.ok(h.writes.length > count);
  h.unmount(); await turn(); assert.equal(h.env.session.current?.transportReleasePending, false);
});

test('uncertain prior cleanup retains exact session and prevents replacement', async () => {
  const h = harness(); const old = transport(); const next = transport();
  const previous = new DeviceSession(old.value); await previous.open(); h.env.session.current = previous;
  const closing = deferred(); old.delayClose(closing.promise);
  const work = h.run(() => h.connect(next.value)); closing.reject(new Error('unknown release')); await work;
  assert.equal(h.env.session.current, previous); assert.equal(previous.transportReleasePending, true);
  assert.deepEqual(next.calls, []); assert.equal(h.env.lock.current, false);
  old.delayClose(Promise.resolve()); await previous.close();
});

test('unmount during native open retains cleanup ownership and suppresses late callbacks/publication', async () => {
  const h = harness(); const next = transport(); const opening = deferred(); next.delayOpen(opening.promise);
  const work = h.run(() => h.connect(next.value)); await turn();
  const selected = h.env.session.current!; assert.equal(selected.state, 'opening');
  h.unmount(); const count = h.writes.length;
  next.callbacks[0]!(new Error('retained callback after detach'));
  opening.resolve(); await work; await turn();
  assert.equal(h.env.session.current, selected); assert.equal(selected.state, 'closed');
  assert.equal(selected.transportReleasePending, false); assert.ok(next.calls.includes('disconnect'));
  assert.equal(h.writes.length, count); assert.equal(h.env.lock.current, false);
});

for (const invalidation of ['detach', 'remount', 'operation'] as const) {
  test(`run rejection cannot publish to ${invalidation} successor`, async () => {
    const h = harness(); const action = deferred(); const work = h.run(() => action.promise);
    if (invalidation === 'operation') h.env.operation.current = {};
    else { h.unmount(); if (invalidation === 'remount') { h.env.attached.current = true; ++h.env.mountEpoch.current; } }
    const count = h.writes.length; action.reject(new Error('stale error')); await work;
    assert.equal(h.writes.length, count);
    assert.equal(h.env.lock.current, invalidation === 'operation');
  });
}

test('connected callback cannot publish after same-object remount or session replacement', async () => {
  const h = harness(); const next = transport(); await h.run(() => h.connect(next.value));
  const selected = h.env.session.current!;
  h.env.session.current = new DeviceSession(new SimulatorTransport());
  let count = h.writes.length; next.callbacks[0]!(new Error('old session')); assert.equal(h.writes.length, count);
  h.env.session.current = selected; ++h.env.mountEpoch.current;
  count = h.writes.length; next.callbacks[0]!(new Error('old mount')); assert.equal(h.writes.length, count);
  await selected.close();
});

test('explicit native cancellation during prior close prevents new acquisition and retains original lock', async () => {
  const h = harness(); const old = transport(); const next = transport();
  const previous = new DeviceSession(old.value); await previous.open(); h.env.session.current = previous;
  const closing = deferred(); old.delayClose(closing.promise);
  const work = h.run(() => h.connect(next.value)); await turn();
  h.cancelAcquisition?.(h.env.acquisition.current);
  assert.equal(h.env.lock.current, true);
  closing.resolve(); await work;
  const leaked = h.env.session.current;
  try { assert.equal(next.calls.includes('connect'), false); assert.equal(h.env.session.current, null); }
  finally { await leaked?.close(); }
});

test('cancel after acquisition stops negotiation, is idempotent, and drains close before unlocking', async () => {
  const h = harness(); const t = transport(); const opening = deferred(); const closing = deferred();
  t.delayOpen(opening.promise); t.delayClose(closing.promise);
  const work = h.run(() => h.connect(t.value)); await turn();
  const selected = h.env.session.current!; const attempt = h.env.acquisition.current;
  h.cancelAcquisition!(attempt); h.cancelAcquisition!(attempt);
  await turn(); assert.equal(selected.state, 'closed'); assert.equal(h.env.lock.current, true);
  assert.equal(t.calls.filter(x => x === 'disconnect').length, 1);
  opening.resolve(); await turn(); assert.equal(h.env.lock.current, true);
  closing.resolve(); await work;
  assert.equal(h.env.session.current, null); assert.equal(h.env.acquisition.current, null);
  assert.equal(h.env.lock.current, false);
  assert.equal(h.writes.some(values => String(values).includes('Connected:')), false);
});

test('failed cancellation retains ownership until explicit later Disconnect retry', async () => {
  const h = harness(); const t = transport(); const opening = deferred(); const closing = deferred();
  t.delayOpen(opening.promise); t.delayClose(closing.promise);
  const work = h.run(() => h.connect(t.value)); await turn();
  const selected = h.env.session.current!;
  h.cancelAcquisition!(h.env.acquisition.current); await turn();
  closing.reject(new Error('release unconfirmed')); opening.resolve(); await work;
  assert.equal(h.env.session.current, selected); assert.equal(selected.transportReleasePending, true);
  assert.equal(t.calls.filter(x => x === 'disconnect').length, 1);
  assert.equal(h.env.lock.current, false);
  assert.ok(h.writes.some(values => String(values).includes('release is still unconfirmed')));
  t.delayClose(Promise.resolve()); await h.run(h.disconnect);
  assert.equal(h.env.session.current, null);
  assert.equal(t.calls.filter(x => x === 'disconnect').length, 2);
});

for (const invalidation of ['detach', 'remount', 'operation', 'session', 'successor'] as const) {
  test('stale cancel handler cannot affect ' + invalidation, async () => {
    const h = harness(); const t = transport(); const opening = deferred(); t.delayOpen(opening.promise);
    const work = h.run(() => h.connect(t.value)); await turn();
    const attempt = h.env.acquisition.current; const selected = h.env.session.current!;
    const replacement = new DeviceSession(new SimulatorTransport());
    if (invalidation === 'detach') h.env.attached.current = false;
    if (invalidation === 'remount') ++h.env.mountEpoch.current;
    if (invalidation === 'operation') h.env.operation.current = {};
    if (invalidation === 'session') h.env.session.current = replacement;
    if (invalidation === 'successor') h.env.acquisition.current = {};
    const count = h.writes.length;
    h.cancelAcquisition!(attempt);
    assert.equal(attempt.cancelled, false); assert.equal(selected.state, 'opening');
    assert.equal(h.writes.length, count); assert.equal(replacement.state, 'new');
    opening.resolve(); await work; await selected.close();
  });
}

test('old cancelled handle cannot close a later successful session', async () => {
  const h = harness(); const t = transport(); const gate = deferred(); t.delayOpen(gate.promise);
  const work = h.run(() => h.connect(t.value)); await turn(); const old = h.env.acquisition.current;
  h.cancelAcquisition!(old); gate.resolve(); await work;
  await h.run(() => h.connect(new SimulatorTransport()));
  const next = h.env.session.current!; const count = h.writes.length;
  h.cancelAcquisition!(old); assert.equal(next.state, 'open'); assert.equal(h.writes.length, count);
  await h.run(h.disconnect);
});

test('reentrant cancellation at clearSession prevents creating the next session', async () => {
  let h: ReturnType<typeof harness>;
  let reentered = false;
  h = harness({ clearSession() {
    if (!reentered) { reentered = true; h.cancelAcquisition!(h.env.acquisition.current); }
  } });
  const t = transport(); await h.run(() => h.connect(t.value));
  assert.equal(reentered, true); assert.deepEqual(t.calls, []);
  assert.equal(h.env.session.current, null); assert.equal(h.env.lock.current, false);
});

test('reentrant cancellation from listener registration prevents native acquisition', async () => {
  const h = harness(); const t = transport(); const original = t.value.onDisconnect;
  t.value.onDisconnect = callback => {
    const off = original(callback); h.cancelAcquisition!(h.env.acquisition.current); return off;
  };
  await h.run(() => h.connect(t.value));
  assert.equal(t.calls.includes('connect'), false);
  assert.equal(h.env.session.current, null); assert.equal(h.env.lock.current, false);
});

test('cancel cleanup cannot clear or close session replaced during drain', async () => {
  const h = harness(); const t = transport(); const opening = deferred(); const closing = deferred();
  t.delayOpen(opening.promise); t.delayClose(closing.promise);
  const work = h.run(() => h.connect(t.value)); await turn();
  const old = h.env.acquisition.current; h.cancelAcquisition!(old);
  const replacement = new DeviceSession(new SimulatorTransport()); await replacement.open();
  h.env.session.current = replacement;
  h.cancelAcquisition!(old); opening.resolve(); closing.resolve(); await work;
  assert.equal(h.env.session.current, replacement); assert.equal(replacement.state, 'open');
  await replacement.close();
});

test('completed open retires cancellation handle before yielding finalization', async () => {
  let h: ReturnType<typeof harness>;
  let retained: any;
  h = harness({ setCaps() {
    retained = h.env.acquisition.current;
    queueMicrotask(() => h.cancelAcquisition!(retained));
  } });
  const t = transport(); const closing = deferred(); t.delayClose(closing.promise);
  const work = h.run(() => h.connect(t.value)); await work; await turn();
  try {
    assert.equal(retained.cancelled, false);
    assert.equal(h.env.session.current?.state, 'open');
    assert.equal(t.calls.includes('disconnect'), false);
  } finally { closing.resolve(); await h.env.session.current?.close(); }
});
