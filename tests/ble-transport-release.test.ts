import test from 'node:test';
import assert from 'node:assert/strict';
import { BleTransport, AXP_READY } from '../packages/core/ble-transport.ts';
import type { GattConnection } from '../packages/core/ble-transport.ts';
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  let calls = 0;
  const connection: GattConnection = { mtu: 23, async subscribe(data) { data(AXP_READY); return () => {}; }, async writeWithResponse() {}, async disconnect() { calls++; } };
  const transport = new BleTransport({ connect: async () => connection }, 'synthetic', { timeoutMs: 15 });
  return { connection, transport, calls: () => calls };
}
test('failed setup retains exact connection for explicit cleanup retry', async () => {
  const p = fixture(); let calls = 0; const setupError = new Error('Subscribe failed');
  p.connection.subscribe = async () => { throw setupError; };
  p.connection.disconnect = async () => { calls++; throw new Error('Native release failed'); };
  await assert.rejects(p.transport.connect(), error => error === setupError);
  await assert.rejects(p.transport.disconnect(), /Native release failed/);
  assert.equal(calls, 2);
  p.connection.disconnect = async () => { calls++; };
  await p.transport.disconnect(); await p.transport.disconnect(); assert.equal(calls, 3);
});
test('concurrent disconnects coalesce and rejected cleanup can be retried', async () => {
  const p = fixture(); const gate = deferred<void>(); let calls = 0;
  p.connection.disconnect = () => { calls++; return gate.promise; };
  await p.transport.connect();
  const first = p.transport.disconnect(); const second = p.transport.disconnect();
  assert.equal(first, second); await tick(); assert.equal(calls, 1);
  const rejected = assert.rejects(first, /uncertain/); gate.reject(new Error('uncertain')); await rejected;
  p.connection.disconnect = async () => { calls++; }; await p.transport.disconnect(); assert.equal(calls, 2);
});
test('invalid MTU retains cleanup handle when native disconnect rejects', async () => {
  const p = fixture(); p.connection.mtu = 22; let calls = 0;
  p.connection.disconnect = async () => { calls++; throw new Error('uncertain'); };
  await assert.rejects(p.transport.connect(), /Invalid BLE MTU/);
  await assert.rejects(p.transport.disconnect(), /uncertain/); assert.equal(calls, 2);
});
test('close during pending acquisition waits then releases returned exact handle', async () => {
  const p = fixture(); const gate = deferred<GattConnection>(); let subscriptions = 0;
  p.connection.subscribe = async () => { subscriptions++; return () => {}; };
  const transport = new BleTransport({ connect: () => gate.promise }, 'late-connect');
  const opening = assert.rejects(transport.connect(), /cancelled/);
  await tick(); // Ensure acquisition was actually dispatched before cancellation.
  let released = false; const closing = transport.disconnect().then(() => { released = true; });
  await tick(); assert.equal(released, false); assert.equal(p.calls(), 0);
  gate.resolve(p.connection); await Promise.all([opening, closing]);
  assert.equal(released, true); assert.equal(p.calls(), 1); assert.equal(subscriptions, 0);
});
test('cancelled acquisition retains returned handle after failed native cleanup', async () => {
  const p = fixture(); const gate = deferred<GattConnection>(); let calls = 0;
  p.connection.disconnect = async () => { calls++; throw new Error('native cancel failed'); };
  const transport = new BleTransport({ connect: () => gate.promise }, 'late-failure');
  const opening = assert.rejects(transport.connect(), /cancelled/);
  await tick(); // Ensure acquisition was actually dispatched before cancellation.
  const closing = assert.rejects(transport.disconnect(), /native cancel failed/);
  gate.resolve(p.connection); await Promise.all([opening, closing]); assert.equal(calls, 1);
  await assert.rejects(transport.disconnect(), /native cancel failed/); assert.equal(calls, 2);
});
test('rejected acquisition without handle remains explicitly unknown', async () => {
  for (const sync of [false, true]) {
    const error = new Error('acquisition failed');
    const transport = new BleTransport({ connect() { if (sync) throw error; return Promise.reject(error); } }, 'unknown');
    await assert.rejects(transport.connect(), e => e === error);
    await assert.rejects(transport.disconnect(), /release unknown/);
    await assert.rejects(transport.disconnect(), /release unknown/);
  }
});
test('disconnect waits late subscription and ignores late READY, data and terminal events', async () => {
  const p = fixture(); const gate = deferred<() => void>(); let notify!: (b: Uint8Array) => void; let close!: (e: Error) => void; let removed = 0; let data = 0; let terminal = 0;
  p.connection.subscribe = (onData, onClose) => { notify = onData; close = onClose; return gate.promise; };
  p.transport.onData(() => { data++; }); p.transport.onDisconnect(() => { terminal++; });
  const opening = assert.rejects(p.transport.connect(), /closed/); await tick();
  let released = false; const closing = p.transport.disconnect().then(() => { released = true; });
  notify(AXP_READY); notify(Uint8Array.of(1)); close(new Error('late'));
  await tick(); assert.equal(released, false); assert.equal(p.calls(), 0);
  gate.resolve(() => { removed++; }); await Promise.all([opening, closing]);
  assert.equal(removed, 1); assert.equal(p.calls(), 1); assert.equal(data, 0); assert.equal(terminal, 0);
  await assert.rejects(p.transport.write(Uint8Array.of(1)), /not connected/);
});
test('readiness timeout does not release while native subscribe remains pending', async () => {
  const p = fixture(); const gate = deferred<() => void>(); let removed = 0;
  p.connection.subscribe = () => gate.promise;
  const opening = assert.rejects(p.transport.connect(), /readiness timed out/);
  await new Promise(resolve => setTimeout(resolve, 35)); assert.equal(p.calls(), 0);
  gate.resolve(() => { removed++; }); await opening;
  assert.equal(removed, 1); assert.equal(p.calls(), 1);
});
test('write timeout rejects caller promptly but cleanup waits raw native write settlement', async () => {
  for (const reject of [false, true]) {
    const p = fixture(); const gate = deferred<void>(); let writes = 0;
    p.connection.writeWithResponse = () => { writes++; return gate.promise; }; await p.transport.connect();
    await assert.rejects(p.transport.write(new Uint8Array(40)), /write timed out/);
    let released = false; const closing = p.transport.disconnect().then(() => { released = true; });
    await tick(); assert.equal(released, false); assert.equal(p.calls(), 0); assert.equal(writes, 1);
    if (reject) gate.reject(new Error('late native rejection')); else gate.resolve();
    await closing; assert.equal(p.calls(), 1); assert.equal(writes, 1);
  }
});
test('terminal event during native write does not certify release or start queued writes', async () => {
  const p = fixture(); const gate = deferred<void>(); let close!: (e: Error) => void; let writes = 0;
  p.connection.subscribe = async (data, onClose) => { close = onClose; data(AXP_READY); return () => {}; };
  p.connection.writeWithResponse = () => { writes++; return gate.promise; }; await p.transport.connect();
  const first = p.transport.write(new Uint8Array(40)); const second = p.transport.write(Uint8Array.of(1));
  const results = Promise.allSettled([first, second]); await tick(); close(new Error('link gone'));
  let released = false; const closing = p.transport.disconnect().then(() => { released = true; });
  await tick(); assert.equal(released, false); assert.equal(p.calls(), 0);
  gate.resolve(); await closing; assert.ok((await results).every(r => r.status === 'rejected'));
  assert.equal(writes, 1); assert.equal(p.calls(), 1);
});
test('disconnect before connect has no native effects and forbids reuse', async () => {
  let calls = 0; const transport = new BleTransport({ connect() { calls++; throw new Error('not expected'); } }, 'unused');
  await transport.disconnect(); await transport.disconnect(); await assert.rejects(transport.connect(), /cannot be reused/); assert.equal(calls, 0);
});
test('throwing unsubscribe retains subscription and native handle for explicit retry', async () => {
  const p = fixture(); let removals = 0;
  p.connection.subscribe = async data => { data(AXP_READY); return () => { removals++; if (removals === 1) throw new Error('unsubscribe failed'); }; };
  await p.transport.connect(); await assert.rejects(p.transport.disconnect(), /unsubscribe failed/);
  assert.equal(p.calls(), 0); await p.transport.disconnect(); assert.equal(removals, 2); assert.equal(p.calls(), 1);
});
test('late rejected subscribe still drains before exact handle disconnect', async () => {
  const p = fixture(); const gate = deferred<() => void>();
  p.connection.subscribe = () => gate.promise;
  const opening = assert.rejects(p.transport.connect(), /closed/); await tick();
  const closing = p.transport.disconnect(); await tick(); assert.equal(p.calls(), 0);
  gate.reject(new Error('late registration failure')); await Promise.all([opening, closing]); assert.equal(p.calls(), 1);
});
test('automatic cleanup reuses failed setup release until explicit retry', async () => {
  const p = fixture(); let calls = 0;
  p.connection.subscribe = async () => { throw new Error('setup failed'); };
  p.connection.disconnect = async () => { if (++calls === 1) throw new Error('native failed'); };
  await assert.rejects(p.transport.connect(), /setup failed/);
  await assert.rejects(p.transport.disconnect({ retryFailedCleanup: false }), /native failed/);
  await assert.rejects(p.transport.disconnect({ retryFailedCleanup: false }), /native failed/);
  assert.equal(calls, 1); await p.transport.disconnect(); assert.equal(calls, 2);
});
test('single chunk native write settling after cancellation cannot fulfill caller', async () => {
  const p = fixture(); const gate = deferred<void>();
  p.connection.writeWithResponse = () => gate.promise; await p.transport.connect();
  const writing = assert.rejects(p.transport.write(Uint8Array.of(1)), /changed/); await tick();
  const closing = p.transport.disconnect(); gate.resolve(); await Promise.all([writing, closing]); assert.equal(p.calls(), 1);
});

test('immediate cancellation skips deferred driver dispatch without claiming unknown release', async () => {
  let calls = 0; const p = fixture();
  const transport = new BleTransport({ async connect() { calls++; return p.connection; } }, 'not-dispatched');
  const opening = assert.rejects(transport.connect(), /cancelled/);
  await transport.disconnect(); await opening;
  assert.equal(calls, 0); assert.equal(p.calls(), 0); await transport.disconnect();
});
test('optional acquisition signal aborts without releasing an unresolved legacy driver call', async () => {
  const p = fixture(); const gate = deferred<GattConnection>(); let signal: AbortSignal | undefined;
  const transport = new BleTransport({ connect(_id, value) { signal = value; return gate.promise; } }, 'signal');
  const opening = assert.rejects(transport.connect(), /cancelled/); await tick();
  const closing = transport.disconnect(); assert.equal(signal?.aborted, true); assert.equal(p.calls(), 0);
  gate.resolve(p.connection); await Promise.all([opening, closing]); assert.equal(p.calls(), 1);
});
