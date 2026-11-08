/** Offline interpretation only. No native APIs, transport, dispatch, network or writes.
 * Wire references and narrower acceptance policy: docs/NDEF_OFFLINE.md. */
export const MAX_NDEF_BYTES = 8192;
export const MAX_NDEF_RECORDS = 64;
export const MAX_NDEF_DOCUMENT_CHARACTERS = 20000;
export type NdefValue =
  | { kind: 'empty' }
  | { kind: 'text'; language: string; encoding: 'utf-8' | 'utf-16be' | 'utf-16le'; text: string }
  | { kind: 'uri'; prefixCode: number; uri: string; actionable: false }
  | { kind: 'opaque'; reason: string }
  | { kind: 'invalid'; reason: string };
export interface OfflineNdefRecord {
  offset: number; endOffset: number; typeOffset: number; idOffset: number; payloadOffset: number;
  header: number; tnf: number; mb: boolean; me: boolean; cf: boolean; sr: boolean; il: boolean;
  rawHex: string; typeHex: string; idHex: string; payloadHex: string; value: NdefValue;
}
export interface NdefDecode {
  inputHex: string; records: OfflineNdefRecord[];
  status: 'parsed' | 'malformed' | 'unsupported' | 'limit-exceeded';
  issues: { offset: number; code: string }[]; unparsedHex: string;
}
// Wire constants, independently implemented from AOSP android-14.0.0_r1 URI table.
const URI_PREFIXES = ['', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:',
  'ftp://anonymous:anonymous@', 'ftp://ftp.', 'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://',
  'dav://', 'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:', 'sip:', 'sips:', 'tftp:',
  'btspp://', 'btl2cap://', 'btgoep://', 'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:',
  'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:'] as const;

// Strict Unicode decoding, independent of Buffer/TextDecoder availability on phones.
// No replacement characters, Unicode normalization, URI parsing or BOM stripping for UTF-8.
function utf8(b: readonly number[]): string {
  let out = '';
  for (let i = 0; i < b.length;) {
    const first = b[i++]!;
    const n = first < 0x80 ? 0 : first >= 0xc2 && first <= 0xdf ? 1 :
      first >= 0xe0 && first <= 0xef ? 2 : first >= 0xf0 && first <= 0xf4 ? 3 : -1;
    if (n < 0 || i + n > b.length) throw new Error('Invalid UTF-8');
    let cp = first & (n === 0 ? 0x7f : (1 << (6 - n)) - 1);
    for (let j = 0; j < n; j++) {
      const next = b[i++]!;
      if (next < 0x80 || next > 0xbf) throw new Error('Invalid UTF-8 continuation');
      cp = cp * 64 + (next & 63);
    }
    if ((n === 1 && cp < 0x80) || (n === 2 && cp < 0x800) || (n === 3 && cp < 0x10000) ||
        cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) throw new Error('Invalid UTF-8 scalar');
    out += String.fromCodePoint(cp);
  }
  return out;
}
function utf16(b: readonly number[]): { text: string; encoding: 'utf-16be' | 'utf-16le' } {
  if (b.length % 2) throw new Error('Odd UTF-16 byte length');
  const le = b[0] === 0xff && b[1] === 0xfe;
  let i = le || (b[0] === 0xfe && b[1] === 0xff) ? 2 : 0;
  const unit = (at: number) => le ? b[at]! + b[at + 1]! * 256 : b[at]! * 256 + b[at + 1]!;
  let text = '';
  while (i < b.length) {
    const a = unit(i); i += 2;
    if (a >= 0xd800 && a <= 0xdbff) {
      if (i >= b.length) throw new Error('Unpaired UTF-16 surrogate');
      const z = unit(i); i += 2;
      if (z < 0xdc00 || z > 0xdfff) throw new Error('Unpaired UTF-16 surrogate');
      text += String.fromCodePoint(0x10000 + (a - 0xd800) * 1024 + z - 0xdc00);
    } else {
      if (a >= 0xdc00 && a <= 0xdfff) throw new Error('Unpaired UTF-16 surrogate');
      text += String.fromCharCode(a);
    }
  }
  return { text, encoding: le ? 'utf-16le' : 'utf-16be' };
}
/** Payload-only interpretation of validated fields; does not validate message framing. */
export function interpretNdefPayload(tnf: number, type: string, payload: readonly number[]): NdefValue {
  if (tnf === 0) return { kind: 'empty' };
  if (tnf !== 1 || (type !== '54' && type !== '55')) return { kind: 'opaque', reason: 'Unsupported record type; no nested decoding' };
  try {
    const status = payload[0];
    if (status === undefined) throw new Error('Missing RTD status/prefix byte');
    if (type === '55') {
      const prefix = URI_PREFIXES[status];
      if (prefix === undefined) return { kind: 'opaque', reason: 'Unknown URI prefix code' };
      return { kind: 'uri', prefixCode: status, uri: prefix + utf8(payload.slice(1)), actionable: false };
    }
    if (status & 0x40) throw new Error('Reserved Text status bit set');
    const length = status & 63;
    if (1 + length > payload.length) throw new Error('Truncated Text language');
    const languageBytes = payload.slice(1, 1 + length);
    if (languageBytes.some(b => b > 127)) throw new Error('Non-ASCII Text language');
    const language = languageBytes.map(b => String.fromCharCode(b)).join('');
    const data = payload.slice(1 + length);
    return { kind: 'text', language, ...(status & 0x80 ? utf16(data) : { text: utf8(data), encoding: 'utf-8' as const }) };
  } catch (error) {
    return { kind: 'invalid', reason: error instanceof Error ? error.message : 'Invalid RTD' };
  }
}
/** Exactly one raw serialized NDEF message, not a tag-memory dump/TLV/RF frame/native dictionary.
 * Invalid hex or input exceeding the byte budget is rejected before allocating decoded bytes.
 * Accepted bytes (including malformed/unsupported bytes) are always retained in inputHex. */
export function decodeNdefMessage(inputHex: string): NdefDecode {
  if (typeof inputHex !== 'string' || inputHex.length > MAX_NDEF_BYTES * 2 ||
      inputHex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(inputHex)) throw new Error('NDEF requires bounded contiguous hexadecimal bytes');
  const hex = inputHex.toLowerCase();
  const b = Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  const result: NdefDecode = { inputHex, records: [], status: 'parsed', issues: [], unparsedHex: '' };
  const fail = (offset: number, code: string, status: NdefDecode['status'] = 'malformed') => {
    result.status = status; result.issues.push({ offset, code }); result.unparsedHex = hex.slice(offset * 2); return result;
  };
  let at = 0;
  while (at < b.length) {
    const start = at;
    if (result.records.length >= MAX_NDEF_RECORDS) return fail(start, 'record-limit', 'limit-exceeded');
    const header = b[at++]!;
    const mb = !!(header & 128), me = !!(header & 64), cf = !!(header & 32), sr = !!(header & 16), il = !!(header & 8), tnf = header & 7;
    if (mb !== (result.records.length === 0)) return fail(start, 'message-begin-flag');
    if (cf && me) return fail(start, 'chunk-with-message-end');
    if (tnf === 6) return fail(start, 'unchanged-without-leading-chunk');
    const required = 1 + (sr ? 1 : 4) + (il ? 1 : 0);
    if (at + required > b.length) return fail(start, 'truncated-header');
    const typeLength = b[at++]!;
    let payloadLength = 0;
    for (let n = 0; n < (sr ? 1 : 4); n++) payloadLength = payloadLength * 256 + b[at++]!;
    const idLength = il ? b[at++]! : 0;
    if ((tnf === 0 && (typeLength || payloadLength || idLength || cf)) || ((tnf === 5 || tnf === 7) && typeLength)) return fail(start, 'tnf-field-constraint');
    if (payloadLength > MAX_NDEF_BYTES) return fail(start, 'payload-limit', 'limit-exceeded');
    if (at + typeLength + idLength + payloadLength > b.length) return fail(start, 'truncated-record');
    // Reject chunk support before presenting any partial payload as a logical record.
    if (cf && typeLength === 0 && tnf !== 5) return fail(start, 'chunk-missing-type');
    if (cf) return fail(start, 'chunking-not-supported', 'unsupported');
    const typeOffset = at, idOffset = at + typeLength, payloadOffset = idOffset + idLength;
    at = payloadOffset + payloadLength;
    const typeHex = hex.slice(typeOffset * 2, idOffset * 2);
    const value = interpretNdefPayload(tnf, typeHex, b.slice(payloadOffset, at));
    result.records.push({ offset: start, endOffset: at, typeOffset, idOffset, payloadOffset, header, tnf, mb, me, cf, sr, il,
      rawHex: hex.slice(start * 2, at * 2), typeHex, idHex: hex.slice(idOffset * 2, payloadOffset * 2), payloadHex: hex.slice(payloadOffset * 2, at * 2), value });
    if (value.kind === 'invalid') { result.status = 'malformed'; result.issues.push({ offset: payloadOffset, code: 'invalid-rtd' }); }
    if (me) return at === b.length ? result : fail(at, 'trailing-bytes');
  }
  return fail(at, b.length ? 'missing-message-end' : 'empty-message');
}

export interface NdefObservation {
  schemaVersion: 1; inputKind: 'serialized-ndef-message'; sourceDocument: string;
  provenance: { origin: 'synthetic-fixture' | 'recorded-import'; label: string };
  verification: { physicalReceptionVerified: false; identityVerified: false; authenticated: false; originIsCallerClaim: true };
  decoded: NdefDecode;
}
function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected NDEF document object');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) throw new Error('Unexpected NDEF document fields');
  return row;
}
/** Pure import: exact original document retained; caller-supplied verification/decoded claims forbidden. */
export function importNdefObservation(document: string): NdefObservation {
  if (typeof document !== 'string' || document.length > MAX_NDEF_DOCUMENT_CHARACTERS) throw new Error('NDEF document size limit');
  // Bound nesting before JSON.parse; ignore brackets inside strings. Contract has only two object levels.
  let depth = 0, quoted = false, escaped = false, stringStart = 0;
  const keySets: Set<string>[] = [];
  for (let i = 0; i < document.length; i++) {
    const c = document[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') {
        quoted = false;
        let next = i + 1;
        while (next < document.length && /\s/.test(document[next]!)) next++;
        if (document[next] === ':' && keySets.length) {
          const key: string = JSON.parse(document.slice(stringStart, i + 1));
          const keys = keySets[keySets.length - 1]!;
          if (keys.has(key)) throw new Error('Duplicate NDEF document key');
          keys.add(key);
        }
      }
    } else if (c === '"') { quoted = true; stringStart = i; }
    else if (c === '{' || c === '[') {
      if (++depth > 2) throw new Error('NDEF document depth limit');
      keySets.push(new Set());
    } else if (c === '}' || c === ']') { depth--; keySets.pop(); }
  }
  const row = exactObject(JSON.parse(document), ['schemaVersion', 'inputKind', 'provenance', 'messageHex']);
  if (row.schemaVersion !== 1 || row.inputKind !== 'serialized-ndef-message' || typeof row.messageHex !== 'string') throw new Error('Unsupported NDEF import format');
  const p = exactObject(row.provenance, ['origin', 'label']);
  if ((p.origin !== 'synthetic-fixture' && p.origin !== 'recorded-import') || typeof p.label !== 'string' || p.label.length < 1 || p.label.length > 128) throw new Error('Invalid NDEF provenance');
  return { schemaVersion: 1, inputKind: 'serialized-ndef-message', sourceDocument: document,
    provenance: { origin: p.origin, label: p.label },
    verification: { physicalReceptionVerified: false, identityVerified: false, authenticated: false, originIsCallerClaim: true },
    decoded: decodeNdefMessage(row.messageHex) };
}
