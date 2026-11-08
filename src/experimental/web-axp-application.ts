/** Pure application ownership. Construction, attachment and snapshots perform no host acquisition. */
import { DeviceSession } from '../../packages/core/session.ts';
import { BleTransport } from '../../packages/core/ble-transport.ts';
import { WebAxpManager } from './web-axp.ts';
import type { WebAxpSnapshot } from './web-axp.ts';

export interface WebAxpEligibility {
  foreground: boolean; devicesTab: boolean; busy: boolean; scanning: boolean;
  observing: boolean; capturing: boolean; nfc: boolean;
}
export interface WebAxpApplicationSnapshot {
  manager: WebAxpSnapshot;
  revision: number;
  held: boolean;
  opening: boolean;
  cleaning: boolean;
  cleanupFailed: boolean;
  error: string | null;
}
export class WebAxpApplication {
  // Shared with the ordinary Console, including simulator ownership. Survives App remount.
  readonly session = { current: null as DeviceSession | null };
  readonly lock = { current: false };
  readonly operation = { current: null as object | null };
  private owner: DeviceSession | null = null;
  private reservation = false;
  private opening = false;
  private epoch = 0;
  private cleanup: Promise<void> | null = null;
  private cleanupFailed = false;
  private error: string | null = null;
  private listeners = new Set<() => void>();
  readonly manager: WebAxpManager;
  constructor(manager: WebAxpManager) {
    this.manager = manager;
    manager.observe(() => this.publish());
  }
  snapshot(): WebAxpApplicationSnapshot {
    return Object.freeze({ manager: this.manager.snapshot(), revision: this.epoch, held: this.held, opening: this.opening,
      cleaning: this.cleanup !== null, cleanupFailed: this.cleanupFailed, error: this.error });
  }
  get held(): boolean { return this.reservation || this.owner !== null || this.manager.snapshot().state !== 'idle' || this.manager.snapshot().rawPending !== 0; }
  owns(session: DeviceSession | null): boolean { return session !== null && session === this.owner; }
  observe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  refresh(): void { this.publish(); }
  private publish(): void { for (const listener of [...this.listeners]) { try { listener(); } catch { /* Presentation cannot own cleanup. */ } } }
  private eligible(gate: WebAxpEligibility): void {
    if (!gate.foreground || !gate.devicesTab) throw new Error('Choose or connect from the foreground Devices tab.');
    if (this.lock.current || gate.busy || gate.scanning || gate.observing || gate.capturing || gate.nfc || this.session.current) {
      throw new Error('Release the current session, scan, observation or capture before choosing an accessory.');
    }
  }
  /** Deliberately not async: reserve and invoke the browser chooser in this event stack. */
  choose(gate: WebAxpEligibility): Promise<void> {
    this.eligible(gate);
    if (this.held || this.cleanup) throw new Error('Browser AXP ownership must be released first.');
    this.reservation = true; this.error = null; this.cleanupFailed = false;
    const epoch = ++this.epoch;
    const picking = this.manager.chooseAccessory(); // No observer publication before this call.
    return picking.then(() => {}, error => {
      if (this.epoch === epoch) this.error = String(error instanceof Error ? error.message : error);
      throw error;
    }).finally(() => {
      // A local cancellation settles before the raw picker. Manager remains authoritative.
      if (this.epoch === epoch) this.reservation = false;
      this.publish();
    });
  }
  connect(gate: WebAxpEligibility): Promise<void> {
    this.eligible(gate);
    const candidate = this.manager.snapshot().candidate;
    if (this.opening || this.cleanup || this.owner || this.manager.snapshot().state !== 'selected' || !candidate) throw new Error('Select a browser AXP accessory first.');
    this.reservation = true; this.opening = true; this.error = null;
    const epoch = ++this.epoch;
    // Own a concrete cleanup handle before core's deferred driver acquisition begins.
    let handle!: ReturnType<WebAxpManager['connect']>;
    const transport = new BleTransport({ connect: () => handle }, candidate.id, { timeoutMs: 30000 });
    const session = new DeviceSession(transport);
    this.owner = session; this.session.current = session;
    handle = this.manager.connect(candidate.id);
    transport.onDisconnect(() => { if (this.owner === session) this.publish(); });
    const opening = session.open();
    this.publish();
    return opening.catch(error => {
      if (this.owner === session && this.epoch === epoch) {
        this.error = error instanceof Error ? error.message : String(error);
        this.cleanupFailed = session.transportReleasePending || this.manager.snapshot().state !== 'idle';
      }
      throw error;
    }).finally(() => {
      if (this.owner === session) {
        this.opening = false; this.reservation = false;
        this.releaseIfSafe(session);
      }
      this.publish();
    });
  }
  private releaseIfSafe(expected: DeviceSession | null): void {
    const state = this.manager.snapshot();
    if (state.state !== 'idle' || state.rawPending || expected?.transportReleasePending || this.opening) return;
    if (this.owner !== expected) return;
    if (expected && this.session.current === expected) this.session.current = null;
    this.owner = null; this.reservation = false;
  }
  /** Fence first, outside the Console operation lock. Automatic cleanup never retries a failure. */
  cancel(explicitRetry = false): Promise<void> {
    if (this.cleanup) return this.cleanup;
    if (this.cleanupFailed && !explicitRetry) return Promise.reject(new Error('Browser AXP cleanup failed. Use explicit Retry browser AXP cleanup.'));
    const expected = this.owner;
    ++this.epoch;
    this.reservation = true;
    // Install cleanup identity before fencing can publish/reenter.
    let resolve!: () => void; let reject!: (error: unknown) => void;
    const operation = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    this.cleanup = operation;
    this.manager.cancelCurrentLease();
    const work = async () => {
      // Session.close may itself perform the first manager cleanup. Do not silently retry its failure.
      if (expected) await expected.close();
      // Needed when cancellation fenced a reserved handle before core acquired it.
      // Never reached after a failed session close, so it cannot silently retry failure.
      await this.manager.retryCleanup();
      const state = this.manager.snapshot();
      if (state.state !== 'idle' || state.rawPending || expected?.transportReleasePending) {
        throw new Error('Browser cleanup is still pending. The chooser may remain open; its permission grant cannot be revoked here.');
      }
    };
    void work().then(() => {
      if (this.cleanup === operation) {
        this.cleanupFailed = false; this.error = null; this.releaseIfSafe(expected);
        this.cleanup = null; this.reservation = false; this.publish();
      }
      resolve();
    }, error => {
      if (this.cleanup === operation) {
        this.cleanupFailed = true; this.error = error instanceof Error ? error.message : String(error);
        this.cleanup = null; this.reservation = false; this.publish();
      }
      reject(error);
    });
    this.publish();
    return operation;
  }
  /** Hidden/pagehide/background and unmount only fence once; visible never starts or retries. */
  suspend(): void { if (this.held && !this.cleanupFailed) void this.cancel().catch(() => {}); }
}
