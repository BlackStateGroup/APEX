import { FlipperRpcError, type FlipperRpcTransport } from './flipper-rpc.ts';

/** Canonical UUID strings reverse the byte order in the pinned STM32 GATT source. */
export const FLIPPER_SERIAL_UUIDS = Object.freeze({
  service: '8fe5b3d5-2e7f-4a98-2a48-7acc60fe0000',
  receive: '19ed82ae-ed21-4c9d-4145-228e62fe0000',
  transmit: '19ed82ae-ed21-4c9d-4145-228e61fe0000',
  flowControl: '19ed82ae-ed21-4c9d-4145-228e63fe0000',
  rpcStatus: '19ed82ae-ed21-4c9d-4145-228e64fe0000',
});
export interface FlipperBleSerialPort {
  /** Authenticated, selected serial service. GATT subscriptions must be ready on return. */
  subscribeData(onData: (bytes: Uint8Array) => void): () => void;
  subscribeCredit(onCredit: (bytes: Uint8Array) => void): () => void;
  subscribeDisconnect(onError: (error: Error) => void): () => void;
  /** Read once after subscribing. The initial read is ignored if a notification wins the race. */
  readCredit(signal: AbortSignal): Promise<Uint8Array>;
  /** Write with response to RX only. No retries. Caller owns actual GATT cancellation. */
  writeChunk(bytes: Uint8Array, signal: AbortSignal): Promise<void>;
  /** Detach subscriptions/disconnect this dedicated port. Must not write RPC reset/status. */
  close(): void;
}
const fault = (code: string) => new FlipperRpcError(code);
export function decodeFlipperCredit(bytes: Uint8Array): number {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 4) throw fault('invalid-credit-length');
  const value = bytes[0]! * 0x1000000 + bytes[1]! * 0x10000 + bytes[2]! * 256 + bytes[3]!;
  // Pinned callback takes uint16_t; reject implausible counters rather than granting them.
  if (value > 65535) throw fault('credit-budget');
  return value;
}

/** One writer, exact (not additive) credit windows, bounded packet size and bounded waits. */
export class FlipperBleCreditTransport implements FlipperRpcTransport {
  private port: FlipperBleSerialPort;
  private packetBytes: number;
  private timeoutMs: number;
  private credits = 0;
  private creditKnown = false;
  private creditGeneration = 0;
  private busy = false;
  private started = false;
  private closed: Error | undefined;
  private subscriptions: (() => void)[] = [];
  private listeners: { data: (bytes: Uint8Array) => void; error: (error: Error) => void } | undefined;
  private wakeCredit: (() => void) | undefined;
  private lifetime = new AbortController();
  constructor(port: FlipperBleSerialPort, options: { packetBytes?: number; timeoutMs?: number } = {}) {
    this.port = port;
    // 20 fits the default ATT MTU; callers may pass a verified negotiated MTU minus 3.
    this.packetBytes = options.packetBytes ?? 20;
    this.timeoutMs = options.timeoutMs ?? 5000;
    if (!Number.isInteger(this.packetBytes) || this.packetBytes < 1 || this.packetBytes > 486) throw fault('invalid-packet-size');
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 30000) throw fault('invalid-timeout');
  }
  subscribe(onData: (bytes: Uint8Array) => void, onError: (error: Error) => void): () => void {
    if (this.started || this.closed) throw fault('transport-already-used');
    this.started = true;
    this.listeners = { data: onData, error: onError };
    const keep = (unsubscribe: () => void) => {
      if (this.closed) { try { unsubscribe(); } catch { /* Already closed. */ } }
      else this.subscriptions.push(unsubscribe);
    };
    try {
      keep(this.port.subscribeDisconnect(cause => this.fail(cause)));
      if (!this.closed) keep(this.port.subscribeData(bytes => { if (!this.closed) this.listeners?.data(bytes); }));
      if (!this.closed) keep(this.port.subscribeCredit(bytes => {
        if (this.closed) return;
        try {
          const credit = decodeFlipperCredit(bytes);
          // Firmware replenishes only when its previous window reached zero. Do not double-grant.
          if (this.creditKnown && this.credits !== 0) throw fault('unexpected-credit-window');
          this.creditGeneration++; this.creditKnown = true; this.credits = credit;
          this.wakeCredit?.();
        } catch (cause) { this.fail(cause instanceof Error ? cause : fault('invalid-credit')); }
      }));
      if (!this.closed && !this.creditKnown) {
        const generation = this.creditGeneration;
        void this.bounded(this.port.readCredit(this.lifetime.signal), this.lifetime.signal).then(bytes => {
          if (this.closed || this.creditGeneration !== generation) return;
          this.creditKnown = true; this.credits = decodeFlipperCredit(bytes); this.wakeCredit?.();
        }).catch(cause => {
          // A newer notification supersedes both the value and failure of this read.
          if (this.closed || this.creditGeneration !== generation) return;
          this.fail(cause instanceof Error ? cause : fault('credit-read-failed'));
        });
      }
    } catch (cause) { this.fail(cause instanceof Error ? cause : fault('subscribe-failed')); }
    return () => this.close();
  }
  private fail(cause: Error): void {
    if (this.closed) return;
    this.closed = cause;
    this.lifetime.abort();
    const listeners = this.listeners; this.listeners = undefined;
    this.wakeCredit?.(); this.wakeCredit = undefined;
    for (const unsubscribe of this.subscriptions.splice(0)) { try { unsubscribe(); } catch { /* Continue cleanup. */ } }
    try { this.port.close(); } catch { /* Remain closed. */ }
    listeners?.error(cause);
  }
  close(): void { this.fail(fault('transport-closed')); }
  private async bounded<T>(promise: Promise<T>, signal: AbortSignal, deadline?: number): Promise<T> {
    void promise.catch(() => undefined);
    const remaining = deadline === undefined ? this.timeoutMs : deadline - Date.now();
    if (remaining <= 0) throw fault('transport-timeout');
    if (this.closed) throw this.closed;
    if (signal.aborted) throw fault('aborted');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
        abort = () => reject(this.closed ?? fault('aborted'));
        signal.addEventListener('abort', abort, { once: true });
        this.lifetime.signal.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => reject(fault('transport-timeout')), remaining);
      })]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (abort) { signal.removeEventListener('abort', abort); this.lifetime.signal.removeEventListener('abort', abort); }
    }
  }
  async write(bytes: Uint8Array, signal: AbortSignal): Promise<void> {
    if (this.closed) throw this.closed;
    if (!this.started) throw fault('transport-not-started');
    if (this.busy) throw fault('transport-busy');
    if (signal.aborted) throw fault('aborted');
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > 65536) throw fault('write-budget');
    // Snapshot before the first await; later caller mutations cannot change transmitted bytes.
    const snapshot = Uint8Array.from(bytes);
    this.busy = true;
    const deadline = Date.now() + this.timeoutMs;
    try {
      for (let offset = 0; offset < snapshot.length;) {
        if (signal.aborted || this.closed) throw this.closed ?? fault('aborted');
        if (Date.now() >= deadline) throw fault('transport-timeout');
        if (!this.creditKnown || this.credits === 0) {
          await this.bounded(new Promise<void>(resolve => { this.wakeCredit = resolve; }), signal, deadline);
          this.wakeCredit = undefined;
          continue;
        }
        const count = Math.min(this.packetBytes, this.credits, snapshot.length - offset);
        // Reserve before awaiting the write; a legitimate refill may arrive during its ACK.
        this.credits -= count;
        await this.bounded(this.port.writeChunk(snapshot.slice(offset, offset + count), signal), signal, deadline);
        offset += count;
      }
    } catch (cause) {
      const failure = cause instanceof Error ? cause : fault('write-failed');
      this.fail(failure); throw failure;
    } finally { this.busy = false; this.wakeCredit = undefined; }
  }
}
