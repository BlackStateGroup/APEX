import assert from 'node:assert/strict';
import test from 'node:test';
import { fromByteArray } from 'base64-js';
import type { Characteristic, Descriptor, Device, BleManager } from 'react-native-ble-plx';
import { readFlipperPhoneSnapshot, type FlipperPhoneLease, type FlipperPhoneManager, type FlipperPhoneCleanup } from '../packages/adapters/flipper-ble-plx.ts';
import { FLIPPER_SERIAL_UUIDS as UUID } from '../packages/adapters/flipper-ble-credit.ts';
// Compile-time compatibility check. Type-only import never loads React Native in host tests.
const acceptsNativeManager = (manager: BleManager): FlipperPhoneManager => manager;
void acceptsNativeManager;
const id = 'owned-fixture';
const turn = () => new Promise<void>(r => setImmediate(r));
const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const never = <T>(): Promise<T> => new Promise(() => {});
const b64 = (bytes: number[] | Uint8Array) => fromByteArray(Uint8Array.from(bytes));
const wire = (body: number[]) => [body.length, ...body];
const version = (requestId: number, minor = 25) => wire([8, requestId, 194, 2, 2, 16, minor]);
const pair = (requestId: number, tag: number, key: string, value: string) => {
  const content = [10, key.length, ...Buffer.from(key), 18, value.length, ...Buffer.from(value)];
  return wire([8, requestId, (tag * 8 + 2) % 128 + 128, Math.floor((tag * 8 + 2) / 128), content.length, ...content]);
};
const characteristic = (uuid: string, value: number[] = []) => ({ deviceID: id, serviceUUID: UUID.service, uuid, value: b64(value), isReadable: true, isIndicatable: uuid === UUID.transmit, isNotifiable: uuid === UUID.flowControl || uuid === UUID.rpcStatus, isWritableWithResponse: uuid === UUID.receive } as Characteristic);
class MockPhone {
  log: string[] = []; writes: string[] = []; closed = 0; cancelled: string[] = [];
  monitors = new Map<string, (error: any, value: Characteristic | null) => void>();
  disconnected: (error: any, device: Device | null) => void = () => {};
  removeDisconnect = 0; removeMonitor = 0;
  device = { id, mtu: 23 } as Device;
  powered = 'PoweredOn'; minor = 25; status = [1, 0, 0, 0]; credit = [0, 0, 0, 6];
  descriptorZeros = 0; descriptorBad = false; omitTx = false; notWritable = false; badBase64 = false; wrongCharacteristic = false;
  onConnect = async () => this.device;
  onCancel = async () => { queueMicrotask(() => this.disconnected(null, this.device)); return this.device; };
  onDiscover = async () => this.device;
  onDescriptor: (() => Promise<Descriptor>) | undefined;
  onWrite: (() => Promise<Characteristic>) | undefined;
  async state() { this.log.push('state'); return this.powered as any; }
  async connectToDevice(deviceId: string, options: unknown) { assert.equal(deviceId, id); assert.equal((options as any).autoConnect, false); assert.ok((options as any).timeout > 0 && (options as any).timeout <= 10000); this.log.push('connect'); return await this.onConnect(); }
  async cancelDeviceConnection(deviceId: string) { assert.equal(deviceId, id); this.log.push('cancel-device'); this.closed++; return await this.onCancel(); }
  onDeviceDisconnected(deviceId: string, listener: typeof this.disconnected) { assert.equal(deviceId, id); this.log.push('disconnect-listener'); this.disconnected = listener; return { remove: () => { this.removeDisconnect++; } }; }
  async discoverAllServicesAndCharacteristicsForDevice(deviceId: string, tx?: string) { assert.equal(deviceId, id); assert.ok(tx?.startsWith('apex-flipper-')); this.log.push('discover'); return await this.onDiscover(); }
  async characteristicsForDevice(deviceId: string, service: string) { assert.equal(deviceId, id); assert.equal(service, UUID.service); this.log.push('characteristics'); return Object.values(UUID).filter(v => v !== UUID.service && (!this.omitTx || v !== UUID.transmit)).map(v => { const c = characteristic(v); if (this.notWritable && v === UUID.receive) c.isWritableWithResponse = false; return c; }); }
  monitorCharacteristicForDevice(deviceId: string, service: string, uuid: string, listener: (error: any, value: Characteristic | null) => void, tx?: string, mode?: string) {
    assert.equal(deviceId, id); assert.equal(service, UUID.service); assert.ok(tx); assert.equal(mode, uuid === UUID.transmit ? 'indication' : 'notification');
    this.log.push(`monitor:${uuid}`); this.monitors.set(uuid, listener); return { remove: () => { this.removeMonitor++; } };
  }
  async readDescriptorForDevice(deviceId: string, service: string, uuid: string, descriptor: string) {
    assert.equal(deviceId, id); assert.equal(service, UUID.service); this.log.push(`cccd:${uuid}`);
    if (this.onDescriptor) return await this.onDescriptor();
    const bits = this.descriptorZeros-- > 0 ? 0 : this.descriptorBad ? 3 : uuid === UUID.transmit ? 2 : 1;
    return { deviceID: id, serviceUUID: service, characteristicUUID: uuid, uuid: descriptor, value: b64([bits, 0]) } as Descriptor;
  }
  async readCharacteristicForDevice(deviceId: string, service: string, uuid: string) {
    assert.equal(deviceId, id); assert.equal(service, UUID.service); this.log.push(`read:${uuid}`);
    const c = characteristic(uuid, uuid === UUID.rpcStatus ? this.status : this.credit);
    if (this.badBase64) c.value = '____'; if (this.wrongCharacteristic) c.deviceID = 'other-device'; return c;
  }
  async writeCharacteristicWithResponseForDevice(deviceId: string, service: string, uuid: string, value: string) {
    assert.equal(deviceId, id); assert.equal(service, UUID.service); assert.equal(uuid, UUID.receive); this.log.push('write-rx'); this.writes.push(value);
    if (this.onWrite) return await this.onWrite();
    const bytes = [...Buffer.from(value, 'base64')]; assert.equal(bytes.length, 6); const requestId = bytes[2]!;
    const response = bytes[3] === 0xba ? version(requestId, this.minor) : pair(requestId, bytes[3] === 0x82 ? 33 : 45, 'fixture', 'ok');
    for (let n = 0; n < response.length; n += 3) this.monitors.get(UUID.transmit)!(null, characteristic(UUID.transmit, response.slice(n, n + 3)));
    this.monitors.get(UUID.flowControl)!(null, characteristic(UUID.flowControl, this.credit));
    return characteristic(UUID.receive);
  }
  async cancelTransaction(tx: string) { this.cancelled.push(tx); }
  manager = this as unknown as FlipperPhoneManager;
}
function context(phone = new MockPhone()) {
  const completed: FlipperPhoneCleanup[] = []; let foreground = true; let current = true; let background: (active: boolean) => void = () => {};
  let removed = 0;
  const lease: FlipperPhoneLease = { manager: phone.manager, platform: 'android', assertCurrent() { if (!current) throw new Error('lease lost'); }, isForeground: () => foreground, onForegroundChange(listener) { background = listener; return () => { removed++; }; }, complete: value => completed.push(value) };
  return { phone, lease, completed, get removed() { return removed; }, background() { foreground = false; background(false); }, revoke() { current = false; } };
}
const options = () => ({ deviceId: id, setupTimeoutMs: 1000, requestTimeoutMs: 100, cleanupTimeoutMs: 100 });

test('concrete PLX lifecycle connects, verifies CCCDs and RPC status, reads snapshot and proves cleanup', async () => {
  const c = context(); const result = await readFlipperPhoneSnapshot(c.lease, options());
  assert.deepEqual(result, { version: { major: 0, minor: 25 }, identity: [{ key: 'fixture', value: 'ok' }], power: [{ key: 'fixture', value: 'ok' }] });
  assert.equal(c.phone.writes.length, 3); assert.equal(c.phone.closed, 1); assert.equal(c.phone.removeDisconnect, 1); assert.equal(c.phone.removeMonitor, 3); assert.equal(c.removed, 1); assert.deepEqual(c.completed, [{ state: 'closed' }]);
  assert.ok(c.phone.log.indexOf('disconnect-listener') < c.phone.log.indexOf('connect'));
  for (const uuid of [UUID.transmit, UUID.flowControl, UUID.rpcStatus]) assert.ok(c.phone.log.indexOf(`cccd:${uuid}`) < c.phone.log.indexOf('write-rx'));
  assert.ok(c.phone.log.indexOf(`read:${UUID.rpcStatus}`) < c.phone.log.indexOf('write-rx'));
});
test('subscription setup polls zero CCCD instead of treating monitor return as readiness', async () => {
  const c = context(); c.phone.descriptorZeros = 1; await readFlipperPhoneSnapshot(c.lease, options());
  assert.equal(c.phone.log.filter(x => x === `cccd:${UUID.transmit}`).length, 2);
});
test('iOS, preabort, invalid selection, background and invalid lease fail before native access', async () => {
  for (const mode of ['ios', 'abort', 'id', 'background', 'lease']) {
    const c = context(); const o = options(); const controller = new AbortController();
    if (mode === 'ios') c.lease.platform = 'ios'; if (mode === 'abort') controller.abort(); if (mode === 'id') o.deviceId = ''; if (mode === 'background') c.background(); if (mode === 'lease') c.revoke();
    await assert.rejects(readFlipperPhoneSnapshot(c.lease, { ...o, signal: controller.signal })); assert.equal(c.phone.log.length, 0);
  }
});
test('missing/wrong characteristics, CCCD modes, inactive RPC and malformed values cause no RPC writes', async () => {
  for (const mode of ['missing', 'write', 'cccd', 'inactive', 'base64', 'identity']) {
    const c = context(); if (mode === 'missing') c.phone.omitTx = true; if (mode === 'write') c.phone.notWritable = true; if (mode === 'cccd') c.phone.descriptorBad = true; if (mode === 'inactive') c.phone.status = [0, 0, 0, 0]; if (mode === 'base64') c.phone.badBase64 = true; if (mode === 'identity') c.phone.wrongCharacteristic = true;
    await assert.rejects(readFlipperPhoneSnapshot(c.lease, options())); assert.equal(c.phone.writes.length, 0); assert.deepEqual(c.completed, [{ state: 'closed' }]);
  }
});
test('unsupported protocol version preserves the specific error and sends no identity/power requests', async () => {
  const c = context(); c.phone.minor = 26; await assert.rejects(readFlipperPhoneSnapshot(c.lease, options()), /unsupported-version/); assert.equal(c.phone.writes.length, 1); assert.equal(c.completed[0]!.state, 'closed');
});
test('same manager is exclusive while connecting and same identifier is never reissued afterward', async () => {
  const c = context(); let resolve!: (d: Device) => void; c.phone.onConnect = () => new Promise(r => { resolve = r; });
  const task = readFlipperPhoneSnapshot(c.lease, options()); await turn(); await assert.rejects(readFlipperPhoneSnapshot(c.lease, options()), /manager-unavailable/); resolve(c.phone.device); await task;
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, options()), /fresh-manager-required/); assert.equal(c.phone.log.filter(x => x === 'connect').length, 1);
});
test('background during setup stops future reads/writes and cleanup waits for native settlement', async () => {
  const c = context(); let resolve!: (d: Device) => void; c.phone.onDiscover = () => new Promise(r => { resolve = r; });
  const task = readFlipperPhoneSnapshot(c.lease, options()); const rejected = assert.rejects(task, /background/); await turn(); c.background(); await turn(); resolve(c.phone.device); await rejected;
  assert.equal(c.phone.writes.length, 0); assert.equal(c.phone.log.filter(x => x === 'characteristics').length, 0); assert.equal(c.completed[0]!.state, 'closed');
});
test('native disconnect or monitor error during read aborts the client and prevents subsequent commands', async () => {
  for (const mode of ['disconnect', 'monitor', 'status']) {
    const c = context(); c.phone.onWrite = async () => { if (mode === 'disconnect') c.phone.disconnected(null, c.phone.device); else if (mode === 'monitor') c.phone.monitors.get(UUID.transmit)!(new Error('monitor failed'), null); else c.phone.monitors.get(UUID.rpcStatus)!(null, characteristic(UUID.rpcStatus, [0, 0, 0, 0])); return characteristic(UUID.receive); };
    await assert.rejects(readFlipperPhoneSnapshot(c.lease, options()), /disconnected|monitor failed|rpc-not-active/); assert.equal(c.phone.writes.length, 1); assert.equal(c.completed[0]!.state, 'closed');
  }
});
test('external abort cancels active transaction and ignores stale monitor callbacks after close', async () => {
  const c = context(); const controller = new AbortController(); c.phone.onWrite = async () => { controller.abort(); return characteristic(UUID.receive); };
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, { ...options(), signal: controller.signal }), /aborted/);
  assert.equal(c.phone.writes.length, 1); assert.ok(c.phone.cancelled.length > 0);
  const count = c.phone.writes.length; c.phone.monitors.get(UUID.transmit)!(null, characteristic(UUID.transmit, version(1))); c.phone.monitors.get(UUID.flowControl)!(null, characteristic(UUID.flowControl, c.phone.credit)); assert.equal(c.phone.writes.length, count);
});
test('cleanup requires a terminal disconnect event, not only cancellation promise success', async () => {
  const c = context(); c.phone.onCancel = async () => c.phone.device;
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, { ...options(), cleanupTimeoutMs: 10 }), /cleanup unconfirmed/); assert.equal(c.completed[0]!.state, 'unknown');
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, options()), /manager-unavailable/);
});
test('failed cancellation is unknown even if a disconnect event also arrives', async () => {
  const c = context(); c.phone.onCancel = async () => { c.phone.disconnected(null, c.phone.device); throw new Error('cancel rejected'); };
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, options()), /cleanup unconfirmed/); assert.equal(c.completed[0]!.state, 'unknown');
});
test('hung native operations retain unknown ownership and never permit manager reuse', async () => {
  const c = context(); c.phone.onDescriptor = () => never();
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, { ...options(), setupTimeoutMs: 10, cleanupTimeoutMs: 10 }), /cleanup unconfirmed/); assert.equal(c.completed[0]!.state, 'unknown'); assert.equal(c.phone.writes.length, 0);
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, options()), /manager-unavailable/);
});
test('late successful native connect after timeout is cancelled again and cannot orphan or write', async () => {
  const c = context(); let resolve!: (d: Device) => void; c.phone.onConnect = () => new Promise(r => { resolve = r; });
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, { ...options(), setupTimeoutMs: 10, cleanupTimeoutMs: 10 }), /cleanup unconfirmed/); const cancels = c.phone.closed;
  resolve(c.phone.device); await turn(); assert.equal(c.phone.closed, cancels + 1); assert.equal(c.phone.writes.length, 0); assert.equal(c.completed[0]!.state, 'unknown');
});
test('early disconnect while connect is pending cannot certify eventual native closure', async () => {
  const c = context(); let resolve!: (d: Device) => void; c.phone.onConnect = () => new Promise(r => { resolve = r; }); c.phone.onCancel = async () => c.phone.device;
  const task = readFlipperPhoneSnapshot(c.lease, { ...options(), cleanupTimeoutMs: 10 }); const rejected = assert.rejects(task, /cleanup unconfirmed/); await turn(); c.phone.disconnected(null, c.phone.device); resolve(c.phone.device); await rejected;
  assert.equal(c.completed[0]!.state, 'unknown'); assert.equal(c.phone.writes.length, 0);
});
test('hung write cannot yield successful read even if a valid version response already arrived', async () => {
  const c = context(); c.phone.onWrite = async () => { c.phone.monitors.get(UUID.transmit)!(null, characteristic(UUID.transmit, version(1))); return await never(); };
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, { ...options(), requestTimeoutMs: 10, cleanupTimeoutMs: 10 }), /cleanup unconfirmed/); assert.equal(c.phone.writes.length, 1); assert.equal(c.completed[0]!.state, 'unknown');
});

test('confirmed spontaneous disconnect tolerates native DeviceNotConnected with terminal proof', async () => {
  const c = context(); c.phone.onCancel = async () => { throw Object.assign(new Error('not connected'), { errorCode: 205 }); };
  c.phone.onWrite = async () => { c.phone.disconnected(null, c.phone.device); return characteristic(UUID.receive); };
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, options()), /phone-disconnected/);
  assert.equal(c.phone.closed, 1); assert.equal(c.completed[0]!.state, 'closed');
});

test('DeviceNotConnected cancellation race is accepted only with terminal disconnect proof', async () => {
  for (const event of [true, false]) {
    const c = context(); c.phone.onCancel = async () => { if (event) queueMicrotask(() => c.phone.disconnected(null, c.phone.device)); throw Object.assign(new Error('not connected'), { errorCode: 205 }); };
    const task = readFlipperPhoneSnapshot(c.lease, { ...options(), cleanupTimeoutMs: 10 });
    if (event) { const result = await task; assert.equal(result.power[0]!.value, 'ok'); assert.equal(c.completed[0]!.state, 'closed'); }
    else { await assert.rejects(task, /cleanup unconfirmed/); assert.equal(c.completed[0]!.state, 'unknown'); }
  }
});

test('clean pending-connect rejection is not cancelled twice after its terminal event', async () => {
  const c = context(); let rejectConnect!: (error: Error) => void; const controller = new AbortController();
  c.phone.onConnect = () => new Promise((_resolve, reject) => { rejectConnect = reject; });
  c.phone.onCancel = async () => {
    if (c.phone.closed > 1) throw Object.assign(new Error('not connected'), { errorCode: 205 });
    rejectConnect(new Error('cancelled connection'));
    setImmediate(() => c.phone.disconnected(null, c.phone.device));
    return c.phone.device;
  };
  const task = readFlipperPhoneSnapshot(c.lease, { ...options(), signal: controller.signal }); const rejected = assert.rejects(task, /phone-aborted/);
  await turn(); controller.abort(); await rejected;
  assert.equal(c.phone.closed, 1); assert.equal(c.completed[0]!.state, 'closed'); assert.equal(c.phone.writes.length, 0);
});

test('flow notification supersedes obsolete initial read bytes and read rejection', async () => {
  for (const mode of ['bad-value', 'rejection']) {
    const c = context(); const original = c.phone.readCharacteristicForDevice.bind(c.phone);
    c.phone.readCharacteristicForDevice = async (deviceId, service, uuid) => {
      if (uuid !== UUID.flowControl) return await original(deviceId, service, uuid);
      c.phone.monitors.get(UUID.flowControl)!(null, characteristic(UUID.flowControl, c.phone.credit));
      if (mode === 'rejection') throw new Error('superseded read failed');
      return characteristic(UUID.flowControl, [1, 0, 0, 0]);
    };
    const result = await readFlipperPhoneSnapshot(c.lease, options()); assert.equal(result.power[0]!.value, 'ok'); assert.equal(c.completed[0]!.state, 'closed');
  }
});

test('late identifier-only disconnect event never suppresses cancellation of the new native connection', async () => {
  const c = context(); c.phone.onDiscover = async () => { c.phone.disconnected(null, c.phone.device); return c.phone.device; };
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, options()), /phone-disconnected/);
  assert.equal(c.phone.closed, 1); assert.equal(c.phone.writes.length, 0); assert.equal(c.completed[0]!.state, 'closed');
});

test('write acknowledgement from a different service cannot complete a read', async () => {
  const c = context(); c.phone.onWrite = async () => {
    c.phone.monitors.get(UUID.transmit)!(null, characteristic(UUID.transmit, version(1)));
    return { ...characteristic(UUID.receive), serviceUUID: '00001800-0000-1000-8000-00805f9b34fb' } as Characteristic;
  };
  await assert.rejects(readFlipperPhoneSnapshot(c.lease, options()), /wrong-write-ack/); assert.equal(c.phone.writes.length, 1); assert.equal(c.completed[0]!.state, 'closed');
});
