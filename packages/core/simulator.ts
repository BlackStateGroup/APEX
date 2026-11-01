import { encode, FrameDecoder, Kind, Opcode, utf8 } from '../protocol/index.ts';
import type { ByteTransport } from './transport.ts';

/** Software-only demonstration peer. Never used as an automatic hardware fallback. */
export class SimulatorTransport implements ByteTransport {
  readonly source = 'simulator' as const;
  private connected = false;
  private listeners = new Set<(bytes: Uint8Array) => void>();
  private disconnectListeners = new Set<(error: Error) => void>();
  private decoder = new FrameDecoder(frame => {
    if (frame.kind !== Kind.Request) return;
    let kind: 2 | 3 = Kind.Response;
    let payload: Uint8Array;
    if ([Opcode.Info, Opcode.Capabilities].includes(frame.opcode as 1 | 2) && frame.payload.length) {
      kind = Kind.Error; payload = utf8('{"code":"INVALID_ARGUMENT"}');
    } else if (frame.opcode === Opcode.Info) {
      payload = utf8(JSON.stringify({ id: 'apex-simulator', board: 'software', firmware: '0.1.0', protocol: 1, source: 'simulator' }));
    } else if (frame.opcode === Opcode.Capabilities) {
      payload = utf8('{"operations":["system.info","system.capabilities","system.ping"]}');
    } else if (frame.opcode === Opcode.Ping) payload = frame.payload;
    else { kind = Kind.Error; payload = utf8('{"code":"UNSUPPORTED_OPERATION"}'); }
    const response = encode({ ...frame, kind, payload });
    // Deliberately fragment so the UI also exercises stream reassembly.
    for (let offset = 0; offset < response.length; offset += 7) {
      for (const listener of this.listeners) listener(response.slice(offset, offset + 7));
    }
  });
  async connect(): Promise<void> { this.connected = true; }
  async write(bytes: Uint8Array): Promise<void> {
    if (!this.connected) throw new Error('Simulator disconnected');
    this.decoder.push(bytes);
  }
  async disconnect(): Promise<void> {
    const wasConnected = this.connected; this.connected = false; this.decoder.reset();
    if (wasConnected) for (const listener of [...this.disconnectListeners]) listener(new Error('Simulator disconnected'));
  }
  onData(listener: (bytes: Uint8Array) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  onDisconnect(listener: (error: Error) => void): () => void {
    this.disconnectListeners.add(listener); return () => this.disconnectListeners.delete(listener);
  }
}
