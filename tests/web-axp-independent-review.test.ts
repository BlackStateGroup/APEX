import test from 'node:test';
import assert from 'node:assert/strict';
import { WebAxpManager } from '../src/experimental/web-axp.ts';
import { AXP_SERVICE, AXP_WRITE, AXP_NOTIFY, BleTransport } from '../packages/core/ble-transport.ts';
import { DeviceSession } from '../packages/core/session.ts';
import { makeReviewHost, deferred, tick, delay } from './helpers/web-axp-independent-host.ts';
function fixture() { const host = makeReviewHost(); const manager = new WebAxpManager({ secureContext: true, bluetooth: host.bluetooth }, { effectTimeoutMs: 30, setupTimeoutMs: 100, cleanupTimeoutMs: 20 }); return { host, manager }; }
async function acquired() { const f = fixture(); const candidate = await f.manager.chooseAccessory(); const handle = await f.manager.connect(candidate.id); return { ...f, candidate, handle }; }

test('independent: exact synchronous chooser, local handle, no eager GATT', async () => {
  const { host, manager } = fixture(); assert.deepEqual(host.calls, []);
  const choice = manager.chooseAccessory(); assert.deepEqual(host.requests, [{ filters: [{ services: [AXP_SERVICE] }] }]);
  const candidate = await choice; assert.notEqual(candidate.id, host.device.id); assert.equal(candidate.rssi, null); assert.ok(Object.isFrozen(candidate));
  const handle = await manager.connect(candidate.id); assert.deepEqual(host.calls, ['choose']); await handle.disconnect(); assert.deepEqual(host.calls, ['choose']);
});
test('independent: cancelled raw chooser keeps exclusivity until late settlement', async () => {
  const { host, manager } = fixture(); const gate = deferred<any>(); host.gates.choose = () => gate.promise;
  const choose = assert.rejects(manager.chooseAccessory(), /cancelled/); manager.cancelCurrentLease(); await choose;
  await assert.rejects(manager.chooseAccessory(), /busy/); assert.equal(manager.snapshot().rawPending, 1);
  gate.resolve(host.device); await tick(); assert.equal(manager.snapshot().state, 'idle'); assert.equal(manager.snapshot().candidate, null); assert.deepEqual(host.calls, ['choose']);
});
for (const secureContext of [false, true]) test(`independent: unavailable chooser gate ${secureContext}`, async () => {
  const manager = new WebAxpManager({ secureContext }); await assert.rejects(manager.chooseAccessory()); assert.equal(manager.snapshot().rawPending, 0);
});
test('independent: actual session negotiates and ping uses 20-byte conservative chunks', async () => {
  const { host, manager, candidate, handle } = await acquired(); await handle.disconnect();
  const selected = await manager.chooseAccessory(); const session = new DeviceSession(new BleTransport(manager, selected.id, { timeoutMs: 200 }));
  await session.open(); assert.equal(session.info?.id, 'independent'); assert.equal(session.capabilities.length, 3);
  for (const length of [0, 20, 21, 512]) { const payload = Uint8Array.from({ length }, (_, i) => i % 251); assert.deepEqual(await session.request('system.ping', payload), payload); }
  assert.ok(host.writes.every(bytes => bytes.length > 0 && bytes.length <= 20));
  assert.ok(host.calls.includes(`service:${AXP_SERVICE}`)); assert.ok(host.calls.includes(`char:${AXP_WRITE}`)); assert.ok(host.calls.includes(`char:${AXP_NOTIFY}`));
  await session.close(); assert.equal(session.transportReleasePending, false);
});
test('independent: retired old handle cannot disconnect replacement lease', async () => {
  const { host, manager, handle } = await acquired(); const unsubscribe = await handle.subscribe(() => {}, () => {}); await handle.disconnect();
  const next = await manager.chooseAccessory(); const replacement = await manager.connect(next.id); await replacement.subscribe(() => {}, () => {});
  assert.equal(host.server.connected, true); const before = host.calls.filter(x => x === 'disconnect').length;
  await handle.disconnect(); unsubscribe(); await tick(); assert.equal(host.server.connected, true); assert.equal(host.calls.filter(x => x === 'disconnect').length, before);
  await replacement.disconnect();
});
for (const phase of ['connect', `service:${AXP_SERVICE}`, `char:${AXP_WRITE}`, `char:${AXP_NOTIFY}`, 'start']) test(`independent: hung ${phase} is bounded but raw ownership persists`, async () => {
  const { host, manager, handle } = await acquired(); const gate = deferred<any>(); host.gates[phase] = () => gate.promise;
  await assert.rejects(handle.subscribe(() => {}, () => {})); assert.equal(manager.snapshot().rawPending, 1);
  await assert.rejects(handle.disconnect(), /cleanup unknown/); await assert.rejects(manager.chooseAccessory(), /busy/);
  const calls = host.calls.length;
  gate.resolve(phase === 'connect' ? host.server : phase.startsWith('service') ? host.service : phase === `char:${AXP_WRITE}` ? host.write : host.notify);
  await tick(); assert.equal(manager.snapshot().state, 'cleanup-unknown');
  assert.ok(host.calls.slice(calls).every(x => x === 'disconnect' || x === 'stop' || x.startsWith('remove:') || x.startsWith('device-remove:')));
  await manager.retryCleanup(); assert.equal(manager.snapshot().state, 'idle');
});
test('independent: preconnected foreign GATT is not disconnected', async () => {
  const { host, handle } = await acquired(); host.server.connected = true;
  await assert.rejects(handle.subscribe(() => {}, () => {}), /outside/); await handle.disconnect(); assert.equal(host.server.connected, true); assert.ok(!host.calls.includes('disconnect'));
});
test('independent: notification uses intrinsic offset and immutable copied bytes', async () => {
  const { host, handle } = await acquired(); const seen: Uint8Array[] = []; await handle.subscribe(bytes => seen.push(bytes), () => {});
  const backing = host.emit(new Uint8Array([1, 2, 3]), 7); backing.fill(8); assert.deepEqual(seen.at(-1), new Uint8Array([1, 2, 3]));
  const value = new DataView(new Uint8Array([4, 5, 6]).buffer); Object.defineProperties(value, { byteLength: { value: 9000 }, byteOffset: { value: 100 }, buffer: { value: null } }); host.notify.value = value;
  for (const listener of host.listeners.get('characteristicvaluechanged')!) listener({ target: host.notify }); assert.deepEqual(seen.at(-1), new Uint8Array([4, 5, 6])); await handle.disconnect();
});
test('independent: DeviceSession keeps releasePending across hung write and explicit retry', async () => {
  const { host, manager } = fixture(); const candidate = await manager.chooseAccessory(); const session = new DeviceSession(new BleTransport(manager, candidate.id, { timeoutMs: 200 })); await session.open();
  const gate = deferred<any>(); host.gates.write = () => gate.promise;
  await assert.rejects(session.request('system.ping', new Uint8Array([1]))); await delay(30); assert.equal(session.transportReleasePending, true);
  gate.resolve(undefined); await tick(); assert.equal(session.transportReleasePending, true); await session.close(); assert.equal(session.transportReleasePending, false);
});
for (const phase of ['connect', `service:${AXP_SERVICE}`, `char:${AXP_WRITE}`, `char:${AXP_NOTIFY}`, 'start']) test(`independent: rejected ${phase} retires without later discovery`, async () => {
  const { host, manager, handle } = await acquired(); host.gates[phase] = () => Promise.reject(new Error('injected rejection'));
  await assert.rejects(handle.subscribe(() => {}, () => {})); await handle.disconnect(); assert.equal(manager.snapshot().state, 'idle'); assert.equal(host.server.connected, false);
});
for (const size of [0, 513]) test(`independent: notification bound ${size} fails closed`, async () => {
  const { host, handle } = await acquired(); let closed = 0; let received = 0; await handle.subscribe(() => received++, () => closed++);
  const before = received; host.emit(new Uint8Array(size)); assert.equal(received, before); assert.equal(closed, 1); await handle.disconnect();
});
for (const kind of ['shared', 'resizable']) test(`independent: ${kind} notification backing rejected`, async () => {
  const { host, handle } = await acquired(); let closed = 0; await handle.subscribe(() => {}, () => closed++);
  host.notify.value = new DataView(kind === 'shared' ? new SharedArrayBuffer(3) : new ArrayBuffer(3, { maxByteLength: 10 }));
  for (const listener of host.listeners.get('characteristicvaluechanged')!) listener({ target: host.notify }); assert.equal(closed, 1); await handle.disconnect();
});
test('independent: pending startup can deliver READY but cannot write before startup settles', async () => {
  const { host, handle } = await acquired(); const gate = deferred<any>(); host.gates.start = () => { host.emit(new TextEncoder().encode('AXP_READY')); return gate.promise; };
  let received = 0; const subscribing = handle.subscribe(() => received++, () => {}); await tick(); assert.equal(received, 1);
  await assert.rejects(handle.writeWithResponse(new Uint8Array([1]))); assert.equal(host.writes.length, 0); gate.resolve(host.notify); await subscribing; await handle.disconnect();
});
test('independent: hanging notification stop retains poison until explicit retry', async () => {
  const { host, manager, handle } = await acquired(); const unsubscribe = await handle.subscribe(() => {}, () => {}); const gate = deferred<any>(); host.gates.stop = () => gate.promise;
  unsubscribe(); await assert.rejects(handle.disconnect(), /cleanup unknown/); assert.equal(host.listeners.get('characteristicvaluechanged')!.size, 0); assert.equal(host.server.connected, false);
  gate.resolve(host.notify); await tick(); assert.equal(manager.snapshot().state, 'cleanup-unknown'); await manager.retryCleanup(); assert.equal(manager.snapshot().state, 'idle'); assert.equal(host.calls.filter(x => x === 'stop').length, 1);
});
test('independent: observer cancellation at reservation cannot trigger acquisition', async () => {
  const { host, manager } = fixture(); const candidate = await manager.chooseAccessory(); manager.observe(snapshot => { if (snapshot.state === 'reserved') manager.cancelCurrentLease(); throw new Error('observer'); });
  const handle = await manager.connect(candidate.id); await assert.rejects(handle.subscribe(() => {}, () => {})); await handle.disconnect(); assert.deepEqual(host.calls, ['choose']);
});
test('independent: stale local candidate failure handle cannot affect active owner', async () => {
  const { host, manager, handle } = await acquired(); await handle.subscribe(() => {}, () => {}); const invalid = await manager.connect('stale-id'); await assert.rejects(invalid.subscribe(() => {}, () => {})); await invalid.disconnect(); assert.equal(host.server.connected, true); await handle.disconnect();
});
test('independent: saved old disconnect listener cannot fence same-device replacement', async () => {
  const { host, manager, handle } = await acquired(); await handle.subscribe(() => {}, () => {}); const old = [...host.deviceListeners.get('gattserverdisconnected')!][0]!; await handle.disconnect();
  const candidate = await manager.chooseAccessory(); const next = await manager.connect(candidate.id); await next.subscribe(() => {}, () => {}); old({ target: host.device }); assert.equal(manager.snapshot().state, 'active'); assert.equal(host.server.connected, true); await next.disconnect();
});
test('independent: disconnected characteristics do not require impossible stop call', async () => {
  const { host, manager, handle } = await acquired(); await handle.subscribe(() => {}, () => {});
  host.gates.stop = () => host.server.connected ? Promise.resolve(host.notify) : Promise.reject(new Error('InvalidStateError: disconnected characteristic'));
  await handle.disconnect(); assert.equal(manager.snapshot().state, 'idle');
});
test('independent: cleanup observer reentry joins one retirement', async () => {
  const { host, manager, handle } = await acquired(); await handle.subscribe(() => {}, () => {}); let reentered: Promise<void> | undefined;
  manager.observe(snapshot => { if (snapshot.state === 'closing' && !reentered) { reentered = Promise.resolve(); reentered = manager.retryCleanup(); } });
  const closing = handle.disconnect(); await closing; await reentered; assert.equal(manager.snapshot().state, 'idle'); assert.ok(host.calls.filter(x => x === 'stop').length <= 1);
});
for (const phase of ['connect', `service:${AXP_SERVICE}`, `char:${AXP_WRITE}`, `char:${AXP_NOTIFY}`, 'start']) test(`independent: immediate cancellation fences pending ${phase}`, async () => {
  const { host, manager, handle } = await acquired(); const gate = deferred<any>(); host.gates[phase] = () => gate.promise;
  const subscribing = assert.rejects(handle.subscribe(() => {}, () => {})); await tick(); manager.cancelCurrentLease(); await subscribing;
  assert.equal(host.server.connected, false); const cleanup = assert.rejects(handle.disconnect()); await cleanup;
  gate.reject(new Error('late failure')); await tick(); await manager.retryCleanup(); assert.equal(manager.snapshot().state, 'idle');
});
test('independent: chooser denial releases local ownership without GATT', async () => {
  const { host, manager } = fixture(); host.gates.choose = () => Promise.reject(new Error('NotAllowedError')); await assert.rejects(manager.chooseAccessory()); assert.equal(manager.snapshot().state, 'idle'); assert.deepEqual(host.calls, ['choose']);
});
test('independent: notification length 512 is accepted and copied exactly', async () => {
  const { host, handle } = await acquired(); let seen: Uint8Array | undefined; await handle.subscribe(bytes => { seen = bytes; }, () => {});
  const payload = Uint8Array.from({ length: 512 }, (_, i) => i & 255); host.emit(payload, 13); assert.deepEqual(seen, payload); await handle.disconnect();
});
test('independent: public connection is opaque and manager has no release bypass', async () => {
  const { manager, handle } = await acquired(); assert.deepEqual(Object.keys(handle).sort(), ['disconnect', 'mtu', 'subscribe', 'writeWithResponse']); assert.ok(Object.isFrozen(handle));
  assert.equal('released' in manager, false); assert.equal('changed' in manager, false); await handle.disconnect();
});
test('independent: later acquisition discovers fresh characteristic objects', async () => {
  const { host, manager, handle } = await acquired(); await handle.subscribe(() => {}, () => {}); await handle.disconnect();
  let newWrites = 0; const freshWrite = { ...host.write, writeValueWithResponse: async () => { newWrites++; } }; const freshNotify = { ...host.notify, startNotifications: async () => freshNotify, stopNotifications: async () => freshNotify };
  host.gates[`char:${AXP_WRITE}`] = async () => freshWrite; host.gates[`char:${AXP_NOTIFY}`] = async () => freshNotify;
  const candidate = await manager.chooseAccessory(); const next = await manager.connect(candidate.id); await next.subscribe(() => {}, () => {}); await next.writeWithResponse(new Uint8Array([1])); assert.equal(newWrites, 1); await next.disconnect();
});
for (const missing of ['write', 'writeMethod', 'notify']) test(`independent: missing ${missing} capability refuses startup`, async () => {
  const { host, handle } = await acquired(); if (missing === 'write') host.write.properties.write = false; else if (missing === 'writeMethod') delete host.write.writeValueWithResponse; else host.notify.properties.notify = false;
  await assert.rejects(handle.subscribe(() => {}, () => {})); assert.ok(!host.calls.includes('start')); await handle.disconnect();
});
test('independent: late raw connect reopening own host is disconnected without discovery', async () => {
  const { host, manager, handle } = await acquired(); const gate = deferred<any>(); host.gates.connect = () => gate.promise;
  const subscribing = assert.rejects(handle.subscribe(() => {}, () => {})); await tick(); manager.cancelCurrentLease(); await subscribing; await assert.rejects(handle.disconnect());
  host.server.connected = true; gate.resolve(host.server); await tick(); assert.equal(host.server.connected, false); assert.ok(!host.calls.some(x => x.startsWith('service:'))); await manager.retryCleanup();
});
test('independent: disconnect failure retains lease and explicit retry verifies release', async () => {
  const { host, manager, handle } = await acquired(); await handle.subscribe(() => {}, () => {}); host.gates.disconnect = () => { throw new Error('disconnect failed'); };
  await assert.rejects(handle.disconnect()); assert.equal(manager.snapshot().state, 'cleanup-unknown'); assert.equal(host.server.connected, true); await assert.rejects(manager.chooseAccessory(), /busy/);
  delete host.gates.disconnect; await manager.retryCleanup(); assert.equal(manager.snapshot().state, 'idle'); assert.equal(host.server.connected, false);
});
test('independent: throwing byte and close callbacks do not prevent cleanup', async () => {
  const { host, manager, handle } = await acquired(); await handle.subscribe(() => { throw new Error('bytes callback'); }, () => { throw new Error('closed callback'); }); host.drop(); await handle.disconnect(); assert.equal(manager.snapshot().state, 'idle'); assert.equal(host.listeners.get('characteristicvaluechanged')!.size, 0);
});
test('independent delta: selected cancellation removes candidate without browser effects', async () => {
  const { host, manager } = fixture(); const candidate = await manager.chooseAccessory(); const before = [...host.calls]; manager.cancelCurrentLease();
  assert.deepEqual(manager.snapshot(), { state: 'idle', candidate: null, rawPending: 0, error: null }); assert.deepEqual(host.calls, before);
  const stale = await manager.connect(candidate.id); await assert.rejects(stale.subscribe(() => {}, () => {})); await stale.disconnect(); assert.deepEqual(host.calls, before);
});
test('independent delta: selected cancel observer may choose and reserve newer candidate', async () => {
  const { host, manager } = fixture(); const old = await manager.chooseAccessory(); let replacement: Promise<Readonly<{id: string}>> | undefined;
  const stop = manager.observe(snapshot => { if (snapshot.state === 'idle' && !replacement) { replacement = Promise.resolve({id: 'sentinel'}); replacement = manager.chooseAccessory(); } });
  manager.cancelCurrentLease(); const next = await replacement!; assert.notEqual(next.id, old.id); assert.equal(manager.snapshot().candidate?.id, next.id);
  const handle = await manager.connect(next.id); assert.equal(manager.snapshot().state, 'reserved'); stop(); await handle.disconnect(); assert.deepEqual(host.calls, ['choose', 'choose']);
});
test('independent delta: cancellation reentered from selected notification cannot restore stale candidate', async () => {
  const { host, manager } = fixture(); manager.observe(snapshot => { if (snapshot.state === 'selected') manager.cancelCurrentLease(); });
  const selected = await manager.chooseAccessory(); assert.equal(manager.snapshot().state, 'idle'); assert.equal(manager.snapshot().candidate, null);
  const handle = await manager.connect(selected.id); await assert.rejects(handle.subscribe(() => {}, () => {})); await handle.disconnect(); assert.deepEqual(host.calls, ['choose']);
});
