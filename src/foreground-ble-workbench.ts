import type { ForegroundObservation, ForegroundObservationOptions, ForegroundObservationSession } from '../packages/core/ble-observation-session.ts';
import type { ScanResult } from '../packages/core/ble-scan-session.ts';
import { readBlePlxSourceEvidencePayload } from '../packages/core/ble-plx-source-evidence.ts';

export interface ForegroundBleItem {
  id: number; document: string; callbackReceivedAt: string; serviceUuid: 'FCD2' | 'FEAA';
  platform: 'android' | 'ios'; rssiDbm: number | null;
}
export interface ForegroundBleState {
  serviceUuid: 'FCD2' | 'FEAA'; phase: 'idle' | 'running' | 'stopping';
  uncertain: boolean; items: readonly ForegroundBleItem[]; characters: number; message: string;
}
export const initialForegroundBle: ForegroundBleState = {
  serviceUuid: 'FCD2', phase: 'idle', uncertain: false, items: [], characters: 0,
  message: 'No observations collected. Explicit start required; nothing is saved automatically.',
};
/** UI lifecycle coordinator. No native module, persistence, pairing or device-write dependency. */
export function createForegroundBleWorkbench(deps: {
  start(options: ForegroundObservationOptions): ForegroundObservationSession;
  canStart(): boolean; clock(): string;
  changed(state: ForegroundBleState): void; busy(value: boolean): void; uncertainty(value: boolean): void;
}) {
  let state = initialForegroundBle;
  let session: ForegroundObservationSession | null = null;
  let generation = 0;
  let disposed = false;
  const publish = (next: ForegroundBleState) => { state = next; if (!disposed) deps.changed(state); };
  const finish = (token: number, result: ScanResult) => {
    if (token !== generation || state.phase === 'idle') return;
    session = null;
    const uncertain = result.reusable !== true;
    // Publish the synchronous app fence before releasing the busy flag.
    deps.uncertainty(uncertain);
    publish({ ...state, phase: 'idle', uncertain, ...(uncertain ? { items: [], characters: 0 } : {}), message: uncertain
      ? `Bluetooth controller reuse is uncertain. Inspection and device work are fenced; retained sources discarded. Use Android Reset or restart the app. ${result.error?.message ?? ''}`
      : result.error
      ? `Observation ended with error: ${result.error.message}. Local collection ended; retained sources remain available.`
      : `Observation ended (${result.reason}). ${state.items.length} callback documents retained in memory; none saved.` });
    deps.busy(false);
  };
  const failure = (token: number, error: unknown) => finish(token, {
    reusable: false, reason: 'error', count: state.items.length, characters: state.characters,
    error: error instanceof Error ? error : new Error(String(error)),
  });
  const stop = () => {
    if (state.phase === 'idle') return;
    publish({ ...state, phase: 'stopping', message: 'Ending local collection and requesting SDK scan stop…' });
    // The phase also blocks callbacks if a synchronous start has not returned its handle yet.
    if (session) {
      const token = generation;
      try { void session.stop().then(result => finish(token, result), error => failure(token, error)); }
      catch (error) { failure(token, error); }
    }
  };
  return {
    get state() { return state; },
    select(serviceUuid: 'FCD2' | 'FEAA') {
      if (disposed || state.phase !== 'idle') return;
      if (serviceUuid !== 'FCD2' && serviceUuid !== 'FEAA') throw new Error('Unsupported observation service');
      publish({ ...state, serviceUuid });
    },
    clear() {
      if (disposed || state.phase !== 'idle') return;
      publish({ ...state, items: [], characters: 0, message: 'In-memory observations cleared. Saved evidence was not changed.' });
    },
    start() {
      if (disposed || state.phase !== 'idle') return;
      if (state.uncertain || !deps.canStart()) { publish({ ...state, message: 'Observation unavailable. Use a native foreground app and stop other device work first.' }); return; }
      const token = ++generation;
      const serviceUuid = state.serviceUuid;
      publish({ ...state, phase: 'running', items: [], characters: 0, message: 'Observing the selected service for at most 10 seconds or 25 callbacks…' });
      deps.busy(true);
      try {
        const handle = deps.start({ serviceUuid, receiptClock: deps.clock, durationMs: 10000, maxCount: 25, maxCharacters: 65536,
          onObservation(value: ForegroundObservation) {
            if (disposed || token !== generation || state.phase !== 'running') return;
            // Copy the exact bounded document; never hold a mutable SDK Device object.
            const source = readBlePlxSourceEvidencePayload(value.source);
            if (value.selectedServiceUuid !== serviceUuid || value.timestampBasis !== 'caller-supplied-sdk-callback-receipt' ||
                value.callbackReceivedAt !== source.provenance.capturedAt || source.provenance.origin !== 'recorded-import') {
              throw new Error('Observation source timing or service mismatch');
            }
            const item: ForegroundBleItem = { id: state.items.length + 1, document: value.source.document,
              callbackReceivedAt: value.callbackReceivedAt, serviceUuid, platform: source.platform, rssiDbm: source.observation?.rssiDbm ?? null };
            const size = JSON.stringify(value).length;
            if (state.items.length >= 25 || state.characters + size > 65536) { stop(); return; }
            publish({ ...state, items: [...state.items, Object.freeze(item)], characters: state.characters + size });
          },
          onEnd: result => finish(token, result),
        });
        if (token === generation && state.phase !== 'idle') {
          session = handle;
          if (state.phase === 'stopping' || disposed) stop();
        }
        // Handles a backend that settles done without calling onEnd. Finish is idempotent.
        void handle.done.then(result => finish(token, result), error => failure(token, error));
      } catch (error) { failure(token, error); }
    },
    stop,
    document(id: number): string {
      if (disposed || state.phase !== 'idle' || state.uncertain) throw new Error('Stop observation before opening a document');
      const item = state.items.find(item => item.id === id);
      if (!item) throw new Error('Observation no longer available');
      return item.document;
    },
    /** Called only after explicit Android reset succeeds. Never restore old sources. */
    resetConfirmed() {
      if (disposed || state.phase !== 'idle') return;
      ++generation;
      deps.uncertainty(false);
      publish({ ...initialForegroundBle, serviceUuid: state.serviceUuid, message: 'Android reset confirmed. Start a new observation explicitly.' });
    },
    dispose() { if (disposed) return; disposed = true; stop(); },
  };
}
