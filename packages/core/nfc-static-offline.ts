/** Deliberately narrow offline static profile, not generic Type 2 support.
 * Independently implemented vendor facts and product policy: docs/NFC_STATIC_OFFLINE.md. */
import { decodeNdefMessage } from './ndef-offline.ts';
import type { NdefDecode, NdefValue } from './ndef-offline.ts';
export const NFC_STATIC_SOURCE_LIMIT = 64;
export const NFC_STATIC_OUTPUT_LIMIT = 65536;
export interface NfcStaticContext {
  mode: 'static-data-48' | 'static-structure-64';
  provenance: 'synthetic-fixture' | 'recorded-import';
  label: string;
}
export interface StaticSpan {
  readonly offset: number; readonly endOffset: number;
  readonly sourceOffset: number; readonly sourceEndOffset: number;
}
export interface StaticTlv extends StaticSpan {
  readonly kind: 'null' | 'terminator' | 'ndef' | 'proprietary';
  readonly value: StaticSpan | null;
}
export interface NfcStaticReport {
  readonly profile: 'apex-static-48-v1';
  readonly source: Readonly<NfcStaticContext & { byteCount: number; sha256: string }>;
  readonly dataArea: StaticSpan;
  readonly tlvStatus: 'supported' | 'unsupported' | 'malformed';
  readonly diagnostic: Readonly<{code: string; sourceOffset: number; offset: number | null}> | null;
  readonly elements: readonly StaticTlv[];
  readonly trailing: StaticSpan | null;
  readonly ndef: Readonly<{
    status: 'not-attempted' | 'missing' | 'ambiguous' | 'empty' | 'decoded';
    count: number; value: StaticSpan | null;
    decoder: Readonly<{status: NdefDecode['status']; issues: readonly Readonly<{offset: number; dataOffset: number; sourceOffset: number; code: string}>[];
      records: readonly Readonly<{offset: number; endOffset: number; dataOffset: number; dataEndOffset: number; sourceOffset: number; sourceEndOffset: number; value: Readonly<NdefValue>}>[]}> | null;
  }>;
  readonly disclosures: readonly string[];
}
const disclosures = Object.freeze([
  'Explicitly selected APEX static profile; no autodetection, chip identity, physical completeness or generic Type 2 conformance claim.',
  'Mode, provenance and label are caller claims, not verified ownership or capture history.',
  'SHA-256 covers all supplied bytes only, not capture authenticity, security, ownership or access. The injected hash adapter must be trusted; digest shape does not prove its honesty.',
  'First 12 structure bytes are uninterpreted; UID, lock contents, access state and credentials are not interpreted or displayed.',
  'Proprietary and post-terminator bytes remain opaque spans. Trailing bytes are not assumed padding.',
  'NDEF decoder status is separate from TLV acceptance. Text and URI values are inert, never navigated.',
  'No device operations, persistent storage, certification or licensing determination.',
]);
const originals = new WeakMap<NfcStaticReport, Uint8Array>();
function reject(reason: string): never { throw new Error(`NFC static input refused: ${reason}`); }
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const viewTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
const viewSize = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const viewBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
const viewOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;
const bufferSize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const bufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
function snapshot(input: Uint8Array, max: number, min: number): Uint8Array {
  if (!(input instanceof Uint8Array)) reject('byte input size/type');
  // Intrinsic accessors ignore subclass/own-property claims and reject proxy views.
  let size: number; let offset: number; let buffer: ArrayBuffer;
  try {
    if (viewTag.call(input) !== 'Uint8Array') reject('byte input size/type');
    size = viewSize.call(input); buffer = viewBuffer.call(input); offset = viewOffset.call(input);
    // This intrinsic also rejects shared storage, regardless of a shadowed buffer property.
    bufferSize.call(buffer);
    if (bufferResizable?.call(buffer)) reject('resizable input buffers');
  } catch { reject('unsupported input buffer/view'); }
  if (size < min || size > max) reject('byte input size/type');
  return new Uint8Array(new Uint8Array(buffer, offset, size));
}
function contextSnapshot(input: NfcStaticContext): NfcStaticContext {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) reject('context type');
  const copy: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !['mode', 'label', 'provenance'].includes(key)) reject('context field');
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !Object.hasOwn(d, 'value')) reject('context requires own data');
    copy[key] = d.value;
  }
  if (copy.mode !== 'static-data-48' && copy.mode !== 'static-structure-64') reject('explicit mode required');
  if (copy.provenance !== 'synthetic-fixture' && copy.provenance !== 'recorded-import') reject('provenance');
  if (typeof copy.label !== 'string' || copy.label.length < 1 || copy.label.length > 128 || /[\u0000-\u001f\u007f]/.test(copy.label)) reject('label');
  return freeze(copy as unknown as NfcStaticContext);
}
export async function inspectNfcStatic(input: Uint8Array, context: NfcStaticContext,
  hash: (bytes: Uint8Array) => Promise<string>): Promise<NfcStaticReport> {
  // Snapshot before inspecting context or calling any supplied asynchronous adapter.
  const bytes = snapshot(input, NFC_STATIC_SOURCE_LIMIT, 48);
  const ctx = contextSnapshot(context);
  const base = ctx.mode === 'static-data-48' ? 0 : 16;
  if (bytes.length !== base + 48) reject('mode requires exact byte count');
  const span = (start: number, end: number): StaticSpan => ({offset:start,endOffset:end,sourceOffset:base+start,sourceEndOffset:base+end});
  let tlvStatus: NfcStaticReport['tlvStatus'] = 'supported';
  let diagnostic: NfcStaticReport['diagnostic'] = null;
  const elements: StaticTlv[] = [];
  let trailing: StaticSpan | null = null;
  const stop = (status: 'unsupported' | 'malformed', code: string, offset: number | null, sourceOffset: number) => {
    tlvStatus = status; diagnostic = {code, offset, sourceOffset};
  };
  if (base && (bytes[12] !== 0xe1 || bytes[13] !== 0x10 || bytes[14] !== 6 || (bytes[15] !== 0 && bytes[15] !== 15))) {
    stop('unsupported', 'cc-outside-static-profile', null, 12);
  } else {
    let p = 0;
    while (p < 48) {
      const tag = bytes[base+p]!;
      if (tag === 0 || tag === 254) {
        elements.push({...span(p,p+1),kind:tag === 0 ? 'null' : 'terminator',value:null}); p++;
        if (tag === 254) { if (p < 48) trailing = span(p,48); break; }
        continue;
      }
      if (tag !== 3 && tag !== 253) { stop('unsupported','tag-outside-static-profile',p,base+p); break; }
      if (48-p < 2) { stop('malformed','truncated-length',p,base+p); break; }
      const length = bytes[base+p+1]!;
      if (length === 255) { stop('unsupported','extended-length-not-supported',p+1,base+p+1); break; }
      if (length > 48-(p+2)) { stop('malformed','truncated-value',p+1,base+p+1); break; }
      const end = p+2+length;
      elements.push({...span(p,end),kind:tag === 3 ? 'ndef' : 'proprietary',value:span(p+2,end)}); p = end;
    }
  }
  const candidates = elements.filter(e => e.kind === 'ndef');
  let ndef: NfcStaticReport['ndef'] = {status:'not-attempted',count:candidates.length,value:null,decoder:null};
  if (tlvStatus === 'supported') {
    if (candidates.length !== 1) ndef = {...ndef,status:candidates.length ? 'ambiguous' : 'missing'};
    else {
      const value = candidates[0]!.value!;
      if (value.offset === value.endOffset) ndef = {...ndef,status:'empty',value};
      else {
        const hex = Array.from(bytes.subarray(value.sourceOffset,value.sourceEndOffset),b=>b.toString(16).padStart(2,'0')).join('');
        const decoded = decodeNdefMessage(hex);
        // No raw record/type/id/payload bytes in this viewer, including unknown records.
        ndef = {...ndef,status:'decoded',value,decoder:{status:decoded.status,issues:decoded.issues.map(i=>({...i,dataOffset:value.offset+i.offset,sourceOffset:value.sourceOffset+i.offset})),
          records:decoded.records.map(r=>({offset:r.offset,endOffset:r.endOffset,dataOffset:value.offset+r.offset,dataEndOffset:value.offset+r.endOffset,sourceOffset:value.sourceOffset+r.offset,sourceEndOffset:value.sourceOffset+r.endOffset,value:r.value}))}};
      }
    }
  }
  const sha256 = await hash(new Uint8Array(bytes));
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) reject('SHA-256 result');
  const result: NfcStaticReport = freeze({profile:'apex-static-48-v1',source:{...ctx,sha256,byteCount:bytes.length},
    dataArea:span(0,48),tlvStatus,diagnostic,elements,trailing,ndef,disclosures});
  originals.set(result,bytes);
  return result;
}
export function serializeNfcStaticReport(report: NfcStaticReport): string {
  if (!originals.has(report)) reject('unrecognized report');
  const output = JSON.stringify(report,null,2);
  // Conservative UTF-8 bound (at most 3 bytes per UTF-16 code unit).
  if (output.length * 3 > NFC_STATIC_OUTPUT_LIMIT) reject('output budget');
  return output;
}
