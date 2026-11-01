import { encode, FrameDecoder, Kind, Opcode, text, VERSION } from '../protocol/index.ts';
import type { Frame } from '../protocol/index.ts';
import type { ByteTransport, SourceKind } from './transport.ts';

export const operations = {
  'system.info': Opcode.Info,
  'system.capabilities': Opcode.Capabilities,
  'system.ping': Opcode.Ping,
} as const;
export type Operation = keyof typeof operations;
export interface DeviceInfo {
  id: string; board: string; firmware: string; protocol: 1;
  source: 'simulator' | 'host' | 'accessory';
}
type Pending = {
  opcode: number; timer: ReturnType<typeof setTimeout>;
  resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void;
};

function object(bytes: Uint8Array): Record<string, unknown> {
  const value: unknown = JSON.parse(text(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid response object');
  return value as Record<string, unknown>;
}
export function validateInfo(bytes: Uint8Array): DeviceInfo {
  const value = object(bytes);
  for (const key of ['id', 'board', 'firmware']) {
    const field = value[key];
    if (typeof field !== 'string' || field.length < 1 || field.length > 128 || /[\x00-\x1f]/.test(field)) {
      throw new Error(`Invalid identity field: ${key}`);
    }
  }
  if (value.protocol !== VERSION || !['simulator', 'host', 'accessory'].includes(String(value.source))) {
    throw new Error('Unsupported device identity/protocol');
  }
  return value as unknown as DeviceInfo;
}
export function validateCapabilities(bytes: Uint8Array): Operation[] {
  const value = object(bytes).operations;
  if (!Array.isArray(value) || value.length !== 3 || new Set(value).size !== value.length ||
      value.some(x => typeof x !== 'string' || !Object.hasOwn(operations, x)) ||
      Object.keys(operations).some(x => !value.includes(x))) {
    throw new Error('Unsupported capability manifest');
  }
  return value as Operation[];
}

/** One-use connection; IDs are never recycled, including after timeouts. */
export class DeviceSession {
  private transport: ByteTransport;
  private decoder: FrameDecoder;
  private pending = new Map<number, Pending>();
  private unsubscribers: (() => void)[] = [];
  private nextId = 1;
  private timeoutMs: number;
  private maxPending: number;
  state: 'new' | 'opening' | 'open' | 'closed' = 'new';
  info: DeviceInfo | null = null;
  capabilities: Operation[] = [];

  constructor(transport: ByteTransport, options: { timeoutMs?: number; maxPending?: number } = {}) {
    this.transport = transport;
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.maxPending = options.maxPending ?? 8;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 30000 ||
        !Number.isInteger(this.maxPending) || this.maxPending < 1 || this.maxPending > 32) {
      throw new Error('Invalid session bounds');
    }
    this.decoder = new FrameDecoder(frame => this.receive(frame));
  }
  get source(): SourceKind { return this.transport.source; }
  get pendingCount(): number { return this.pending.size; }

  async open(): Promise<void> {
    if (this.state !== 'new') throw new Error('Session cannot be reused');
    this.state = 'opening';
    this.unsubscribers = [
      this.transport.onData(bytes => this.decoder.push(bytes)),
      this.transport.onDisconnect(error => { this.terminate(error); void this.transport.disconnect().catch(() => {}); }),
    ];
    try {
      await this.transport.connect();
      if (this.state !== 'opening') throw new Error('Connection closed during open');
      this.info = validateInfo(await this.exchange(Opcode.Info, new Uint8Array()));
      this.capabilities = validateCapabilities(await this.exchange(Opcode.Capabilities, new Uint8Array()));
      if (this.state !== 'opening') throw new Error('Connection closed during negotiation');
      this.state = 'open';
    } catch (error) {
      this.terminate(error instanceof Error ? error : new Error(String(error)));
      await this.transport.disconnect().catch(() => {});
      throw error;
    }
  }

  async request(operation: Operation, payload: Uint8Array = new Uint8Array()): Promise<Uint8Array> {
    if (this.state !== 'open') throw new Error('Device is not connected');
    if (!this.capabilities.includes(operation) || !Object.hasOwn(operations, operation)) {
      throw new Error('Operation is not supported');
    }
    return this.exchange(operations[operation], payload);
  }

  private exchange(opcode: number, payload: Uint8Array): Promise<Uint8Array> {
    if (this.state !== 'open' && this.state !== 'opening') return Promise.reject(new Error('Session closed'));
    if (this.pending.size >= this.maxPending) return Promise.reject(new Error('Request queue full'));
    if (this.nextId > 65535) return Promise.reject(new Error('Request ID space exhausted; reconnect'));
    const id = this.nextId++;
    let bytes: Uint8Array;
    try { bytes = encode({ kind: Kind.Request, id, opcode, payload }); }
    catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${id} timed out`));
      }, this.timeoutMs);
      this.pending.set(id, { opcode, timer, resolve, reject });
      const failed = (error: unknown) => {
        const item = this.pending.get(id);
        if (!item) return;
        clearTimeout(item.timer); this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      try { void this.transport.write(bytes).catch(failed); }
      catch (error) { failed(error); }
    });
  }

  private receive(frame: Frame): void {
    if (frame.kind === Kind.Request) return;
    const item = this.pending.get(frame.id);
    if (!item) return;
    clearTimeout(item.timer); this.pending.delete(frame.id);
    if (frame.opcode !== item.opcode) { item.reject(new Error('Response opcode mismatch')); return; }
    if (frame.kind === Kind.Error) {
      let code = 'DEVICE_ERROR';
      try { const value = object(frame.payload); if (typeof value.code === 'string') code = value.code.slice(0, 128); } catch { /* error stays an error */ }
      item.reject(new Error(code)); return;
    }
    item.resolve(frame.payload);
  }

  private terminate(error: Error): void {
    this.state = 'closed';
    this.info = null; this.capabilities = [];
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear(); this.decoder.reset();
  }
  async close(): Promise<void> {
    this.terminate(new Error('Session closed'));
    await this.transport.disconnect();
  }
}
