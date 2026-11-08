import type { ServiceDataSession, ServiceDataResult, ServiceDataMetrics } from '../packages/core/ble-service-data-session.ts';
import type { BlePlxSelectedService } from '../packages/core/ble-plx-service-data-filter.ts';
import { readBlePlxSourceEvidencePayload } from '../packages/core/ble-plx-source-evidence.ts';
import type { ForegroundBleItem } from './foreground-ble-workbench.ts';

export interface ServiceDataWorkbenchState {
  service: BlePlxSelectedService; optedIn: boolean; phase: 'idle' | 'running' | 'stopping';
  uncertain: boolean; items: readonly ForegroundBleItem[]; page: number;
  metrics: Readonly<ServiceDataMetrics> | null; reason: string; message: string;
}
export const initialServiceDataWorkbench: ServiceDataWorkbenchState = {
  service: 'FCD2', optedIn: false, phase: 'idle', uncertain: false, items: [], page: 0,
  metrics: null, reason: 'not started', message: 'Explicit one-session opt-in required. Nothing is saved automatically.',
};
export function createServiceDataWorkbench(deps: {
  start(options: { service: BlePlxSelectedService; receiptClock(): string }): ServiceDataSession;
  canStart(): boolean; clock(): string; changed(state: ServiceDataWorkbenchState): void;
  busy(value: boolean): void; uncertainty(value: boolean): void;
}) {
  let state = initialServiceDataWorkbench;
  let session: ServiceDataSession | null = null;
  let disposed = false;
  let generation = 0;
  let stopReason: 'stopped' | 'background' = 'stopped';
  const publish = (next: ServiceDataWorkbenchState) => { state = next; if (!disposed) deps.changed(state); };
  const finish = (token: number, result?: ServiceDataResult) => {
    if (token !== generation || state.phase === 'idle') return;
    let items: ForegroundBleItem[] = [];
    let uncertain = !result?.reusable;
    try {
      if (result?.reusable) {
        if (result.observations.length > 25 || result.metrics.characters > 65536) throw new Error();
        items = result.observations.map((value, index) => {
          const source = readBlePlxSourceEvidencePayload(value.source);
          if (source.platform !== 'android' || value.selectedServiceUuid !== state.service ||
            value.timestampBasis !== 'caller-supplied-sdk-callback-receipt' || source.provenance.origin !== 'recorded-import' ||
            source.provenance.capturedAt !== value.callbackReceivedAt) throw new Error();
          return Object.freeze({ id: index + 1, document: value.source.document, callbackReceivedAt: value.callbackReceivedAt,
            serviceUuid: state.service, platform: source.platform, rssiDbm: source.observation?.rssiDbm ?? null });
        });
      }
    } catch { uncertain = true; items = []; }
    session = null;
    deps.uncertainty(uncertain);
    publish({ ...state, phase: 'idle', optedIn: false, uncertain, items, page: 0,
      metrics: result?.metrics ?? null, reason: result?.reason ?? 'backend-error',
      message: uncertain ? 'Native state or result uncertain. Inspection and device work are fenced. Use Reset APEX Bluetooth on Android; if recovery fails, restart the app.'
        : 'Session settled with confirmed reusable native state. Selected sources remain unsaved in memory.' });
    deps.busy(false);
  };
  const stop = (reason: 'stopped' | 'background' = 'stopped') => {
    publish({ ...state, optedIn: false });
    if (state.phase === 'idle' || state.phase === 'stopping') return;
    stopReason = reason;
    publish({ ...state, phase: 'stopping', message: 'Stopping and awaiting native cleanup, including preparation…' });
    const token = generation;
    if (session) { try { void session.stop(reason).catch(() => finish(token)); } catch { finish(token); } }
  };
  return {
    get state() { return state; },
    select(service: BlePlxSelectedService) {
      if (disposed || state.phase !== 'idle' || !['FCD2', 'FEAA'].includes(service)) return;
      publish({ ...state, service, optedIn: false, items: [], page: 0, metrics: null, reason: 'not started' });
    },
    optIn() { if (!disposed && state.phase === 'idle' && !state.uncertain && deps.canStart()) publish({ ...state, optedIn: !state.optedIn }); },
    start() {
      if (disposed || state.phase !== 'idle') return;
      const accepted = state.optedIn;
      publish({ ...state, optedIn: false });
      if (!accepted || state.uncertain || !deps.canStart()) return;
      const token = ++generation;
      deps.busy(true);
      publish({ ...state, phase: 'running', items: [], page: 0, metrics: null, reason: 'pending', message: 'Preparing or observing; Stop remains available.' });
      try {
        session = deps.start({ service: state.service, receiptClock: deps.clock });
        const handle = session;
        void handle.done.then(result => finish(token, result), () => finish(token));
        if ((state as ServiceDataWorkbenchState).phase === 'stopping' || disposed) void handle.stop(stopReason).catch(() => finish(token));
      } catch { finish(token); }
    },
    stop,
    resetConfirmed() {
      if (disposed || state.phase !== 'idle') return;
      deps.uncertainty(false); publish({ ...initialServiceDataWorkbench, service: state.service, message: 'Android reset confirmed. A new opt-in and explicit Start are required.' });
    },
    page(delta: number) { publish({ ...state, page: Math.max(0, Math.min(Math.max(0, Math.ceil(state.items.length / 4) - 1), state.page + delta)) }); },
    clear() { if (state.phase === 'idle') publish({ ...state, items: [], page: 0, optedIn: false }); },
    document(id: number) {
      if (disposed || state.phase !== 'idle' || state.uncertain) throw new Error('Confirmed reusable result required');
      const item = state.items.find(item => item.id === id);
      if (!item) throw new Error('Source unavailable');
      return item.document;
    },
    dispose() { if (disposed) return; disposed = true; stop(); },
  };
}
