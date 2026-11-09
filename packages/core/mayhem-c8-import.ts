/** Original, offline-only adapter for an explicit, narrow Mayhem .c8 + text-sidecar profile.
 * No upstream implementation is copied. No filesystem, network or device APIs. */
import { IQ_DATA_LIMIT, prepareIq, type IqByteHasher, type IqImportContext, type PreparedIq } from './iq-offline.ts';

export const MAYHEM_C8_PROFILE = 'mayhem-c8-text-v1';
export const MAYHEM_C8_FORMAT = 'c8 (signed int8 I,Q)';
export const MAYHEM_C8_LIMITS = Object.freeze({ sidecarBytes: 4096, dataBytes: IQ_DATA_LIMIT / 2 });
export interface MayhemC8Import {
  readonly sourceProfile: typeof MAYHEM_C8_PROFILE;
  readonly parserVersion: '1';
  readonly sourceClaims: Readonly<{ sampleRate: number; centerFrequency: number; format: typeof MAYHEM_C8_FORMAT }>;
  readonly conversion: 'signed-int8-times-256-to-signed-int16-le; interleaved-IQ-order-preserved';
  readonly original: Readonly<{ dataLength: number; sidecarLength: number; dataSha256: string; sidecarSha256: string }>;
  readonly verification: Readonly<{ acquisitionVerified: false; producerVerified: false; authenticityVerified: false }>;
  readonly warnings: readonly string[];
  readonly recording: PreparedIq;
  getOriginalDataBytes(): Uint8Array;
  getOriginalSidecarBytes(): Uint8Array;
}

const fail = (reason: string): never => { throw new Error(`Unsupported by Mayhem C8 profile v1: ${reason}`); };
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const intrinsic = (key: PropertyKey) => Object.getOwnPropertyDescriptor(typedArrayPrototype, key)!.get!;
const tag = intrinsic(Symbol.toStringTag), byteLength = intrinsic('byteLength');
const backingBuffer = intrinsic('buffer'), byteOffset = intrinsic('byteOffset');
const arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;

/** Intrinsics ignore byte-view property overrides. Caller storage never crosses an await. */
function snapshot(input: Uint8Array, minimum: number, maximum: number): Uint8Array {
  try {
    if (tag.call(input) !== 'Uint8Array') return fail('expected Uint8Array byte input');
    const size: number = byteLength.call(input), offset: number = byteOffset.call(input);
    const buffer: ArrayBuffer = backingBuffer.call(input);
    arrayBufferLength.call(buffer); // Reject shared storage even if a property claims otherwise.
    if (resizable?.call(buffer)) return fail('resizable input storage');
    if (size < minimum || size > maximum) return fail('input byte limit');
    return new Uint8Array(new Uint8Array(buffer, offset, size));
  } catch { return fail('unsupported byte input or storage'); }
}

function parseSidecar(bytes: Uint8Array): MayhemC8Import['sourceClaims'] {
  let text = '';
  for (const byte of bytes) {
    if (byte !== 10 && byte !== 13 && (byte < 32 || byte > 126)) fail('sidecar must be plain ASCII');
    text += String.fromCharCode(byte);
  }
  if (/\r(?!\n)/.test(text) || (text.includes('\r\n') && text.replace(/\r\n/g, '').includes('\n'))) fail('sidecar line endings');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length !== 3) fail('sidecar requires exactly three fields');
  const fields = new Map<string, string>();
  for (const line of lines) {
    const equals = line.indexOf('=');
    const key = line.slice(0, equals), value = line.slice(equals + 1);
    if (equals < 1 || !['sample_rate', 'center_frequency', 'format'].includes(key) || fields.has(key)) fail('unknown, missing or duplicate sidecar field');
    fields.set(key, value);
  }
  if (fields.get('format') !== MAYHEM_C8_FORMAT) fail('explicit signed int8 I,Q format required');
  function integerHz(key: string, min: number, max: number): number {
    const value = fields.get(key);
    if (value === undefined || !/^(0|[1-9][0-9]{0,12})$/.test(value)) return fail(`${key} requires canonical integer Hz`);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < min || number > max) return fail(`${key} range`);
    return number;
  }
  return Object.freeze({ sampleRate: integerHz('sample_rate', 1, 1e9), centerFrequency: integerHz('center_frequency', 0, 1e12), format: MAYHEM_C8_FORMAT });
}

/** Produce the existing APEX ci16_le profile and keep originals independently retrievable.
 * The caller selects the files and supplies a trusted local hasher and explicit import context.
 * Hash shape is checked; hashes establish byte identity, not an authentic producer or capture. */
export async function importMayhemC8(dataBytes: Uint8Array, sidecarBytes: Uint8Array, context: IqImportContext, hasher: IqByteHasher): Promise<MayhemC8Import> {
  const originalData = snapshot(dataBytes, 2, MAYHEM_C8_LIMITS.dataBytes);
  const originalSidecar = snapshot(sidecarBytes, 1, MAYHEM_C8_LIMITS.sidecarBytes);
  if (originalData.length % 2 !== 0) fail('partial I/Q sample');
  const sourceClaims = parseSidecar(originalSidecar);
  const converted = new Uint8Array(originalData.length * 2);
  // Each two's-complement int8 becomes int16 * 256. The low byte is zero;
  // the original byte is the high byte. This preserves normalized sample amplitude.
  for (let i = 0; i < originalData.length; i++) converted[2 * i + 1] = originalData[i]!;
  // The generated fields are fixed ASCII strings and canonical integer Hz.
  // Avoid TextEncoder, which is not available in every native JS runtime.
  const metadata = Uint8Array.from(JSON.stringify({
    global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': sourceClaims.sampleRate,
      'core:recorder': 'APEX original Mayhem C8 importer v1',
      'core:description': 'Derived offline data; sidecar frequency and sample rate are unverified supplier claims.' },
    captures: [{ 'core:sample_start': 0, 'core:frequency': sourceClaims.centerFrequency }], annotations: [],
  }), character => character.charCodeAt(0));
  // prepareIq validates and snapshots context before its first await, then verifies derived bytes.
  const recording = await prepareIq(metadata, converted, context, hasher);
  async function hash(bytes: Uint8Array): Promise<string> {
    const digest = await hasher.digest('SHA-256', new Uint8Array(bytes));
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/i.test(digest)) throw new Error('Invalid original-byte hasher result');
    return digest.toLowerCase();
  }
  const dataSha256 = await hash(originalData), sidecarSha256 = await hash(originalSidecar);
  return Object.freeze({
    sourceProfile: MAYHEM_C8_PROFILE, parserVersion: '1', sourceClaims,
    conversion: 'signed-int8-times-256-to-signed-int16-le; interleaved-IQ-order-preserved',
    original: Object.freeze({ dataLength: originalData.length, sidecarLength: originalSidecar.length, dataSha256, sidecarSha256 }),
    verification: Object.freeze({ acquisitionVerified: false, producerVerified: false, authenticityVerified: false }),
    warnings: Object.freeze(['Offline conversion only; no capture or device compatibility is verified.',
      'Frequency and sample rate are unverified sidecar claims; no timestamp is inferred.',
      'Converted int16 rail-hit counts do not describe original int8 clipping: +127 maps to +32512, not +32767.',
      'Hashes identify bytes only when computed by the trusted local hasher; they do not authenticate the producer.']),
    recording,
    getOriginalDataBytes: () => new Uint8Array(originalData),
    getOriginalSidecarBytes: () => new Uint8Array(originalSidecar),
  });
}
