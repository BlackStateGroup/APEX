import { matchBlePlxSelectedServiceData } from './ble-plx-service-data-filter.ts';
import type { BlePlxSelectedService } from './ble-plx-service-data-filter.ts';
import { prepareForegroundObservation } from './ble-observation-session.ts';
import type { ForegroundObservation } from './ble-observation-session.ts';

export const SERVICE_DATA_LIMITS = Object.freeze({ durationMs: 10000, callbacks: 100, matches: 25, characters: 65536 });
/** Exclusive ownership of PLX's singleton, not a second manager. No native adapter is supplied. */
export interface ServiceDataLease {
  startBroad(request: { serviceUUIDs: null; allowDuplicates: true }, callback: (error: unknown, device?: unknown) => void): Promise<void>;
  stop(): Promise<void>;
  /** Success must mean native destruction completed AND exclusive ownership released. */
  destroyAndRelease(): Promise<void>;
}
export interface ServiceDataBackend {
  /** Includes all preparation. null certifies no ownership/effects remain. Rejection is unknown ownership. */
  acquireExclusive(signal: AbortSignal): Promise<ServiceDataLease | null>;
}
export interface ServiceDataRuntime {
  /** Finite, nondecreasing monotonic milliseconds. */
  now(): number;
  set(callback: () => void, ms: number): unknown;
  clear(timer: unknown): void;
}
export type ServiceDataReason = 'stopped' | 'background' | 'duration' | 'callback-budget' | 'match-budget' | 'character-budget' | 'sdk-error' | 'malformed' | 'preparation-error' | 'ownership-unavailable' | 'backend-error';
export interface ServiceDataMetrics { total: number; match: number; noMatch: number; unavailable: number; malformed: number; sdkErrors: number; retained: number; characters: number }
export interface ServiceDataResult {
  reason: ServiceDataReason;
  metrics: Readonly<ServiceDataMetrics>;
  observations: readonly ForegroundObservation[];
  /** Only confirmed stop AND destruction (or certified no acquisition) permit reuse. */
  reusable: boolean;
  errors: readonly Error[];
}
export interface ServiceDataSession { done: Promise<ServiceDataResult>; stop(reason?: 'stopped' | 'background'): Promise<ServiceDataResult> }
// Never copy SDK messages, causes, custom fields or callback references into retained diagnostics.
const stageError = (message: string) => Object.freeze(new Error(message));

/** Pure cooperative-JS lifecycle. No permissions, SDK calls, persistence or automatic retries. */
export function createServiceDataController(backend: ServiceDataBackend, runtime: ServiceDataRuntime = {
  now: () => performance.now(), set: (fn, ms) => setTimeout(fn, ms), clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
}) {
  let current: ServiceDataSession | null = null;
  let poisoned = false;
  const diagnostics: Error[] = [];
  return {
    get busy() { return current !== null; },
    get healthy() { return !poisoned; },
    /** Includes failures during late cleanup after done. Does not retain callback objects. */
    get errors(): readonly Error[] { return Object.freeze([...diagnostics]); },
    start(input: { platform: 'android' | 'ios'; service: BlePlxSelectedService; receiptClock(): string }): ServiceDataSession {
      const options = { ...input };
      if (poisoned || current) throw new Error('Exclusive observation controller unavailable');
      if (!['android', 'ios'].includes(options.platform) || !['FCD2', 'FEAA'].includes(options.service) || typeof options.receiptClock !== 'function') throw new Error('Select Android/iOS and FCD2/FEAA');
      let started: number;
      try { started = runtime.now(); if (!Number.isFinite(started)) throw new Error(); }
      catch { poisoned = true; const error = stageError('Invalid monotonic clock'); diagnostics.push(error); throw error; }
      let lastTime = started;
      const metrics: ServiceDataMetrics = { total: 0, match: 0, noMatch: 0, unavailable: 0, malformed: 0, sdkErrors: 0, retained: 0, characters: 0 };
      const observations: ForegroundObservation[] = [];
      const errors: Error[] = [];
      const abort = new AbortController();
      let reason: ServiceDataReason | undefined;
      let wake!: () => void;
      const ended = new Promise<void>(r => { wake = r; });
      let resolve!: (result: ServiceDataResult) => void;
      const done = new Promise<ServiceDataResult>(r => { resolve = r; });
      const fault = (message: string) => { const error = stageError(message); errors.push(error); diagnostics.push(error); poisoned = true; };
      const finish = (value: ServiceDataReason) => { if (!reason) { reason = value; abort.abort(); wake(); } };
      const deadline = () => {
        let now: number;
        try { now = runtime.now(); } catch { fault('Monotonic clock failed'); finish('backend-error'); return true; }
        if (!Number.isFinite(now) || now < lastTime) { fault('Invalid monotonic clock'); finish('backend-error'); return true; }
        lastTime = now;
        if (now - started >= SERVICE_DATA_LIMITS.durationMs) { finish('duration'); return true; }
        return false;
      };
      const session: ServiceDataSession = { done, stop(value = 'stopped') { finish(value); return done; } };
      current = session;
      let timer: unknown;
      try { timer = runtime.set(() => finish('duration'), SERVICE_DATA_LIMITS.durationMs); }
      catch { fault('Deadline timer failed'); finish('backend-error'); }
      const clearTimer = (value: unknown) => {
        try { runtime.clear(value); } catch { fault('Timer cleanup failed'); finish('backend-error'); }
      };
      const callback = (error: unknown, device?: unknown) => {
        if (reason || deadline()) return;
        ++metrics.total;
        if (error !== null && error !== undefined) {
          ++metrics.sdkErrors; errors.push(stageError('SDK callback error')); finish('sdk-error'); return;
        }
        const membership = matchBlePlxSelectedServiceData(options.platform, device, options.service);
        if (membership.status === 'match') {
          ++metrics.match;
          try {
            const item = prepareForegroundObservation(options.platform, device, options.service, options.receiptClock());
            if (deadline() || reason) return;
            if (metrics.characters + item.characters > SERVICE_DATA_LIMITS.characters) { finish('character-budget'); return; }
            Object.freeze(item.value.source); Object.freeze(item.value);
            observations.push(item.value); ++metrics.retained; metrics.characters += item.characters;
            if (metrics.retained === SERVICE_DATA_LIMITS.matches) finish('match-budget');
            else if (metrics.characters === SERVICE_DATA_LIMITS.characters) finish('character-budget');
          } catch { errors.push(stageError('Selected-source preparation failed')); finish('preparation-error'); }
        } else if (membership.status === 'no-match') ++metrics.noMatch;
        else if (membership.status === 'unavailable') ++metrics.unavailable;
        else { ++metrics.malformed; finish('malformed'); }
        if (metrics.total === SERVICE_DATA_LIMITS.callbacks) finish('callback-budget');
      };
      // Every backend invocation is deferred, so sync throws/callbacks cannot strand publication.
      const invoke = <T>(fn: () => Promise<T>) => Promise.resolve().then(fn);
      const bounded = async <T>(promise: Promise<T>, label: string): Promise<{ ok: true; value: T } | { ok: false }> => {
        let timeout: unknown;
        try {
          return { ok: true, value: await Promise.race([promise, new Promise<never>((_, reject) => {
            timeout = runtime.set(() => reject(new Error(`${label} did not settle; ownership unknown`)), 2000);
          })]) };
        } catch { fault(`${label} failed or did not settle; ownership unknown`); return { ok: false }; }
        finally { clearTimer(timeout); }
      };
      const cleanup = async (lease: ServiceDataLease) => {
        const stopped = await bounded(invoke(() => lease.stop()), 'Stop');
        // Destruction is still attempted when stop fails; failure never becomes success through destruction.
        const destroyed = await bounded(invoke(() => lease.destroyAndRelease()), 'Destruction');
        return stopped.ok && destroyed.ok;
      };
      void (async () => {
        let reusable = false;
        try {
          const acquire = invoke(() => reason ? Promise.resolve(null) : backend.acquireExclusive(abort.signal));
          // Observe rejections even if cancellation wins the race.
          const acquisition = acquire.then(value => ({ value }), () => ({ error: true }));
          const first = await Promise.race([acquisition, ended.then(() => null)]);
          const acquired = first ?? (await bounded(acquisition, 'Acquisition'));
          let lease: ServiceDataLease | null;
          if ('ok' in acquired) {
            if (!acquired.ok) {
              void acquisition.then(async late => { if ('value' in late && late.value) await cleanup(late.value); else if ('error' in late) fault('Late acquisition failed; ownership unknown'); });
              return;
            }
            if ('error' in acquired.value) { fault('Acquisition failed; ownership unknown'); finish('backend-error'); return; }
            lease = acquired.value.value;
          } else {
            if ('error' in acquired) { fault('Acquisition failed; ownership unknown'); finish('backend-error'); return; }
            lease = acquired.value;
          }
          if (!lease) { reusable = true; finish('ownership-unavailable'); return; }
          if (!reason && !deadline()) {
            const start = invoke(() => reason ? Promise.resolve() : lease!.startBroad({ serviceUUIDs: null, allowDuplicates: true }, callback));
            const acknowledgement = start.then(() => true, error => { errors.push(stageError('Start failed')); finish('backend-error'); return false; });
            await Promise.race([acknowledgement, ended]);
            if (!reason) await ended;
            // Stop promptly even while start acknowledgement is pending. Then await start and stop again.
            const earlyStop = await bounded(invoke(() => lease!.stop()), 'Early stop');
            const settled = await bounded(acknowledgement, 'Start');
            if (!settled.ok) {
              void acknowledgement.then(() => cleanup(lease!));
              return;
            }
            reusable = await cleanup(lease) && earlyStop.ok;
          } else reusable = await cleanup(lease);
        } catch { fault('Backend lifecycle failed; ownership unknown'); finish('backend-error'); }
        finally {
          clearTimer(timer);
          current = null;
          resolve(Object.freeze({ reason: reason ?? 'backend-error', metrics: Object.freeze({ ...metrics }), observations: Object.freeze([...observations]), reusable: reusable && !poisoned, errors: Object.freeze([...errors]) }));
        }
      })();
      return session;
    },
  };
}
