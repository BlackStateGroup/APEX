import { MAX_FRAME, utf8 } from '../protocol/index.ts';
import type { ByteTransport, DisconnectOptions } from './transport.ts';

export const AXP_SERVICE = '6f1d0001-8632-4a97-a816-7776d2b7a101';
export const AXP_WRITE = '6f1d0002-8632-4a97-a816-7776d2b7a101';
export const AXP_NOTIFY = '6f1d0003-8632-4a97-a816-7776d2b7a101';
export const AXP_READY = utf8('AXP_READY');
export interface BleCandidate { id: string; name: string; rssi: number | null; }
export interface GattConnection {
  mtu: number;
  subscribe(onBytes: (bytes: Uint8Array) => void, onClosed: (error: Error) => void): Promise<() => void>;
  writeWithResponse(bytes: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
}
export interface BleDriver {
  connect(id: string, signal?: AbortSignal, attempt?: object): Promise<GattConnection>;
  /** Trusted adapter proof for this exact rejected dispatch, not native release. */
  consumeUnissuedConnection?(attempt: object, id: string, rejection: unknown): boolean;
}

/** AXP only. Discovery and an unauthenticated READY marker do not grant downstream authority. */
export class BleTransport implements ByteTransport {
  readonly source = 'ble' as const;
  private driver: BleDriver;
  private id: string;
  private connection: GattConnection | null = null;
  private unsubscribe: (() => void) | null = null;
  private data = new Set<(bytes: Uint8Array) => void>();
  private closed = new Set<(error: Error) => void>();
  private state: 'new' | 'opening' | 'open' | 'closed' = 'new';
  private rejectReady: ((error: Error) => void) | null = null;
  private writeChain = Promise.resolve();
  private queued = 0;
  // These are raw driver effects, not caller-facing timeout races or connect().
  private pendingEffects = new Set<Promise<unknown>>();
  private disconnecting: Promise<void> | null = null;
  private failedDisconnect: Promise<void> | null = null;
  private acquisitionUnknown = false;
  private acquisitionAbort = new AbortController();
  private track<T>(operation: Promise<T>): Promise<T> {
    this.pendingEffects.add(operation);
    void operation.then(() => this.pendingEffects.delete(operation), () => this.pendingEffects.delete(operation));
    return operation;
  }
  private timeoutMs: number;
  constructor(driver: BleDriver, id: string, options: { timeoutMs?: number } = {}) {
    this.driver = driver; this.id = id; this.timeoutMs = options.timeoutMs ?? 5000;
    if (!id || id.length > 128 || !Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 30000) throw new Error('Invalid BLE session bounds');
  }
  async connect(): Promise<void> {
    if (this.state !== 'new') throw new Error('BLE transport cannot be reused');
    this.state = 'opening';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let dispatched = false;
      let attempt: object | undefined;
      const connection = await this.track(Promise.resolve().then(() => {
        // Cancellation before dispatch proves no driver effect was issued.
        if (this.acquisitionAbort.signal.aborted) throw new Error('BLE connection cancelled');
        dispatched = true;
        attempt = Object.freeze({});
        return this.driver.connect(this.id, this.acquisitionAbort.signal, attempt);
      }).then(connection => {
        // Own the returned handle before cancellation or validation can fail.
        this.connection = connection;
        attempt = undefined;
        return connection;
      }, error => {
        // Query once on the exact raw rejection. Legacy/malformed/throwing
        // proofs stay unknown, and never replace the original rejection.
        let unissued = false;
        if (dispatched && attempt) {
          try {
            const proof: unknown = this.driver.consumeUnissuedConnection?.(attempt, this.id, error);
            unissued = proof === true;
            if (proof !== null && (typeof proof === 'object' || typeof proof === 'function')) {
              // A malformed native Promise is never proof. Observe its rejection
              // without awaiting it or reading/assimilating arbitrary thenables.
              try { Promise.prototype.then.call(proof, undefined, () => {}); } catch { /* Not a native Promise. */ }
            }
          }
          catch { /* Proof failure is not proof of release. */ }
        }
        attempt = undefined;
        if (dispatched && !unissued) this.acquisitionUnknown = true;
        throw error;
      }));
      if (this.state !== 'opening') throw new Error('BLE connection cancelled');
      if (!Number.isInteger(connection.mtu) || connection.mtu < 23 || connection.mtu > 517) throw new Error('Invalid BLE MTU');
      let ready = false;
      let resolveReady!: () => void;
      const notificationReady = new Promise<void>((resolve, reject) => {
        resolveReady = resolve; this.rejectReady = reject;
        timer = setTimeout(() => reject(new Error('AXP notification readiness timed out')), this.timeoutMs);
      });
      const subscribing = this.track(Promise.resolve().then(() => {
        if (this.state !== 'opening') throw new Error('BLE connection cancelled');
        return connection.subscribe(bytes => {
          if (this.state === 'closed' || this.connection !== connection) return;
          const marker = bytes.length === AXP_READY.length && bytes.every((x, i) => x === AXP_READY[i]);
          // READY is only a startup marker. After the first marker, even an
          // identical notification is ordinary framed data (also before subscribe settles).
          if (!ready && marker) { ready = true; resolveReady(); return; }
          if (!ready) { this.rejectReady?.(new Error('Accessory did not send the AXP READY marker')); return; }
          if (!bytes.length || bytes.length > 512) { this.fail(new Error('Invalid BLE notification bounds')); return; }
          for (const listener of this.data) listener(bytes.slice());
        }, error => this.fail(error));
      }).then(unsubscribe => {
        // Even late registration is owned until disconnect removes it.
        this.unsubscribe = unsubscribe;
      }));
      await Promise.all([notificationReady, subscribing]);
      if (this.state !== 'opening') throw new Error('BLE closed during setup');
      this.rejectReady = null; this.state = 'open';
    } catch (error) {
      await this.disconnect({ retryFailedCleanup: false }).catch(() => {}); throw error;
    } finally { clearTimeout(timer); }
  }
  async write(bytes: Uint8Array): Promise<void> {
    if (this.state !== 'open' || !this.connection) throw new Error('BLE is not connected');
    if (bytes.length < 1 || bytes.length > MAX_FRAME) throw new Error('BLE write exceeds frame bounds');
    if (this.queued >= 16) throw new Error('BLE write queue full');
    const connection = this.connection; const copy = bytes.slice(); ++this.queued;
    const write = this.writeChain.then(async () => {
      const chunkSize = Math.min(connection.mtu - 3, 244);
      for (let offset = 0; offset < copy.length; offset += chunkSize) {
        if (this.state !== 'open' || this.connection !== connection) throw new Error('BLE connection changed');
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this.track(Promise.resolve().then(() => {
              if (this.state !== 'open') throw new Error('BLE connection changed');
              return connection.writeWithResponse(copy.slice(offset, offset + chunkSize));
            })),
            new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('BLE write timed out')), this.timeoutMs); }),
          ]);
          // Even the final chunk must not report success after cancellation.
          if (this.state !== 'open' || this.connection !== connection) throw new Error('BLE connection changed');
        } finally { clearTimeout(timer); }
      }
    }).catch(error => { this.fail(error instanceof Error ? error : new Error(String(error))); throw error; }).finally(() => { --this.queued; });
    this.writeChain = write.catch(() => {}); return write;
  }
  private fail(error: Error): void {
    if (this.state === 'closed') return;
    this.rejectReady?.(error);
    const listeners = [...this.closed];
    void this.disconnect({ retryFailedCleanup: false }).catch(() => {});
    for (const listener of listeners) listener(error);
  }
  disconnect(options: DisconnectOptions = {}): Promise<void> {
    this.state = 'closed'; this.acquisitionAbort.abort(); this.rejectReady?.(new Error('BLE connection closed')); this.rejectReady = null;
    if (this.disconnecting) return this.disconnecting;
    if (options.retryFailedCleanup === false && this.failedDisconnect) return this.failedDisconnect;
    this.failedDisconnect = null;
    const cleanup = Promise.resolve().then(async () => {
      // A timeout/event is not settlement of a native effect. Closed state
      // prevents new effects; drain any effect already reserved before closure.
      while (this.pendingEffects.size) await Promise.allSettled([...this.pendingEffects]);
      this.unsubscribe?.(); this.unsubscribe = null;
      const connection = this.connection;
      if (connection) {
        await connection.disconnect();
        this.connection = null;
      }
      if (this.acquisitionUnknown) throw new Error('BLE acquisition release unknown; driver connect failed without a cleanup handle');
    });
    this.disconnecting = cleanup;
    void cleanup.then(() => { this.disconnecting = null; }, () => {
      this.disconnecting = null;
      this.failedDisconnect = cleanup;
    });
    return cleanup;
  }
  onData(listener: (bytes: Uint8Array) => void): () => void { this.data.add(listener); return () => this.data.delete(listener); }
  onDisconnect(listener: (error: Error) => void): () => void { this.closed.add(listener); return () => this.closed.delete(listener); }
}
