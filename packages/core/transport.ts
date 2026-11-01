export type SourceKind = 'simulator' | 'host' | 'usb' | 'ble';
export interface ByteTransport {
  readonly source: SourceKind;
  connect(): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
  onData(listener: (bytes: Uint8Array) => void): () => void;
  onDisconnect(listener: (error: Error) => void): () => void;
}
