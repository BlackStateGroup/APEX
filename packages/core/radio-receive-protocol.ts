/** Fixed-profile, receive-only ABI. No modem configuration or transmit commands. */
export const RADIO_RECEIVE_OPERATIONS = Object.freeze({
  'radio.rx.start': 0x60,
  'radio.rx.poll': 0x61,
  'radio.rx.stop': 0x62,
} as const);
export type RadioReceiveState = 0 | 1 | 2 | 3 | 4 | 5;
export interface RadioReceivePacket {
  readonly elapsedMs: number;
  readonly rssiTenthsDbm: number;
  readonly lqi: number;
  readonly payload: readonly number[];
}
export interface RadioReceiveStatus {
  readonly version: 1;
  readonly state: RadioReceiveState;
  readonly profile: 1;
  readonly captureId: number;
  readonly observed: number;
  readonly accepted: number;
  readonly dropped: number;
  readonly rejected: number;
  readonly queued: number;
  readonly elapsedMs: number;
  readonly error: number;
  readonly packet: RadioReceivePacket | null;
}
function integer(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
export function encodeRadioReceiveStart(durationMs: number, eventLimit: number): Uint8Array {
  if (!integer(durationMs, 50, 30000) || !integer(eventLimit, 1, 64)) throw new Error('Invalid receive capture bounds');
  return new Uint8Array([1, 1, durationMs & 255, durationMs >>> 8, eventLimit, 0]);
}
export function encodeRadioReceiveCaptureId(id: number): Uint8Array {
  if (!integer(id, 1, 0xffffffff)) throw new Error('Invalid receive capture ID');
  return new Uint8Array([id & 255, (id >>> 8) & 255, (id >>> 16) & 255, id >>> 24]);
}
const prototype = Object.getPrototypeOf(Uint8Array.prototype);
const tag = Object.getOwnPropertyDescriptor(prototype, Symbol.toStringTag)!.get!;
const size = Object.getOwnPropertyDescriptor(prototype, 'byteLength')!.get!;
const buffer = Object.getOwnPropertyDescriptor(prototype, 'buffer')!.get!;
const offset = Object.getOwnPropertyDescriptor(prototype, 'byteOffset')!.get!;
const bufferSize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
function snapshot(input: Uint8Array): Uint8Array {
  try {
    if (tag.call(input) !== 'Uint8Array') throw 0;
    const length: number = size.call(input);
    if (length < 24 || length > 91) throw 0;
    const storage: ArrayBuffer = buffer.call(input);
    bufferSize.call(storage); // Reject SharedArrayBuffer before reading any wire bytes.
    if (resizable?.call(storage)) throw 0;
    return new Uint8Array(new Uint8Array(storage, offset.call(input), length));
  } catch { throw new Error('Invalid receive status bytes'); }
}
export function parseRadioReceiveStatus(input: Uint8Array): RadioReceiveStatus {
  const b = snapshot(input);
  const u16 = (i: number) => b[i]! + b[i + 1]! * 256;
  const u32 = (i: number) => u16(i) + u16(i + 2) * 65536;
  const i16 = (i: number) => (u16(i) << 16) >> 16;
  const state = b[1]!;
  const present = b[3] === 1;
  const captureId = u32(4), observed = u16(8), accepted = u16(10);
  const dropped = u16(12), rejected = u16(14), queued = b[16]!;
  const length = b[17]!, elapsedMs = u32(18);
  if (b[0] !== 1 || b[2] !== 1 || state > 5 || b[3]! > 1 ||
      (present ? length < 1 || length > 60 || b.length !== 31 + length : length !== 0 || b.length !== 24) ||
      elapsedMs > 30000 || observed > 64 || accepted + rejected !== observed || dropped > accepted ||
      queued > 8 || queued + Number(present) > 8 || queued + Number(present) > accepted - dropped ||
      (state === 0 && captureId !== 0) ||
      (captureId === 0 && (observed !== 0 || queued !== 0 || present || state === 1 || state === 3 || state === 4)) ||
      (present && u32(24) > 30000)) {
    throw new Error('Invalid receive status');
  }
  // Clock rollback may yield fault status with elapsed time below an older queued
  // packet's timestamp. Cold initialization expiry legitimately has no events.
  const packet = present ? Object.freeze({
    elapsedMs: u32(24), rssiTenthsDbm: i16(28), lqi: b[30]!,
    payload: Object.freeze(Array.from(b.subarray(31))),
  }) : null;
  return Object.freeze({ version: 1, state: state as RadioReceiveState, profile: 1,
    captureId, observed, accepted, dropped, rejected, queued, elapsedMs, error: i16(22), packet });
}
