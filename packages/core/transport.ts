export type SourceKind = 'simulator' | 'host' | 'usb' | 'ble';
/** Automatic cleanup joins a prior failure; explicit user cleanup may retry it. */
export interface DisconnectOptions { retryFailedCleanup?: boolean; }
export interface ByteTransport {
  readonly source: SourceKind;
  connect(): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(options?: DisconnectOptions): Promise<void>;
  onData(listener: (bytes: Uint8Array) => void): () => void;
  onDisconnect(listener: (error: Error) => void): () => void;
}
