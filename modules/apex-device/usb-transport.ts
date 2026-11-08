import { MAX_FRAME } from '../../packages/protocol/index.ts';
import type { ByteTransport } from '../../packages/core/transport.ts';
import type { ApexNative } from './index.ts';

type Lease = {
  token: number | null; cancelled: boolean; closeRequested: boolean; closeFailed: boolean; opened: boolean; released: boolean;
  terminal: boolean; early: Map<number, string>; overflow: boolean;
  subscriptions: { remove(): void }[]; pending: Set<(error: Error) => void>;
  acquiring: Promise<void>; writes: Promise<void>; queued: number; closing?: Promise<void>;
};
// Native exposes one USB link. Ownership includes permission/open and uncertain cleanup,
// and cannot be bypassed by constructing another transport around the same module.
const owners = new WeakMap<ApexNative, Lease>();
const validToken = (token: number) => Number.isSafeInteger(token) && token > 0 && token <= 0x7fffffff;

const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const viewKind = Object.getOwnPropertyDescriptor(typedPrototype, Symbol.toStringTag)!.get!;
const viewLength = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength')!.get!;
const viewOffset = Object.getOwnPropertyDescriptor(typedPrototype, 'byteOffset')!.get!;
const viewBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer')!.get!;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const bufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
function snapshotWrite(input: Uint8Array): Uint8Array {
  let length: number; let offset: number; let buffer: ArrayBuffer;
  try {
    if (viewKind.call(input) !== 'Uint8Array') throw new Error();
    length = viewLength.call(input); offset = viewOffset.call(input); buffer = viewBuffer.call(input);
    bufferLength.call(buffer); // Reject shared backing storage using its intrinsic brand.
    if (bufferResizable?.call(buffer)) throw new Error();
  } catch { throw new Error('Invalid USB write input'); }
  if (length < 1 || length > MAX_FRAME) throw new Error('USB write exceeds frame bounds');
  try {
    const view = new Uint8Array(buffer, offset, length);
    const copy = new Uint8Array(length); copy.set(view); return copy;
  } catch { throw new Error('Invalid USB write input'); }
}

export class AndroidUsbTransport implements ByteTransport {
  readonly source = 'usb' as const;
  private native: ApexNative;
  private deviceId: number;
  private lease: Lease | null = null;
  private data = new Set<(bytes: Uint8Array) => void>();
  private closed = new Set<(error: Error) => void>();
  constructor(native: ApexNative, deviceId: number) { this.native = native; this.deviceId = deviceId; }

  async connect(): Promise<void> {
    if (owners.has(this.native)) throw new Error('USB already owned; close the previous transport first');
    const lease: Lease = { token: null, cancelled: false, closeRequested: false, closeFailed: false, opened: false, released: false,
      terminal: false, early: new Map(), overflow: false, subscriptions: [], pending: new Set(),
      acquiring: Promise.resolve(), writes: Promise.resolve(), queued: 0 };
    this.lease = lease; owners.set(this.native, lease);
    // Start on a microtask so disconnect always sees the actual acquisition promise.
    lease.acquiring = Promise.resolve().then(async () => {
      try {
        if (lease.cancelled) throw new Error('USB connection cancelled');
        if (!await this.native.requestUsbPermission(this.deviceId)) throw new Error('USB permission denied');
        if (lease.cancelled) throw new Error('USB connection cancelled');
        lease.subscriptions.push(this.native.addListener('onUsbData', event => {
          if (!event || typeof event !== 'object' || this.lease !== lease || lease.cancelled || lease.terminal || lease.token === null || event.token !== lease.token) return;
          if (!Array.isArray(event.bytes) || event.bytes.length > 512 || Array.from(event.bytes).some(x => !Number.isInteger(x) || x < 0 || x > 255)) return;
          for (const listener of [...this.data]) {
            if (lease.cancelled || lease.terminal) break;
            try { listener(Uint8Array.from(event.bytes)); } catch { /* Consumers cannot change native ownership. */ }
          }
        }));
        lease.subscriptions.push(this.native.addListener('onUsbClosed', event => {
          if (!event || typeof event !== 'object' || this.lease !== lease || lease.released || !validToken(event.token)) return;
          if (lease.token === null) {
            if (lease.early.size < 32) lease.early.set(event.token, String(event.reason));
            else lease.overflow = true;
            return;
          }
          if (event.token === lease.token) this.terminal(lease, String(event.reason));
        }));
        lease.opened = true;
        const token = await this.native.openUsb(this.deviceId);
        if (!validToken(token)) throw new Error('Invalid USB connection token; cleanup is uncertain');
        lease.token = token;
        const earlyReason = lease.early.get(token); lease.early.clear();
        if (earlyReason !== undefined) this.terminal(lease, earlyReason);
        if (lease.overflow) { lease.cancelled = true; throw new Error('USB terminal event buffer overflow; close required'); }
        if (lease.cancelled || lease.terminal) throw new Error('USB connection closed during open');
      } catch (error) {
        this.clearSubscriptions(lease);
        if (!lease.opened) this.release(lease);
        // Rejected/invalid open does not prove native release. Retain the fence.
        throw error;
      }
    });
    return lease.acquiring;
  }

  private terminal(lease: Lease, reason: string): void {
    if (lease.terminal) return;
    lease.terminal = true;
    this.rejectWrites(lease, new Error(reason));
    this.clearSubscriptions(lease);
    // Explicit close intent is sticky, including after failure. No callback can
    // falsely certify that a rejected close released the native resource.
    if (!lease.closeRequested && !lease.overflow) void lease.acquiring.catch(() => {}).then(() => lease.writes).then(() => {
      if (!lease.closeRequested && !lease.overflow) this.release(lease);
    });
    for (const listener of [...this.closed]) { try { listener(new Error(reason)); } catch { /* Isolate consumers. */ } }
  }

  write(bytes: Uint8Array): Promise<void> {
    const lease = this.lease;
    if (!lease || lease.released || lease.cancelled || lease.terminal || lease.token === null) return Promise.reject(new Error('USB is closed'));
    if (lease.queued >= 16) return Promise.reject(new Error('USB write queue full'));
    let copy: Uint8Array;
    try { copy = snapshotWrite(bytes); } catch (error) { return Promise.reject(error); }
    const token = lease.token; lease.queued++;
    return new Promise<void>((resolve, reject) => {
      lease.pending.add(reject);
      const write = lease.writes.then(async () => {
        if (lease.cancelled || lease.terminal || lease.released || this.lease !== lease) throw new Error('USB connection changed');
        await this.native.writeUsb(token, Array.from(copy));
        if (lease.cancelled || lease.terminal) throw new Error('USB connection changed');
      }).finally(() => { lease.queued--; });
      lease.writes = write.catch(() => {});
      void write.then(resolve, reject).finally(() => lease.pending.delete(reject));
    });
  }
  private rejectWrites(lease: Lease, error: Error): void {
    for (const reject of lease.pending) reject(error);
    lease.pending.clear();
  }
  private clearSubscriptions(lease: Lease): void {
    for (const sub of lease.subscriptions.splice(0)) { try { sub.remove(); } catch { /* Stale callbacks are fenced. */ } }
  }
  private release(lease: Lease): void {
    lease.released = true; this.clearSubscriptions(lease);
    if (owners.get(this.native) === lease) owners.delete(this.native);
  }
  async disconnect(): Promise<void> {
    const lease = this.lease;
    if (!lease || lease.released) return;
    if (lease.closing) return lease.closing;
    lease.closeRequested = true; lease.cancelled = true; this.rejectWrites(lease, new Error('USB is closed'));
    lease.closing = Promise.resolve().then(async () => {
      await lease.acquiring.catch(() => {});
      if (lease.released) return;
      if (lease.token === null) throw new Error('USB cleanup uncertain: native open returned no valid token');
      try { await this.native.closeUsb(lease.token); }
      catch (error) {
        lease.closeFailed = true; this.clearSubscriptions(lease); throw error;
      }
      // Native clears its link before physical cleanup. After a rejection, a
      // fulfilled retry may merely be a no-op and cannot acknowledge that cleanup.
      if (lease.closeFailed) throw new Error('USB cleanup uncertain after failed close; native release cannot be confirmed');
      await lease.writes;
      this.release(lease);
    });
    try { await lease.closing; }
    finally { lease.closing = undefined; }
  }
  onData(listener: (bytes: Uint8Array) => void): () => void { this.data.add(listener); return () => this.data.delete(listener); }
  onDisconnect(listener: (error: Error) => void): () => void { this.closed.add(listener); return () => this.closed.delete(listener); }
}
