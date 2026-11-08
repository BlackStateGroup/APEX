/** Pure selected-field adapter, not a scan, wire serializer or journal input.
 * The source contract is react-native-nfc-manager 4.2.0; see docs/NFC_MANAGER_NDEF.md.
 */
import { parseBoundedJson } from './bounded-json.ts';
import { interpretNdefPayload } from './ndef-offline.ts';
import type { NdefValue } from './ndef-offline.ts';

export const MAX_PHONE_NDEF_RECORDS = 64;
export const MAX_PHONE_NDEF_FIELD_BYTES = 8192;
export const MAX_PHONE_NDEF_TOTAL_BYTES = 8192;
export const MAX_PHONE_NDEF_DOCUMENT_CHARACTERS = 40000;
export type PhoneNdefPlatform = 'android' | 'ios';
export interface PhoneNdefProvenance { origin: 'synthetic-fixture' | 'recorded-import'; label: string }
export interface PhoneNdefRecord { tnf: number; type: number[]; id?: string | number[]; payload: number[] }
export interface PhoneNdefSnapshot { ndefMessage?: PhoneNdefRecord[] | null }
export interface PhoneNdefObservation {
  schemaVersion: 1;
  inputKind: 'nfc-manager-normalized-records';
  source: { sdk: 'react-native-nfc-manager'; version: '4.2.0'; platform: PhoneNdefPlatform };
  provenance: PhoneNdefProvenance;
  /** Exact imported document; prepare creates a NEW document of selected fields only. */
  sourceDocument: string;
  snapshot: PhoneNdefSnapshot;
  availability: 'missing' | 'null' | 'empty-array' | 'records';
  projection: { tnf: number; typeHex: string; idHex: string | null; payloadHex: string; value: NdefValue }[];
  verification: { sourceIsCallerClaim: true; originalWireAvailable: false; fullMessageVerified: false;
    physicalReceptionVerified: false; identityVerified: false; authenticated: false };
}

// Ordinary data objects only. Descriptors avoid executing getters/toJSON/array iterators.
// JavaScript cannot reliably detect hostile Proxies: use the string importer for untrusted code.
function object(value: unknown, allowed?: readonly string[], required: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Expected plain NFC data object');
  const keys = Reflect.ownKeys(value);
  if (keys.length > 64) throw new Error('NFC object field limit');
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== 'string' || (allowed && !allowed.includes(key))) throw new Error('Unexpected NFC field');
    const d = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in d) || !d.enumerable) throw new Error('NFC fields must be enumerable data');
    out[key] = d.value;
  }
  if (required.some(key => !Object.hasOwn(out, key))) throw new Error('Missing NFC field');
  return out;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error('Expected NFC array');
  const length = Object.getOwnPropertyDescriptor(value, 'length')!.value as number;
  if (length > max) throw new Error('NFC array limit');
  if (Reflect.ownKeys(value).length !== length + 1) throw new Error('Sparse or decorated NFC array');
  const out: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !('value' in d) || !d.enumerable) throw new Error('NFC array must contain data');
    out.push(d.value);
  }
  return out;
}
function bytes(value: unknown, max: number): number[] {
  return list(value, max).map(n => {
    if (typeof n !== 'number' || !Number.isInteger(n) || Object.is(n, -0) || n < 0 || n > 255) throw new Error('Invalid NFC byte');
    return n;
  });
}
function platform(value: unknown): PhoneNdefPlatform {
  if (value !== 'android' && value !== 'ios') throw new Error('Unsupported NFC source platform');
  return value;
}
function provenance(value: unknown): PhoneNdefProvenance {
  const p = object(value, ['origin', 'label'], ['origin', 'label']);
  if ((p.origin !== 'synthetic-fixture' && p.origin !== 'recorded-import') || typeof p.label !== 'string' || p.label.length < 1 || p.label.length > 128) throw new Error('Invalid NFC provenance');
  // Reject lone surrogates without depending on newer String APIs on phones.
  for (let i = 0; i < p.label.length; i++) {
    const unit = p.label.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = p.label.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('Invalid NFC label encoding');
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error('Invalid NFC label encoding');
  }
  return { origin: p.origin, label: p.label };
}
const hex = (b: readonly number[]) => b.map(n => n.toString(16).padStart(2, '0')).join('');
function snapshot(value: unknown, source: PhoneNdefPlatform, selectedOnly: boolean): PhoneNdefSnapshot {
  const tag = object(value, selectedOnly ? ['ndefMessage'] : undefined);
  if (!Object.hasOwn(tag, 'ndefMessage')) return {};
  if (tag.ndefMessage === null) return { ndefMessage: null };
  let total = 0;
  const records = list(tag.ndefMessage, MAX_PHONE_NDEF_RECORDS).map(value => {
    const r = object(value, ['tnf', 'type', 'id', 'payload'], ['tnf', 'type', 'payload']);
    if (typeof r.tnf !== 'number' || !Number.isInteger(r.tnf) || Object.is(r.tnf, -0) || r.tnf < 0 || r.tnf > 7 || r.tnf === 6) throw new Error('Invalid logical NFC TNF');
    const type = bytes(r.type, 255), payload = bytes(r.payload, MAX_PHONE_NDEF_FIELD_BYTES);
    let id: string | number[] | undefined;
    if (Object.hasOwn(r, 'id')) {
      if (source === 'android') {
        if (typeof r.id !== 'string' || r.id.length > 510 || r.id.length % 2 || !/^[0-9a-f]*$/i.test(r.id)) throw new Error('Android NFC ID requires hex text');
        id = r.id;
      } else id = bytes(r.id, 255);
    }
    const idLength = id === undefined ? 0 : typeof id === 'string' ? id.length / 2 : id.length;
    if ((r.tnf === 0 && (type.length || idLength || payload.length)) || ((r.tnf === 5 || r.tnf === 7) && type.length)) throw new Error('Invalid NFC TNF fields');
    total += type.length + idLength + payload.length;
    if (total > MAX_PHONE_NDEF_TOTAL_BYTES) throw new Error('NFC aggregate byte limit');
    const interpreted = interpretNdefPayload(r.tnf, hex(type), payload);
    if (interpreted.kind === 'invalid') throw new Error(`Invalid NFC payload encoding: ${interpreted.reason}`);
    return { tnf: r.tnf, type, ...(id === undefined ? {} : { id }), payload };
  });
  return { ndefMessage: records };
}
/** Import exact bounded JSON; source mismatch is an error, never a platform coercion. */
export function importPhoneNdefObservation(document: string, expectedPlatform: PhoneNdefPlatform): PhoneNdefObservation {
  const expected = platform(expectedPlatform);
  const row = object(parseBoundedJson(document, MAX_PHONE_NDEF_DOCUMENT_CHARACTERS, 5),
    ['schemaVersion', 'inputKind', 'source', 'provenance', 'snapshot'], ['schemaVersion', 'inputKind', 'source', 'provenance', 'snapshot']);
  if (row.schemaVersion !== 1 || row.inputKind !== 'nfc-manager-normalized-records') throw new Error('Unsupported NFC document');
  const s = object(row.source, ['sdk', 'version', 'platform'], ['sdk', 'version', 'platform']);
  if (s.sdk !== 'react-native-nfc-manager' || s.version !== '4.2.0' || platform(s.platform) !== expected) throw new Error('NFC source mismatch');
  const retained = snapshot(row.snapshot, expected, true);
  return { schemaVersion: 1, inputKind: 'nfc-manager-normalized-records',
    source: { sdk: 'react-native-nfc-manager', version: '4.2.0', platform: expected }, provenance: provenance(row.provenance),
    sourceDocument: document, snapshot: retained,
    availability: !Object.hasOwn(retained, 'ndefMessage') ? 'missing' : retained.ndefMessage === null ? 'null' : retained.ndefMessage!.length ? 'records' : 'empty-array',
    projection: (retained.ndefMessage ?? []).map(r => ({ tnf: r.tnf, typeHex: hex(r.type),
      idHex: r.id === undefined ? null : typeof r.id === 'string' ? r.id.toLowerCase() : hex(r.id),
      payloadHex: hex(r.payload), value: interpretNdefPayload(r.tnf, hex(r.type), r.payload) })),
    verification: { sourceIsCallerClaim: true, originalWireAvailable: false, fullMessageVerified: false,
      physicalReceptionVerified: false, identityVerified: false, authenticated: false } };
}
/** Prepare a defensive selected-field document, NOT serialization of the original TagEvent.
 * Does not call native APIs, persist evidence or connect any provider. Explicit undefined is rejected.
 */
export function preparePhoneNdefObservation(source: PhoneNdefPlatform, tag: unknown, origin: PhoneNdefProvenance): PhoneNdefObservation {
  const p = platform(source);
  const document = JSON.stringify({ schemaVersion: 1, inputKind: 'nfc-manager-normalized-records',
    source: { sdk: 'react-native-nfc-manager', version: '4.2.0', platform: p },
    provenance: provenance(origin), snapshot: snapshot(tag, p, false) });
  return importPhoneNdefObservation(document, p);
}
