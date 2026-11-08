/** Original offline parser for a bounded IRremoteESP8266 source-code excerpt.
 * Format reference only: no upstream implementation, firmware or transport is linked. */
import { decodeNec, type NecResult } from './analysis.ts';
import type { IrContext, IrStringHasher } from './ir-offline.ts';
export const IR_RECEIVER_REFERENCE_PIN = '1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f';
export const IR_RECEIVER_LIMITS = Object.freeze({ bytes: 262144, line: 16384, records: 32, timings: 1024, totalTimings: 8192, durationUs: 65535 });
export class IrReceiverImportError extends Error {
  readonly code: string; readonly line: number;
  constructor(code: string, line = 0) { super(`${code} at line ${line}`); this.name = 'IrReceiverImportError'; this.code = code; this.line = line; }
}
const fail = (code: string, line = 0): never => { throw new IrReceiverImportError(code, line); };
export interface IrReceiverRecord {
  readonly ordinal: number; readonly startLine: number; readonly endLine: number;
  readonly declaredCount: number; readonly durationsUs: readonly number[];
  readonly timingConvention: 'source-format-first-mark-alternating';
  readonly carrier: { readonly frequencyHz: null; readonly dutyCycle: null; readonly status: 'unknown-not-in-source' };
  readonly captureCompleteness: 'unverified-excerpt-may-omit-overflow-warning';
  readonly repeats: 'not-inferred';
  /** Original tokens only; these are upstream/caller claims, never trusted decodes. */
  readonly declaredFields: Readonly<Partial<Record<'address' | 'command' | 'data', string>>>;
  readonly recognition: { readonly status: 'recognized'; readonly decoded: Readonly<NecResult> } | { readonly status: 'not-recognized' };
}
export interface IrReceiverInspection {
  readonly schemaVersion: 1; readonly kind: 'offline-ir-receiver-excerpt'; readonly referencePin: string;
  readonly context: Readonly<IrContext>; readonly originalSource: string; readonly byteCount: number; readonly sha256: string;
  readonly records: readonly IrReceiverRecord[];
  readonly verification: { readonly physicalCaptureVerified: false; readonly authenticityVerified: false; readonly deviceCompatibilityVerified: false; readonly provenanceIsCallerClaim: true };
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
/** Exact accepted ASCII draft is immutable before await. No C/C++ is executed.
 * localHash is a trusted local adapter; digest shape cannot prove honest hashing. */
export async function inspectIrReceiverExcerpt(source: string, context: IrContext, localHash?: IrStringHasher): Promise<IrReceiverInspection> {
  if (typeof source !== 'string') return fail('invalid-source');
  if (source.length > IR_RECEIVER_LIMITS.bytes) return fail('byte-limit');
  if (/[^\x20-\x7e\t\r\n]/.test(source)) return fail('non-ascii-or-control');
  if (/\r(?!\n)/.test(source)) return fail('bare-cr');
  const capturedContext = contextSnapshot(context);
  const rows = source.split(/\r?\n/).map((text, i) => {
    if (text.length > IR_RECEIVER_LIMITS.line) return fail('line-limit', i + 1);
    return { line: i + 1, code: text.split('//', 1)[0]!.trim() };
  });
  const records: IrReceiverRecord[] = [];
  let total = 0, at = 0;
  while (at < rows.length) {
    const row = rows[at++]!;
    if (!row.code) continue;
    if (records.length >= IR_RECEIVER_LIMITS.records) return fail('record-limit', row.line);
    const start = /^uint16_t[ \t]+rawData\[([1-9][0-9]{0,3})\][ \t]*=[ \t]*\{(.*)$/.exec(row.code);
    if (!start) return fail('expected-rawData-excerpt', row.line);
    const declaredCount = Number(start[1]);
    if (declaredCount < 1 || declaredCount > IR_RECEIVER_LIMITS.timings || total + declaredCount > IR_RECEIVER_LIMITS.totalTimings) return fail('timing-limit', row.line);
    let body = start[2]!, endLine = row.line;
    while (!body.includes('}')) {
      if (at >= rows.length) return fail('unterminated-rawData', row.line);
      const next = rows[at++]!; body += '\n' + next.code; endLine = next.line;
      // Bound accumulation even for whitespace/comment-heavy input before splitting.
      if (body.length > IR_RECEIVER_LIMITS.bytes) return fail('byte-limit', row.line);
    }
    const array = /^([0-9, \t\n]*)\}[ \t]*;$/.exec(body);
    if (!array) return fail('unsupported-array-syntax', endLine);
    const tokens = array[1]!.split(',').map(s => s.trim());
    if (tokens.length !== declaredCount) return fail('declared-count-mismatch', row.line);
    const durationsUs = tokens.map(token => {
      // Decimal integer tokens only. Leading zeros are rejected to avoid C octal ambiguity.
      if (!/^(?:0|[1-9][0-9]{0,4})$/.test(token)) return fail('invalid-duration', row.line);
      const value = Number(token);
      if (!value) return fail('unsupported-zero-or-split-duration', row.line);
      if (value > IR_RECEIVER_LIMITS.durationUs) return fail('duration-range', row.line);
      return value;
    });
    total += durationsUs.length;
    const declaredFields: Partial<Record<'address' | 'command' | 'data', string>> = {};
    while (at < rows.length) {
      const next = rows[at]!;
      if (!next.code) { at++; continue; }
      if (/^uint16_t[ \t]+rawData\[/.test(next.code)) break;
      const scalar = /^(uint32_t|uint64_t)[ \t]+(address|command|data)[ \t]*=[ \t]*(0x[0-9a-fA-F]{1,16})[ \t]*;$/.exec(next.code);
      if (!scalar) return fail('unsupported-excerpt-line', next.line);
      const field = scalar[2] as 'address' | 'command' | 'data';
      if (scalar[1] !== (field === 'data' ? 'uint64_t' : 'uint32_t') || (field !== 'data' && scalar[3]!.length > 10)) return fail('invalid-declared-field', next.line);
      if (Object.hasOwn(declaredFields, field)) return fail('duplicate-declared-field', next.line);
      declaredFields[field] = scalar[3]!; endLine = next.line; at++;
    }
    let recognition: IrReceiverRecord['recognition'] = Object.freeze({ status: 'not-recognized' });
    try { recognition = Object.freeze({ status: 'recognized', decoded: Object.freeze(decodeNec(durationsUs)) }); } catch { /* Unsupported is not physically invalid. */ }
    records.push(Object.freeze({ ordinal: records.length + 1, startLine: row.line, endLine, declaredCount,
      durationsUs: Object.freeze(durationsUs), timingConvention: 'source-format-first-mark-alternating',
      carrier: Object.freeze({ frequencyHz: null, dutyCycle: null, status: 'unknown-not-in-source' }),
      captureCompleteness: 'unverified-excerpt-may-omit-overflow-warning', repeats: 'not-inferred',
      declaredFields: Object.freeze(declaredFields), recognition }));
  }
  if (!records.length) return fail('empty-excerpt');
  const sha256 = localHash === undefined
    ? Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(source, c => c.charCodeAt(0)))), b => b.toString(16).padStart(2, '0')).join('')
    : await localHash(source);
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return fail('invalid-sha256');
  return Object.freeze({ schemaVersion: 1, kind: 'offline-ir-receiver-excerpt', referencePin: IR_RECEIVER_REFERENCE_PIN,
    context: capturedContext, originalSource: source, byteCount: source.length, sha256, records: Object.freeze(records),
    verification: Object.freeze({ physicalCaptureVerified: false, authenticityVerified: false, deviceCompatibilityVerified: false, provenanceIsCallerClaim: true }) });
}
