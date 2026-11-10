import { encode, FrameDecoder } from '../protocol/index.ts';
import type { Frame } from '../protocol/index.ts';
import type { ByteTransport } from './transport.ts';
import { AccessoryTrustAuthority } from './accessory-trust.ts';
import type { AccessoryReader, AccessoryReadOperation, AccessoryReadResult } from './accessory-trust.ts';

type Pending = { request: Frame; resolve(frame: Frame): void; reject(error: Error): void; response?: Frame; wrote: boolean; timer: ReturnType<typeof setTimeout> };
const owners = new WeakSet<ByteTransport>();
/** One USB connection, no handshake/legacy fallback, retries, reconnect or RF.
 * Transport disconnect must cancel/join an in-progress acquisition, as the
 * existing AndroidUsbTransport does. Failed cleanup retains the ownership fence. */
export class AccessorySignedConnection {
  #state: 'new' | 'opening' | 'open' | 'closing' | 'closed' | 'cleanup-failed' = 'new';
  #reader?: AccessoryReader;
  #pending?: Pending;
  #opening: Promise<void> = Promise.resolve();
  #closing?: Promise<void>;
  #off: (() => void)[] = [];
  #lease?: ReturnType<typeof setTimeout>;
  #listeners = new Set<() => void>();
  #failure?: Error;
  #decoder = new FrameDecoder(frame => {
    const p = this.#pending;
    if (!p || p.response || frame.kind !== 2 || frame.opcode !== 0x70 || frame.id !== p.request.id) throw new Error('Unexpected signed-read response');
    p.response = frame;
  });
  private transport: ByteTransport;
  private authority: AccessoryTrustAuthority;
  private label: string;
  private options: { leaseMs: number; exchangeMs: number };
  constructor(transport: ByteTransport, authority: AccessoryTrustAuthority, label: string,
    options = { leaseMs: 30000, exchangeMs: 5000 }) {
    this.transport = transport; this.authority = authority; this.label = label;
    this.options = { leaseMs: options.leaseMs, exchangeMs: options.exchangeMs };
    if (transport.source !== 'usb') throw new Error('This laboratory connection only supports USB');
    if (!Number.isInteger(options.leaseMs) || options.leaseMs < 1 || options.leaseMs > 30000 ||
        !Number.isInteger(options.exchangeMs) || options.exchangeMs < 1 || options.exchangeMs > 5000) throw new Error('Invalid connection deadlines');
  }
  get state() { return this.#state; }
  get held() { return !['new', 'closed'].includes(this.#state); }
  observe(fn: () => void) { this.#listeners.add(fn); return () => { this.#listeners.delete(fn); }; }
  #emit() { for (const fn of this.#listeners) { try { fn(); } catch { /* No observer can authorise I/O. */ } } }
  #fail(error: Error) {
    this.#failure ??= error;
    if (this.#pending) { clearTimeout(this.#pending.timer); this.#pending.reject(error); this.#pending = undefined; }
    void this.close().catch(() => {});
  }
  open(): Promise<void> {
    if (this.#state !== 'new' || owners.has(this.transport)) return Promise.reject(new Error('Connection already used or owned'));
    // Reject missing/revoked pairing before asking native code to acquire USB.
    if (!this.authority.listPairings().some(p => p.label === this.label)) return Promise.reject(new Error('Explicit pairing required'));
    owners.add(this.transport); this.#state = 'opening'; this.#emit();
    this.#opening = Promise.resolve().then(async () => {
      if (this.#state !== 'opening') throw new Error('Connection cancelled');
      const subscribe = (install: () => (() => void)) => {
        const off = install();
        if (this.#state !== 'opening') { off(); throw new Error('Connection cancelled during subscription'); }
        this.#off.push(off);
      };
      subscribe(() => this.transport.onData(bytes => {
        if (this.#state !== 'open') { this.#fail(new Error('Unexpected bytes before signed request')); return; }
        try {
          if (!this.#pending) throw new Error('Unsolicited signed-read bytes');
          this.#decoder.push(bytes);
          if (this.#decoder.discarded || (this.#pending?.response && this.#decoder.bufferedBytes)) throw new Error('Malformed or trailing signed-read bytes');
          this.#finish();
        } catch (e) { this.#fail(e instanceof Error ? e : new Error('Invalid signed-read bytes')); }
      }));
      subscribe(() => this.transport.onDisconnect(e => this.#fail(e)));
      await this.transport.connect();
      if (this.#state !== 'opening') throw new Error('Connection cancelled');
      this.#reader = this.authority.createReader(this.label, q => this.#exchange(q), this.options);
      this.#state = 'open'; this.#lease = setTimeout(() => this.#fail(new Error('Signed-read lease expired')), this.options.leaseMs); this.#emit();
    }).catch(error => { this.#fail(error instanceof Error ? error : new Error('USB acquisition failed')); throw error; });
    return this.#opening;
  }
  #finish() {
    const p = this.#pending;
    if (!p || !p.wrote || !p.response) return;
    clearTimeout(p.timer); this.#pending = undefined; p.resolve(p.response);
  }
  #exchange(request: Frame): Promise<Frame> {
    if (this.#state !== 'open' || this.#pending) return Promise.reject(new Error('Signed-read connection unavailable'));
    return new Promise((resolve, reject) => {
      const p: Pending = { request, resolve, reject, wrote: false, timer: setTimeout(() => this.#fail(new Error('Signed-read exchange timed out')), this.options.exchangeMs) };
      this.#pending = p;
      void Promise.resolve().then(() => {
        if (this.#pending !== p || this.#state !== 'open') throw new Error('Exchange cancelled');
        return this.transport.write(encode(request));
      }).then(() => { if (this.#pending === p && this.#state === 'open') { p.wrote = true; this.#finish(); } }, error => this.#fail(error instanceof Error ? error : new Error('USB write failed')));
    });
  }
  async request(operation: AccessoryReadOperation, body = new Uint8Array()): Promise<AccessoryReadResult> {
    if (this.#state !== 'open' || !this.#reader) throw new Error('Signed-read connection unavailable');
    try {
      const result = await this.#reader.request(operation, body);
      if (this.#state !== 'open') throw new Error('Signed-read connection closed during verification');
      return result;
    } catch (error) {
      const failure = this.#failure ?? (error instanceof Error ? error : new Error('Signed read failed'));
      this.#fail(failure); throw failure;
    }
  }
  close(): Promise<void> {
    if (this.#closing) return this.#closing;
    if (this.#state === 'closed') return Promise.resolve();
    if (this.#state === 'new') { this.#state = 'closed'; this.#emit(); return Promise.resolve(); }
    // No cleanup retry can turn an uncertain native release into trusted reuse.
    if (this.#state === 'cleanup-failed') return Promise.reject(new Error('USB cleanup remains uncertain; restart the app after checking the device'));
    this.#state = 'closing'; this.#reader?.close(); clearTimeout(this.#lease);
    if (this.#pending) { clearTimeout(this.#pending.timer); this.#pending.reject(new Error('Signed read cancelled')); this.#pending = undefined; }
    for (const off of this.#off.splice(0)) { try { off(); } catch { /* State fences late callbacks. */ } }
    this.#decoder.reset();
    this.#closing = Promise.resolve().then(async () => {
      // Calling disconnect now fences preventable native permission/open work.
      const cleanup = Promise.resolve().then(() => this.transport.disconnect());
      const results = await Promise.allSettled([this.#opening, cleanup]);
      if (results[1]!.status === 'rejected') { this.#state = 'cleanup-failed'; this.#emit(); throw results[1]!.reason; }
      owners.delete(this.transport); this.#state = 'closed'; this.#emit();
    });
    this.#emit(); return this.#closing;
  }
}
