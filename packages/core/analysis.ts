export interface NecResult { protocol: 'NEC'; address: number; command: number; evidence: 'offline'; }

/** Standard NEC only, 67 positive durations in microseconds, starting with a mark. */
export function decodeNec(pulses: readonly number[]): NecResult {
  if (pulses.length !== 67 || pulses.some(x => !Number.isFinite(x) || x <= 0 || x > 20000)) {
    throw new Error('Expected a complete 67-duration standard NEC frame');
  }
  const near = (value: number, target: number) => Math.abs(value - target) <= target * 0.25;
  if (!near(pulses[0]!, 9000) || !near(pulses[1]!, 4500) || !near(pulses[66]!, 562.5)) {
    throw new Error('Invalid NEC leader or trailer');
  }
  const bytes = new Uint8Array(4);
  for (let bit = 0; bit < 32; bit++) {
    if (!near(pulses[2 + bit * 2]!, 562.5)) throw new Error('Invalid NEC mark');
    const space = pulses[3 + bit * 2]!;
    if (near(space, 1687.5)) bytes[bit >> 3]! |= 1 << (bit & 7);
    else if (!near(space, 562.5)) throw new Error('Invalid NEC space');
  }
  if ((bytes[0]! ^ bytes[1]!) !== 255 || (bytes[2]! ^ bytes[3]!) !== 255) {
    throw new Error('NEC inverse-byte check failed; extended NEC is not supported');
  }
  return { protocol: 'NEC', address: bytes[0]!, command: bytes[2]!, evidence: 'offline' };
}

export function necFixture(): number[] {
  const pulses = [9000, 4500];
  for (const byte of [0x10, 0xef, 0x34, 0xcb]) {
    for (let bit = 0; bit < 8; bit++) pulses.push(562.5, (byte >> bit & 1) ? 1687.5 : 562.5);
  }
  return [...pulses, 562.5];
}

export interface CanFrame { timestamp: string; channel: string; id: number; extended: boolean; data: number[]; }
/** Compact candump classic data frames only. No FD, RTR, error or live-bus operations. */
export function parseCanLog(input: string): CanFrame[] {
  if (input.length > 262144) throw new Error('CAN log exceeds 256 KiB character limit');
  const lines = input.split(/\r?\n/).filter(x => x.trim().length > 0);
  if (lines.length > 2000) throw new Error('CAN log exceeds 2000 frames');
  return lines.map((line, index) => {
    const match = /^\((\d{1,12}\.\d{1,9})\) ([\w-]{1,16}) ([\da-fA-F]{3}|[\da-fA-F]{8})#([\da-fA-F]{0,16})$/.exec(line.trim());
    if (!match || match[4]!.length % 2) throw new Error(`Unsupported CAN frame on line ${index + 1}`);
    const id = Number.parseInt(match[3]!, 16);
    const extended = match[3]!.length === 8;
    if (id > (extended ? 0x1fffffff : 0x7ff)) throw new Error(`CAN identifier out of range on line ${index + 1}`);
    return {
      timestamp: match[1]!, channel: match[2]!, id, extended,
      data: Array.from({ length: match[4]!.length / 2 }, (_, i) => Number.parseInt(match[4]!.slice(i * 2, i * 2 + 2), 16)),
    };
  });
}

export const CAN_FIXTURE = '(1.000000) vcan0 123#01020304\n(1.010000) vcan0 1ABCDEFF#1020';
