// Synthetic host-only fixtures. No navigator, browser, radio, permissions, or hardware calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebAxpManager } from '../src/experimental/web-axp.ts';
import type { WebAxpCharacteristic, WebAxpDevice, WebAxpServer, WebAxpHost } from '../src/experimental/web-axp.ts';
import { AXP_SERVICE, AXP_WRITE, AXP_NOTIFY, AXP_READY, BleTransport } from '../packages/core/ble-transport.ts';
import { DeviceSession } from '../packages/core/session.ts';
import { encode, FrameDecoder, Kind, Opcode, utf8 } from '../packages/protocol/index.ts';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  const calls: string[] = []; const chunks: Uint8Array[] = [];
  const values = new Set<() => void>(); const disconnected = new Set<() => void>();
  const phases = new Map<string, () => Promise<unknown>>();
  let value: DataView | null = null; let connected = false; let ready = true;
  const run = async <T>(phase: string, fallback: T): Promise<T> => { calls.push(phase); return phases.has(phase) ? await phases.get(phase)!() as T : fallback; };
  const emit = (bytes: Uint8Array) => { const backing = new Uint8Array(bytes.length + 11); backing.set(bytes, 5); value = new DataView(backing.buffer, 5, bytes.length); for (const listener of [...values]) listener(); return backing; };
  const notify: WebAxpCharacteristic = {
    properties: { notify: true }, get value() { return value; },
    addEventListener(_type, listener) { calls.push('listen'); values.add(listener); },
    removeEventListener(_type, listener) { calls.push('unlisten'); values.delete(listener); },
    startNotifications() { if (ready) emit(AXP_READY); return run('start', notify); },
    stopNotifications() { return run('stop', notify); },
  };
  const decoder = new FrameDecoder(frame => {
    let payload = frame.payload;
    if (frame.opcode === Opcode.Info) payload = utf8(JSON.stringify({ id: 'synthetic-web-axp', board: 'host-fixture', firmware: 'fixture-only', protocol: 1, source: 'accessory' }));
    if (frame.opcode === Opcode.Capabilities) payload = utf8(JSON.stringify({ operations: ['system.info', 'system.capabilities', 'system.ping'] }));
    const response = encode({ kind: Kind.Response, opcode: frame.opcode, id: frame.id, payload });
    for (let offset = 0; offset < response.length; offset += 20) emit(response.slice(offset, offset + 20));
  });
  const write: WebAxpCharacteristic = {
    ...notify, properties: { write: true },
    async writeValueWithResponse(bytes) { chunks.push(bytes.slice()); await run('write', undefined); decoder.push(bytes); },
  };
  const service = { getCharacteristic(uuid: string) { return run(uuid === AXP_WRITE ? 'write-char' : uuid === AXP_NOTIFY ? 'notify-char' : 'BAD-CHAR', uuid === AXP_WRITE ? write : notify); } };
  const server: WebAxpServer = {
    get connected() { return connected; },
    async connect() { const result = await run('connect', server); connected = true; return result; },
    disconnect() { calls.push('disconnect'); connected = false; },
    getPrimaryService(uuid) { assert.equal(uuid, AXP_SERVICE); return run('service', service); },
  };
  const device: WebAxpDevice = {
    name: 'Synthetic AXP '.repeat(12), gatt: server,
    addEventListener(_type, listener) { calls.push('device-listen'); disconnected.add(listener); },
    removeEventListener(_type, listener) { calls.push('device-unlisten'); disconnected.delete(listener); },
  };
  const host: WebAxpHost = { secureContext: true, bluetooth: { requestDevice(options) { calls.push('picker'); assert.deepEqual(options, { filters: [{ services: [AXP_SERVICE] }] }); return run('pick-result', device); } } };
  const manager = new WebAxpManager(host, { effectTimeoutMs: 30, setupTimeoutMs: 100, cleanupTimeoutMs: 30 });
  return { manager, host, device, server, notify, write, service, calls, chunks, phases, values, disconnected, emit,
    setValue(v: DataView | null) { value = v; for (const listener of [...values]) listener(); },
    setConnected(v: boolean) { connected = v; }, setReady(v: boolean) { ready = v; },
    async reserve() { const candidate = await manager.chooseAccessory(); return manager.connect(candidate.id); },
    async session() { const candidate = await manager.chooseAccessory(); return new DeviceSession(new BleTransport(manager, candidate.id, { timeoutMs: 30000 })); },
  };
}

test('construction/import and close-before-subscribe do no browser work; exact picker is synchronous', async () => {
  const f = fixture(); assert.deepEqual(f.calls, []);
  let observedPicker = false; f.manager.observe(s => { if (s.state === 'picking') observedPicker = f.calls.includes('picker'); });
  const picking = f.manager.chooseAccessory(); assert.equal(f.calls[0], 'picker'); assert.equal(observedPicker, true);
  const candidate = await picking; assert.equal(candidate.rssi, null); assert.equal(candidate.name.length, 80); assert.equal(Object.isFrozen(candidate), true);
  const before = [...f.calls]; const handlePromise = f.manager.connect(candidate.id); assert.deepEqual(f.calls, before);
  const handle = await handlePromise; assert.equal(handle.mtu, 23); await handle.disconnect(); assert.deepEqual(f.calls, before);
  await assert.rejects(handle.subscribe(() => {}, () => {})); assert.equal(f.manager.snapshot().state, 'idle');
});

test('unsupported and insecure hosts fail without picker effects; errors retain no external message', async () => {
  for (const host of [{ secureContext: false }, { secureContext: true }]) {
    const manager = new WebAxpManager(host); await assert.rejects(manager.chooseAccessory()); assert.equal(manager.snapshot().rawPending, 0);
  }
  const f = fixture(); f.phases.set('pick-result', async () => { throw new Error('PRIVATE external error'.repeat(1000)); });
  await assert.rejects(f.manager.chooseAccessory(), /rejected, denied, or cancelled/); assert.ok(f.manager.snapshot().error!.length < 100);
});

test('cancelled chooser retains raw ownership and ignores late result', async () => {
  const f = fixture(); const gate = deferred<WebAxpDevice>(); f.phases.set('pick-result', () => gate.promise);
  const picking = assert.rejects(f.manager.chooseAccessory(), /cancelled locally/);
  f.manager.cancelCurrentLease(); await picking; assert.equal(f.manager.snapshot().state, 'picking'); assert.equal(f.manager.snapshot().rawPending, 1);
  await assert.rejects(f.manager.chooseAccessory(), /busy/);
  gate.resolve(f.device); await tick(); assert.equal(f.manager.snapshot().state, 'idle'); assert.equal(f.manager.snapshot().candidate, null); assert.equal(f.calls.includes('connect'), false);
});

test('invalid and stale candidate handle failures cannot acquire unknown core release or disturb a lease', async () => {
  const f = fixture(); const handle = await f.reserve(); const bad = new BleTransport(f.manager, 'invalid');
  await assert.rejects(bad.connect(), /unavailable/); await bad.disconnect(); assert.equal(f.manager.snapshot().state, 'reserved');
  await handle.disconnect(); const next = await f.reserve(); await next.subscribe(() => {}, () => {});
  const before = f.calls.filter(x => x === 'disconnect').length; await handle.disconnect(); assert.equal(f.calls.filter(x => x === 'disconnect').length, before); await next.disconnect();
});

test('unchanged session negotiates real READY and info/capabilities, then echoes 0/20/21/512 byte ping with ordered 20-byte fragments', async () => {
  const f = fixture(); const session = await f.session(); await session.open();
  assert.equal(session.state, 'open'); assert.equal(session.info?.id, 'synthetic-web-axp'); assert.equal(session.capabilities.length, 3);
  for (const length of [0, 20, 21, 512]) {
    const payload = Uint8Array.from({ length }, (_, i) => i % 251); const start = f.chunks.length;
    assert.deepEqual(await session.request('system.ping', payload), payload);
    const chunks = f.chunks.slice(start); assert.ok(chunks.every(x => x.length > 0 && x.length <= 20));
    assert.equal(chunks.reduce((n, x) => n + x.length, 0), length + 12);
    assert.deepEqual(Uint8Array.from(chunks.flatMap(x => [...x])).slice(10, 10 + length), payload);
  }
  await session.close(); assert.equal(session.transportReleasePending, false); assert.equal(f.values.size, 0); assert.equal(f.disconnected.size, 0);
});

test('READY is not manufactured; successful browser acquisition does not imply core readiness', async () => {
  const f = fixture(); f.setReady(false); const candidate = await f.manager.chooseAccessory();
  const transport = new BleTransport(f.manager, candidate.id, { timeoutMs: 20 });
  await assert.rejects(transport.connect(), /readiness timed out/); assert.equal(f.manager.snapshot().state, 'idle');
});

for (const phase of ['connect', 'service', 'write-char', 'notify-char', 'start']) {
  test(`rejected ${phase} fails closed and can clean up`, async () => {
    const f = fixture(); f.phases.set(phase, async () => { throw new Error('synthetic rejection'); }); const handle = await f.reserve();
    await assert.rejects(handle.subscribe(() => {}, () => {})); await handle.disconnect(); assert.equal(f.manager.snapshot().state, 'idle');
  });
  test(`hung ${phase} fences deadline, retains ownership, blocks replacement and retries only after raw settlement`, async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.phases.set(phase, () => gate.promise); const handle = await f.reserve();
    await assert.rejects(handle.subscribe(() => {}, () => {}), /timed out|closing/);
    assert.equal(f.manager.snapshot().rawPending, 1); assert.ok(f.calls.includes('disconnect'));
    await assert.rejects(handle.disconnect(), /cleanup unknown/); assert.equal(f.manager.snapshot().state, 'cleanup-unknown'); await assert.rejects(f.manager.chooseAccessory(), /busy/);
    const discoveryBefore = f.calls.filter(x => ['service', 'write-char', 'notify-char', 'start'].includes(x)).length;
    gate.resolve(phase === 'connect' ? f.server : phase === 'service' ? f.service : phase === 'write-char' ? f.write : f.notify); await tick();
    assert.equal(f.calls.filter(x => ['service', 'write-char', 'notify-char', 'start'].includes(x)).length, discoveryBefore);
    assert.equal(f.manager.snapshot().state, 'cleanup-unknown'); await handle.disconnect(); assert.equal(f.manager.snapshot().state, 'idle'); assert.equal(f.server.connected, false);
  });
}

test('explicit cancellation rejects setup before deadline while retaining the raw effect', async () => {
  const f = fixture(); const gate = deferred<WebAxpServer>(); f.phases.set('connect', () => gate.promise); const handle = await f.reserve();
  const subscribing = assert.rejects(handle.subscribe(() => {}, () => {}), /cancelled locally/); await tick();
  f.manager.cancelCurrentLease(); await subscribing; assert.equal(f.manager.snapshot().rawPending, 1);
  gate.resolve(f.server); await tick(); await handle.disconnect(); assert.equal(f.calls.includes('service'), false);
});

test('notifications preserve offsets, bounded copies and intrinsic DataView slots; stale callbacks are fenced', async () => {
  const f = fixture(); f.setReady(false); const handle = await f.reserve(); const seen: Uint8Array[] = [];
  const unsubscribe = await handle.subscribe(bytes => seen.push(bytes), () => {});
  const stale = [...f.values][0]!; const backing = f.emit(Uint8Array.of(7, 8)); backing.fill(0); assert.deepEqual(seen, [Uint8Array.of(7, 8)]);
  const view = new DataView(Uint8Array.of(9, 10, 11).buffer, 1, 1); Object.defineProperty(view, 'byteLength', { value: 1000000 });
  f.setValue(view); assert.deepEqual(seen[1], Uint8Array.of(10));
  unsubscribe(); assert.equal(f.values.size, 0); stale(); assert.equal(seen.length, 2); await handle.disconnect();
});

for (const bad of [null, new DataView(new ArrayBuffer(0)), new DataView(new ArrayBuffer(513)), {} as DataView]) {
  test('malformed or out-of-bound notification fences callbacks', async () => {
    const f = fixture(); f.setReady(false); const handle = await f.reserve(); let closed = 0; let received = 0;
    await handle.subscribe(() => { received++; }, () => { closed++; }); f.setValue(bad);
    assert.equal(closed, 1); assert.equal(received, 0); assert.equal(f.values.size, 0); await handle.disconnect();
  });
}

test('foreign/shared already-connected state is rejected without disconnecting it', async () => {
  const f = fixture(); f.setConnected(true); const handle = await f.reserve(); await assert.rejects(handle.subscribe(() => {}, () => {}), /already connected/);
  await handle.disconnect(); assert.equal(f.calls.includes('disconnect'), false); assert.equal(f.server.connected, true);
});

for (const mode of ['property', 'method', 'notify-property', 'foreign-connect', 'foreign-start']) {
  test(`missing or foreign GATT contract rejected: ${mode}`, async () => {
    const f = fixture();
    if (mode === 'property') Object.assign(f.write.properties, { write: false });
    if (mode === 'method') f.write.writeValueWithResponse = undefined;
    if (mode === 'notify-property') Object.assign(f.notify.properties, { notify: false });
    if (mode === 'foreign-connect') f.phases.set('connect', async () => ({ ...f.server }));
    if (mode === 'foreign-start') f.phases.set('start', async () => ({ ...f.notify }));
    const handle = await f.reserve(); await assert.rejects(handle.subscribe(() => {}, () => {})); await handle.disconnect(); assert.equal(f.manager.snapshot().state, 'idle');
  });
}

test('hung raw write retains session transportReleasePending and prevents replacement through explicit close retry', async () => {
  const f = fixture(); const session = await f.session(); await session.open(); const gate = deferred<unknown>(); f.phases.set('write', () => gate.promise);
  await assert.rejects(session.request('system.ping', Uint8Array.of(5))); await delay(40);
  assert.equal(session.transportReleasePending, true); await assert.rejects(f.manager.chooseAccessory(), /busy/);
  gate.resolve(undefined); await tick(); await session.close(); assert.equal(session.transportReleasePending, false); assert.equal(f.manager.snapshot().state, 'idle');
});

test('unsubscribe tracks a rejected stop until settlement and retires only the disconnected browser handle', async () => {
  const f = fixture(); const handle = await f.reserve(); const unsubscribe = await handle.subscribe(() => {}, () => {});
  f.phases.set('stop', async () => { throw new Error('synthetic stop failure'); }); unsubscribe();
  await handle.disconnect(); assert.equal(f.manager.snapshot().state, 'idle'); assert.equal(f.calls.filter(x => x === 'stop').length, 1);
});

test('disconnect never calls stopNotifications on an invalidated characteristic', async () => {
  const f = fixture(); const handle = await f.reserve(); await handle.subscribe(() => {}, () => {});
  f.phases.set('stop', async () => { assert.equal(f.server.connected, true); return f.notify; });
  await handle.disconnect(); assert.equal(f.calls.filter(x => x === 'stop').length, 0);
});

test('hung stop is not duplicated by retry and late completion does not release without explicit retry', async () => {
  const f = fixture(); const handle = await f.reserve(); const unsubscribe = await handle.subscribe(() => {}, () => {}); const gate = deferred<unknown>(); f.phases.set('stop', () => gate.promise);
  unsubscribe(); await assert.rejects(handle.disconnect(), /cleanup unknown/); await assert.rejects(handle.disconnect(), /cleanup unknown/); assert.equal(f.calls.filter(x => x === 'stop').length, 1);
  gate.resolve(f.notify); await tick(); assert.equal(f.manager.snapshot().state, 'cleanup-unknown'); await handle.disconnect(); assert.equal(f.manager.snapshot().state, 'idle');
});

test('cleanup observer reentry joins the reserved promise without duplicate host work', async () => {
  const f = fixture(); const handle = await f.reserve(); await handle.subscribe(() => {}, () => {}); let retry: Promise<void> | undefined;
  f.manager.observe(s => { if (s.state === 'closing') retry = f.manager.retryCleanup(); });
  const cleanup = handle.disconnect(); assert.equal(retry, cleanup); await cleanup; assert.equal(f.manager.snapshot().state, 'idle');
});

test('unexpected disconnect and throwing observers/callbacks cannot strand ownership', async () => {
  const f = fixture(); f.manager.observe(() => { throw new Error('observer'); }); const handle = await f.reserve();
  await handle.subscribe(() => { throw new Error('bytes'); }, () => { throw new Error('closed'); });
  for (const listener of [...f.disconnected]) listener(); assert.equal(f.manager.snapshot().state, 'closing'); await handle.disconnect(); assert.equal(f.manager.snapshot().state, 'idle');
});

test('observer reentry cancellation at acquisition prevents the first browser effect', async () => {
  const f = fixture(); const handle = await f.reserve();
  f.manager.observe(s => { if (s.state === 'acquiring') f.manager.cancelCurrentLease(); });
  await assert.rejects(handle.subscribe(() => {}, () => {})); await handle.disconnect(); assert.equal(f.calls.includes('connect'), false);
});

test('fresh leases rediscover characteristics; old event callbacks cannot affect a new lease', async () => {
  const f = fixture(); const one = await f.reserve(); await one.subscribe(() => {}, () => {}); const stale = [...f.disconnected][0]!;
  await one.disconnect(); const two = await f.reserve(); await two.subscribe(() => {}, () => {}); stale();
  assert.equal(f.manager.snapshot().state, 'active'); assert.equal(f.calls.filter(x => x === 'write-char').length, 2); await two.disconnect();
});

test('public handles are frozen opaque capabilities and manager does not expose browser references', async () => {
  const f = fixture(); const handle = await f.reserve();
  assert.deepEqual(Object.keys(handle).sort(), ['disconnect', 'mtu', 'subscribe', 'writeWithResponse']); assert.equal(Object.isFrozen(handle), true);
  assert.equal('changed' in f.manager, false); assert.equal('released' in f.manager, false);
  assert.deepEqual(Object.keys(f.manager).sort(), ['cleanupTimeoutMs', 'effectTimeoutMs', 'setupTimeoutMs']);
  await handle.disconnect();
});

test('write-before-setup is effect-free and a rejected live write fences further writes', async () => {
  const f = fixture(); const handle = await f.reserve(); await assert.rejects(handle.writeWithResponse(Uint8Array.of(1)));
  assert.equal(f.calls.includes('write'), false); await handle.subscribe(() => {}, () => {});
  f.phases.set('write', async () => { throw new Error('rejected synthetic write'); });
  await assert.rejects(handle.writeWithResponse(Uint8Array.of(2)), /write failed/);
  await assert.rejects(handle.writeWithResponse(Uint8Array.of(3))); assert.equal(f.calls.filter(x => x === 'write').length, 1); await handle.disconnect();
});

test('explicit cancellation fences a raw write immediately and its late resolution never reports success', async () => {
  const f = fixture(); const handle = await f.reserve(); await handle.subscribe(() => {}, () => {}); const gate = deferred<unknown>();
  f.phases.set('write', () => gate.promise); const writing = assert.rejects(handle.writeWithResponse(Uint8Array.of(1)), /cancelled locally/);
  f.manager.cancelCurrentLease(); await writing; assert.equal(f.manager.snapshot().rawPending, 1);
  gate.resolve(undefined); await tick(); await handle.disconnect(); assert.equal(f.calls.filter(x => x === 'write').length, 1);
});

for (const storage of [new SharedArrayBuffer(1), new ArrayBuffer(1, { maxByteLength: 2 })]) {
  test('shared or resizable notification storage is rejected using intrinsic storage brand', async () => {
    const f = fixture(); f.setReady(false); const handle = await f.reserve(); let closed = false;
    await handle.subscribe(() => assert.fail('unexpected bytes'), () => { closed = true; });
    f.setValue(new DataView(storage)); assert.equal(closed, true); await handle.disconnect();
  });
}

test('a selected name is an inert bounded claim without control or bidi formatting', async () => {
  const f = fixture(); Object.defineProperty(f.device, 'name', { value: '\u202eX\n\0\u2069' });
  const chosen = await f.manager.chooseAccessory(); assert.equal(chosen.name, 'X'); assert.match(chosen.id, /^web-axp-\d+$/);
});

test('cleanup failure retains browser ownership when disconnect throws or cannot confirm disconnected state', async () => {
  const f = fixture(); const handle = await f.reserve(); await handle.subscribe(() => {}, () => {});
  const disconnect = f.server.disconnect; f.server.disconnect = () => { throw new Error('synthetic failed disconnect'); };
  await assert.rejects(handle.disconnect(), /cleanup unknown/); assert.equal(f.manager.snapshot().state, 'cleanup-unknown');
  await assert.rejects(f.manager.chooseAccessory(), /busy/); f.server.disconnect = disconnect; await handle.disconnect(); assert.equal(f.manager.snapshot().state, 'idle');
});

test('cancel selection atomically clears local candidate without acquiring or disconnecting a handle', async () => {
  const f = fixture(); const candidate = await f.manager.chooseAccessory(); const before = [...f.calls];
  const snapshots: ReturnType<WebAxpManager['snapshot']>[] = []; f.manager.observe(snapshot => { snapshots.push(snapshot); });
  f.manager.cancelCurrentLease();
  assert.deepEqual(f.calls, before); assert.deepEqual(f.manager.snapshot(), { state: 'idle', candidate: null, rawPending: 0, error: null });
  assert.equal(snapshots.length, 1); assert.equal(Object.isFrozen(snapshots[0]), true);
  const stale = await f.manager.connect(candidate.id); await assert.rejects(stale.subscribe(() => {}, () => {}), /unavailable/); await stale.disconnect();
  assert.deepEqual(f.calls, before); f.manager.cancelCurrentLease(); assert.equal(snapshots.length, 1);
});

test('selection cancellation cannot overwrite a new chooser started by an idle observer', async () => {
  const f = fixture(); const first = await f.manager.chooseAccessory(); const gate = deferred<WebAxpDevice>();
  f.phases.set('pick-result', () => gate.promise); let next: Promise<Readonly<{ id: string }>> | undefined;
  const remove = f.manager.observe(snapshot => { if (snapshot.state === 'idle' && !next) next = f.manager.chooseAccessory(); });
  f.manager.cancelCurrentLease(); remove();
  assert.ok(next); assert.equal(f.manager.snapshot().state, 'picking'); assert.equal(f.manager.snapshot().candidate, null); assert.equal(f.manager.snapshot().rawPending, 1);
  await assert.rejects(f.manager.chooseAccessory(), /busy/); gate.resolve(f.device); const second = await next;
  assert.notEqual(second.id, first.id); assert.equal(f.manager.snapshot().candidate?.id, second.id); assert.equal(f.manager.snapshot().state, 'selected');
  assert.equal(f.calls.includes('connect'), false); assert.equal(f.calls.includes('disconnect'), false); f.manager.cancelCurrentLease();
});

test('selection cancellation preserves a poisoned lease and raw browser ownership', async () => {
  const f = fixture(); const gate = deferred<WebAxpServer>(); f.phases.set('connect', () => gate.promise); const handle = await f.reserve();
  await assert.rejects(handle.subscribe(() => {}, () => {})); await assert.rejects(handle.disconnect(), /cleanup unknown/);
  const before = f.manager.snapshot(); f.manager.cancelCurrentLease();
  assert.equal(f.manager.snapshot().state, 'cleanup-unknown'); assert.deepEqual(f.manager.snapshot().candidate, before.candidate); assert.equal(f.manager.snapshot().rawPending, 1);
  await assert.rejects(f.manager.chooseAccessory(), /busy/); gate.resolve(f.server); await tick(); await handle.disconnect(); assert.equal(f.manager.snapshot().state, 'idle');
});
