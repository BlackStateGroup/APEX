import { MAX_FRAME, utf8 } from '../protocol/index.ts';
import type { ByteTransport } from './transport.ts';

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
export interface BleDriver { connect(id: string): Promise<GattConnection>; }

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
      const connection = await this.driver.connect(this.id);
      if (this.state !== 'opening') { await connection.disconnect(); throw new Error('BLE connection cancelled'); }
      if (!Number.isInteger(connection.mtu) || connection.mtu < 23 || connection.mtu > 517) { await connection.disconnect(); throw new Error('Invalid BLE MTU'); }
      this.connection = connection;
      let ready = false;
      let resolveReady!: () => void;
      const notificationReady = new Promise<void>((resolve, reject) => {
        resolveReady = resolve; this.rejectReady = reject;
        timer = setTimeout(() => reject(new Error('AXP notification readiness timed out')), this.timeoutMs);
      });
      const subscribing = Promise.resolve().then(() => connection.subscribe(bytes => {
        if (this.state === 'closed' || this.connection !== connection) return;
        const marker = bytes.length === AXP_READY.length && bytes.every((x, i) => x === AXP_READY[i]);
        if (marker) { ready = true; resolveReady(); return; }
        if (!ready) { this.rejectReady?.(new Error('Accessory did not send the AXP READY marker')); return; }
        if (!bytes.length || bytes.length > 512) { this.fail(new Error('Invalid BLE notification bounds')); return; }
        for (const listener of this.data) listener(bytes.slice());
      }, error => this.fail(error))).then(unsubscribe => {
        if (this.state === 'closed') unsubscribe(); else this.unsubscribe = unsubscribe;
      });
      await Promise.all([notificationReady, subscribing]);
      if (this.state !== 'opening') throw new Error('BLE closed during setup');
      this.rejectReady = null; this.state = 'open';
    } catch (error) {
      await this.disconnect().catch(() => {}); throw error;
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
            connection.writeWithResponse(copy.slice(offset, offset + chunkSize)),
            new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('BLE write timed out')), this.timeoutMs); }),
          ]);
        } finally { clearTimeout(timer); }
      }
    }).catch(error => { this.fail(error instanceof Error ? error : new Error(String(error))); throw error; }).finally(() => { --this.queued; });
    this.writeChain = write.catch(() => {}); return write;
  }
  private fail(error: Error): void {
    if (this.state === 'closed') return;
    this.rejectReady?.(error);
    const listeners = [...this.closed];
    void this.disconnect().catch(() => {});
    for (const listener of listeners) listener(error);
  }
  async disconnect(): Promise<void> {
    this.state = 'closed'; this.rejectReady?.(new Error('BLE connection closed')); this.rejectReady = null;
    this.unsubscribe?.(); this.unsubscribe = null;
    const connection = this.connection; this.connection = null;
    await connection?.disconnect();
  }
  onData(listener: (bytes: Uint8Array) => void): () => void { this.data.add(listener); return () => this.data.delete(listener); }
  onDisconnect(listener: (error: Error) => void): () => void { this.closed.add(listener); return () => this.closed.delete(listener); }
}
