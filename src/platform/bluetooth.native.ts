import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { fromByteArray, toByteArray } from 'base64-js';
import type { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { AXP_NOTIFY, AXP_SERVICE, AXP_WRITE } from '../../packages/core/ble-transport.ts';
import type { BleCandidate, BleDriver } from '../../packages/core/ble-transport.ts';

import { createServiceDataController } from '../../packages/core/ble-service-data-session.ts';
import type { ServiceDataLease, ServiceDataSession } from '../../packages/core/ble-service-data-session.ts';
import type { BlePlxSelectedService } from '../../packages/core/ble-plx-service-data-filter.ts';
import { createScanController } from '../../packages/core/ble-scan-session.ts';
import { observationServiceUuid, prepareForegroundObservation } from '../../packages/core/ble-observation-session.ts';
import type { ForegroundObservationOptions, ForegroundObservationSession } from '../../packages/core/ble-observation-session.ts';

let manager: BleManager | null = null;
let loading: Promise<BleManager> | null = null;
let connectionPreparing = false;
let shuttingDown = false;
let managerEpoch = 0;
let managerUnhealthy = false;
let managerCreationUnknown = false;
// PLX can forget its subscription before underlying remove throws. Destruction
// cannot recover that lost ownership; keep this latch for the process lifetime.
let readinessCleanupUnknown = false;
// The exposed SDK query remains owned after a caller stops waiting. This is
// deliberately independent of scanner/connection cancellation and SDK internals.
type ReadinessOwner = { ble: BleManager; epoch: number; query?: ReturnType<BleManager['state']> };
let readinessOwner: ReadinessOwner | null = null;
const stateQueries = new Set<ReadinessOwner>();
let stateQueryDispatchUnknown = false;
function assertReadinessQuiescent() {
  assertReadinessCleanupKnown();
  if (readinessOwner || stateQueries.size) throw new Error('Bluetooth readiness operation still pending');
}
function assertReadinessCleanupKnown() {
  if (readinessCleanupUnknown) throw new Error('Bluetooth readiness cleanup unknown; restart the app before retrying');
  if (stateQueryDispatchUnknown) throw new Error('Bluetooth state query dispatch unknown; restart the app before retrying');
}
type ObservationOwner = {
  preparing: boolean; signal?: AbortSignal; ble?: BleManager; epoch: number;
  pending: Set<Promise<void>>; destroying?: Promise<void>; released: boolean;
  lease?: ServiceDataLease;
};
let observationOwner: ObservationOwner | null = null;
type ConnectionLease = {
  id: string; ble: BleManager; epoch: number; unknown: boolean;
  release: () => void;
};
const connections = new Set<ConnectionLease>();
// PLX events have no generation token. Reuse needs a consumed terminal fence or a new epoch.
const attemptedIds = new Set<string>();
const disconnectFences = new Set<() => void>();
let cancellationsPending = 0;
let writesPending = 0;
/** Aggregate seam only. Future exclusive acquisition must also reserve its own lease. */
export function accessoryConnectionOwnership(): 'idle' | 'owned' | 'unknown' {
  if (managerUnhealthy || [...connections].some(lease => lease.unknown)) return 'unknown';
  return readinessOwner || stateQueries.size || connectionPreparing || cancellationsPending > 0 || connections.size > 0 ? 'owned' : 'idle';
}
// Core cleanup timeouts are not cancellation of native promises. Keep this
// fence outside the replaceable controller until each SDK call settles. On iOS,
// void scan bridge exports acknowledge JS dispatch only, not native completion.
const ordinaryScanOperations = new Set<Promise<void>>();
function trackOrdinaryScanOperation(run: () => Promise<void>): Promise<void> {
  const operation = Promise.resolve().then(run);
  ordinaryScanOperations.add(operation);
  void operation.then(() => ordinaryScanOperations.delete(operation), () => ordinaryScanOperations.delete(operation));
  return operation;
}
function makeScanner() {
  let ble: BleManager;
  let epoch: number;
  return createScanController<Device>({
    async prepare(signal) { ble = await prepare(signal); epoch = managerEpoch; },
    start(uuid, callback, allowDuplicates) {
      return trackOrdinaryScanOperation(async () => {
        assertReadinessQuiescent();
        if (manager !== ble || epoch !== managerEpoch) throw new Error('Bluetooth scanner belongs to an unavailable manager');
        await ble.startDeviceScan([uuid], { allowDuplicates }, (error, device) => {
          if (manager === ble && epoch === managerEpoch) callback(error, device ?? undefined);
        });
      });
    },
    stop() {
      return trackOrdinaryScanOperation(async () => {
        if (manager !== ble || epoch !== managerEpoch) throw new Error('Bluetooth scanner belongs to an unavailable manager');
        await ble.stopDeviceScan();
      });
    },
  });
}
let scanner = makeScanner();
function assertManagerHealthy() {
  assertReadinessCleanupKnown();
  if (observationOwner) throw new Error('Bluetooth manager busy with exclusive observation');
  if (managerUnhealthy || !scanner.healthy || [...connections].some(lease => lease.unknown)) throw new Error('Bluetooth manager state unknown; shut down Bluetooth before retrying');
}
function assertScanAvailable() {
  assertReadinessQuiescent();
  assertManagerHealthy();
  if (connectionPreparing || shuttingDown) throw new Error('Bluetooth manager busy');
}

async function getManager(): Promise<BleManager> {
  if (manager) return manager;
  loading ??= import('react-native-ble-plx').then(module => {
    try { manager = new module.BleManager(); return manager; }
    catch (error) { managerCreationUnknown = true; managerUnhealthy = true; throw error; }
  }).catch(() => { loading = null; throw new Error('Install an APEX development build with Bluetooth support'); });
  return loading;
}
async function prepare(signal?: AbortSignal, permissionExit?: (error: Error) => void): Promise<BleManager> {
  const check = () => { assertReadinessCleanupKnown(); if (signal?.aborted) throw new Error('Bluetooth preparation cancelled'); };
  check();
  if (Platform.OS === 'android') {
    const required = Number(Platform.Version) >= 31 ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const grants = await PermissionsAndroid.requestMultiple(required);
    const notePermissionExit = (error: Error) => {
      // Only a complete ordinary RN result is evidence. Preserve the original
      // denial/throw behavior for malformed results, without reading accessors.
      let normal = false;
      if (permissionExit) try {
        normal = Object.getPrototypeOf(grants) === Object.prototype && required.every(permission => {
          const entry = Object.getOwnPropertyDescriptor(grants, permission);
          return !!entry && 'value' in entry && ['granted', 'denied', 'never_ask_again'].includes(entry.value);
        });
      } catch { /* A malformed result cannot attest this prefix. */ }
      if (normal) permissionExit?.(error);
    };
    if (required.some(permission => grants[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
      const error = new Error('Bluetooth permission denied');
      notePermissionExit(error); throw error;
    }
    if (signal?.aborted) {
      const error = new Error('Bluetooth preparation cancelled');
      notePermissionExit(error); throw error;
    }
  }
  check();
  const ble = await getManager();
  check();
  // Existing scanner, connectionPreparing and observation leases cover the
  // permission/import prefix. Reserve only at the SDK readiness boundary so an
  // ordinary cancelled permission prompt cannot prevent manager reset.
  assertReadinessQuiescent();
  if (shuttingDown || manager !== ble) throw new Error('Bluetooth manager unavailable');
  const owner: ReadinessOwner = { ble, epoch: managerEpoch };
  readinessOwner = owner;
  try {
    await new Promise<void>((resolve, reject) => {
      let subscription: Subscription | undefined;
      let registrationComplete = false, requested = false, settled = false;
      let sdkRegistrationStarted = false, eventObserved = false;
      let hasError = false, readinessError: unknown;
      let vetoed = false, vetoError: unknown;
      const registrationErrors: unknown[] = [];
      const uncertain = () => { readinessCleanupUnknown = true; managerUnhealthy = true; };
      const drain = () => {
        if (!registrationComplete || settled) return;
        if (!requested && !vetoed && !registrationErrors.length) return;
        // A terminal success is a decision, not permission to finish while a
        // query is outstanding. Cancellation and the deadline remain live.
        if (!hasError && !vetoed && !registrationErrors.length && stateQueries.has(owner)) return;
        settled = true;
        const errors = hasError ? [readinessError, ...registrationErrors] : vetoed ? [vetoError, ...registrationErrors] : [...registrationErrors];
        const cleanup = (run: () => void, sdkOwnership = false) => {
          try { run(); } catch (error) { if (sdkOwnership) uncertain(); errors.push(error); }
        };
        cleanup(() => clearTimeout(timer));
        cleanup(() => subscription?.remove(), true);
        cleanup(() => signal?.removeEventListener('abort', cancelled));
        if (!errors.length) try {
          check();
          if (readinessOwner !== owner || manager !== ble || managerEpoch !== owner.epoch || shuttingDown) throw new Error('Bluetooth readiness belongs to an unavailable manager');
        } catch (error) { errors.push(error); }
        if (errors.length === 1) reject(errors[0]);
        else if (errors.length) reject(new AggregateError(errors, 'Bluetooth readiness failed; cleanup may be unknown'));
        else resolve();
      };
      const finish = (failed: boolean, error?: unknown) => {
        if (requested || settled || vetoed) return;
        requested = true; hasError = failed; readinessError = error;
        drain();
      };
      const veto = (error: unknown) => {
        if (settled || vetoed) return;
        vetoed = true; vetoError = error; drain();
      };
      const cancelled = () => veto(new Error('Bluetooth preparation cancelled'));
      const timer = setTimeout(() => veto(new Error('Bluetooth did not become ready')), 10000);
      const stateChanged = (state: string) => {
        if (state === 'PoweredOn') finish(false);
        else if (state === 'Unauthorized' || state === 'Unsupported' || state === 'PoweredOff') finish(true, new Error(`Bluetooth ${state.toLowerCase()}`));
      };
      try {
        signal?.addEventListener('abort', cancelled, { once: true });
        sdkRegistrationStarted = true;
        subscription = ble.onStateChange(state => {
          eventObserved = true;
          stateChanged(state);
        }, false);
        if (typeof subscription?.remove !== 'function') throw new Error('Bluetooth readiness subscription cleanup unavailable');
      } catch (error) {
        if (sdkRegistrationStarted) uncertain();
        registrationErrors.push(error); requested = true;
      }
      registrationComplete = true;
      if (signal?.aborted) cancelled();
      // A synchronous terminal event needs no snapshot. Registration validation
      // still precedes completion, including original/falsy registration errors.
      if (!requested && !vetoed && !registrationErrors.length) {
        stateQueries.add(owner);
        try {
          const query = ble.state();
          owner.query = query;
          // Observe the actual exposed SDK promise immediately, in this stack.
          // Both handlers consume late outcomes without reviving the caller.
          void query.then(state => {
            stateQueries.delete(owner);
            if (!settled && !eventObserved) stateChanged(state);
            drain();
          }, error => {
            stateQueries.delete(owner);
            if (!settled) finish(true, error);
            drain();
          });
        } catch (error) {
          stateQueries.delete(owner);
          stateQueryDispatchUnknown = true; managerUnhealthy = true;
          // No exposed promise can account for dispatch-before-throw. This is
          // separate from losing the subscription, whose handle we still own.
          registrationErrors.push(error); requested = true;
        }
      }
      drain();
    });
    check();
    if (manager !== ble || managerEpoch !== owner.epoch || shuttingDown) throw new Error('Bluetooth readiness belongs to an unavailable manager');
    return ble;
  } finally {
    if (readinessOwner === owner) readinessOwner = null;
  }
}

/** Existing AXP discovery keeps its exact filter. Both scan modes share an exclusive lease. */
export async function scanAccessories(onDevice: (device: BleCandidate) => void, onEnd: (error?: Error) => void): Promise<() => Promise<void>> {
  assertScanAvailable();
  const session = scanner.start({ serviceUuid: AXP_SERVICE, durationMs: 10000, maxCount: 100, maxCharacters: 409600,
    project(device) { const value = { id: device.id, name: (device.name ?? device.localName ?? 'AXP accessory').slice(0, 128), rssi: device.rssi }; return { value, characters: JSON.stringify(value).length }; },
    onValue: onDevice, onEnd: result => onEnd(result.error),
  });
  return async () => { await session.stop(); };
}

/** Explicit, foreground-only observation. Does not connect, write, save or export. */
export function startForegroundObservation(options: ForegroundObservationOptions): ForegroundObservationSession {
  options = { ...options };
  assertScanAvailable();
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error('Native Bluetooth observation unavailable');
  const isBackground = () => AppState.currentState === 'background';
  if (AppState.currentState !== 'active') throw new Error('Bluetooth observation requires an active foreground app');
  const platform = Platform.OS;
  const serviceUuid = observationServiceUuid(options.serviceUuid);
  let session: ForegroundObservationSession | undefined;
  const listener = AppState.addEventListener('change', state => { if (state === 'background') void session?.stop('background'); });
  try {
    session = scanner.start({ serviceUuid, allowDuplicates: true, durationMs: options.durationMs ?? 10000, maxCount: options.maxCount ?? 25, maxCharacters: options.maxCharacters ?? 65536,
      project: device => prepareForegroundObservation(platform, device, options.serviceUuid, options.receiptClock()),
      onValue: options.onObservation, onEnd: result => { listener.remove(); options.onEnd(result); },
    });
    if (isBackground()) void session.stop('background');
    return session;
  } catch (error) { listener.remove(); throw error; }
}
export async function stopForegroundObservation(): Promise<void> { const result = await scanner.stop(); if (result?.error) throw result.error; }

/** Explicit broad SDK observation. Future UI must obtain informed one-session opt-in. */
export function startSelectedServiceDataObservation(options: { service: BlePlxSelectedService; receiptClock(): string }): ServiceDataSession {
  assertScanAvailable();
  // PLX 3.5.1 iOS exports void destroyClient: JS await is not native acknowledgement.
  if (Platform.OS !== 'android') throw new Error('Exclusive service-data observation requires Android; iOS destruction acknowledgement unavailable');
  if (scanner.busy || ordinaryScanOperations.size || cancellationsPending || writesPending || connections.size || loading && !manager) throw new Error('Bluetooth manager busy');
  if (AppState.currentState !== 'active') throw new Error('Bluetooth observation requires an active foreground app');
  if (!['FCD2', 'FEAA'].includes(options.service) || typeof options.receiptClock !== 'function') throw new Error('Select FCD2/FEAA');
  // Reserve before controller acquisition (which is deliberately deferred).
  const owner: ObservationOwner = { preparing: true, epoch: managerEpoch, pending: new Set(), released: false };
  observationOwner = owner;
  const current = () => observationOwner === owner && !owner.released && owner.epoch === managerEpoch;
  const operation = (run: () => Promise<void>) => {
    if (!current() || owner.destroying) return Promise.reject(new Error('Exclusive observation lease unavailable'));
    const promise = Promise.resolve().then(run);
    owner.pending.add(promise);
    void promise.then(() => owner.pending.delete(promise), () => owner.pending.delete(promise));
    return promise;
  };
  const lease: ServiceDataLease = {
    startBroad(request, callback) {
      return operation(async () => {
        if (owner.signal?.aborted) return;
        assertReadinessQuiescent();
        if (request.serviceUUIDs !== null || request.allowDuplicates !== true || !owner.ble) throw new Error('Invalid exclusive scan request');
        await owner.ble.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
          if (current() && !owner.signal?.aborted && !owner.destroying) callback(error, device ?? undefined);
        });
      });
    },
    stop() { return operation(async () => { if (owner.ble) await owner.ble.stopDeviceScan(); }); },
    destroyAndRelease() {
      if (owner.released) return Promise.resolve();
      if (!current()) return Promise.reject(new Error('Exclusive observation lease unavailable'));
      if (owner.destroying) return owner.destroying;
      // Never destroy across an unresolved native start/stop. A controller timeout
      // does not cancel an SDK promise or make it safe to reuse the singleton.
      const destruction = (async () => {
        await Promise.allSettled([...owner.pending]);
        assertReadinessQuiescent();
        if (owner.preparing || managerCreationUnknown) throw new Error('Exclusive acquisition state unknown');
        managerUnhealthy = true;
        await owner.ble?.destroy();
        if (!current()) throw new Error('Exclusive observation epoch changed');
        resetDestroyedManager();
        owner.released = true;
        observationOwner = null;
      })();
      owner.destroying = destruction;
      void destruction.then(() => { owner.destroying = undefined; }, () => { owner.destroying = undefined; });
      return destruction;
    },
  };
  owner.lease = lease;
  let session: ServiceDataSession | undefined;
  let listener: Subscription | undefined;
  try {
    listener = AppState.addEventListener('change', state => { if (state === 'background') void session?.stop('background'); });
    const controller = createServiceDataController({ async acquireExclusive(signal) {
      owner.signal = signal;
      try {
        owner.ble = await prepare(signal);
        owner.preparing = false;
        return lease;
      } catch {
        // prepare can create a manager before readiness/cancellation fails.
        owner.ble = manager ?? undefined;
        owner.preparing = false;
        try { await lease.stop(); } finally { await lease.destroyAndRelease(); }
        return null;
      }
    } });
    session = controller.start({ ...options, platform: Platform.OS });
    void session.done.then(() => {
      listener?.remove();
      // Stop before the deferred acquisition runs certifies that no acquisition
      // occurred. No asynchronous prepare was entered in this case.
      if (current() && !owner.signal) { owner.released = true; observationOwner = null; }
    });
    if ((AppState.currentState as string) === 'background') void session.stop('background');
    return session;
  } catch (error) {
    listener?.remove();
    if (!owner.signal) { owner.released = true; observationOwner = null; }
    throw error;
  }
}

// Identity-only, one-shot evidence. Tombstones prevent reuse from reviving a record.
// This certifies only local non-acquisition, never manager health/native release.
type UnissuedAttempt = { id: string; eligible: boolean; rejection?: unknown };
const seenAttempts = new WeakSet<object>();
const unissuedAttempts = new WeakMap<object, UnissuedAttempt>();
export const bleDriver: BleDriver = {
  consumeUnissuedConnection(attempt, id, rejection) {
    const record = unissuedAttempts.get(attempt);
    unissuedAttempts.delete(attempt); // Even a wrong receiver/id/error consumes the query.
    return this === bleDriver && !!record?.eligible && record.id === id && Object.is(record.rejection, rejection);
  },
  async connect(id, signal, attempt) {
    let record: UnissuedAttempt | undefined;
    if (attempt !== null && (typeof attempt === 'object' || typeof attempt === 'function')) {
      if (seenAttempts.has(attempt)) unissuedAttempts.delete(attempt);
      else {
        seenAttempts.add(attempt);
        record = { id, eligible: false };
        unissuedAttempts.set(attempt, record);
      }
    }
    let witness: Error | undefined;
    let acquisitionSectionEntered = false;
    try {
      if (signal?.aborted) {
        witness = new Error('Bluetooth connection cancelled');
        throw witness;
      }
      const checkCancelled = () => { if (signal?.aborted) throw new Error('Bluetooth connection cancelled'); };
      checkCancelled();
      assertScanAvailable();
      connectionPreparing = true;
      try {
        const result = await scanner.stop();
        checkCancelled();
        if (result?.error) throw result.error;
        assertManagerHealthy();
        // Only normally settled Android permission results can witness this prefix.
        // No callback is used after getManager or for a thrown/rejected request.
        const prefixEpoch = managerEpoch, prefixScanner = scanner;
        const cleanPrefix = ordinaryScanOperations.size === 0 && !managerCreationUnknown;
        const ble = await prepare(signal, error => {
          if (cleanPrefix && !ordinaryScanOperations.size && !shuttingDown && !managerCreationUnknown &&
              prefixEpoch === managerEpoch && prefixScanner === scanner && scanner.healthy &&
              !managerUnhealthy && !observationOwner && ![...connections].some(lease => lease.unknown)) witness = error;
        });
        const epoch = managerEpoch;
        const assertConnectionCurrent = () => {
          checkCancelled();
          assertManagerHealthy();
          if (shuttingDown || manager !== ble || epoch !== managerEpoch) throw new Error('Bluetooth connection belongs to an unavailable manager');
        };
        assertConnectionCurrent();
        // PLX 3.5.1 cancellation is identifier-scoped. Never let two leases for
        // the same identifier cancel one another (including uncertain attempts).
        if (attemptedIds.has(id)) throw new Error('Bluetooth accessory already owned in this manager epoch; shut down Bluetooth before reconnecting');
        let disconnected = false;
        let connecting = true;
        let nativeConnectSucceeded = false;
        let nativeClosed = false;
        let confirmedClosed = false;
        let intentionalClose = false;
        let closedSubscription: Subscription | undefined;
        let listenerRetired = false;
        let cancellation: Promise<void> | undefined;
        const notifications = new Set<Subscription>();
        const closedListeners = new Set<{ callback: (error: Error) => void }>();
        const current = () => manager === ble && epoch === managerEpoch;
        const removeClosedSubscription = () => { listenerRetired = true; closedSubscription?.remove(); disconnectFences.delete(removeClosedSubscription); };
        const hasTerminalFence = () => Platform.OS === 'android' || (Platform.OS === 'ios' && nativeConnectSucceeded);
        const retireIdentifier = () => {
          // Android uses doFinally; successful iOS connects install a take(1)
          // disconnect monitor. See BLE_CONNECTION_OWNERSHIP.md pinned source.
          // An event during pending connect cannot prove a generation boundary.
          if (hasTerminalFence() && confirmedClosed && !connecting && !cancellation && disconnected) {
            attemptedIds.delete(id);
            removeClosedSubscription();
          }
        };
        const lease: ConnectionLease = { id, ble, epoch, unknown: false, release() {
          if (disconnected) return;
          disconnected = true;
          connections.delete(lease);
          if (hasTerminalFence() && !confirmedClosed && !shuttingDown) disconnectFences.add(removeClosedSubscription);
          else removeClosedSubscription();
          for (const subscription of notifications) subscription.remove();
          notifications.clear();
          closedListeners.clear();
          retireIdentifier();
        } };
        const assertOpen = () => {
          assertConnectionCurrent();
          if (disconnected || nativeClosed || intentionalClose) throw new Error('Bluetooth accessory disconnected');
        };
        const cancel = (): Promise<void> => {
          if (cancellation) return cancellation;
          if (disconnected) return Promise.resolve();
          // Cleanup remains available when ownership is unknown. Never use the
          // normal healthy-manager guard here, or a rejected cancel is unrecoverable.
          if (!current() || shuttingDown) return Promise.reject(new Error('Bluetooth connection belongs to an unavailable manager'));
          intentionalClose = true;
          ++cancellationsPending;
          cancellation = Promise.resolve().then(() => ble.cancelDeviceConnection(id)).then(() => {
            if (current()) lease.release();
          }, error => {
            if (current() && !disconnected) {
              if (confirmedClosed) lease.release();
              else lease.unknown = true;
            }
            throw error;
          }).finally(() => { --cancellationsPending; cancellation = undefined; retireIdentifier(); });
          return cancellation;
        };
        acquisitionSectionEntered = true;
        connections.add(lease);
        attemptedIds.add(id);
        try {
          // This listener belongs to the connection, not to a notification
          // subscription. It survives unsubscribe and failed cancellation.
          closedSubscription = ble.onDeviceDisconnected(id, error => {
            if (!current() || listenerRetired) return;
            if (disconnected) {
              if (!connecting) confirmedClosed = true;
              retireIdentifier();
              return;
            }
            nativeClosed = true;
            if (!connecting) confirmedClosed = true;
            const listeners = !intentionalClose && !shuttingDown ? [...closedListeners] : [];
            // A pending connect can still produce native effects after this event.
            // Its settlement path cancels before releasing the lease.
            if (!connecting && !cancellation) lease.release();
            for (const listener of listeners) listener.callback(error ?? new Error('Bluetooth accessory disconnected'));
          });
          let device = await ble.connectToDevice(id, { timeout: 10000 });
          connecting = false;
          nativeConnectSucceeded = true;
          assertOpen();
          device = await device.discoverAllServicesAndCharacteristics();
          assertOpen();
          if (Platform.OS === 'android') { try { device = await device.requestMTU(185); } catch { /* PLX MTU negotiation is optional; retain actual MTU. */ } }
          assertOpen();
          const characteristics = await device.characteristicsForService(AXP_SERVICE);
          assertOpen();
          if (!characteristics.some(x => x.uuid.toLowerCase() === AXP_WRITE && x.isWritableWithResponse) ||
              !characteristics.some(x => x.uuid.toLowerCase() === AXP_NOTIFY && x.isNotifiable)) throw new Error('Accessory does not expose the required AXP characteristics');
          return {
            mtu: device.mtu,
            async subscribe(onBytes, onClosed) {
              assertOpen();
              const closedListener = { callback: onClosed };
              closedListeners.add(closedListener);
              let subscription: Subscription;
              try {
                subscription = device.monitorCharacteristicForService(AXP_SERVICE, AXP_NOTIFY, (error, characteristic) => {
                  if (disconnected || nativeClosed || intentionalClose || shuttingDown || !current() || managerUnhealthy || !scanner.healthy || accessoryConnectionOwnership() === 'unknown') return;
                  if (error) { onClosed(error); return; }
                  if (characteristic?.value) {
                    try { if (characteristic.value.length > 684) throw new Error('BLE notification exceeds limit'); onBytes(toByteArray(characteristic.value)); }
                    catch (error) { onClosed(error instanceof Error ? error : new Error(String(error))); }
                  }
                });
              } catch (error) { closedListeners.delete(closedListener); throw error; }
              if (disconnected) subscription.remove(); else notifications.add(subscription);
              return () => { closedListeners.delete(closedListener); if (notifications.delete(subscription)) subscription.remove(); };
            },
            async writeWithResponse(bytes) {
              assertOpen();
              ++writesPending;
              try { await device.writeCharacteristicWithResponseForService(AXP_SERVICE, AXP_WRITE, fromByteArray(bytes)); }
              finally { --writesPending; }
            },
            async disconnect() {
              // Successful destruction invalidates even otherwise closed handles.
              if (!current()) throw new Error('Bluetooth connection belongs to an unavailable manager');
              await cancel();
            },
          };
        } catch (error) {
          connecting = false;
          try { await cancel(); }
          catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Bluetooth connection setup failed; cancellation failed and native state may be unknown'); }
          throw error;
        }
      } finally { connectionPreparing = false; }
    } catch (error) {
      // Publication follows reservation cleanup. An invalidated/consumed record
      // cannot be restored by a late continuation of its original invocation.
      if (attempt && record && unissuedAttempts.get(attempt) === record) {
        if (!acquisitionSectionEntered && witness !== undefined && Object.is(witness, error)) {
          record.rejection = error; record.eligible = true;
        } else unissuedAttempts.delete(attempt);
      }
      throw error;
    } finally {
      if (attempt && record && !record.eligible && unissuedAttempts.get(attempt) === record) unissuedAttempts.delete(attempt);
    }
  },
};
export async function stopAccessoryDiscovery(): Promise<void> { const result = await scanner.stop(); if (result?.error) throw result.error; }
function resetDestroyedManager() {
  assertReadinessQuiescent();
  for (const lease of connections) lease.release();
  for (const remove of disconnectFences) remove();
  attemptedIds.clear();
  managerUnhealthy = false;
  ++managerEpoch; manager = null; loading = null; scanner = makeScanner();
}
export async function shutdownBluetooth(): Promise<void> {
  assertReadinessQuiescent();
  if (managerCreationUnknown) throw new Error('Bluetooth construction state unknown; restart the app before retrying');
  if (observationOwner) {
    const owner = observationOwner;
    if (owner.preparing || !owner.signal?.aborted || owner.pending.size || owner.destroying) throw new Error('Bluetooth manager busy with exclusive observation');
    // Explicit recovery only after every SDK effect has settled. Failed destroy
    // may be retried on this same instance; never manufacture a replacement.
    await owner.lease!.destroyAndRelease();
    return;
  }
  if (shuttingDown || connectionPreparing || cancellationsPending > 0 || writesPending > 0 || ordinaryScanOperations.size > 0) throw new Error('Bluetooth manager busy');
  shuttingDown = true;
  try {
    await scanner.stop();
    // stop() may report a bounded controller timeout while its SDK effect lives.
    if (ordinaryScanOperations.size) throw new Error('Bluetooth native scan operation still pending');
    // A cancelled preparation may still be waiting for a platform permission dialog.
    // Its signal checks prohibit it from creating/starting a scanner afterward.
    const instance = manager ?? await loading;
    assertReadinessQuiescent();
    managerUnhealthy = true;
    await instance?.destroy();
    // Pinned iOS destroyClient is a void bridge method, not native completion.
    if (instance && Platform.OS === 'ios') throw new Error('iOS Bluetooth teardown is unacknowledged; restart the app before retrying');
    resetDestroyedManager();
  } finally { shuttingDown = false; }
}
