import type { ByteTransport } from '../../packages/core/transport.ts';
import type { ApexNative } from './index.ts';

export class AndroidUsbTransport implements ByteTransport {
  readonly source = 'usb' as const;
  private native: ApexNative;
  private deviceId: number;
  private token: number | null = null;
  private subscriptions: { remove(): void }[] = [];
  private data = new Set<(bytes: Uint8Array) => void>();
  private closed = new Set<(error: Error) => void>();
  private writeChain = Promise.resolve();
  constructor(native: ApexNative, deviceId: number) { this.native = native; this.deviceId = deviceId; }
  async connect(): Promise<void> {
    if (this.token !== null) throw new Error('USB already open');
    if (!await this.native.requestUsbPermission(this.deviceId)) throw new Error('USB permission denied');
    this.subscriptions = [
      this.native.addListener('onUsbData', event => {
        if (event.token !== this.token) return;
        if (event.bytes.length > 512 || event.bytes.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return;
        for (const listener of this.data) listener(Uint8Array.from(event.bytes));
      }),
      this.native.addListener('onUsbClosed', event => {
        if (event.token !== this.token) return;
        this.token = null;
        this.clearSubscriptions();
        for (const listener of [...this.closed]) listener(new Error(event.reason));
      }),
    ];
    try { this.token = await this.native.openUsb(this.deviceId); }
    catch (error) { this.clearSubscriptions(); throw error; }
  }
  async write(bytes: Uint8Array): Promise<void> {
    const token = this.token;
    if (token === null) throw new Error('USB is closed');
    const copy = Array.from(bytes);
    const write = this.writeChain.then(async () => {
      if (this.token !== token) throw new Error('USB connection changed');
      await this.native.writeUsb(token, copy);
    });
    this.writeChain = write.catch(() => {});
    return write;
  }
  private clearSubscriptions(): void { for (const sub of this.subscriptions.splice(0)) sub.remove(); }
  async disconnect(): Promise<void> {
    const token = this.token; this.token = null; this.clearSubscriptions();
    if (token !== null) await this.native.closeUsb(token);
  }
  onData(listener: (bytes: Uint8Array) => void): () => void { this.data.add(listener); return () => this.data.delete(listener); }
  onDisconnect(listener: (error: Error) => void): () => void { this.closed.add(listener); return () => this.closed.delete(listener); }
}
