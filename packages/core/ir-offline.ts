/** Independent, offline ordinary .ir subset. No transport, encoder or device APIs. */
import { decodeNec, type NecResult } from './analysis.ts';
export const IR_REFERENCE_PIN = '9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a';
export const IR_LIMITS = Object.freeze({ bytes: 262144, records: 128, name: 128, line: 16384, timings: 1024, totalTimings: 8192, output: 1048576 });
export interface IrContext { provenance: 'synthetic-fixture' | 'recorded-import'; sourceLabel: string }
interface RecordBase { ordinal: number; name: string; startLine: number; endLine: number; repeats: 'not-represented' }
export type IrRecord = RecordBase & (
  { type: 'parsed'; protocol: 'NEC'; addressBytes: string; commandBytes: string; address: number; command: number; interpretation: 'declared-standard-NEC-fields' } |
  { type: 'raw'; timingConvention: 'assumed-first-mark-alternating'; carrierMetadata: 'declared-not-measured'; frequencyHz: number; dutyCycle: number; dutyCycleDecimal: string; dutyCycleProjection: 'binary64-rounded'; durationsUs: readonly number[]; recognition: { status: 'recognized'; decoded: NecResult } | { status: 'not-recognized' } });
export interface IrInspection {
  schemaVersion: 1; kind: 'offline-ir-file'; referencePin: string; context: Readonly<IrContext>;
  originalSource: string; byteCount: number; sha256: string; records: readonly IrRecord[];
  verification: { physicalCaptureVerified: false; authenticityVerified: false; deviceCompatibilityVerified: false; provenanceIsCallerClaim: true };
}
export class IrInspectionError extends Error {
  readonly code: string;
  readonly line: number;
  constructor(code: string, line: number) { super(`${code} at line ${line}`); this.code = code; this.line = line; this.name = 'IrInspectionError'; }
}
const fail = (code: string, line = 0): never => { throw new IrInspectionError(code, line); };
const proto = Object.getPrototypeOf(Uint8Array.prototype);
const get = (name: PropertyKey) => Object.getOwnPropertyDescriptor(proto, name)!.get!;
const lengthOf = get('byteLength'), offsetOf = get('byteOffset'), bufferOf = get('buffer'), kindOf = get(Symbol.toStringTag);
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
function snapshot(input: Uint8Array): Uint8Array<ArrayBuffer> {
  try {
    if (kindOf.call(input) !== 'Uint8Array') return fail('invalid-bytes');
    const length = lengthOf.call(input), offset = offsetOf.call(input), buffer = bufferOf.call(input);
    bufferLength.call(buffer); // Reject shared backing storage.
    if (resizable?.call(buffer)) return fail('invalid-bytes');
    if (length > IR_LIMITS.bytes) return fail('byte-limit');
    const copy = new Uint8Array(length);
    copy.set(new Uint8Array(buffer, offset, length));
    return copy;
  } catch (e) { if (e instanceof IrInspectionError) throw e; return fail('invalid-bytes'); }
}
function contextSnapshot(context: IrContext): Readonly<IrContext> {
  if (!context || typeof context !== 'object' || Object.getPrototypeOf(context) !== Object.prototype) return fail('invalid-context');
  const keys = Reflect.ownKeys(context);
  if (keys.length !== 2 || !keys.includes('provenance') || !keys.includes('sourceLabel')) return fail('invalid-context');
  const p = Object.getOwnPropertyDescriptor(context, 'provenance'), s = Object.getOwnPropertyDescriptor(context, 'sourceLabel');
  if (!p || !s || !Object.hasOwn(p, 'value') || !Object.hasOwn(s, 'value')) return fail('invalid-context');
  if (p.value !== 'synthetic-fixture' && p.value !== 'recorded-import') return fail('invalid-context');
  if (typeof s.value !== 'string' || !/^[\x20-\x7e]{1,128}$/.test(s.value)) return fail('invalid-context');
  return Object.freeze({ provenance: p.value, sourceLabel: s.value });
}
function uint(value: string, line: number): number {
  if (!/^[0-9]{1,10}$/.test(value) || Number(value) > 0xffffffff) return fail('invalid-uint32', line);
  return Number(value);
}
/** Snapshots bytes/context synchronously before hashing. Exact ASCII source is immutable;
 * rejected files produce no partial report. Names and source labels are inert caller data. */
/** Trusted local adapter only: hash this exact ASCII string as UTF-8 bytes without
 * normalization. ASCII guarantees byte identity. It receives no private mutable bytes.
 * Shape validation does not prove a supplied adapter computed SHA-256 honestly. */
export type IrStringHasher = (exactAscii: string) => Promise<string>;
export async function inspectIrFile(input: Uint8Array, context: IrContext, localHash?: IrStringHasher): Promise<IrInspection> {
  const bytes = snapshot(input), capturedContext = contextSnapshot(context);
  let source = '';
  for (const b of bytes) {
    if (b !== 10 && b !== 13 && (b < 32 || b > 126)) return fail('non-ascii-or-control');
    source += String.fromCharCode(b);
  }
  if (/\r(?!\n)/.test(source)) return fail('bare-cr');
  const rows: { key: string; value: string; line: number }[] = [];
  for (const [i, line] of source.split(/\r?\n/).entries()) {
    if (line.length > IR_LIMITS.line) return fail('line-limit', i + 1);
    if (line === '' || line.startsWith('#')) continue;
    const at = line.indexOf(': ');
    if (at < 1) return fail('key-value-separator', i + 1);
    rows.push({ key: line.slice(0, at), value: line.slice(at + 2), line: i + 1 });
  }
  let at = 0;
  const take = (key: string) => {
    const row = rows[at++];
    if (!row || row.key !== key) return fail(`expected-${key}`, row?.line ?? source.split('\n').length);
    return row;
  };
  if (take('Filetype').value !== 'IR signals file' || take('Version').value !== '1') return fail('unsupported-header');
  const records: IrRecord[] = [];
  let total = 0;
  while (at < rows.length) {
    if (records.length >= IR_LIMITS.records) return fail('record-limit', rows[at]!.line);
    const name = take('name');
    if (!name.value.length || name.value.length > IR_LIMITS.name) return fail('name-limit', name.line);
    const type = take('type');
    const base = { ordinal: records.length + 1, name: name.value, startLine: name.line, repeats: 'not-represented' as const };
    if (type.value === 'parsed') {
      const protocol = take('protocol');
      if (protocol.value !== 'NEC') return fail('unsupported-protocol', protocol.line);
      const a = take('address'), c = take('command');
      for (const field of [a, c]) if (!/^[0-9a-fA-F]{2} 00 00 00$/.test(field.value)) return fail('unsupported-NEC-field', field.line);
      records.push(Object.freeze({ ...base, endLine: c.line, type: 'parsed', protocol: 'NEC', addressBytes: a.value, commandBytes: c.value,
        address: parseInt(a.value.slice(0, 2), 16), command: parseInt(c.value.slice(0, 2), 16), interpretation: 'declared-standard-NEC-fields' }));
    } else if (type.value === 'raw') {
      const f = take('frequency'), d = take('duty_cycle'), data = take('data');
      const frequencyHz = uint(f.value, f.line);
      if (frequencyHz < 10000 || frequencyHz > 1000000) return fail('frequency-range', f.line);
      if (!/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/.test(d.value)) return fail('invalid-duty-cycle', d.line);
      // Check the exact decimal upper bound before binary64 rounding can hide >1.
      const [whole = '', fraction = ''] = d.value.split('.');
      const significantWhole = whole.replace(/^0+/, '');
      if (significantWhole !== '' && (significantWhole !== '1' || /[1-9]/.test(fraction))) return fail('invalid-duty-cycle', d.line);
      // Tiny positive decimals which underflow to zero are outside this subset.
      const dutyCycle = Number(d.value);
      if (!Number.isFinite(dutyCycle) || dutyCycle <= 0 || dutyCycle > 1) return fail('invalid-duty-cycle', d.line);
      const tokens = data.value.split(' ');
      if (tokens.length > IR_LIMITS.timings || (total += tokens.length) > IR_LIMITS.totalTimings) return fail('timing-limit', data.line);
      const durationsUs = tokens.map(token => { const n = uint(token, data.line); if (!n) return fail('zero-duration', data.line); return n; });
      let recognition: Extract<IrRecord, { type: 'raw' }>['recognition'] = { status: 'not-recognized' };
      try { recognition = { status: 'recognized', decoded: Object.freeze(decodeNec(durationsUs)) }; } catch { /* Valid file, unsupported waveform. */ }
      records.push(Object.freeze({ ...base, endLine: data.line, type: 'raw', timingConvention: 'assumed-first-mark-alternating', carrierMetadata: 'declared-not-measured', frequencyHz, dutyCycle, dutyCycleDecimal: d.value, dutyCycleProjection: 'binary64-rounded', durationsUs: Object.freeze(durationsUs), recognition: Object.freeze(recognition) }));
    } else return fail('unsupported-type', type.line);
  }
  if (!records.length) return fail('empty-remote');
  const sha256 = localHash === undefined
    ? Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
    : await localHash(source);
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return fail('invalid-sha256');
  return Object.freeze({ schemaVersion: 1, kind: 'offline-ir-file', referencePin: IR_REFERENCE_PIN, context: capturedContext,
    originalSource: source, byteCount: bytes.length, sha256, records: Object.freeze(records),
    verification: Object.freeze({ physicalCaptureVerified: false, authenticityVerified: false, deviceCompatibilityVerified: false, provenanceIsCallerClaim: true }) });
}
