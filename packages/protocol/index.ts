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

export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc;
}

export function encode(frame: Frame): Uint8Array {
  if (![1, 2, 3].includes(frame.kind) || !Number.isInteger(frame.opcode) ||
      frame.opcode < 0 || frame.opcode > 255 || !Number.isInteger(frame.id) ||
      frame.id < 1 || frame.id > 65535 || !(frame.payload instanceof Uint8Array) ||
      frame.payload.length > MAX_PAYLOAD) {
    throw new Error('Invalid AXP frame');
  }
  const result = new Uint8Array(12 + frame.payload.length);
  const view = new DataView(result.buffer);
  result.set([0x41, 0x58, VERSION, frame.kind, frame.opcode, 0]);
  view.setUint16(6, frame.id, true);
  view.setUint16(8, frame.payload.length, true);
  result.set(frame.payload, HEADER_SIZE);
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
    for (const byte of chunk) {
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
      }
    }
  }
}

export const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);
export const text = (value: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(value);
