// Exact native TS adapter; explicitly fake RN/PLX. No installed SDK or device execution.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { harness } from './support/app-acquisition.ts';
import { bridge } from './browser-c-host/bridge.ts';
import { BleTransport, AXP_SERVICE, AXP_WRITE, AXP_NOTIFY, AXP_READY } from '../packages/core/ble-transport.ts';
import { DeviceSession } from '../packages/core/session.ts';
import { encode, FrameDecoder } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';

const directory = mkdtempSync(join(tmpdir(), 'apex-native-c-'));
const binary = join(directory, 'bridge');
const pinned = JSON.parse(readFileSync('tests/browser-c-host/current-inputs.sha256.json', 'utf8')) as Record<string,string>;
const paths = ['App.tsx', 'tests/support/app-acquisition.ts', ...Object.keys(pinned), 'src/platform/bluetooth.native.ts', 'tests/browser-c-host/bridge.c', 'tests/browser-c-host/bridge.ts', 'tests/native-c-roundtrip.test.ts'];
const hashes = Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
const args = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-Wno-misleading-indentation', '-DCONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=1', '-DESP_PLATFORM', '-Itests/esp32-reviewed-host/fakes', '-Ifirmware/core', '-Ifirmware/esp32s3/main', 'tests/browser-c-host/bridge.c', 'firmware/core/apex.c', '-o', binary];
before(() => {
  for (const [path, hash] of Object.entries(pinned)) assert.equal(hashes[path], hash, path);
  const result = spawnSync('gcc', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1048576 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
});
after(() => rmSync(directory, { recursive: true, force: true }));
let mocks: object;
(globalThis as any).__nativeCMocks = () => mocks;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'react-native' || specifier === 'react-native-ble-plx') {
    const names = specifier === 'react-native' ? 'AppState, Platform, PermissionsAndroid' : 'BleManager';
    // One distinct mocked module per case, just like a fresh app process.
    return { url: `data:text/javascript,${encodeURIComponent(`export const { ${names} } = globalThis.__nativeCMocks(); // ${context.parentURL}`)}`, shortCircuit: true };
  }
  return next(specifier, context);
} });
after(() => { hooks.deregister(); delete (globalThis as any).__nativeCMocks; });
let serial = 0;
async function fixture(platform: 'android' | 'ios', mtu: 23 | 517) {
  type Monitor = (error: Error | null, characteristic?: { value: string }) => void;
  const monitors = new Set<Monitor>(), disconnects = new Set<(error: Error | null) => void>();
  const events: string[] = [];
  let writeGate: Promise<void> | undefined, writeEntered = () => {}, cancelFailure = false;
  let heldPhase: string | undefined, phaseGate: Promise<void> | undefined, phaseEntered = () => {};
  const phase = async (name: string) => { events.push(name); if (heldPhase === name) { phaseEntered(); await phaseGate; } };
  let readiness: ((state: string) => void) | undefined, readinessHeld = false;
  let permissionGate: Promise<void> | undefined, permissionEntered = () => {};
  const f = bridge(binary, mtu, bytes => {
    events.push('C-notification');
    for (const callback of [...monitors]) callback(null, { value: Buffer.from(bytes).toString('base64') });
  });
  const device = {
    mtu,
    async discoverAllServicesAndCharacteristics() { await phase('discover'); return device; },
    async requestMTU(requested: number) { await phase('requestMTU:' + requested); return device; },
    async characteristicsForService(service: string) { assert.equal(service, AXP_SERVICE); await phase('characteristics'); return [{ uuid: AXP_WRITE, isWritableWithResponse: true }, { uuid: AXP_NOTIFY, isNotifiable: true }]; },
    monitorCharacteristicForService(service: string, characteristic: string, callback: Monitor) {
      assert.equal(service, AXP_SERVICE); assert.equal(characteristic, AXP_NOTIFY); monitors.add(callback); events.push('monitor');
      void f.command('SUBSCRIBE').catch(error => callback(error));
      return { remove() { events.push('remove-monitor'); monitors.delete(callback); } };
    },
    async writeCharacteristicWithResponseForService(service: string, characteristic: string, value: string) {
      assert.equal(service, AXP_SERVICE); assert.equal(characteristic, AXP_WRITE);
      const bytes = Buffer.from(value, 'base64'); assert.equal(bytes.toString('base64'), value);
      assert.ok(bytes.length <= Math.min(mtu - 3, 244));
      events.push('write-enter'); writeEntered(); await writeGate;
      const result = await f.command('W ' + bytes.toString('hex'), 'native-client-write');
      events.push('write-settled'); if (result[0]) throw new Error('C ATT rejection ' + result[0]);
    },
  };
  class FakeManager {
  async state() { return 'Unknown'; }
    onStateChange(callback: (state: string) => void) { readiness = callback; events.push('readiness'); if (!readinessHeld) callback('PoweredOn'); return { remove() { events.push('remove-readiness'); } }; }
    async stopDeviceScan() {}
    async connectToDevice(id: string) { assert.equal(id, 'AXP'); await phase('connect'); return device; }
    onDeviceDisconnected(_id: string, callback: (error: Error | null) => void) { disconnects.add(callback); return { remove() { disconnects.delete(callback); } }; }
    async cancelDeviceConnection() {
      events.push('cancel'); if (cancelFailure) throw new Error('fake cancellation rejected');
      const result = await f.command('CLOSE'); assert.deepEqual(result.slice(0, 3), [0,0,0]); assert.equal(result[5], 65535);
      for (const callback of [...disconnects]) callback(null);
    }
    async destroy() { events.push('fake-destroy'); }
  }
  mocks = { Platform: { OS: platform, Version: 34 }, AppState: { currentState: 'active' },
    PermissionsAndroid: { PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect' }, RESULTS: { GRANTED: 'granted' }, async requestMultiple() { events.push('fake-permission'); permissionEntered(); await permissionGate; return { scan: 'granted', connect: 'granted' }; } }, BleManager: FakeManager };
  const native = await import(`../src/platform/bluetooth.native.ts?native-c-case=${++serial}`);
  const transport = new BleTransport(native.bleDriver, 'AXP', { timeoutMs: 1500 });
  const session = new DeviceSession(transport, { timeoutMs: 2500 });
  return { f, native, transport, session, events, monitors, disconnects,
    holdPhase(name: string) { heldPhase = name; let release!: () => void; phaseGate = new Promise<void>(r => { release = r; }); const entered = new Promise<void>(r => { phaseEntered = r; }); return { release, entered }; },
    holdReadiness() { readinessHeld = true; return () => readiness?.('PoweredOn'); },
    holdPermission() { let release!: () => void; permissionGate = new Promise<void>(r => { release = r; }); const entered = new Promise<void>(r => { permissionEntered = r; }); return { release, entered }; },
    holdWrite() { let release!: () => void; writeGate = new Promise<void>(r => { release = r; }); const entered = new Promise<void>(r => { writeEntered = r; }); return { release, entered }; },
    failCancel(value: boolean) { cancelFailure = value; },
    async finish(name: string, unknown = false, managedSession = session) {
      try { if (unknown) await assert.rejects(managedSession.close(), /release unknown/); else await managedSession.close(); } finally { try { await f.dispose(); } finally {
        if (process.env.APEX_NATIVE_C_EVIDENCE) { const out = process.env.APEX_NATIVE_C_EVIDENCE; mkdirSync(out, { recursive: true }); writeFileSync(join(out, name + '.json'), JSON.stringify({ scope: 'host-only fake RN/PLX, MTU, scheduling and acknowledgments; no native/device/startup acceptance', platform, mtu, hashes, events, trace: f.trace }, null, 2) + '\n'); }
      } }
    },
  };
}
function frames(chunks: Uint8Array[]) {
  const result: Frame[] = []; const decoder = new FrameDecoder(frame => result.push(frame)); chunks.forEach(chunk => decoder.push(chunk));
  assert.equal(decoder.discarded, 0); assert.equal(decoder.bufferedBytes, 0);
  assert.deepEqual(Buffer.concat(chunks), Buffer.concat(result.map(frame => encode(frame)))); return result;
}
for (const platform of ['android', 'ios'] as const) for (const mtu of [23, 517] as const) {
  test(`fake ${platform} native adapter to C, MTU ${mtu}: exact frames and stale callbacks`, { timeout: 20000 }, async () => {
    const x = await fixture(platform, mtu);
    try {
      await x.session.open(); assert.equal(x.session.info?.id, 'apex-s3-dev'); assert.equal(x.session.source, 'ble');
      assert.deepEqual(x.session.capabilities, ['system.info', 'system.capabilities', 'system.ping']);
      const payloads = [new Uint8Array(), Uint8Array.from(Buffer.from('80a700000000000000004158505f524541', 'hex')), Uint8Array.from({length:512}, (_,i) => i & 255)];
      for (const payload of payloads) assert.deepEqual(await x.session.request('system.ping', payload), payload);
      const writes = x.f.trace.filter(e => e.origin === 'native-client-write').map(e => Buffer.from(e.value.slice(2), 'hex'));
      const notifications = x.f.trace.filter(e => e.origin === 'C-notification').map(e => Buffer.from(e.value, 'hex'));
      assert.deepEqual(new Uint8Array(notifications[0]!), AXP_READY);
      const requests = frames(writes), replies = frames(notifications.slice(1));
      assert.deepEqual(requests.map(f => [f.kind,f.opcode,f.id]), [[1,1,1],[1,2,2],[1,3,3],[1,3,4],[1,3,5]]);
      assert.deepEqual(replies.map(f => [f.kind,f.opcode,f.id]), [[2,1,1],[2,2,2],[2,3,3],[2,3,4],[2,3,5]]);
      assert.deepEqual(replies.slice(2).map(f => f.payload), payloads);
      assert.ok(writes.some(b => b.length === Math.min(mtu-3,244)));
      assert.ok(notifications.every(b => b.length <= Math.min(mtu-3,244)));
      assert.equal(x.events.includes('fake-permission'), platform === 'android'); assert.equal(x.events.includes('requestMTU:185'), platform === 'android');
      const staleMonitor = [...x.monitors][0]!, staleDisconnect = [...x.disconnects][0]!;
      let delivered = 0; x.transport.onData(() => delivered++);
      await x.session.close(); assert.equal(x.session.transportReleasePending, false); assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
      assert.equal(x.monitors.size + x.disconnects.size, 0);
      staleMonitor(null, {value: Buffer.from(encode(replies[2]!)).toString('base64')}); staleDisconnect(new Error('stale'));
      assert.equal(delivered, 0); await x.f.command('TICK');
      if (platform === 'ios') { await assert.rejects(x.native.shutdownBluetooth(), /unacknowledged/); assert.equal(x.native.accessoryConnectionOwnership(), 'unknown'); await assert.rejects(x.native.bleDriver.connect('AXP'), /unknown/); }
      else { await x.native.shutdownBluetooth(); assert.equal(x.native.accessoryConnectionOwnership(), 'idle'); }
    } finally { await x.finish(`${platform}-${mtu}`); }
  });
  test(`fake ${platform} MTU ${mtu}: C ATT error closes session`, { timeout: 20000 }, async () => {
    const x = await fixture(platform, mtu);
    try { await x.session.open(); await x.f.command('FAIL_FLATTEN'); await assert.rejects(x.session.request('system.ping', Uint8Array.of(1)), /C ATT rejection 14/); await x.session.close(); assert.equal(x.session.state, 'closed'); assert.equal(x.session.transportReleasePending, false); assert.equal(x.monitors.size + x.disconnects.size, 0); }
    finally { await x.finish(`${platform}-${mtu}-att-error`); }
  });
}
for (const platform of ['android','ios'] as const) test(`fake ${platform}: close drains pending write and failed cancel stays unknown until explicit retry`, { timeout: 20000 }, async () => {
  const x = await fixture(platform, 23);
  try {
    await x.session.open(); const gate = x.holdWrite();
    const request = x.session.request('system.ping', new Uint8Array(512)); const rejected = assert.rejects(request);
    await gate.entered; x.failCancel(true); const closing = x.session.close(); const closeRejected = assert.rejects(closing);
    await new Promise<void>(r => setImmediate(r)); assert.equal(x.events.includes('cancel'), false);
    await assert.rejects(x.native.shutdownBluetooth(), /busy/);
    gate.release(); await rejected; await closeRejected;
    assert.equal(x.native.accessoryConnectionOwnership(), 'unknown'); assert.equal(x.session.transportReleasePending, true);
    await assert.rejects(x.native.bleDriver.connect('other'), /unknown/);
    x.failCancel(false); await x.session.close();
    assert.equal(x.session.transportReleasePending, false); assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
    assert.equal(x.events.filter(e => e === 'cancel').length, 2); assert.equal(x.monitors.size + x.disconnects.size, 0);
  } finally { x.failCancel(false); await x.finish(`${platform}-pending-write-cancel`); }
});

// The pre-fix characterization and failing desired behavior remain in commit 6ddbb80.
test('late Android permission grant cannot start a connection after session close', { timeout: 20000 }, async () => {
  const x = await fixture('android', 23);
  try {
    const gate = x.holdPermission(); const rejected = assert.rejects(x.session.open(), /cancelled/);
    await gate.entered; const closing = x.session.close();
    await new Promise<void>(r => setImmediate(r));
    assert.equal(x.events.includes('connect'), false); gate.release(); await rejected; await closing;
    assert.equal(x.events.includes('connect'), false); assert.equal(x.events.includes('discover'), false);
    assert.equal(x.events.includes('monitor'), false); assert.equal(x.events.includes('cancel'), false);
    assert.equal(x.session.transportReleasePending, false);
  } finally { await x.finish('android-late-permission-unissued'); }
});
for (const platform of ['android', 'ios'] as const) {
  test(`fake ${platform}: cancellation during readiness removes listener and prevents connect`, async () => {
    const x = await fixture(platform, 23);
    try {
      const ready = x.holdReadiness(); const rejected = assert.rejects(x.session.open(), /cancelled/);
      await new Promise<void>(r => setImmediate(r)); assert.ok(x.events.includes('readiness'));
      await assert.rejects(x.session.close(), /release unknown/); await rejected; ready();
      assert.ok(x.events.includes('remove-readiness')); assert.equal(x.events.includes('connect'), false);
    } finally { await x.finish(`${platform}-readiness-cancel`, true); }
  });
  for (const phase of ['connect', 'discover', ...(platform === 'android' ? ['requestMTU:185'] : []), 'characteristics']) {
    test(`fake ${platform}: cancel during ${phase} drains issued effect without next setup effect`, async () => {
      const x = await fixture(platform, 23);
      try {
        const gate = x.holdPhase(phase); const rejected = assert.rejects(x.session.open(), /cancelled/);
        await gate.entered; const before = [...x.events]; const closing = assert.rejects(x.session.close(), /release unknown/);
        await new Promise<void>(r => setImmediate(r)); assert.deepEqual(x.events, before);
        await assert.rejects(x.native.shutdownBluetooth(), /busy/);
        gate.release(); await rejected; await closing;
        assert.deepEqual(x.events.slice(before.length), ['cancel']);
        assert.equal(x.monitors.size + x.disconnects.size, 0); assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
        // Driver rejection has no transport cleanup certificate, even when fake native cleanup succeeded.
        assert.equal(x.session.transportReleasePending, true);
      } finally { await x.finish(`${platform}-${phase.replace(':','-')}-cancel`, true); }
    });
  }
}

test('cancelled native setup with failed cancellation retains unknown ownership', async () => {
  const x = await fixture('android', 23);
  try {
    const gate = x.holdPhase('discover'); const rejected = assert.rejects(x.session.open(), /cancellation failed/);
    await gate.entered; x.failCancel(true);
    const closing = assert.rejects(x.session.close(), /release unknown/);
    gate.release(); await rejected; await closing;
    assert.equal(x.native.accessoryConnectionOwnership(), 'unknown');
    assert.equal(x.session.transportReleasePending, true);
    assert.equal(x.events.includes('requestMTU:185'), false);
    await assert.rejects(x.native.bleDriver.connect('other'), /unknown/);
    await assert.rejects(x.session.close(), /release unknown/);
    assert.equal(x.events.filter(e => e === 'cancel').length, 1);
    // Explicit fake manager recovery is separate from transport release proof.
    await x.native.shutdownBluetooth();
    assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
    assert.equal(x.session.transportReleasePending, true);
  } finally { await x.finish('android-cancelled-setup-cancel-failed', true); }
});

// App handler -> real DeviceSession -> real BleTransport -> exact native adapter
// -> fake RN/PLX -> actual host C, where negotiation reaches the wire.
for (const platform of ['android', 'ios'] as const) {
  for (const phase of ['readiness', ...(platform === 'android' ? ['permission'] : []),
      'connect', 'discover', ...(platform === 'android' ? ['requestMTU:185'] : []),
      'characteristics', 'negotiation']) {
    test('App cancel on fake ' + platform + ' during ' + phase, { timeout: 20000 }, async () => {
      const x = await fixture(platform, 23); const h = harness();
      let release: () => void;
      let entered: Promise<void>;
      if (phase === 'readiness') {
        release = x.holdReadiness();
        entered = (async () => { while (!x.events.includes('readiness')) await new Promise<void>(r => setImmediate(r)); })();
      } else {
        const gate = phase === 'permission' ? x.holdPermission() : phase === 'negotiation' ? x.holdWrite() : x.holdPhase(phase);
        release = gate.release; entered = gate.entered;
      }
      const work = h.run(() => h.connect(x.transport));
      await entered;
      const selected = h.env.session.current!;
      const attempt = h.env.acquisition.current;
      const before = [...x.events];
      h.cancelAcquisition!(attempt); h.cancelAcquisition!(attempt);
      await new Promise<void>(r => setImmediate(r));
      if (phase !== 'readiness') assert.equal(h.env.lock.current, true);
      if (!['permission','readiness'].includes(phase)) assert.deepEqual(x.events, before);
      release(); await work;
      try {
        assert.equal(h.env.lock.current, false);
        assert.equal(h.env.acquisition.current, null);
        assert.equal(selected.state, 'closed');
        assert.equal(h.writes.some(values => String(values).includes('Connected:')), false);
        if (phase === 'negotiation') {
          assert.equal(h.env.session.current, null);
          assert.equal(selected.transportReleasePending, false);
          const writes = x.f.trace.filter(e => e.origin === 'native-client-write').map(e => Buffer.from(e.value.slice(2), 'hex'));
          assert.deepEqual(frames(writes).map(f => f.opcode), [1]); // no capabilities after cancelled Info
        } else if (phase === 'permission') {
          // Exact normal-result witness, before manager creation; no readiness proof.
          assert.equal(h.env.session.current, null);
          assert.equal(selected.transportReleasePending, false);
          assert.deepEqual(x.events.slice(before.length), []);
        } else {
          assert.equal(h.env.session.current, selected);
          assert.equal(selected.transportReleasePending, true);
          const setup = x.events.slice(before.length).filter(e => ['connect','discover','requestMTU:185','characteristics','monitor','write-enter'].includes(e));
          assert.deepEqual(setup, []);
          await h.run(h.disconnect);
          assert.equal(h.env.session.current, selected); // no release proof invented by retry
        }
      } finally { await x.finish('app-' + platform + '-' + phase.replace(':','-'), !['negotiation', 'permission'].includes(phase), selected); }
    });
  }
}
