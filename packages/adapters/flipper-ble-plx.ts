/** Optional Android phone bridge. Native manager ownership and user selection stay with the host. */
import { fromByteArray, toByteArray } from 'base64-js';
import type { BleManager, Characteristic, Descriptor, Device, Subscription } from 'react-native-ble-plx';
import { decodeFlipperCredit, FlipperBleCreditTransport, FLIPPER_SERIAL_UUIDS as UUID, type FlipperBleSerialPort } from './flipper-ble-credit.ts';
import { FlipperReadOnlyClient, FlipperRpcError } from './flipper-rpc.ts';

export type FlipperPhoneManager = Pick<BleManager,
  'state' | 'connectToDevice' | 'cancelDeviceConnection' | 'onDeviceDisconnected' |
  'discoverAllServicesAndCharacteristicsForDevice' | 'characteristicsForDevice' |
  'monitorCharacteristicForDevice' | 'readCharacteristicForDevice' |
  'readDescriptorForDevice' | 'writeCharacteristicWithResponseForDevice' | 'cancelTransaction'>;
export interface FlipperPhoneCleanup {
  state: 'closed' | 'unknown';
  reason?: string;
}
export interface FlipperPhoneLease {
  manager: FlipperPhoneManager;
  platform: 'android' | 'ios';
  /** Must throw unless the host still exclusively owns this manager for this operation. */
  assertCurrent(): void;
  isForeground(): boolean;
  onForegroundChange(listener: (active: boolean) => void): () => void;
  /** Release only on closed. Unknown means retain the lease until explicit host recovery. */
  complete(result: FlipperPhoneCleanup): void;
}
export interface FlipperPhoneOptions {
  deviceId: string;
  signal?: AbortSignal;
  setupTimeoutMs?: number;
  requestTimeoutMs?: number;
  cleanupTimeoutMs?: number;
}
export type FlipperPhoneSnapshot = Awaited<ReturnType<FlipperReadOnlyClient['readSnapshot']>>;
const CCCD = '00002902-0000-1000-8000-00805f9b34fb';
// Pinned PLX 3.5.1 BleErrorCode.DeviceNotConnected. Type-only imports keep native code lazy.
const isNotConnected = (cause: unknown) => cause !== null && typeof cause === 'object' && 'errorCode' in cause && cause.errorCode === 205;
const fail = (code: string) => new FlipperRpcError(`phone-${code}`);
const managers = new WeakMap<object, { busy: boolean; unknown: boolean; attemptedIds: Set<string> }>();
let sequence = 0;
function timeout(value: number | undefined, fallback: number): number {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 1 || n > 30000) throw fail('invalid-timeout');
  return n;
}
function decode(value: string | null, maxBytes: number): Uint8Array {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes / 3) * 4 || value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw fail('invalid-base64');
  const bytes = toByteArray(value);
  if (bytes.length > maxBytes || fromByteArray(bytes) !== value) throw fail('invalid-base64');
  return bytes;
}
function activeStatus(bytes: Uint8Array): void {
  // The pinned firmware sends its uint32 enum in native STM32 little-endian order.
  if (bytes.length !== 4 || bytes[0] !== 1 || bytes[1] || bytes[2] || bytes[3]) throw fail('rpc-not-active');
}
async function bounded<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  void promise.catch(() => undefined);
  if (ms <= 0) throw fail('timeout');
  if (signal?.aborted) throw fail('aborted');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let aborted: (() => void) | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      aborted = () => reject(fail('aborted'));
      signal?.addEventListener('abort', aborted, { once: true });
      timer = setTimeout(() => reject(fail('timeout')), ms);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (aborted) signal?.removeEventListener('abort', aborted);
  }
}

/**
 * One foreground snapshot over a user-selected device and a host-acquired exclusive manager lease.
 * Does not scan, request permissions, create/destroy managers, pair automatically, reset RPC or retry.
 * The host must obtain Android permissions and an exclusive lease before calling this function.
 */
export async function readFlipperPhoneSnapshot(lease: FlipperPhoneLease, options: FlipperPhoneOptions): Promise<FlipperPhoneSnapshot> {
  if (lease.platform !== 'android') throw fail('android-only');
  const id = options.deviceId;
  const signal = options.signal;
  if (typeof id !== 'string' || !id || id.length > 256) throw fail('invalid-device-id');
  const setupMs = timeout(options.setupTimeoutMs, 15000);
  const requestMs = timeout(options.requestTimeoutMs, 5000);
  const cleanupMs = timeout(options.cleanupTimeoutMs, 5000);
  if (signal?.aborted) throw fail('aborted');
  lease.assertCurrent();
  if (!lease.isForeground()) throw fail('background');
  const manager = lease.manager;
  const ownership = managers.get(manager) ?? { busy: false, unknown: false, attemptedIds: new Set<string>() };
  if (ownership.busy || ownership.unknown) throw fail('manager-unavailable');
  // PLX disconnect events identify only the device, not a connection generation.
  // Never reuse an attempted identifier in this manager object, even after clean shutdown.
  if (ownership.attemptedIds.has(id) || ownership.attemptedIds.size >= 32) throw fail('fresh-manager-required');
  if (++sequence > Number.MAX_SAFE_INTEGER) throw fail('sequence-exhausted');
  const prefix = `apex-flipper-${sequence}`;
  ownership.busy = true; managers.set(manager, ownership);
  const lifetime = new AbortController();
  const pending = new Set<Promise<unknown>>();
  const transactions = new Set<string>();
  const subscriptions: Subscription[] = [];
  const deadline = Date.now() + setupMs;
  let nextTransaction = 0;
  let closing = false;
  let portClosed = false;
  let reason: Error | undefined;
  let connectIssued = false;
  let connectSettled = false;
  let terminalDisconnect = false;
  let disconnected: Subscription | undefined;
  let removeForeground: (() => void) | undefined;
  let client: FlipperReadOnlyClient | undefined;
  let onData: ((bytes: Uint8Array) => void) | undefined;
  let onCredit: ((bytes: Uint8Array) => void) | undefined;
  let onError: ((error: Error) => void) | undefined;
  let latestCredit: Uint8Array | undefined;
  let creditGeneration = 0;
  let disconnectWake: (() => void) | undefined;
  const track = <T>(promise: Promise<T>): Promise<T> => {
    pending.add(promise);
    void promise.then(() => pending.delete(promise), () => pending.delete(promise));
    return promise;
  };
  const rejectSession = (cause: unknown) => {
    if (closing || portClosed || reason) return;
    reason = cause instanceof Error ? cause : fail('native-failure');
    lifetime.abort(); onError?.(reason);
  };
  const check = () => {
    if (closing || portClosed || lifetime.signal.aborted) throw reason ?? fail('closed');
    lease.assertCurrent();
    if (!lease.isForeground()) throw fail('background');
  };
  const transaction = () => {
    if (nextTransaction >= 512) throw fail('transaction-budget');
    const value = `${prefix}-${++nextTransaction}`; transactions.add(value); return value;
  };
  const step = async <T>(run: (transactionId: string) => Promise<T>): Promise<T> => {
    check();
    if (Date.now() >= deadline) throw fail('setup-timeout');
    const result = await bounded(track(run(transaction())), deadline - Date.now(), lifetime.signal);
    check(); return result;
  };
  const readValue = (characteristic: Characteristic, uuid: string, max: number) => {
    if (characteristic.deviceID !== id || characteristic.serviceUUID.toLowerCase() !== UUID.service || characteristic.uuid.toLowerCase() !== uuid) throw fail('wrong-characteristic');
    return decode(characteristic.value, max);
  };
  const lateCancel = () => {
    // A timed-out native connect is still alive. Its late settlement cannot orphan a device.
    if (closing) { try { void track(manager.cancelDeviceConnection(id)).catch(cause => { if (!isNotConnected(cause)) ownership.unknown = true; }); } catch (cause) { if (!isNotConnected(cause)) ownership.unknown = true; } }
  };
  const abort = () => rejectSession(fail('aborted'));
  let result: FlipperPhoneSnapshot | undefined;
  let primaryError: unknown;
  try {
    signal?.addEventListener('abort', abort, { once: true });
    removeForeground = lease.onForegroundChange(active => { if (!active) rejectSession(fail('background')); });
    check();
    if (await step(() => manager.state()) !== 'PoweredOn') throw fail('bluetooth-not-powered-on');
    disconnected = manager.onDeviceDisconnected(id, (_error, device) => {
      if (device?.id !== id) return;
      if (connectSettled) { terminalDisconnect = true; disconnectWake?.(); }
      if (!closing) rejectSession(fail('disconnected'));
    });
    check();
    if (Date.now() >= deadline) throw fail('setup-timeout');
    ownership.attemptedIds.add(id); connectIssued = true;
    let connectPromise: Promise<Device>;
    try { connectPromise = manager.connectToDevice(id, { timeout: Math.min(deadline - Date.now(), 10000), autoConnect: false }); }
    catch (cause) { connectSettled = true; throw cause; }
    const connection = track(connectPromise.then(device => { connectSettled = true; lateCancel(); return device; }, cause => { connectSettled = true; throw cause; }));
    const device = await bounded(connection, deadline - Date.now(), lifetime.signal);
    check(); if (device.id !== id) throw fail('wrong-device');
    await step(tx => manager.discoverAllServicesAndCharacteristicsForDevice(id, tx));
    const chars = await step(() => manager.characteristicsForDevice(id, UUID.service));
    const characteristic = (uuid: string) => {
      const matches = chars.filter(c => c.deviceID === id && c.serviceUUID.toLowerCase() === UUID.service && c.uuid.toLowerCase() === uuid);
      if (matches.length !== 1) throw fail('missing-or-ambiguous-characteristic'); return matches[0]!;
    };
    if (!characteristic(UUID.receive).isWritableWithResponse || !characteristic(UUID.transmit).isIndicatable ||
        !characteristic(UUID.flowControl).isReadable || !characteristic(UUID.flowControl).isNotifiable ||
        !characteristic(UUID.rpcStatus).isReadable || !characteristic(UUID.rpcStatus).isNotifiable) throw fail('unsupported-characteristics');
    for (const [uuid, mode] of [[UUID.transmit, 'indication'], [UUID.flowControl, 'notification'], [UUID.rpcStatus, 'notification']] as const) {
      check(); if (Date.now() >= deadline) throw fail('setup-timeout');
      const subscription = manager.monitorCharacteristicForDevice(id, UUID.service, uuid, (error, value) => {
        if (closing || portClosed || reason) return;
        try {
          check(); if (error) throw error; if (!value) throw fail('missing-notification');
          const bytes = readValue(value, uuid, uuid === UUID.transmit ? 486 : 4);
          if (uuid === UUID.rpcStatus) activeStatus(bytes);
          else if (uuid === UUID.flowControl) { decodeFlipperCredit(bytes); latestCredit = bytes; creditGeneration++; onCredit?.(bytes); }
          else { if (!onData) throw fail('unsolicited-data'); onData(bytes); }
        } catch (cause) { rejectSession(cause); }
      }, transaction(), mode);
      subscriptions.push(subscription);
    }
    // monitor() is not a readiness acknowledgement. Read remote CCCDs until their bits agree.
    // Android PLX isNotifying checks only bit 0, so it cannot certify indication-only TX.
    for (const [uuid, expected] of [[UUID.transmit, 2], [UUID.flowControl, 1], [UUID.rpcStatus, 1]] as const) {
      for (;;) {
        const descriptor: Descriptor = await step(tx => manager.readDescriptorForDevice(id, UUID.service, uuid, CCCD, tx));
        if (descriptor.deviceID !== id || descriptor.serviceUUID.toLowerCase() !== UUID.service || descriptor.characteristicUUID.toLowerCase() !== uuid || descriptor.uuid.toLowerCase() !== CCCD) throw fail('wrong-descriptor');
        const bytes = decode(descriptor.value, 2);
        if (bytes.length !== 2 || bytes[1] || (bytes[0] !== 0 && bytes[0] !== expected)) throw fail('wrong-subscription-mode');
        if (bytes[0] === expected) break;
        await bounded(new Promise<void>(resolve => setTimeout(resolve, 50)), deadline - Date.now(), lifetime.signal);
      }
    }
    activeStatus(readValue(await step(tx => manager.readCharacteristicForDevice(id, UUID.service, UUID.rpcStatus, tx)), UUID.rpcStatus, 4));
    if (!latestCredit) {
      const generation = creditGeneration;
      let initial: Characteristic | undefined;
      try { initial = await step(tx => manager.readCharacteristicForDevice(id, UUID.service, UUID.flowControl, tx)); }
      catch (cause) {
        check();
        if (generation === creditGeneration || !latestCredit || Date.now() >= deadline) throw cause;
      }
      // A notification supersedes the old read, including obsolete validation errors.
      if (initial && generation === creditGeneration) {
        const bytes = readValue(initial, UUID.flowControl, 4); decodeFlipperCredit(bytes); latestCredit = bytes;
      }
    }
    check();
    const port: FlipperBleSerialPort = {
      subscribeData(listener) { check(); onData = listener; return () => { onData = undefined; }; },
      subscribeCredit(listener) { check(); onCredit = listener; listener(latestCredit!); return () => { onCredit = undefined; }; },
      subscribeDisconnect(listener) { check(); onError = listener; return () => { onError = undefined; }; },
      async readCredit(signal) { check(); if (signal.aborted) throw fail('aborted'); return Uint8Array.from(latestCredit!); },
      async writeChunk(bytes, signal) {
        check(); if (signal.aborted) throw fail('aborted');
        const tx = transaction();
        const cancel = () => { try { void track(manager.cancelTransaction(tx)).catch(rejectSession); } catch (cause) { rejectSession(cause); } };
        signal.addEventListener('abort', cancel, { once: true });
        try {
          const value = await bounded(track(manager.writeCharacteristicWithResponseForDevice(id, UUID.service, UUID.receive, fromByteArray(bytes), tx)), requestMs, lifetime.signal);
          check(); if (value.deviceID !== id || value.serviceUUID.toLowerCase() !== UUID.service || value.uuid.toLowerCase() !== UUID.receive) throw fail('wrong-write-ack');
        } finally { signal.removeEventListener('abort', cancel); }
      },
      // Invalidate immediately, but let transport onError preserve its specific failure.
      // The outer finally aborts the shared lifetime during cleanup.
      close() { portClosed = true; },
    };
    // Conservative default-MTU payload. No MTU negotiation or optimistic larger packets.
    client = new FlipperReadOnlyClient(new FlipperBleCreditTransport(port, { packetBytes: 20, timeoutMs: requestMs }), { timeoutMs: requestMs });
    result = await client.readSnapshot(lifetime.signal);
  } catch (cause) { primaryError = reason ?? cause; }
  finally {
    closing = true; lifetime.abort(); client?.close();
    signal?.removeEventListener('abort', abort);
    try { removeForeground?.(); } catch { ownership.unknown = true; }
    for (const subscription of subscriptions) { try { subscription.remove(); } catch { ownership.unknown = true; } }
    let cleanupError: unknown;
    const cleanupDeadline = Date.now() + cleanupMs;
    try {
      const cancellations = [...transactions].map(tx => { try { return track(manager.cancelTransaction(tx)); } catch (cause) { return Promise.reject(cause); } });
      // Always cancel: an untagged late disconnect event alone cannot identify this connection.
      if (connectIssued) {
        try { cancellations.push(track(manager.cancelDeviceConnection(id)).then(() => undefined, cause => { if (!isNotConnected(cause)) throw cause; })); }
        catch (cause) { if (!isNotConnected(cause)) cancellations.push(Promise.reject(cause)); }
      }
      const cancelled = await bounded(Promise.allSettled(cancellations), cleanupDeadline - Date.now());
      if (cancelled.some(value => value.status === 'rejected')) throw fail('cleanup-cancellation-failed');
      while (pending.size) await bounded(Promise.allSettled([...pending]), cleanupDeadline - Date.now());
      if (connectIssued && !terminalDisconnect) await bounded(new Promise<void>(resolve => { disconnectWake = resolve; }), cleanupDeadline - Date.now());
      if (ownership.unknown) throw fail('cleanup-uncertain');
    } catch (cause) { cleanupError = cause; ownership.unknown = true; }
    finally { disconnectWake = undefined; try { disconnected?.remove(); } catch { ownership.unknown = true; cleanupError ??= fail('disconnect-cleanup-failed'); } }
    ownership.busy = false;
    const cleanup: FlipperPhoneCleanup = ownership.unknown ? { state: 'unknown', reason: 'Native cleanup is unconfirmed; retain the manager lease and use explicit host recovery.' } : { state: 'closed' };
    try { lease.complete(cleanup); } catch (cause) { ownership.unknown = true; throw cause; }
    if (cleanupError) throw new AggregateError([...(primaryError ? [primaryError] : []), cleanupError], 'Flipper phone cleanup unconfirmed; manager lease must remain unavailable');
  }
  if (primaryError) throw primaryError;
  if (!result) throw fail('missing-result');
  return result;
}
