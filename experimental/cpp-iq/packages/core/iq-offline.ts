import { parseBoundedJson } from './bounded-json.ts';

/** A deliberately narrow APEX profile, not a full SigMF implementation. */
export const IQ_PROFILE = 'apex-ci16-le-v1';
export const IQ_METADATA_LIMIT = 65_536;
export const IQ_DATA_LIMIT = 262_144;
export interface IqImportContext {
  schemaVersion: 1;
  origin: 'synthetic-fixture' | 'external-file';
  importedAt: string;
  supplierLabel?: string;
}
export interface IqByteHasher {
  digest(algorithm: 'SHA-256' | 'SHA-512', bytes: Uint8Array): Promise<string>;
}
export interface PreparedIq {
  readonly profile: typeof IQ_PROFILE;
  readonly parserVersion: '1';
  readonly acquisition: 'offline import; acquisition not verified';
  readonly context: Readonly<IqImportContext>;
  readonly supplierClaim: Readonly<Record<string, unknown>>;
  readonly sampleRate: number;
  readonly centerFrequency: number;
  readonly sampleCount: number;
  readonly metadataLength: number;
  readonly dataLength: number;
  readonly metadataSha256: string;
  readonly dataSha256: string;
  readonly sha512Status: 'byte-match-only' | 'not-provided';
  readonly warnings: readonly string[];
  getMetadataBytes(): Uint8Array;
  getDataBytes(): Uint8Array;
}
const prepared = new WeakSet<object>();
export function assertPreparedIq(recording: PreparedIq): void {
  if (!prepared.has(recording)) throw new Error('Expected an APEX prepared recording, not supplied analysis claims');
}
function fail(message: string): never { throw new Error(`Unsupported by APEX profile v1: ${message}`); }
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('expected plain object');
  return value as Record<string, unknown>;
}
function bounded(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value)) fail('non-finite number');
  if (typeof value === 'string' && value.length > 4096) fail('string limit');
  if (Array.isArray(value)) {
    if (value.length > 256) fail('array limit');
    value.forEach(bounded);
  } else if (value !== null && typeof value === 'object') {
    const entries = Object.entries(object(value));
    if (entries.length > 128) fail('object key limit');
    for (const [key, child] of entries) {
      if (key.length > 128) fail('key length limit');
      bounded(child);
    }
  }
}
function freezeTree(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeTree); Object.freeze(value);
  }
}
function string(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096) fail('expected bounded string');
  return value;
}
function numeric(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail('numeric field range/type');
  return value;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('unexpected/missing object keys');
}
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const viewTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
const viewSize = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const viewBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
const viewOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;
const bufferSize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const bufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
function snapshot(input: Uint8Array, max: number, min: number): Uint8Array {
  if (!(input instanceof Uint8Array)) fail('byte input size/type');
  // Intrinsic accessors ignore subclass/own-property claims and reject proxy views.
  let size: number; let offset: number; let buffer: ArrayBuffer;
  try {
    if (viewTag.call(input) !== 'Uint8Array') fail('byte input size/type');
    size = viewSize.call(input); buffer = viewBuffer.call(input); offset = viewOffset.call(input);
    // This intrinsic also rejects shared storage, regardless of a shadowed buffer property.
    bufferSize.call(buffer);
    if (bufferResizable?.call(buffer)) fail('resizable input buffers');
  } catch { fail('unsupported input buffer/view'); }
  if (size < min || size > max) fail('byte input size/type');
  return new Uint8Array(new Uint8Array(buffer, offset, size));
}
function snapshotContext(context: IqImportContext): Record<string, unknown> {
  const source = object(context);
  const copy: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(source)) {
    if (typeof key !== 'string' || !['schemaVersion', 'origin', 'importedAt', 'supplierLabel'].includes(key)) fail('import context field');
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('import context requires own data fields');
    copy[key] = descriptor.value;
  }
  for (const key of ['schemaVersion', 'origin', 'importedAt']) {
    if (!Object.hasOwn(copy, key)) fail('missing import context field');
  }
  return Object.freeze(copy);
}
export async function prepareIq(metadataBytes: Uint8Array, dataBytes: Uint8Array, context: IqImportContext, hasher: IqByteHasher): Promise<PreparedIq> {
  const metadata = snapshot(metadataBytes, IQ_METADATA_LIMIT, 1);
  const data = snapshot(dataBytes, IQ_DATA_LIMIT, 4);
  if (data.length % 4 !== 0) fail('partial complex sample');
  if (metadata[0] === 0xef && metadata[1] === 0xbb && metadata[2] === 0xbf) fail('UTF-8 BOM');
  const document = new TextDecoder('utf-8', { fatal: true }).decode(metadata);
  const root = object(parseBoundedJson(document, IQ_METADATA_LIMIT, 8)); bounded(root);
  exactKeys(root, ['global', 'captures', 'annotations']);
  const global = object(root.global);
  if (global['core:datatype'] !== 'ci16_le') fail('datatype (requires ci16_le)');
  if (global['core:version'] !== '1.2.6') fail('unsupported version (requires 1.2.6)');
  const sampleRate = numeric(global['core:sample_rate'], 1, 1e9);
  if (!Array.isArray(root.captures) || root.captures.length !== 1) fail('requires one capture');
  const capture = object(root.captures[0]);
  if (capture['core:sample_start'] !== 0) fail('capture start must be zero');
  const centerFrequency = numeric(capture['core:frequency'], -1e12, 1e12);
  if (!Array.isArray(root.annotations) || root.annotations.length !== 0) fail('annotations must be empty');
  for (const [key, expected] of [['core:num_channels', 1], ['core:offset', 0], ['core:metadata_only', false]] as const) {
    if (Object.hasOwn(global, key) && global[key] !== expected) fail(key);
  }
  const warnings: string[] = [];
  const optional = new Set<string>();
  if (Object.hasOwn(global, 'core:extensions')) {
    const extensions = global['core:extensions'];
    if (!Array.isArray(extensions) || extensions.length > 16) fail('extensions limit/type');
    for (const value of extensions) {
      const extension = object(value); exactKeys(extension, ['name', 'version', 'optional']);
      const name = string(extension.name); string(extension.version);
      if (!name || name === 'core' || name.includes(':') || optional.has(name)) fail('extension namespace/duplicate');
      if (extension.optional !== true) fail('required extension');
      optional.add(name);
      warnings.push(`Optional extension ${name}: retained, not interpreted`);
    }
  }
  const globalStrings = ['core:author', 'core:description', 'core:hw', 'core:recorder', 'core:license'];
  const globalAllowed = ['core:datatype', 'core:version', 'core:sample_rate', 'core:num_channels', 'core:offset', 'core:metadata_only', 'core:sha512', 'core:extensions', ...globalStrings];
  function checkFields(fields: Record<string, unknown>, allowed: string[]) {
    for (const key of Object.keys(fields)) {
      if (allowed.includes(key)) continue;
      const colon = key.indexOf(':');
      if (colon <= 0 || colon === key.length - 1 || !optional.has(key.slice(0, colon))) fail(`field ${key}`);
    }
  }
  checkFields(global, globalAllowed); checkFields(capture, ['core:sample_start', 'core:frequency', 'core:datetime']);
  for (const key of globalStrings) if (Object.hasOwn(global, key)) string(global[key]);
  if (Object.hasOwn(capture, 'core:datetime')) { string(capture['core:datetime']); warnings.push('timestamp retained, not validated'); }
  const expectedSha512 = global['core:sha512'];
  if (Object.hasOwn(global, 'core:sha512') && (typeof expectedSha512 !== 'string' || !/^[a-f\d]{128}$/i.test(expectedSha512))) fail('malformed SHA-512');
  const ctx = snapshotContext(context);
  if (Object.keys(ctx).some(key => !['schemaVersion', 'origin', 'importedAt', 'supplierLabel'].includes(key))) fail('import context field');
  if (ctx.schemaVersion !== 1 || (ctx.origin !== 'synthetic-fixture' && ctx.origin !== 'external-file')) fail('import context version/origin');
  if (typeof ctx.origin !== 'string') fail('import context origin');
  const importedAt = string(ctx.importedAt);
  const date = new Date(importedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== importedAt) fail('import time must be canonical ISO UTC');
  const contextCopy: IqImportContext = { schemaVersion: 1, origin: ctx.origin as IqImportContext['origin'], importedAt };
  if (Object.hasOwn(ctx, 'supplierLabel')) contextCopy.supplierLabel = string(ctx.supplierLabel);
  freezeTree(root); Object.freeze(contextCopy);
  async function digest(algorithm: 'SHA-256' | 'SHA-512', bytes: Uint8Array) {
    const hash = await hasher.digest(algorithm, new Uint8Array(bytes));
    if (typeof hash !== 'string' || !(algorithm === 'SHA-256' ? /^[a-f\d]{64}$/i : /^[a-f\d]{128}$/i).test(hash)) throw new Error('Invalid byte hasher result');
    return hash.toLowerCase();
  }
  const metadataSha256 = await digest('SHA-256', metadata);
  const dataSha256 = await digest('SHA-256', data);
  if (typeof expectedSha512 === 'string' && (await digest('SHA-512', data)) !== expectedSha512.toLowerCase()) throw new Error('Data SHA-512 integrity mismatch');
  const result: PreparedIq = Object.freeze({
    profile: IQ_PROFILE, parserVersion: '1', acquisition: 'offline import; acquisition not verified',
    context: contextCopy, supplierClaim: root, sampleRate, centerFrequency, sampleCount: data.length / 4,
    metadataLength: metadata.length, dataLength: data.length, metadataSha256, dataSha256,
    sha512Status: typeof expectedSha512 === 'string' ? 'byte-match-only' : 'not-provided', warnings: Object.freeze(warnings),
    getMetadataBytes: () => new Uint8Array(metadata), getDataBytes: () => new Uint8Array(data),
  });
  prepared.add(result); return result;
}
