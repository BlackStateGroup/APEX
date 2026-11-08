/** Experimental, injected-host-only Web Bluetooth foundation. No global browser access. */
import { AXP_SERVICE, AXP_WRITE, AXP_NOTIFY } from '../../packages/core/ble-transport.ts';
import type { BleCandidate, BleDriver, GattConnection } from '../../packages/core/ble-transport.ts';

export interface WebAxpCharacteristic {
  readonly properties: { readonly write?: boolean; readonly notify?: boolean; readonly indicate?: boolean };
  readonly value?: DataView | null;
  addEventListener(type: 'characteristicvaluechanged', listener: () => void): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: () => void): void;
  startNotifications(): Promise<unknown>;
  stopNotifications(): Promise<unknown>;
  writeValueWithResponse?(bytes: Uint8Array): Promise<unknown>;
}
export interface WebAxpService { getCharacteristic(uuid: string): Promise<WebAxpCharacteristic>; }
export interface WebAxpServer {
  readonly connected: boolean;
  connect(): Promise<WebAxpServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<WebAxpService>;
}
export interface WebAxpDevice {
  readonly name?: string | null;
  readonly gatt?: WebAxpServer;
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
  removeEventListener(type: 'gattserverdisconnected', listener: () => void): void;
}
export interface WebAxpHost {
  readonly secureContext: boolean;
  readonly bluetooth?: { requestDevice(options: { filters: { services: string[] }[] }): Promise<WebAxpDevice> };
}
export type WebAxpState = 'idle' | 'picking' | 'selected' | 'reserved' | 'acquiring' | 'active' | 'closing' | 'cleanup-unknown';
export interface WebAxpSnapshot {
  readonly state: WebAxpState;
  readonly candidate: Readonly<BleCandidate> | null;
  readonly rawPending: number;
  readonly error: string | null;
}
export interface WebAxpOptions { effectTimeoutMs?: number; setupTimeoutMs?: number; cleanupTimeoutMs?: number; }
const error = (message: string): Error => new Error(message);
const viewBuffer = Object.getOwnPropertyDescriptor(DataView.prototype, 'buffer')!.get!;
const viewOffset = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteOffset')!.get!;
const viewLength = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength')!.get!;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const bufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
const safe = (callback: () => void): void => { try { callback(); } catch { /* Observers cannot own lifecycle. */ } };
const bound = (value: number | undefined, fallback: number, maximum: number): number => {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 1 || n > maximum) throw error('Invalid Web AXP deadline');
  return n;
};

/** One manager owns at most one chooser or GATT lease. Construct one per application. */
export class WebAxpManager implements BleDriver {
  #state: WebAxpState = 'idle';
  #candidate: BleCandidate | null = null;
  #selected: WebAxpDevice | null = null;
  #picker: { cancelled: boolean; reject: (e: Error) => void } | null = null;
  #lease: Lease | null = null;
  #serial = 0;
  #lastError: string | null = null;
  readonly #observers = new Set<(snapshot: WebAxpSnapshot) => void>();
  readonly effectTimeoutMs: number;
  readonly setupTimeoutMs: number;
  readonly cleanupTimeoutMs: number;
  readonly #host: WebAxpHost;
  constructor(host: WebAxpHost, options: WebAxpOptions = {}) {
    this.#host = host;
    this.effectTimeoutMs = bound(options.effectTimeoutMs, 4000, 12000);
    this.setupTimeoutMs = bound(options.setupTimeoutMs, 12000, 20000);
    this.cleanupTimeoutMs = bound(options.cleanupTimeoutMs, 5000, 10000);
  }
  snapshot(): WebAxpSnapshot {
    return Object.freeze({ state: this.#state, candidate: this.#candidate ? Object.freeze({ ...this.#candidate }) : null,
      rawPending: (this.#picker ? 1 : 0) + (this.#lease?.raw.size ?? 0), error: this.#lastError });
  }
  observe(listener: (snapshot: WebAxpSnapshot) => void): () => void {
    this.#observers.add(listener); return () => { this.#observers.delete(listener); };
  }
  #publish(): void { const snapshot = this.snapshot(); for (const listener of [...this.#observers]) safe(() => listener(snapshot)); }
  /** Must be called directly from an explicit user gesture. No await precedes requestDevice. */
  chooseAccessory(): Promise<Readonly<BleCandidate>> {
    if (this.#picker || this.#lease) return Promise.reject(error('Web AXP ownership is busy'));
    if (!this.#host.secureContext || !this.#host.bluetooth) {
      this.#lastError = !this.#host.secureContext ? 'Web Bluetooth requires a secure context' : 'Web Bluetooth is unavailable';
      this.#publish(); return Promise.reject(error(this.#lastError));
    }
    this.#selected = null; this.#candidate = null; this.#lastError = null; this.#state = 'picking';
    let resolve!: (candidate: Readonly<BleCandidate>) => void;
    let reject!: (e: Error) => void;
    const result = new Promise<Readonly<BleCandidate>>((yes, no) => { resolve = yes; reject = no; });
    const owner = { cancelled: false, reject }; this.#picker = owner;
    // Reserve before entering host code. Publish only after invocation: observers cannot consume activation.
    let raw: Promise<WebAxpDevice>;
    try { raw = Promise.resolve(this.#host.bluetooth.requestDevice({ filters: [{ services: [AXP_SERVICE] }] })); }
    catch { raw = Promise.reject(error('Accessory chooser failed')); }
    void raw.then(device => {
      if (this.#picker !== owner) return;
      this.#picker = null;
      if (owner.cancelled) { this.#state = 'idle'; this.#publish(); return; }
      let name: string;
      try { name = typeof device.name === 'string' && device.name ? device.name.slice(0, 80).replace(/[\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '') || 'AXP accessory' : 'AXP accessory'; }
      catch { this.#state = 'idle'; this.#lastError = 'Invalid accessory selection'; reject(error(this.#lastError)); this.#publish(); return; }
      this.#selected = device;
      this.#candidate = { id: `web-axp-${++this.#serial}`, name, rssi: null };
      this.#state = 'selected'; resolve(Object.freeze({ ...this.#candidate })); this.#publish();
    }, () => {
      if (this.#picker !== owner) return;
      this.#picker = null; this.#state = 'idle';
      this.#lastError = owner.cancelled ? 'Accessory selection cancelled locally' : 'Accessory chooser rejected, denied, or cancelled';
      reject(error(this.#lastError)); this.#publish();
    });
    this.#publish(); return result;
  }
  /** Synchronous local reservation; the returned promise is already fulfilled with its cleanup handle. */
  connect(id: string): Promise<GattConnection> {
    if (this.#lease || this.#picker || !this.#selected || this.#candidate?.id !== id) {
      return Promise.resolve(Object.freeze({ mtu: 23, subscribe: async () => { throw error('Web AXP candidate is unavailable'); },
        writeWithResponse: async () => { throw error('Web AXP candidate is unavailable'); }, disconnect: async () => {} }));
    }
    const lease = new Lease({ effectTimeoutMs: this.effectTimeoutMs, setupTimeoutMs: this.setupTimeoutMs, cleanupTimeoutMs: this.cleanupTimeoutMs,
      changed: (owner, state, message) => this.#changed(owner, state, message), released: owner => this.#released(owner) }, this.#selected);
    this.#lease = lease;
    this.#selected = null; this.#state = 'reserved'; this.#lastError = null;
    // Promise owns handle even if an observer reenters cancellation.
    const handle: GattConnection = Object.freeze({ mtu: lease.mtu,
      subscribe: (onBytes: (bytes: Uint8Array) => void, onClosed: (e: Error) => void) => lease.subscribe(onBytes, onClosed),
      writeWithResponse: (bytes: Uint8Array) => lease.writeWithResponse(bytes), disconnect: () => lease.disconnect() });
    const result = Promise.resolve(handle); this.#publish(); return result;
  }
  cancelCurrentLease(): void {
    if (this.#picker) {
      this.#picker.cancelled = true; this.#picker.reject(error('Accessory selection cancelled locally'));
      this.#lastError = 'Accessory selection cancelled locally'; this.#publish(); return;
    }
    if (this.#lease) { this.#lease.fence(error('Web AXP lease cancelled locally')); return; }
    if (this.#selected) {
      // Clear all local selection state before observers can start a newer chooser.
      this.#selected = null; this.#candidate = null; this.#state = 'idle'; this.#lastError = null;
      this.#publish();
    }
  }
  /** Explicit retry only. A failed cleanup never silently releases the manager. */
  retryCleanup(): Promise<void> { return this.#lease ? this.#lease.disconnect() : Promise.resolve(); }
  // Internal lease hooks. No raw host objects appear in snapshots.
  #changed(lease: Lease, state?: WebAxpState, message?: string): void {
    if (this.#lease !== lease) return;
    if (state) this.#state = state;
    if (message) this.#lastError = message.slice(0, 160);
    this.#publish();
  }
  #released(lease: Lease): void {
    if (this.#lease !== lease) return;
    this.#lease = null; this.#candidate = null; this.#state = 'idle'; this.#publish();
  }
}

interface LeaseOwner {
  effectTimeoutMs: number; setupTimeoutMs: number; cleanupTimeoutMs: number;
  changed(lease: Lease, state?: WebAxpState, message?: string): void;
  released(lease: Lease): void;
}
class Lease implements GattConnection {
  readonly mtu = 23; // Conservative 20-byte transport budget, NOT an observed negotiated MTU.
  readonly raw = new Set<Promise<unknown>>();
  private readonly waiters = new Set<(e: Error) => void>();
  private closing = false;
  private retired = false;
  private subscribed = false;
  private active = false;
  private ownsServer = false;
  private server: WebAxpServer | null = null;
  private notify: WebAxpCharacteristic | null = null;
  private write: WebAxpCharacteristic | null = null;
  private notificationListener: (() => void) | null = null;
  private deviceListener: (() => void) | null = null;
  private stopAttempted = false;
  private failure: Error | null = null;
  private cleanup: Promise<void> | null = null;
  private cleanupWork: Promise<void> | null = null;
  private onClosed: ((e: Error) => void) | null = null;
  private readonly manager: LeaseOwner;
  private readonly device: WebAxpDevice;
  constructor(manager: LeaseOwner, device: WebAxpDevice) { this.manager = manager; this.device = device; }
  private assertLive(): void { if (this.closing) throw error('Web AXP lease is closing'); }
  private track<T>(action: () => Promise<T>): Promise<T> {
    // Register a sentinel before invoking the host, including synchronous reentry.
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason: unknown) => void;
    const raw = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    this.raw.add(raw);
    try { resolve(action()); } catch (e) { reject(e); }
    void raw.then(() => { this.raw.delete(raw); this.manager.changed(this); }, () => { this.raw.delete(raw); this.manager.changed(this); });
    return raw;
  }
  private bounded<T>(raw: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = (e?: Error, value?: T): void => {
        if (done) return; done = true; clearTimeout(timer); this.waiters.delete(cancel);
        if (e) reject(e); else resolve(value as T);
      };
      const cancel = (e: Error): void => finish(e);
      const timer = setTimeout(() => { const e = error(`Web AXP ${label} timed out`); this.fence(e); finish(e); }, ms);
      this.waiters.add(cancel);
      void raw.then(value => this.closing ? finish(this.failure ?? error('Web AXP lease is closing')) : finish(undefined, value),
        () => { const e = error(`Web AXP ${label} failed`); this.fence(e); finish(e); });
      if (this.closing) finish(this.failure ?? error('Web AXP lease is closing'));
    });
  }
  private effect<T>(label: string, action: () => Promise<T>): Promise<T> {
    this.assertLive(); return this.bounded(this.track(action), this.manager.effectTimeoutMs, label);
  }
  private requestDisconnect(): void {
    if (this.ownsServer && this.server) safe(() => this.server!.disconnect());
  }
  private removeNotifications(): void {
    const listener = this.notificationListener;
    if (listener && this.notify) { this.notify.removeEventListener('characteristicvaluechanged', listener); this.notificationListener = null; }
  }
  fence(e: Error): void {
    if (this.retired) return;
    if (this.closing) { this.requestDisconnect(); return; }
    this.closing = true; this.active = false; this.failure = e;
    // Disconnect before waiting for any raw effect. A callback cannot postpone retirement.
    this.requestDisconnect();
    safe(() => this.removeNotifications());
    for (const cancel of [...this.waiters]) cancel(e);
    this.manager.changed(this, 'closing', e.message);
    const closed = this.onClosed; this.onClosed = null;
    if (closed) safe(() => closed(e));
  }
  subscribe(onBytes: (bytes: Uint8Array) => void, onClosed: (e: Error) => void): Promise<() => void> {
    if (this.subscribed || this.closing) return Promise.reject(error('Web AXP subscription is unavailable'));
    this.subscribed = true; this.onClosed = onClosed;
    const setup = this.acquire(onBytes);
    return this.bounded(setup, this.manager.setupTimeoutMs, 'setup');
  }
  private async acquire(onBytes: (bytes: Uint8Array) => void): Promise<() => void> {
    try {
      this.assertLive(); this.manager.changed(this, 'acquiring'); this.assertLive();
      const server = this.device.gatt;
      if (!server || server.connected) throw error('Web AXP server unavailable or already connected outside this lease');
      this.server = server; this.ownsServer = true;
      this.deviceListener = () => { if (!this.closing) this.fence(error('Web AXP browser GATT disconnected')); };
      this.device.addEventListener('gattserverdisconnected', this.deviceListener);
      this.assertLive();
      const connecting = this.effect('connect', () => server.connect());
      // A late connect may re-open the handle after an earlier disconnect request.
      const pendingConnect = [...this.raw][this.raw.size - 1];
      if (pendingConnect) void pendingConnect.then(() => { if (this.closing) this.requestDisconnect(); }, () => {});
      const connected = await connecting; this.assertLive();
      if (connected !== server || !server.connected) throw error('Web AXP unexpected GATT server');
      const service = await this.effect('service discovery', () => server.getPrimaryService(AXP_SERVICE)); this.assertLive();
      this.write = await this.effect('write discovery', () => service.getCharacteristic(AXP_WRITE)); this.assertLive();
      this.notify = await this.effect('notify discovery', () => service.getCharacteristic(AXP_NOTIFY)); this.assertLive();
      if (!this.write.properties.write || typeof this.write.writeValueWithResponse !== 'function' ||
          !(this.notify.properties.notify || this.notify.properties.indicate)) throw error('Web AXP required GATT properties unavailable');
      const characteristic = this.notify;
      this.notificationListener = () => {
        if (this.closing || this.notify !== characteristic) return;
        try {
          const value = characteristic.value;
          const length = viewLength.call(value) as number;
          if (length < 1 || length > 512) throw error('Invalid Web AXP notification bounds');
          const buffer = viewBuffer.call(value) as ArrayBuffer;
          bufferLength.call(buffer); // Reject shared storage via intrinsic ArrayBuffer brand check.
          if (bufferResizable?.call(buffer)) throw error('Invalid Web AXP notification storage');
          const copy = new Uint8Array(buffer, viewOffset.call(value), length).slice();
          safe(() => onBytes(copy));
        } catch { this.fence(error('Invalid Web AXP notification')); }
      };
      characteristic.addEventListener('characteristicvaluechanged', this.notificationListener);
      this.assertLive();
      const started = await this.effect('notification startup', () => characteristic.startNotifications()); this.assertLive();
      if (started !== characteristic) throw error('Web AXP unexpected notification characteristic');
      this.active = true; this.manager.changed(this, 'active'); this.assertLive();
      return () => {
        if (this.retired || this.closing) return;
        // Stop only a still-live own characteristic; never ask a disconnected stale object to stop.
        safe(() => this.removeNotifications());
        if (this.server?.connected && !this.stopAttempted) {
          this.stopAttempted = true; void this.track(() => characteristic.stopNotifications()).catch(() => {});
        }
        this.fence(error('Web AXP subscription removed'));
        void this.disconnect().catch(() => {});
      };
    } catch (e) { this.fence(e instanceof Error ? e : error('Web AXP setup failed')); throw e; }
  }
  writeWithResponse(bytes: Uint8Array): Promise<void> {
    if (!this.active || this.closing || !this.write || bytes.length < 1 || bytes.length > 20) return Promise.reject(error('Web AXP write unavailable or outside conservative chunk budget'));
    const characteristic = this.write; const copy = bytes.slice();
    return this.effect('write', () => characteristic.writeValueWithResponse!(copy)).then(() => {});
  }
  disconnect(): Promise<void> {
    if (this.retired) return Promise.resolve();
    if (this.cleanup) return this.cleanup;
    // Reserve the public cleanup before fence invokes any observer/onClosed callback.
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const result = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    this.cleanup = result;
    this.fence(error('Web AXP lease closed'));
    const drain = async (): Promise<void> => {
      while (this.raw.size) await Promise.allSettled([...this.raw]);
      this.removeNotifications();
      // Disconnect invalidates characteristics. Do not issue a new stop on a stale object.
      // Already dispatched stop promises, including rejection, must first settle above.
      this.requestDisconnect();
      if (this.ownsServer && this.server?.connected) throw error('Web AXP browser GATT handle remains connected');
      if (this.deviceListener) { this.device.removeEventListener('gattserverdisconnected', this.deviceListener); this.deviceListener = null; }
    };
    if (!this.cleanupWork) {
      const work = Promise.resolve().then(drain);
      this.cleanupWork = work;
      void work.then(() => { if (this.cleanupWork === work) this.cleanupWork = null; },
        () => { if (this.cleanupWork === work) this.cleanupWork = null; });
    }
    const work = this.cleanupWork;
    let finished = false;
    const finish = (success: boolean): void => {
      if (finished) return;
      finished = true; clearTimeout(timer); this.cleanup = null;
      if (success) {
        this.retired = true; this.ownsServer = false; this.server = null; this.notify = null; this.write = null;
        this.manager.released(this); resolve();
      } else {
        // Publish only after rejecting; callbacks may explicitly retry against the retained work.
        reject(error('Web AXP cleanup unknown; explicit retry required'));
        this.manager.changed(this, 'cleanup-unknown', 'Web AXP cleanup unknown; explicit retry required');
      }
    };
    const timer = setTimeout(() => finish(false), this.manager.cleanupTimeoutMs);
    void work.then(() => finish(true), () => finish(false));
    return result;
  }
}
