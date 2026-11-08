import type { NfcBackend } from './nfc.ts';

/** Minimal SDK seam for deterministic listener/registration ordering tests. */
export interface NfcSessionApi {
  setTagListener(listener: ((tag: unknown) => void) | null): void;
  setClosedListener(listener: ((error?: Error) => void) | null): void;
  register(): Promise<void>;
  unregister(): Promise<void>;
  isUserCancel(error: Error): boolean;
  /** iOS completes unregister immediately before emitting SessionClosed. */
  requiresClosedEvent?: boolean;
}

/** One controller per native manager singleton. Registration rejection means no
 * new session was acquired (the native SDK contract). An unregister rejection is
 * uncertain: retain ownership and the close listener until retry or SessionClosed.
 * Closure never bypasses an in-flight register/unregister promise.
 */
export function createNfcSessionController(load: () => Promise<NfcSessionApi>): Pick<NfcBackend, 'begin'> {
  let owner: object | null = null;
  return {
    async begin(onTag, onClosed) {
      if (owner) throw new Error('NFC native session is already active');
      const lease = {}; owner = lease;
      let api: NfcSessionApi | undefined;
      let closed = false; let stopping = false; let registering = true; let unregistering = false;
      let pendingStop: Promise<void> | null = null;
      let confirmClosed!: () => void;
      const closure = new Promise<void>(resolve => { confirmClosed = resolve; });
      const release = () => {
        if (owner !== lease) return;
        api!.setTagListener(null); api!.setClosedListener(null); owner = null;
      };
      try {
        api = await load();
        api.setTagListener(tag => { if (owner === lease && !closed && !stopping) onTag(tag); });
        api.setClosedListener(error => {
          if (owner !== lease || closed) return;
          closed = true; confirmClosed();
          if (!registering && !unregistering) release();
          onClosed(error && !api!.isUserCancel(error) ? error : undefined);
        });
        await api.register();
        registering = false;
        if (closed) release();
      } catch (error) {
        registering = false;
        if (api) release(); else if (owner === lease) owner = null;
        throw error;
      }
      return () => {
        if (pendingStop) return pendingStop;
        if (closed || owner !== lease) return Promise.resolve();
        stopping = true; unregistering = true;
        // Assign the shared promise before SDK callbacks can synchronously fire.
        pendingStop = Promise.resolve().then(async () => {
          try {
            if (!closed) {
              try { await api!.unregister(); }
              catch (error) { if (!closed) throw error; }
              // iOS's final global event and the native operation must both
              // settle before a replacement can own these singleton listeners.
              if (api!.requiresClosedEvent) await closure;
              closed = true;
            }
          } finally {
            unregistering = false;
            if (closed) release();
          }
        });
        const task = pendingStop;
        void task.finally(() => { pendingStop = null; }).catch(() => {});
        return task;
      };
    },
  };
}
