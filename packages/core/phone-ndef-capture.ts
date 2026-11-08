import { NfcReader } from './nfc.ts';
import type { NfcBackend } from './nfc.ts';
import { preparePhoneNdefObservation } from './nfc-manager-ndef.ts';
import type { PhoneNdefPlatform } from './nfc-manager-ndef.ts';

export const PHONE_NDEF_WINDOW_MS = 30000;
export interface PhoneNdefCaptureDocument { document: string; expectedPlatform: PhoneNdefPlatform; receivedAt: string }
export interface PhoneNdefCaptureState {
  phase: NfcReader['state']; message: string; capture: PhoneNdefCaptureDocument | null;
}
/** One callback, synchronous selected-field copy, no persistence. Timer requests
 * cancellation only; only the reviewed reader/backend can confirm release. */
export class PhoneNdefCapture {
  state: PhoneNdefCaptureState = { phase: 'idle', message: 'Ready for an explicit one-tag read.', capture: null };
  private reader: NfcReader;
  private accepted = false;
  private generation = 0;
  private candidate: PhoneNdefCaptureDocument | null = null;
  private platform: PhoneNdefPlatform = 'android';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline = 0;
  private changed: (state: PhoneNdefCaptureState) => void;
  private clock: () => number;
  private receiptClock: () => number;
  private lastMonotonic: number | null = null;
  private schedule: typeof setTimeout;
  private unschedule: typeof clearTimeout;
  constructor(backend: NfcBackend, changed: (state: PhoneNdefCaptureState) => void,
    clock = () => performance.now(), schedule: typeof setTimeout = setTimeout, unschedule: typeof clearTimeout = clearTimeout,
    receiptClock = () => Date.now()) {
    this.changed = changed; this.clock = clock; this.receiptClock = receiptClock; this.schedule = schedule; this.unschedule = unschedule;
    this.reader = new NfcReader({
      status: async () => { const s = await backend.status(); if (s.platform === 'web') throw new Error('Phone NDEF reading is unavailable on web'); this.platform = s.platform; return s; },
      begin: (_, closed) => {
        const generation = this.generation;
        return backend.begin(raw => { if (generation === this.generation) this.receive(raw); }, error => {
          if (generation !== this.generation) return;
          if (!this.accepted) { this.accepted = true; this.update('Native session closed without selected NDEF records.'); }
          closed(error);
        });
      },
    }, {
      onTag: () => {}, onError: error => this.update(error.message),
      onState: phase => {
        if (phase === 'idle') { this.clearTimer(); this.state = { ...this.state, phase, capture: this.candidate, ...(this.candidate ? { message: 'Native session released. Selected fields are ready for explicit Inspect.' } : {}) }; }
        else this.state = { ...this.state, phase, capture: null };
        this.changed(this.state);
      },
    });
  }
  private update(message: string) { this.state = { ...this.state, message }; this.changed(this.state); }
  private clearTimer() { if (this.timer !== null) this.unschedule(this.timer); this.timer = null; }
  /** Trusted runtime monotonic clock; injected clocks must obey the same contract.
   * Check each sample, refusing nonfinite, negative, out-of-range or backwards time. */
  private monotonicNow(): number {
    const now = this.clock();
    if (!Number.isFinite(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - PHONE_NDEF_WINDOW_MS ||
        (this.lastMonotonic !== null && now < this.lastMonotonic)) throw new Error('Invalid or backwards monotonic observation clock');
    this.lastMonotonic = now;
    return now;
  }
  start(): Promise<void> {
    if (this.reader.state !== 'idle') return Promise.reject(new Error('Phone NDEF cleanup or read is still active'));
    const generation = ++this.generation;
    this.accepted = false; this.candidate = null;
    this.state = { ...this.state, capture: null, message: 'Reading at most one callback within 30 seconds, including preparation…' };
    this.lastMonotonic = null;
    try { this.deadline = this.monotonicNow() + PHONE_NDEF_WINDOW_MS; }
    catch (error) { this.accepted = true; this.update(`NDEF start refused: ${String(error)}`); return Promise.resolve(); }
    this.timer = this.schedule(() => { void this.cancel('Observation deadline reached; waiting for native release.'); }, PHONE_NDEF_WINDOW_MS);
    return this.reader.start().catch(error => { if (generation === this.generation) this.update(`NDEF startup failed: ${String(error)}`); });
  }
  private receive(raw: unknown) {
    if (this.accepted || (this.reader.state !== 'starting' && this.reader.state !== 'reading')) return;
    this.accepted = true;
    try {
      if (this.monotonicNow() >= this.deadline) { void this.cancel('Observation deadline reached; waiting for native release.'); return; }
      const receipt = this.receiptClock();
      if (!Number.isFinite(receipt) || Math.abs(receipt) > 8640000000000000) throw new Error('Invalid app receipt wall clock');
      const receivedAt = new Date(receipt).toISOString();
      const observation = preparePhoneNdefObservation(this.platform, raw, { origin: 'recorded-import', label: 'Explicit native selected-field read; source unverified' });
      if (observation.availability === 'records') {
        this.candidate = { document: observation.sourceDocument, expectedPlatform: this.platform, receivedAt };
        this.update('Selected fields copied in memory. Waiting for native release before Inspect.');
      } else this.update(`NDEF unavailable (${observation.availability}); no record document offered for inspection.`);
    } catch (error) { this.update(`NDEF rejected without truncation: ${String(error)}`); }
    this.clearTimer();
    void this.stop();
  }
  private stop(): Promise<void> {
    return this.reader.stop().catch(error => { this.update(`Native cleanup failed; restart and Inspect blocked. Stop to retry: ${String(error)}`); });
  }
  cancel(message = 'Read cancelled; waiting for native release.'): Promise<void> {
    this.accepted = true; this.candidate = null; this.clearTimer();
    this.state = { ...this.state, capture: null }; this.update(message);
    return this.stop();
  }
  /** Explicit Stop retries cleanup while retaining a completed callback snapshot. */
  stopOrCancel(): Promise<void> {
    if (!this.accepted) return this.cancel();
    return this.stop();
  }
  inspect(): PhoneNdefCaptureDocument | null {
    if (this.reader.state !== 'idle') return null;
    return this.state.capture ? { ...this.state.capture } : null;
  }
}
