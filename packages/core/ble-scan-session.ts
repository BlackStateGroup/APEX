/** One shared SDK scanner lease. No hardware, persistence, or connection dependency. */
export interface ScanBackend<T> {
  prepare(signal: AbortSignal): Promise<void>;
  start(serviceUuid: string, callback: (error: Error | null, value?: T) => void, allowDuplicates: boolean): Promise<void>;
  stop(): Promise<void>;
}
/** Controller/SDK reuse only; not physical radio teardown acknowledgement. */
export interface ScanResult { reusable: boolean; reason: 'stopped' | 'background' | 'duration' | 'count' | 'memory' | 'error'; count: number; characters: number; error?: Error }
export interface ScanOptions<T, R> {
  serviceUuid: string;
  allowDuplicates?: boolean;
  durationMs: number;
  maxCount: number;
  maxCharacters: number;
  project(value: T): { value: R; characters: number };
  onValue(value: R): void;
  onEnd(result: ScanResult): void;
}
export interface ScanSession { stop(reason?: 'stopped' | 'background'): Promise<ScanResult>; done: Promise<ScanResult> }
const asError = (value: unknown) => value instanceof Error ? value : new Error(String(value));
export function createScanController<T>(backend: ScanBackend<T>, timers = {
  set: (callback: () => void, ms: number): unknown => setTimeout(callback, ms),
  clear: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}, cleanupTimeoutMs = 2000) {
  if (!Number.isInteger(cleanupTimeoutMs) || cleanupTimeoutMs < 1 || cleanupTimeoutMs > 2000) throw new Error('Invalid cleanup timeout');
  let current: ScanSession | null = null;
  // Stop failure leaves the SDK state unknown. Fail closed until this controller is replaced after manager destruction.
  let poisoned = false;
  return {
    get healthy() { return !poisoned; },
    get busy() { return current !== null; },
    stop(reason: 'stopped' | 'background' = 'stopped') { return current?.stop(reason) ?? Promise.resolve(null); },
    start<R>(options: ScanOptions<T, R>): ScanSession {
      options = { ...options };
      if (poisoned) throw new Error('Bluetooth scan state unknown; shut down Bluetooth before retrying');
      if (current) throw new Error('Bluetooth scanner busy');
      if (typeof options.serviceUuid !== 'string' || !/^(?:[a-f0-9]{4}|[a-f0-9]{8}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(options.serviceUuid)) throw new Error('Select exactly one service UUID');
      if (options.allowDuplicates !== undefined && typeof options.allowDuplicates !== 'boolean') throw new Error('Invalid duplicate policy');
      for (const [value, maximum] of [[options.durationMs, 30000], [options.maxCount, 100], [options.maxCharacters, 409600]]) {
        if (!Number.isInteger(value) || value! < 1 || value! > maximum!) throw new Error('Invalid scan bound');
      }
      const abort = new AbortController();
      let terminal: Omit<ScanResult, 'reusable'> | undefined; let count = 0; let characters = 0; let attempted = false;
      let earlyStop: Promise<void> | undefined; let starting = false;
      let resolve!: (value: ScanResult) => void;
      const done = new Promise<ScanResult>(r => { resolve = r; });
      const finish = (reason: ScanResult['reason'], error?: Error) => {
        if (terminal) return;
        terminal = { reason, count, characters, ...(error ? { error } : {}) };
        abort.abort();
        if (starting) {
          // A start acknowledgement can be delayed. Request stop immediately, then stop again
          // after start settles before releasing ownership of the shared manager.
          earlyStop = Promise.resolve().then(() => backend.stop()).catch(error => {
            poisoned = true; terminal = { reason: 'error', count, characters, error: asError(error) };
          });
        }
      };
      const bounded = async (operation: Promise<void>, label: string) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([operation, new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`Bluetooth ${label} did not settle; manager reset required`)), cleanupTimeoutMs);
          })]);
        } catch (error) {
          poisoned = true; terminal = { reason: 'error', count, characters, error: asError(error) };
        } finally { clearTimeout(timer); }
      };
      const session: ScanSession = { done, stop(reason = 'stopped') { finish(reason); return done; } };
      current = session;
      const timer = timers.set(() => finish('duration'), options.durationMs);
      // Schedule after publishing the lease so synchronous SDK callbacks are safe.
      void (async () => {
        try {
          await Promise.race([
            backend.prepare(abort.signal),
            new Promise<void>(r => {
              if (abort.signal.aborted) r();
              else abort.signal.addEventListener('abort', () => r(), { once: true });
            }),
          ]);
          if (!terminal) {
            attempted = true; starting = true;
            const start = backend.start(options.serviceUuid, (error, value) => {
              if (terminal) return;
              if (count >= options.maxCount) { finish('count'); return; }
              if (error) { finish('error', error); return; }
              if (value === undefined) return;
              try {
                const item = options.project(value);
                if (!Number.isSafeInteger(item.characters) || item.characters < 0) throw new Error('Invalid observation size');
                if (characters + item.characters > options.maxCharacters) { finish('memory'); return; }
                ++count; characters += item.characters;
                options.onValue(item.value);
                if (count >= options.maxCount) finish('count');
              } catch (error) { finish('error', asError(error)); }
            }, options.allowDuplicates ?? false);
            // Normal start may remain pending until cancellation, but not beyond a bounded
            // cleanup grace. Unknown native state poisons the lease rather than permitting reuse.
            await Promise.race([start, new Promise<void>(r => {
              if (abort.signal.aborted) r();
              else abort.signal.addEventListener('abort', () => r(), { once: true });
            })]);
            if (terminal) await bounded(start, 'start acknowledgement');
            starting = false;
          }
          if (!terminal) await new Promise<void>(r => abort.signal.addEventListener('abort', () => r(), { once: true }));
        } catch (error) { finish('error', asError(error)); }
        finally {
          timers.clear(timer);
          if (attempted) {
            if (earlyStop) await bounded(earlyStop, 'early stop');
            await bounded(Promise.resolve().then(() => backend.stop()), 'stop');
          }
          const result: ScanResult = { ...(terminal ?? { reason: 'stopped' as const, count, characters }), reusable: !poisoned };
          current = null;
          try { options.onEnd(result); } catch { /* Consumer errors cannot strand the scanner lease. */ }
          resolve(result);
        }
      })();
      return session;
    },
  };
}
