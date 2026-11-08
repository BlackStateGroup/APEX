/** Independently written, offline response observations only. No request codec or transport. */
export const FLIPPER_LIMITS = Object.freeze({ input: 65536, frame: 8192, frames: 256, fields: 256, aggregateFields: 4096, string: 1024 });
export type FlipperProvenance = 'synthetic' | 'imported';
export class FlipperInspectionError extends Error {
  readonly code: string;
  readonly offset: number;
  constructor(code: string, offset: number) { super(`${code} at byte ${offset}`); this.name = 'FlipperInspectionError'; this.code = code; this.offset = offset; }
}
export interface FlipperField { tag: number; wire: number; offset: number; end: number; valueOffset: number; valueEnd: number }
export interface FlipperFrame {
  offset: number; payloadOffset: number; end: number;
  fields: FlipperField[]; unknownFields: FlipperField[];
  commandId: { present: boolean; effective: number };
  status: { present: boolean; effective: number; observation: 'omitted' | 'explicit-zero' | 'nonzero-or-unknown' };
  hasNext: { present: boolean; effective: boolean };
  content: { kind: 'identity' | 'power' | 'version' | 'empty' | 'unsupported'; fields: FlipperField[]; unknownFields: FlipperField[]; key?: { present: boolean; effective: string }; value?: { present: boolean; effective: string }; major?: { present: boolean; effective: number }; minor?: { present: boolean; effective: number } };
  diagnostics: string[];
}
export interface FlipperInspection {
  provenance: FlipperProvenance; originalBytes: Uint8Array; frames: FlipperFrame[];
  tail?: { offset: number; kind: 'incomplete-length' | 'incomplete-payload'; expectedPayloadBytes?: number };
  diagnostics: string[];
}
const U32 = 0xffffffffn;
const U64 = 0xffffffffffffffffn;
const fail = (code: string, offset: number): never => { throw new FlipperInspectionError(code, offset); };
// Intrinsic getters avoid instance accessors/iterators and validate internal typed-array slots.
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const typedByteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;
const typedBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
const typedKind = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
const arrayBufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
const arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
function snapshotProvenance(options: unknown): FlipperProvenance {
  try {
    if (options === null || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype) return fail('invalid-provenance', 0);
    const keys = Reflect.ownKeys(options);
    const descriptor = Object.getOwnPropertyDescriptor(options, 'provenance');
    if (keys.length !== 1 || keys[0] !== 'provenance' || !descriptor || !Object.hasOwn(descriptor, 'value')) return fail('invalid-provenance', 0);
    const value: unknown = descriptor.value;
    if (value !== 'synthetic' && value !== 'imported') return fail('invalid-provenance', 0);
    return value;
  } catch { return fail('invalid-provenance', 0); }
}
function snapshotBytes(input: unknown): Uint8Array {
  let buffer: ArrayBuffer, length: number, offset: number;
  try {
    if (typedKind.call(input) !== 'Uint8Array') fail('invalid-input', 0);
    length = typedByteLength.call(input);
    offset = typedByteOffset.call(input);
    buffer = typedBuffer.call(input);
    // ArrayBuffer's intrinsic brand check rejects SharedArrayBuffer without overridable properties.
    arrayBufferLength.call(buffer);
    if (arrayBufferResizable?.call(buffer)) fail('invalid-input', 0);
  } catch { return fail('invalid-input', 0); }
  if (length > FLIPPER_LIMITS.input) fail('input-budget', 0);
  try {
    const view = new Uint8Array(buffer, offset, length); // Throws for detached backing storage.
    const copy = new Uint8Array(length);
    copy.set(view); // Fresh built-in views; no user iterator, species, accessors or methods.
    return copy;
  } catch { return fail('invalid-input', 0); }
}
class Reader {
  bytes: Uint8Array;
  fieldCount = 0;
  constructor(bytes: Uint8Array) { this.bytes = bytes; }
  varint(start: number, end: number, max: bigint, partial = false): { value: bigint; end: number } | undefined {
    let value = 0n;
    const count = max === U32 ? 5 : 10;
    for (let i = 0; i < count; i++) {
      const p = start + i;
      if (p === end) { if (partial) return undefined; return fail('truncated-varint', start); }
      const b = this.bytes[p]!;
      value |= BigInt(b & 127) << BigInt(i * 7);
      if (value > max) fail('varint-overflow', start);
      if (!(b & 128)) {
        if (i > 0 && (b & 127) === 0) fail('noncanonical-varint', start);
        return { value, end: p + 1 };
      }
    }
    return fail('varint-overflow', start);
  }
  fields(start: number, end: number): FlipperField[] {
    const fields: FlipperField[] = [];
    let p = start;
    while (p < end) {
      if (fields.length === FLIPPER_LIMITS.fields) fail('field-budget', p);
      if (++this.fieldCount > FLIPPER_LIMITS.aggregateFields) fail('aggregate-field-budget', p);
      const offset = p;
      const key = this.varint(p, end, U32)!; p = key.end;
      const tag = Number(key.value >> 3n), wire = Number(key.value & 7n);
      if (tag === 0) fail('field-zero', offset);
      let valueOffset = p;
      if (wire === 0) p = this.varint(p, end, U64)!.end;
      else if (wire === 1 || wire === 5) p += wire === 1 ? 8 : 4;
      else if (wire === 2) { const size = this.varint(p, end, U32)!; valueOffset = size.end; p = valueOffset + Number(size.value); }
      else fail('unsupported-wire-type', offset);
      if (p > end) fail('truncated-field', offset);
      fields.push({ tag, wire, offset, end: p, valueOffset, valueEnd: p });
    }
    return fields;
  }
  scalar(field: FlipperField, bool = false): number {
    if (field.wire !== 0) fail('wrong-known-wire-type', field.offset);
    const n = Number(this.varint(field.valueOffset, field.valueEnd, U32)!.value);
    if (bool && n > 1) fail('noncanonical-bool', field.valueOffset);
    return n;
  }
  children(field: FlipperField): FlipperField[] {
    if (field.wire !== 2) fail('wrong-known-wire-type', field.offset);
    return this.fields(field.valueOffset, field.valueEnd);
  }
  string(field: FlipperField): string {
    if (field.wire !== 2) fail('wrong-known-wire-type', field.offset);
    if (field.valueEnd - field.valueOffset > FLIPPER_LIMITS.string) fail('string-budget', field.valueOffset);
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(this.bytes.subarray(field.valueOffset, field.valueEnd)); }
    catch { return fail('invalid-utf8', field.valueOffset); }
  }
}
function unique(fields: FlipperField[], tags: number[]): void {
  const seen = new Set<number>();
  for (const field of fields) if (tags.includes(field.tag)) {
    if (seen.has(field.tag)) fail('duplicate-known-field', field.offset);
    seen.add(field.tag);
  }
}
/** EOF framing tails are observations; malformed complete frames throw with no partial result.
 * Call separately for separate streams. Never groups IDs or keys, or claims request correlation.
 */
export function inspectFlipperResponses(input: Uint8Array, options: { provenance: FlipperProvenance }): FlipperInspection {
  const provenance = snapshotProvenance(options);
  const bytes = snapshotBytes(input);
  const reader = new Reader(bytes);
  const report: FlipperInspection = { provenance, originalBytes: bytes, frames: [], diagnostics: ['Offline bytes do not prove origin, request correlation, stream completion or device compatibility.'] };
  let p = 0;
  while (p < bytes.length) {
    if (report.frames.length === FLIPPER_LIMITS.frames) fail('frame-count-budget', p);
    const offset = p;
    const length = reader.varint(p, bytes.length, U32, true);
    if (!length) { report.tail = { offset, kind: 'incomplete-length' }; break; }
    const size = Number(length.value);
    if (size > FLIPPER_LIMITS.frame) fail('frame-budget', offset);
    p = length.end;
    const end = p + size;
    if (end > bytes.length) { report.tail = { offset, kind: 'incomplete-payload', expectedPayloadBytes: size }; break; }
    const fields = reader.fields(p, end);
    unique(fields, [1, 2, 3, 4, 33, 40, 45]);
    const candidates = fields.filter(f => f.tag >= 4);
    const selected = candidates.filter(f => [4, 33, 40, 45].includes(f.tag));
    if (selected.length && candidates.length !== 1) fail('ambiguous-content', candidates[1]!.offset);
    const get = (tag: number) => fields.find(f => f.tag === tag);
    const id = get(1), status = get(2), next = get(3);
    const statusValue = status ? reader.scalar(status) : 0;
    const frame: FlipperFrame = {
      offset, payloadOffset: p, end, fields, unknownFields: fields.filter(f => ![1, 2, 3, 4, 33, 40, 45].includes(f.tag)),
      commandId: { present: !!id, effective: id ? reader.scalar(id) : 0 },
      status: { present: !!status, effective: statusValue, observation: !status ? 'omitted' : statusValue === 0 ? 'explicit-zero' : 'nonzero-or-unknown' },
      hasNext: { present: !!next, effective: next ? !!reader.scalar(next, true) : false },
      content: { kind: 'unsupported', fields: [], unknownFields: [] }, diagnostics: [],
    };
    if (selected.length) {
      const field = selected[0]!;
      const child = reader.children(field);
      const kind = field.tag === 33 ? 'identity' : field.tag === 45 ? 'power' : field.tag === 40 ? 'version' : 'empty';
      const known = kind === 'empty' ? [] : [1, 2];
      unique(child, known);
      frame.content = { kind, fields: child, unknownFields: child.filter(f => !known.includes(f.tag)) };
      if (kind === 'version') { frame.content.major = { present: false, effective: 0 }; frame.content.minor = { present: false, effective: 0 }; }
      if (kind === 'identity' || kind === 'power') { frame.content.key = { present: false, effective: '' }; frame.content.value = { present: false, effective: '' }; }
      for (const f of child) if (known.includes(f.tag)) {
        if (kind === 'version') frame.content[f.tag === 1 ? 'major' : 'minor'] = { present: true, effective: reader.scalar(f) };
        else frame.content[f.tag === 1 ? 'key' : 'value'] = { present: true, effective: reader.string(f) };
      }
    }
    if (!selected.length && candidates.length > 1) frame.diagnostics.push('Multiple unknown content candidates; content is unsupported and ambiguous.');
    if (!status) frame.diagnostics.push('Status omitted; effective zero is not explicitly reported success.');
    if (statusValue !== 0) frame.diagnostics.push('Nonzero or unknown status; payload is not successful identity evidence.');
    if (statusValue === 2) frame.diagnostics.push('Decode error: command ID may be unreliable.');
    frame.diagnostics.push(frame.hasNext.effective ? 'Continuation indicated and unresolved; later frames are not correlated or assembled.' : 'No continuation indicated by effective value; this frame may itself contain the terminal pair.');
    if (!next) frame.diagnostics.push('has_next omitted; effective false does not prove completion.');
    report.frames.push(frame); p = end;
  }
  if (report.tail) report.diagnostics.push('Incomplete framing tail preserved; no scan ahead attempted.');
  if (report.frames.at(-1)?.hasNext.effective) report.diagnostics.push('Last observed frame indicates continuation; input may be incomplete at EOF.');
  return report;
}
