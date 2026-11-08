/** Read-only Flipper RPC, deliberately separate from AXP. No device discovery or pairing. */
import { FLIPPER_LIMITS, inspectFlipperResponses, type FlipperFrame } from '../core/flipper-offline.ts';

export const FLIPPER_RPC_BOUNDS = Object.freeze({
  frameBytes: FLIPPER_LIMITS.frame, chunkBytes: 65536, responseBytes: 65536,
  responseFrames: 256, pairs: 128, timeoutMs: 5000,
});
export type FlipperReadOperation = 'version' | 'identity' | 'power';
export interface FlipperVersion { major: number; minor: number }
export interface FlipperPair { key: string; value: string }
export interface FlipperRpcTransport {
  /** Bytes must belong to one already-established RPC session, delivered once and in order. */
  subscribe(onData: (bytes: Uint8Array) => void, onError: (error: Error) => void): () => void;
  /** Must stop issuing further writes when aborted. Never retry an uncertain write. */
  write(bytes: Uint8Array, signal: AbortSignal): Promise<void>;
  /** Release transport subscriptions and invalidate this session. */
  close(): void;
}
export class FlipperRpcError extends Error {
  readonly code: string;
  constructor(code: string) { super(`Flipper RPC: ${code}`); this.name = 'FlipperRpcError'; this.code = code; }
}
const error = (code: string) => new FlipperRpcError(code);
const tags = Object.freeze({ version: 39, identity: 32, power: 44 });
function varint(value: number): number[] {
  const bytes: number[] = [];
  do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte | (value ? 128 : 0)); } while (value);
  return bytes;
}
/** The only request encoder: no raw opcode, arbitrary payload or mutating request escape hatch. */
export function encodeFlipperReadRequest(operation: FlipperReadOperation, commandId: number): Uint8Array {
  if (!Object.hasOwn(tags, operation)) throw error('unsupported-operation');
  if (!Number.isInteger(commandId) || commandId < 1 || commandId > 0xffffffff) throw error('invalid-command-id');
  const body = [8, ...varint(commandId), ...varint(tags[operation] * 8 + 2), 0];
  return Uint8Array.from([...varint(body.length), ...body]);
}

/** Bounded incremental framing. Any framing error poisons the decoder; no scan-ahead recovery. */
export class FlipperFrameDecoder {
  private buffer = new Uint8Array(FLIPPER_RPC_BOUNDS.frameBytes + 5);
  private used = 0;
  private length = 0;
  private prefix = 0;
  private expected: number | undefined;
  private failed = false;
  get hasPartialFrame(): boolean { return this.used !== 0; }
  push(chunk: Uint8Array, consume: (frame: FlipperFrame, wireBytes: number) => void): void {
    if (this.failed) throw error('decoder-closed');
    try {
      if (!(chunk instanceof Uint8Array) || chunk.byteLength > FLIPPER_RPC_BOUNDS.chunkBytes) throw error('chunk-budget');
      let count = 0;
      for (let position = 0; position < chunk.byteLength; position++) {
        const byte = chunk[position]!;
        this.buffer[this.used++] = byte;
        if (this.expected === undefined) {
          if (this.prefix === 4 && byte > 15) throw error('length-overflow');
          this.length += (byte & 127) * 2 ** (this.prefix * 7);
          this.prefix++;
          if (byte & 128) { if (this.prefix === 5) throw error('length-overflow'); continue; }
          if (this.prefix > 1 && byte === 0) throw error('noncanonical-length');
          if (!this.length || this.length > FLIPPER_RPC_BOUNDS.frameBytes) throw error('frame-budget');
          this.expected = this.prefix + this.length;
        }
        if (this.used === this.expected) {
          if (++count > FLIPPER_RPC_BOUNDS.responseFrames) throw error('chunk-frame-budget');
          // Reuse APEX's strict, independently implemented protobuf parser, not upstream code.
          const parsed = inspectFlipperResponses(this.buffer.subarray(0, this.used), { provenance: 'imported' });
          const frame = parsed.frames[0];
          if (!frame || parsed.tail || parsed.frames.length !== 1) throw error('invalid-frame');
          const wireBytes = this.used;
          this.used = 0; this.length = 0; this.prefix = 0; this.expected = undefined;
          consume(frame, wireBytes);
        }
      }
    } catch (cause) { this.failed = true; throw cause; }
  }
  finish(): void { this.failed = true; if (this.used) throw error('truncated-frame'); }
}
interface Pending {
  id: number; operation: FlipperReadOperation; pairs: FlipperPair[];
  bytes: number; frames: number; terminal: boolean; controller: AbortController;
  resolve: (result: FlipperVersion | FlipperPair[]) => void; reject: (reason: Error) => void;
}

/** Single-flight, bounded, fail-closed session. Exact schema version 0.25 is the initial policy. */
export class FlipperReadOnlyClient {
  private transport: FlipperRpcTransport;
  private decoder = new FlipperFrameDecoder();
  private unsubscribe: (() => void) | undefined;
  private pending: Pending | undefined;
  private nextId = 1;
  private busy = false;
  private closed: Error | undefined;
  private version: FlipperVersion | undefined;
  private timeoutMs: number;
  constructor(transport: FlipperRpcTransport, options: { timeoutMs?: number } = {}) {
    this.transport = transport;
    this.timeoutMs = options.timeoutMs ?? FLIPPER_RPC_BOUNDS.timeoutMs;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 30000) throw error('invalid-timeout');
    try {
      const unsubscribe = transport.subscribe(bytes => this.receive(bytes), cause => this.fail(cause));
      if (this.closed) unsubscribe(); else this.unsubscribe = unsubscribe;
    } catch (cause) {
      this.fail(cause instanceof Error ? cause : error('subscribe-failed'));
      throw this.closed;
    }
  }
  private fail(cause: Error): void {
    if (this.closed) return;
    this.closed = cause;
    const pending = this.pending; this.pending = undefined;
    pending?.controller.abort();
    pending?.reject(cause);
    try { this.unsubscribe?.(); } catch { /* The session remains closed even if driver cleanup fails. */ }
    this.unsubscribe = undefined;
    try { this.transport.close(); } catch { /* Never replace the original terminal failure. */ }
  }
  close(): void { this.fail(error('closed')); }
  private receive(bytes: Uint8Array): void {
    if (this.closed) return;
    try {
      this.decoder.push(bytes, (frame, wireBytes) => {
        const pending = this.pending;
        if (!pending) throw error('unsolicited-response');
        if (pending.terminal) throw error('duplicate-terminal-response');
        pending.bytes += wireBytes; pending.frames++;
        if (pending.bytes > FLIPPER_RPC_BOUNDS.responseBytes || pending.frames > FLIPPER_RPC_BOUNDS.responseFrames) throw error('response-budget');
        // ERROR_DECODE explicitly makes command_id unreliable in the upstream schema.
        if (frame.status.effective === 2) throw error('device-decode-error');
        if (frame.commandId.effective !== pending.id) throw error('unexpected-command-id');
        if (frame.status.effective !== 0) throw error(`device-status-${frame.status.effective}`);
        if (frame.content.kind !== pending.operation) throw error('unexpected-response-kind');
        if (pending.operation === 'version') {
          if (frame.hasNext.effective) throw error('continued-version');
          pending.resolve({ major: frame.content.major!.effective, minor: frame.content.minor!.effective });
        } else {
          const key = frame.content.key!.effective;
          if (!key) throw error('empty-key');
          if (pending.pairs.length >= FLIPPER_RPC_BOUNDS.pairs) throw error('pair-budget');
          // Preserve repeated keys as pairs; never merge untrusted keys onto an object.
          pending.pairs.push({ key, value: frame.content.value!.effective });
          if (!frame.hasNext.effective) pending.resolve(pending.pairs);
        }
      });
    } catch (cause) { this.fail(cause instanceof Error ? cause : error('invalid-response')); }
  }
  private async request(operation: FlipperReadOperation, signal?: AbortSignal): Promise<FlipperVersion | FlipperPair[]> {
    if (this.closed) throw this.closed;
    if (signal?.aborted) throw error('aborted');
    if (this.nextId > 0xffffffff) { this.fail(error('command-id-exhausted')); throw this.closed; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let removeInterrupt: (() => void) | undefined;
    const onAbort = () => this.fail(error('aborted'));
    try {
      const response = new Promise<FlipperVersion | FlipperPair[]>((resolve, reject) => {
        const pending: Pending = {
          id: this.nextId++, operation, pairs: [], bytes: 0, frames: 0, terminal: false, controller,
          // Keep pending until write acknowledgement and this response both complete.
          resolve: result => {
            pending.terminal = true; resolve(result);
          }, reject,
        };
        this.pending = pending;
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => this.fail(error('timeout')), this.timeoutMs);
      // Promise.all attaches handlers to both, including when write fails before response.
      const interrupted = new Promise<never>((_resolve, reject) => {
        const rejectInterrupted = () => reject(this.closed ?? error('aborted'));
        controller.signal.addEventListener('abort', rejectInterrupted, { once: true });
        removeInterrupt = () => controller.signal.removeEventListener('abort', rejectInterrupted);
      });
      const [, result] = await Promise.race([interrupted, Promise.all([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw this.closed ?? error('aborted');
          return this.transport.write(encodeFlipperReadRequest(operation, this.pending!.id), controller.signal);
        }).catch(cause => { this.fail(cause instanceof Error ? cause : error('write-failed')); throw cause; }),
        response,
      ])]);
      if (this.closed) throw this.closed;
      if (this.decoder.hasPartialFrame) { this.fail(error('trailing-partial-frame')); throw this.closed; }
      return result;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      removeInterrupt?.();
      signal?.removeEventListener('abort', onAbort);
      this.pending = undefined;
    }
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.closed) throw this.closed;
    if (this.busy) throw error('busy');
    this.busy = true;
    try { return await work(); } finally { this.busy = false; }
  }
  private async negotiate(signal?: AbortSignal): Promise<FlipperVersion> {
    if (signal?.aborted) throw error('aborted');
    if (!this.version) {
      const version = await this.request('version', signal) as FlipperVersion;
      if (version.major !== 0 || version.minor !== 25) { this.fail(error('unsupported-version')); throw this.closed; }
      this.version = version;
    }
    return { ...this.version };
  }
  readVersion(signal?: AbortSignal): Promise<FlipperVersion> {
    return this.exclusive(() => this.negotiate(signal));
  }
  readIdentity(signal?: AbortSignal): Promise<FlipperPair[]> {
    return this.exclusive(async () => { await this.negotiate(signal); return await this.request('identity', signal) as FlipperPair[]; });
  }
  readPower(signal?: AbortSignal): Promise<FlipperPair[]> {
    return this.exclusive(async () => { await this.negotiate(signal); return await this.request('power', signal) as FlipperPair[]; });
  }
  readSnapshot(signal?: AbortSignal): Promise<{ version: FlipperVersion; identity: FlipperPair[]; power: FlipperPair[] }> {
    return this.exclusive(async () => ({
      version: await this.negotiate(signal),
      identity: await this.request('identity', signal) as FlipperPair[],
      power: await this.request('power', signal) as FlipperPair[],
    }));
  }
}
