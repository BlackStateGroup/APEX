export const VERSION = 1;
export const MAX_PAYLOAD = 512;
export const HEADER_SIZE = 10;
export const MAX_FRAME = HEADER_SIZE + MAX_PAYLOAD + 2;
export const Kind = { Request: 1, Response: 2, Error: 3 } as const;
export const Opcode = { Info: 1, Capabilities: 2, Ping: 3 } as const;

export interface Frame {
  kind: 1 | 2 | 3;
  opcode: number;
  id: number;
  payload: Uint8Array;
}

// Read internal view slots, not caller properties, iterators or subclass methods.
// These are normal runtime intrinsics, not a sandbox for modified global built-ins.
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const viewTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
const viewSize = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const viewBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
const viewOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;
const bufferSize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const bufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;

function byteView(input: Uint8Array, max = Infinity): Uint8Array {
  if (viewTag.call(input) !== 'Uint8Array') throw new Error('Invalid AXP byte view');
  const size: number = viewSize.call(input);
  const buffer: ArrayBuffer = viewBuffer.call(input);
  const offset: number = viewOffset.call(input);
  // Reject shared storage (including shadowed .buffer) and resizable storage.
  bufferSize.call(buffer);
  if (bufferResizable?.call(buffer) || size > max) throw new Error('Invalid AXP byte storage or size');
  // Constructing even a zero-length view rejects detached buffers. This aliases
  // fixed storage without allocating a chunk-sized copy or invoking input hooks.
  return new Uint8Array(buffer, offset, size);
}

export function crc16(bytes: Uint8Array): number {
  const view = byteView(bytes);
  let crc = 0xffff;
  for (let i = 0; i < view.length; i++) {
    const byte = view[i]!;
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc;
}

export function encode(frame: Frame): Uint8Array {
  // Getters may run here, but each field is captured once. Payload validation
  // happens after all metadata reads so their side effects cannot invalidate it.
  const { kind, opcode, id, payload } = frame;
  if (![1, 2, 3].includes(kind) || !Number.isInteger(opcode) ||
      opcode < 0 || opcode > 255 || !Number.isInteger(id) || id < 1 || id > 65535) {
    throw new Error('Invalid AXP frame');
  }
  const bytes = byteView(payload, MAX_PAYLOAD);
  const result = new Uint8Array(12 + bytes.length);
  const view = new DataView(result.buffer);
  result.set([0x41, 0x58, VERSION, kind, opcode, 0]);
  view.setUint16(6, id, true);
  view.setUint16(8, bytes.length, true);
  result.set(bytes, HEADER_SIZE);
  view.setUint16(result.length - 2, crc16(result.subarray(0, -2)), true);
  return result;
}

/** Fixed retained buffer; no allocation proportional to the input chunk. */
export class FrameDecoder {
  private buffer = new Uint8Array(MAX_FRAME);
  private used = 0;
  discarded = 0;
  private receive: (frame: Frame) => void;

  constructor(receive: (frame: Frame) => void) { this.receive = receive; }
  get bufferedBytes(): number { return this.used; }
  reset(): void { this.used = 0; }

  private discard(count: number, corrupt = false): void {
    this.buffer.copyWithin(0, count, this.used);
    this.used -= count;
    if (corrupt) this.discarded += count;
  }

  push(chunk: Uint8Array): void {
    const bytes = byteView(chunk);
    const chunkLength = bytes.length;
    for (let i = 0; i < chunkLength; i++) {
      const byte = bytes[i]!;
      if (this.used === MAX_FRAME) this.discard(1, true);
      this.buffer[this.used++] = byte;
      while (this.used >= 2) {
        if (this.buffer[0] !== 0x41 || this.buffer[1] !== 0x58) {
          this.discard(1, true); continue;
        }
        if (this.used < HEADER_SIZE) break;
        const length = this.buffer[8]! | this.buffer[9]! << 8;
        const id = this.buffer[6]! | this.buffer[7]! << 8;
        const kind = this.buffer[3]!;
        if (this.buffer[2] !== VERSION || ![1, 2, 3].includes(kind) ||
            this.buffer[5] !== 0 || id === 0 || length > MAX_PAYLOAD) {
          this.discard(1, true); continue;
        }
        const size = length + 12;
        if (this.used < size) break;
        const expected = this.buffer[size - 2]! | this.buffer[size - 1]! << 8;
        if (crc16(this.buffer.subarray(0, size - 2)) !== expected) {
          this.discard(1, true); continue;
        }
        const frame: Frame = {
          kind: kind as Frame['kind'], opcode: this.buffer[4]!, id,
          payload: this.buffer.slice(HEADER_SIZE, HEADER_SIZE + length),
        };
        this.discard(size);
        this.receive(frame);
        // Callbacks can mutate unread bytes, reset or reenter the decoder. They
        // can also detach this chunk: reject before resuming, even at its end.
        byteView(bytes);
      }
    }
  }
}

export const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);
export const text = (value: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(value);
