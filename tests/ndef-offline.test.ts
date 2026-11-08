import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeNdefMessage as decode, importNdefObservation as load, MAX_NDEF_BYTES, MAX_NDEF_RECORDS, MAX_NDEF_DOCUMENT_CHARACTERS } from '../packages/core/ndef-offline.ts';
const hex = (b: number[]) => b.map(n => n.toString(16).padStart(2, '0')).join('');
function record(payload: number[], type = [0x54], header = 0xd1, id: number[] = []) {
  return hex([header, type.length, ...(header & 16 ? [payload.length] : [0, 0, payload.length >>> 8, payload.length & 255]),
    ...(header & 8 ? [id.length] : []), ...type, ...id, ...payload]);
}
const text = (payload: number[]) => decode(record(payload)).records[0]!.value;
const envelope = (messageHex = 'd101055402656e4869') => ({ schemaVersion: 1, inputKind: 'serialized-ndef-message', provenance: { origin: 'synthetic-fixture', label: 'Test only' }, messageHex });

test('known synthetic fixtures yield readable values without reception or identity claims', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/ndef-observations.json', import.meta.url), 'utf8'));
  const a = load(JSON.stringify(fixtures[0]));
  assert.deepEqual(a.decoded.records[0]!.value, { kind: 'text', language: 'en', encoding: 'utf-8', text: 'Hi' });
  const b = load(JSON.stringify(fixtures[1]));
  assert.deepEqual(b.decoded.records[0]!.value, { kind: 'uri', prefixCode: 4, uri: 'https://example.com', actionable: false });
  assert.deepEqual(a.verification, { physicalReceptionVerified: false, identityVerified: false, authenticated: false, originIsCallerClaim: true });
});
test('UTF-8 preserves scalars, BOM, controls and text as inert content', () => {
  assert.deepEqual(text([2, 101, 110, 0x41, 0xc2, 0xa2, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80]),
    { kind: 'text', language: 'en', encoding: 'utf-8', text: 'A¢€😀' });
  const value = text([0, 0xef, 0xbb, 0xbf, 0]);
  assert.equal(value.kind === 'text' && value.text, '\ufeff\0');
  for (const bytes of [[0x80], [0xc0, 0x80], [0xc1, 0xbf], [0xc2], [0xc2, 0x20], [0xe0, 0x80, 0x80],
    [0xed, 0xa0, 0x80], [0xf0, 0x80, 0x80, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xf5, 0x80, 0x80, 0x80], [0xff]]) {
    assert.equal(text([0, ...bytes]).kind, 'invalid', hex(bytes));
  }
});
test('Text status and language lengths are validated without guessing language validity', () => {
  for (const bytes of [[], [0x40], [3, 101, 110], [1, 0x80]]) assert.equal(text(bytes).kind, 'invalid');
  assert.equal(text([63, ...Array(63).fill(101)]).kind, 'text');
  assert.equal(text([0]).kind, 'text');
});
test('UTF-16 handles both BOMs, BE default, surrogate pairs and malformed units', () => {
  for (const [bytes, encoding] of [ [[0, 65, 0xd8, 0x3d, 0xde, 0], 'utf-16be'],
    [[0xfe, 0xff, 0, 65, 0xd8, 0x3d, 0xde, 0], 'utf-16be'], [[0xff, 0xfe, 65, 0, 0x3d, 0xd8, 0, 0xde], 'utf-16le'] ] as const) {
    assert.deepEqual(text([0x80, ...bytes]), { kind: 'text', language: '', encoding, text: 'A😀' });
  }
  for (const bytes of [[0], [0xd8, 0], [0xdc, 0], [0xd8, 0, 0, 65], [0xff, 0xfe, 0, 0xdc]]) assert.equal(text([0x80, ...bytes]).kind, 'invalid');
});
test('all assigned URI prefixes map exactly and unknown prefixes remain opaque', () => {
  const prefixes = ['', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:', 'ftp://anonymous:anonymous@',
    'ftp://ftp.', 'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://', 'news:', 'telnet://', 'imap:', 'rtsp://',
    'urn:', 'pop:', 'sip:', 'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://', 'tcpobex://', 'irdaobex://', 'file://',
    'urn:epc:id:', 'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:'];
  prefixes.forEach((prefix, i) => assert.deepEqual(decode(record([i, 120], [0x55])).records[0]!.value,
    { kind: 'uri', prefixCode: i, uri: prefix + 'x', actionable: false }));
  for (const prefix of [36, 127, 255]) assert.equal(decode(record([prefix, 255], [0x55])).records[0]!.value.kind, 'opaque');
  assert.equal(decode(record([], [0x55])).status, 'malformed');
  assert.equal(decode(record([0, 255], [0x55])).status, 'malformed');
  const dangerous = decode(record([0, ...Array.from(Buffer.from('javascript:alert(1)'))], [0x55])).records[0]!.value;
  assert.equal(dangerous.kind === 'uri' && dangerous.actionable, false);
});
test('long payload length, ID field, exact record and field offsets', () => {
  const first = record([0, 65], [0x54], 0x99, [0xaa, 0xbb]);
  const second = record(Array(256).fill(42), [0x78], 0x42);
  const d = decode(first + second);
  assert.equal(d.status, 'parsed'); assert.equal(d.records.length, 2);
  assert.deepEqual(d.records.map(r => [r.offset, r.typeOffset, r.idOffset, r.payloadOffset, r.endOffset]), [[0, 4, 5, 7, 9], [9, 15, 16, 16, 272]]);
  assert.equal(d.records[0]!.idHex, 'aabb'); assert.equal(d.records[1]!.payloadHex.length, 512);
  assert.equal(d.records.map(r => r.rawHex).join(''), first + second);
  assert.equal(decode(record([], [], 0xc0)).status, 'parsed'); // zero payload, long length
  assert.equal(decode(record([], [], 0xd8)).status, 'parsed'); // present zero ID length
});
test('opaque types and nested payloads are never recursively interpreted', () => {
  for (const tnf of [1, 2, 3, 4, 5, 7]) {
    const input = record([0xd0, 0, 0], tnf === 5 || tnf === 7 ? [] : [0x78], 0xd0 | tnf);
    const d = decode(input); assert.equal(d.status, 'parsed'); assert.equal(d.records[0]!.value.kind, 'opaque');
    assert.equal(d.records[0]!.payloadHex, 'd00000');
  }
  assert.equal(decode(record([0xd0, 0, 0], [0x53, 0x70])).records[0]!.value.kind, 'opaque');
});
test('MB/ME/CF/SR/IL/TNF constraints and limits fail closed while retaining bytes', () => {
  const cases: [string, string][] = [ ['500000', 'message-begin-flag'], ['900000d00000', 'message-begin-flag'],
    ['f10000', 'chunk-with-message-end'], ['d60000', 'unchanged-without-leading-chunk'], ['d00100ff', 'tnf-field-constraint'],
    ['d00001ff', 'tnf-field-constraint'], ['d8000001ff', 'tnf-field-constraint'], ['d5010078', 'tnf-field-constraint'],
    ['d7010078', 'tnf-field-constraint'], ['900000', 'missing-message-end'], ['d0000000', 'trailing-bytes'], ['', 'empty-message'] ];
  for (const [input, code] of cases) { const d = decode(input); assert.equal(d.status, 'malformed', input); assert.equal(d.issues.at(-1)!.code, code); assert.equal(d.inputHex, input); }
  assert.equal(decode('b10101540056000100').status, 'unsupported');
  assert.equal(decode('b10101540056000100').unparsedHex, 'b10101540056000100');
  assert.equal(decode('b101025400').status, 'malformed'); // even first chunk truncated
  assert.equal(decode('c100ffffffff').status, 'limit-exceeded'); // unsigned, not -1
  const many = '900000' + '100000'.repeat(MAX_NDEF_RECORDS - 1) + '500000';
  assert.equal(decode(many).status, 'limit-exceeded'); assert.equal(decode(many).records.length, MAX_NDEF_RECORDS);
  assert.throws(() => decode('00'.repeat(MAX_NDEF_BYTES + 1)));
  for (const input of ['0', 'zz', 'd0 00 00', '0xd00000', '\nd00000']) assert.throws(() => decode(input));
  assert.equal(decode('D00000').inputHex, 'D00000');
});
test('every truncation boundary of short/long/IL messages is rejected with all bytes retained', () => {
  for (const input of [record([2, 101, 110, 65]), record([0, 65], [84], 0xc9, [1, 2])]) {
    for (let i = 0; i < input.length; i += 2) { const prefix = input.slice(0, i); const d = decode(prefix); assert.notEqual(d.status, 'parsed'); assert.equal(d.inputHex, prefix); }
  }
});
test('import preserves exact source, distinguishes claimed origins, rejects fabricated verification/native dictionaries', () => {
  const document = '\n' + JSON.stringify(envelope(), null, 2) + '\n'; assert.equal(load(document).sourceDocument, document);
  const other = envelope(); other.provenance.origin = 'recorded-import'; assert.equal(load(JSON.stringify(other)).verification.physicalReceptionVerified, false);
  for (const value of [null, [], {}, { ...envelope(), verified: true }, { ...envelope(), inputKind: 'native-records' },
    { ...envelope(), schemaVersion: 2 }, { ...envelope(), messageHex: [] },
    { ...envelope(), provenance: { origin: 'native-capture', label: 'x' } },
    { ...envelope(), provenance: { origin: 'recorded-import', label: '' } },
    { ...envelope(), provenance: { origin: 'recorded-import', label: 'x', authenticated: true } }]) assert.throws(() => load(JSON.stringify(value)));
  assert.throws(() => load('['.repeat(1000) + ']'.repeat(1000)), /depth/);
  assert.throws(() => load(' '.repeat(MAX_NDEF_DOCUMENT_CHARACTERS + 1)), /size/);
  const quoted = envelope(); quoted.provenance.label = '{[\\"'; assert.equal(load(JSON.stringify(quoted)).provenance.label, quoted.provenance.label);
});
test('deterministic fuzz is total, bounded, and preserves record spans and undecoded tail', () => {
  let state = 0x12345678;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  for (let n = 0; n < 6000; n++) {
    const input = hex(Array.from({ length: next() % 200 }, () => next() >>> 24));
    const d = decode(input); assert.deepEqual(d, decode(input)); assert.equal(d.inputHex, input);
    assert.ok(d.records.length <= MAX_NDEF_RECORDS);
    let end = 0;
    for (const r of d.records) { assert.equal(r.offset, end); assert.ok(r.endOffset > r.offset); assert.equal(r.rawHex, input.slice(r.offset * 2, r.endOffset * 2)); end = r.endOffset; }
    assert.equal(d.records.map(r => r.rawHex).join('') + d.unparsedHex, input);
  }
});
test('ambiguous duplicate keys including escaped aliases cannot change origin claims', () => {
  const doc = JSON.stringify(envelope());
  assert.throws(() => load(doc.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')), /Duplicate/);
  assert.throws(() => load(doc.replace('"origin":"synthetic-fixture"', '"origin":"synthetic-fixture","or\\u0069gin":"recorded-import"')), /Duplicate/);
  assert.equal(decode('b10000').issues[0]!.code, 'chunk-missing-type');
});
test('inclusive byte and record boundaries and structured payload fuzz', () => {
  const boundary = record(Array(MAX_NDEF_BYTES - 7).fill(0), [120], 0xc2);
  assert.equal(boundary.length / 2, MAX_NDEF_BYTES); assert.equal(decode(boundary).status, 'parsed');
  const records = '900000' + '100000'.repeat(MAX_NDEF_RECORDS - 2) + '500000';
  assert.equal(decode(records).status, 'parsed'); assert.equal(decode(records).records.length, MAX_NDEF_RECORDS);
  let seed = 42;
  for (let i = 0; i < 1000; i++) {
    const payload = Array.from({ length: i % 128 }, () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed >>> 24; });
    const input = record(payload, [i % 2 ? 84 : 85]);
    const d = decode(input); assert.equal(d.records.length, 1); assert.equal(d.records[0]!.rawHex, input);
    assert.ok(d.status === 'parsed' || d.status === 'malformed');
  }
});
