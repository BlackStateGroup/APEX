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


import { WebAxpApplication } from '../src/experimental/web-axp-application.ts';
import { SimulatorTransport } from '../packages/core/simulator.ts';
const eligible = () => ({ foreground: true, devicesTab: true, busy: false, scanning: false, observing: false, capturing: false, nfc: false });

test('application chooser is same-stack, reserves before publication and refuses double clicks', async () => {
  const f = fixture(); const app = new WebAxpApplication(f.manager); let observed = false;
  app.observe(() => { observed = true; assert.ok(f.calls.includes('picker')); assert.equal(app.held, true); });
  const pick = app.choose(eligible()); assert.equal(f.calls[0], 'picker'); assert.ok(observed);
  assert.throws(() => app.choose(eligible()), /ownership/); await pick;
  assert.equal(app.snapshot().manager.state, 'selected'); assert.throws(() => app.choose(eligible()));
  await app.cancel(); assert.equal(app.held, false); assert.equal(f.calls.includes('connect'), false);
});
test('every live acquisition gate rejects without invoking chooser', async () => {
  for (const key of ['foreground', 'devicesTab', 'busy', 'scanning', 'observing', 'capturing', 'nfc'] as const) {
    const f = fixture(); const app = new WebAxpApplication(f.manager); const gate = eligible();
    gate[key] = !gate[key]; assert.throws(() => app.choose(gate)); assert.deepEqual(f.calls, []);
  }
  const f = fixture(); const app = new WebAxpApplication(f.manager);
  app.lock.current = true; assert.throws(() => app.choose(eligible())); app.lock.current = false;
  const sim = new DeviceSession(new SimulatorTransport()); app.session.current = sim;
  assert.throws(() => app.choose(eligible())); assert.equal(app.session.current, sim); assert.deepEqual(f.calls, []);
});
test('real unchanged session negotiation and ping use shared slot and 20-byte fragments', async () => {
  const f = fixture(); const app = new WebAxpApplication(f.manager);
  await app.choose(eligible()); await app.connect(eligible()); const session = app.session.current!;
  assert.equal(session.state, 'open'); assert.equal(session.info!.id, 'synthetic-web-axp'); assert.ok(app.owns(session));
  assert.equal(new TextDecoder().decode(await session.request('system.ping', utf8('test'))), 'test');
  assert.ok(f.chunks.every(chunk => chunk.length <= 20));
  assert.throws(() => app.choose(eligible())); await app.cancel(); assert.equal(app.session.current, null); assert.equal(app.held, false);
});
test('pending picker cancellation cannot replace raw owner; late selection never connects', async () => {
  const f = fixture(); const gate = deferred<WebAxpDevice>(); f.phases.set('pick-result', () => gate.promise);
  const app = new WebAxpApplication(f.manager); const picking = assert.rejects(app.choose(eligible()));
  await assert.rejects(app.cancel(), /still pending/); await picking;
  assert.equal(app.held, true); assert.throws(() => app.choose(eligible()));
  gate.resolve(f.device); await tick(); assert.equal(app.held, false); assert.equal(f.calls.includes('connect'), false);
  await app.cancel(true); assert.equal(app.snapshot().cleanupFailed, false);
});
test('pending open cancels synchronously before close, holds raw poison and requires explicit retry', async () => {
  const f = fixture(); const gate = deferred<WebAxpServer>(); f.phases.set('connect', () => gate.promise);
  const app = new WebAxpApplication(f.manager); await app.choose(eligible());
  const opening = assert.rejects(app.connect(eligible())); await tick(); const owner = app.session.current!;
  const closing = assert.rejects(app.cancel());
  assert.notEqual(f.manager.snapshot().state, 'acquiring');
  await Promise.all([opening, closing]); assert.equal(app.session.current, owner); assert.ok(owner.transportReleasePending);
  assert.ok(app.snapshot().cleanupFailed); assert.throws(() => app.choose(eligible()));
  const before = [...f.calls]; app.suspend(); assert.deepEqual(f.calls, before);
  gate.resolve(f.server); await tick(); assert.equal(f.calls.includes('service'), false); assert.equal(app.session.current, owner);
  await app.cancel(true); assert.equal(app.session.current, null); assert.equal(app.held, false);
});
test('unmount/remount detaches presentation but preserves pending owner and stale callbacks', async () => {
  const f = fixture(); const gate = deferred<WebAxpDevice>(); f.phases.set('pick-result', () => gate.promise);
  const app = new WebAxpApplication(f.manager); let oldUpdates = 0; const detach = app.observe(() => oldUpdates++);
  const choosing = assert.rejects(app.choose(eligible())); detach(); const before = oldUpdates; app.suspend();
  let newUpdates = 0; const detachNew = app.observe(() => newUpdates++);
  assert.equal(app.held, true); assert.throws(() => app.choose(eligible())); await choosing;
  gate.resolve(f.device); await tick(); assert.equal(oldUpdates, before); assert.ok(newUpdates); detachNew();
  await app.cancel(true); await app.choose(eligible()); assert.equal(app.snapshot().manager.state, 'selected'); await app.cancel();
});
test('cancel during reservation observer never proceeds into GATT or leaves an orphan handle', async () => {
  const f = fixture(); const app = new WebAxpApplication(f.manager); await app.choose(eligible());
  let closing: Promise<void> | null = null;
  app.observe(() => { if (f.manager.snapshot().state === 'reserved' && !closing) closing = app.cancel(); });
  await assert.rejects(app.connect(eligible())); if (closing) await closing; await tick();
  assert.equal(f.calls.includes('connect'), false); assert.equal(app.held, false); assert.equal(app.session.current, null);
});
test('pending write cancel fences immediately and raw settlement alone never clears the shared slot', async () => {
  const f = fixture(); const app = new WebAxpApplication(f.manager); await app.choose(eligible()); await app.connect(eligible());
  const gate = deferred<unknown>(); f.phases.set('write', () => gate.promise); const owner = app.session.current!;
  const ping = assert.rejects(owner.request('system.ping', utf8('pending'))); await tick();
  const closing = assert.rejects(app.cancel()); assert.ok(f.calls.includes('disconnect')); await Promise.all([ping, closing]);
  gate.resolve(undefined); await tick(); assert.equal(app.session.current, owner); assert.ok(app.held);
  await app.cancel(true); assert.equal(app.session.current, null);
});
test('missing actual READY does not negotiate; cancellation remains reachable outside lock', async () => {
  const f = fixture(); f.setReady(false); const app = new WebAxpApplication(f.manager); await app.choose(eligible());
  const opening = assert.rejects(app.connect(eligible())); await tick();
  assert.equal(app.session.current!.state, 'opening'); assert.equal(f.chunks.length, 0);
  app.lock.current = true; await app.cancel(); await opening; assert.equal(app.held, false); app.lock.current = false;
});
test('unsupported or insecure host never invokes picker and can be retried after public rejection', async () => {
  for (const host of [{ secureContext: false }, { secureContext: true }]) {
    const app = new WebAxpApplication(new WebAxpManager(host)); await assert.rejects(app.choose(eligible())); assert.equal(app.held, false);
  }
});

test('actual READY retains the full 30000ms budget and no synthetic negotiation occurs', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); f.setReady(false); const app = new WebAxpApplication(f.manager);
  await app.choose(eligible()); const opening = assert.rejects(app.connect(eligible()), /readiness timed out/); await tick();
  t.mock.timers.tick(29999); await tick(); assert.equal(app.session.current!.state, 'opening'); assert.equal(f.chunks.length, 0);
  t.mock.timers.tick(1); await opening; assert.equal(app.held, false); assert.equal(f.chunks.length, 0);
});
test('late READY after cancellation never revives Console identity or a newer owner', async () => {
  const f = fixture(); f.setReady(false); const app = new WebAxpApplication(f.manager); await app.choose(eligible());
  const opening = assert.rejects(app.connect(eligible())); await tick(); const old = app.session.current;
  await app.cancel(); await opening; f.emit(AXP_READY); await tick(); assert.equal(app.session.current, null);
  f.setReady(true); await app.choose(eligible()); await app.connect(eligible()); const next = app.session.current as DeviceSession | null;
  assert.notEqual(next, old); assert.equal(next!.state, 'open'); await old!.close(); assert.equal(app.session.current, next); await app.cancel();
});
test('explicit retry joins cleanup in flight and stale finally cannot clear a newer selected owner', async () => {
  const f = fixture(); const app = new WebAxpApplication(f.manager); await app.choose(eligible()); await app.connect(eligible());
  const closing = app.cancel(); assert.equal(app.cancel(true), closing); await closing;
  await app.choose(eligible()); await tick(); assert.equal(app.snapshot().manager.state, 'selected'); assert.equal(app.held, true); await app.cancel();
});

import { browserAxpSupport, browserAxpForeground, getBrowserAxpApplication, observeBrowserAxpLifecycle } from '../src/platform/web-axp.ts';
import { readFileSync } from 'node:fs';
test('lazy binding, secure/API checks, hidden/pagehide fence order and visible refresh are host-only', async () => {
  const original = new Map(['window', 'document', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const docEvents = new Map<string, () => void>(); const winEvents = new Map<string, () => void>();
  const document = { visibilityState: 'visible', addEventListener: (key: string, cb: () => void) => docEvents.set(key, cb), removeEventListener: (key: string) => docEvents.delete(key) };
  const window = { isSecureContext: true, addEventListener: (key: string, cb: () => void) => winEvents.set(key, cb), removeEventListener: (key: string) => winEvents.delete(key) };
  let picks = 0;
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { bluetooth: { requestDevice() { picks++; return Promise.reject(new Error('fixture')); } } } });
    const singleton = getBrowserAxpApplication(); assert.equal(getBrowserAxpApplication(), singleton); assert.equal(picks, 0);
    assert.equal(browserAxpSupport(), null); assert.equal(browserAxpForeground(), true);
    window.isSecureContext = false; assert.match(browserAxpSupport()!, /secure/); window.isSecureContext = true;
    const f = fixture(); const app = new WebAxpApplication(f.manager); await app.choose(eligible()); await app.connect(eligible());
    const order: string[] = []; const close = app.session.current!.close.bind(app.session.current!);
    app.session.current!.close = () => { order.push('close'); assert.ok(f.calls.includes('disconnect')); return close(); };
    const detach = observeBrowserAxpLifecycle(app, () => { order.push('refresh'); });
    document.visibilityState = 'hidden'; docEvents.get('visibilitychange')!(); assert.equal(order[0], 'close'); await tick();
    const before = [...f.calls]; document.visibilityState = 'visible'; docEvents.get('visibilitychange')!(); winEvents.get('pageshow')!(); assert.deepEqual(f.calls, before);
    await app.choose(eligible()); winEvents.get('pagehide')!(); await tick(); assert.equal(app.held, false);
    detach(); assert.equal(docEvents.size, 0); assert.equal(winEvents.size, 0); assert.equal(picks, 0);
  } finally {
    for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
test('App wiring preserves explicit controls, live mutual guards, out-of-lock cancel and offline navigation', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(source, /onChoose=\{\(\) => browserAction\(\(\) => browserAxp.choose\(browserGate\(\)\)\)\}/);
  assert.match(source, /onCancel=\{\(\) => browserAction\(\(\) => browserAxp.cancel\(\)/);
  assert.match(source, /if \(browserAxp\?\.held\) throw new Error\('Release browser AXP ownership before starting another session/);
  assert.match(source, /if \(browserAxp\?\.owns\(session.current\)\) \{ await browserAxp.cancel\(\); return; \}/);
  assert.equal((source.match(/canStart=\{\(\) => !browserAxp\?\.held/g) ?? []).length, 2);
  assert.match(source, /if \(browserAxp\?\.held \|\| !foreground.current/);
  assert.match(source, /state === 'background'\) browserAxp\?\.suspend/);
  assert.match(source, /activeTab.current = name; setTab\(name\)/);
  assert.match(source, /operation.current === token/);
  assert.match(source, /mountEpoch.current !== epoch/);
  const controls = readFileSync(new URL('../src/BrowserAxpControls.tsx', import.meta.url), 'utf8');
  for (const phrase of ['Device claim:', 'RSSI unavailable', 'Retry browser AXP cleanup', 'Not general scanning or RF capture', 'Physical compatibility is unvalidated']) assert.ok(controls.includes(phrase));
  const native = readFileSync(new URL('../src/platform/web-axp.native.ts', import.meta.url), 'utf8');
  assert.ok(!native.includes('new WebAxp')); assert.ok(!native.includes('navigator'));
});

test('stale Cancel after failed cleanup rejects rather than claiming completed cleanup', async () => {
  const f = fixture(); const gate = deferred<WebAxpDevice>(); f.phases.set('pick-result', () => gate.promise);
  const app = new WebAxpApplication(f.manager); const choosing = assert.rejects(app.choose(eligible()));
  await assert.rejects(app.cancel()); await choosing;
  await assert.rejects(app.cancel(), /explicit Retry/); assert.equal(app.held, true);
  gate.resolve(f.device); await tick(); await app.cancel(true);
});

test('actual inspector navigation fences retained browser Choose and Connect before React tab state commits', async () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const selectSource = source.slice(source.indexOf('  function selectInspector'), source.indexOf('  const inspectorLabel'))
    .replace('next: AnalysisInspector', 'next');
  const gateSource = source.slice(source.indexOf('  const browserGate ='), source.indexOf('  const syncBrowserSession ='));
  const activeTab = { current: 'Devices' };
  const idle = { current: false };
  // Execute the actual retained gate closure with plain host refs; no React/browser/device runtime.
  const gate = new Function('attached', 'foreground', 'AppState', 'browserAxpForeground', 'activeTab', 'lock', 'accessoryScanning',
    'observationBusy', 'serviceDataBusy', 'observationUncertain', 'serviceDataUncertain', 'captureBusy', 'reader',
    `${gateSource}; return browserGate;`)(
    { current: true }, { current: true }, { currentState: 'active' }, () => true, activeTab, idle, idle, idle, idle, idle, idle, idle, { current: { state: 'idle' } },
  ) as () => ReturnType<typeof eligible>;
  for (const selected of [false, true]) {
    activeTab.current = 'Devices'; const f = fixture(); const app = new WebAxpApplication(f.manager);
    if (selected) await app.choose(gate());
    const before = [...f.calls]; const events: string[] = [];
    let renderedTab = 'Devices';
    const retainedAction = () => selected ? app.connect(gate()) : app.choose(gate());
    const navigate = new Function('setInspector', 'setChooserOpen', 'activeTab', 'setTab', 'scroll', `${selectSource}; return selectInspector;`)(
      (next: string) => events.push(`inspector:${next}`),
      (open: boolean) => events.push(`chooser:${open}`), activeTab,
      (next: string) => {
        assert.equal(renderedTab, 'Devices'); // React has not committed a new render yet.
        assert.equal(activeTab.current, 'Analysis');
        assert.throws(retainedAction, /foreground Devices tab/);
        events.push(`tab:${next}`); renderedTab = next;
      }, { current: { scrollTo: () => events.push('scroll') } },
    ) as (next: string) => void;
    navigate('hci');
    assert.deepEqual(events, ['inspector:hci', 'chooser:false', 'tab:Analysis', 'scroll']);
    assert.deepEqual(f.calls, before); // Navigation never picks, acquires, analyses or saves.
    assert.equal(app.snapshot().manager.state, selected ? 'selected' : 'idle');
    if (selected) await app.cancel();
  }
});
