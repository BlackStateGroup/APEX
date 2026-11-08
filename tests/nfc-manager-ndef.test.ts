import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preparePhoneNdefObservation as prepare, importPhoneNdefObservation as load,
  MAX_PHONE_NDEF_DOCUMENT_CHARACTERS } from '../packages/core/nfc-manager-ndef.ts';
import type { PhoneNdefPlatform } from '../packages/core/nfc-manager-ndef.ts';
import { importNdefObservation } from '../packages/core/ndef-offline.ts';
import { prepareNdefEvidenceInput } from '../packages/core/ndef-evidence.ts';
const origin = { origin: 'synthetic-fixture' as const, label: 'Synthetic, not a capture' };
const record = () => ({ tnf: 1, type: [84], id: '', payload: [2, 101, 110, 72, 105] });
const tag = () => ({ ndefMessage: [record()] });
const fixture = (p: PhoneNdefPlatform) => readFileSync(new URL(`./fixtures/phone-ndef/${p}.json`, import.meta.url), 'utf8');

for (const p of ['android', 'ios'] as const) test(`${p} fixture preserves selected source and inert interpretations`, () => {
  const doc = fixture(p), result = load(doc, p);
  assert.equal(result.sourceDocument, doc);
  assert.deepEqual(result.snapshot, JSON.parse(doc).snapshot);
  assert.equal(result.availability, 'records');
  assert.deepEqual(result.projection[0]!.value, { kind: 'text', language: 'en', encoding: 'utf-8', text: 'Hi' });
  assert.equal(result.projection[0]!.idHex, 'ab00');
  assert.deepEqual(result.projection[1]!.value, { kind: 'uri', prefixCode: 4, uri: 'https://example.com', actionable: false });
  assert.equal(result.projection[2]!.value.kind, 'opaque');
  assert.deepEqual(result.verification, { sourceIsCallerClaim: true, originalWireAvailable: false, fullMessageVerified: false,
    physicalReceptionVerified: false, identityVerified: false, authenticated: false });
  for (const key of ['header', 'mb', 'me', 'cf', 'sr', 'il', 'offset', 'rawHex', 'messageHex']) assert.ok(!(key in result.projection[0]!));
});

test('snapshot copies selected fields, retains hex case, excludes tag identity and is isolated from projection', () => {
  const input = { ...tag(), id: 'FEED', techTypes: ['Ndef'] }; input.ndefMessage[0]!.id = 'aB00';
  const out = prepare('android', input, origin);
  input.ndefMessage[0]!.payload[3] = 0; input.ndefMessage[0]!.type.push(85);
  assert.equal(out.snapshot.ndefMessage![0]!.id, 'aB00');
  assert.equal(out.snapshot.ndefMessage![0]!.payload[3], 72);
  assert.equal(out.projection[0]!.typeHex, '54');
  assert.deepEqual(Object.keys(out.snapshot), ['ndefMessage']);
  out.snapshot.ndefMessage![0]!.payload[3] = 65;
  assert.equal(out.projection[0]!.payloadHex, '02656e4869');
  assert.equal(load(out.sourceDocument, 'android').snapshot.ndefMessage![0]!.payload[3], 72);
});

test('missing, null and empty message stay distinct; optional ID stays missing', () => {
  for (const [input, status] of [[{}, 'missing'], [{ ndefMessage: null }, 'null'], [{ ndefMessage: [] }, 'empty-array']] as const) {
    const out = prepare('ios', input, origin); assert.equal(out.availability, status); assert.deepEqual(out.snapshot, input);
  }
  const r = { tnf: 5, type: [], payload: [] };
  const out = prepare('ios', { ndefMessage: [r] }, origin);
  assert.ok(!Object.hasOwn(out.snapshot.ndefMessage![0]!, 'id')); assert.equal(out.projection[0]!.idHex, null);
  assert.equal(prepare('ios', { ndefMessage: [{ ...r, id: [] }] }, origin).projection[0]!.idHex, '');
  assert.throws(() => prepare('ios', { ndefMessage: undefined }, origin));
  for (const id of [null, undefined]) assert.throws(() => prepare('ios', { ndefMessage: [{ ...r, id }] }, origin));
});

test('native shape is narrower than JS construction typings; platform mismatch rejects', () => {
  assert.throws(() => load(fixture('android'), 'ios'), /source mismatch/);
  assert.throws(() => prepare('web' as PhoneNdefPlatform, tag(), origin));
  for (const [p, id] of [['ios', ''], ['android', []]] as const) assert.throws(() => prepare(p, { ndefMessage: [{ ...record(), id }] }, origin));
  for (const type of ['T', '54', null, new Uint8Array([84])]) assert.throws(() => prepare('android', { ndefMessage: [{ ...record(), type }] }, origin));
  for (const id of ['a', '0x12', 'aa ', 'zz', '00'.repeat(256)]) assert.throws(() => prepare('android', { ndefMessage: [{ ...record(), id }] }, origin));
});

test('no getters execute, including on ignored top-level fields and array elements', () => {
  let reads = 0; const getter = () => { reads++; throw new Error('executed'); };
  for (const key of ['ndefMessage', 'ignored']) {
    const value = Object.defineProperty(tag(), key, { enumerable: true, get: getter }); assert.throws(() => prepare('android', value, origin));
  }
  for (const key of ['tnf', 'type', 'id', 'payload']) {
    const r = Object.defineProperty(record(), key, { enumerable: true, get: getter }); assert.throws(() => prepare('android', { ndefMessage: [r] }, origin));
  }
  const array = Object.defineProperty([84], '0', { enumerable: true, get: getter });
  assert.throws(() => prepare('android', { ndefMessage: [{ ...record(), type: array }] }, origin));
  const p = Object.defineProperty({ ...origin }, 'label', { enumerable: true, get: getter });
  assert.throws(() => prepare('android', tag(), p)); assert.equal(reads, 0);
});

test('reject non-data objects, holes, decorated arrays and invalid byte values', () => {
  for (const bad of [null, [], new Date(), Object.create(null), Object.create(tag())]) assert.throws(() => prepare('android', bad, origin));
  const decorated = [84]; Object.defineProperty(decorated, 'extra', { value: 1 });
  const symbolic = [84]; Object.defineProperty(symbolic, Symbol(), { value: 1 });
  class Special extends Array<number> {}
  for (const bad of [new Array(1), decorated, symbolic, new Special(84), [256], [-1], [-0], [NaN], [Infinity], [1.5], ['84'], [null]]) {
    assert.throws(() => prepare('android', { ndefMessage: [{ ...record(), type: bad }] }, origin));
  }
  const r = Object.defineProperty(record(), 'payload', { value: [], enumerable: false });
  assert.throws(() => prepare('android', { ndefMessage: [r] }, origin));
  for (const ndefMessage of [{}, 'records', new Array(2), [null], [new Date()]]) assert.throws(() => prepare('android', { ndefMessage }, origin));
});

test('counts and total bytes are bounded inclusively without truncation', () => {
  const empty = { tnf: 0, type: [], id: '', payload: [] };
  assert.equal(prepare('android', { ndefMessage: Array(64).fill(empty) }, origin).projection.length, 64);
  assert.throws(() => prepare('android', { ndefMessage: Array(65).fill(empty) }, origin));
  const opaque = { tnf: 5, type: [], id: '', payload: Array(8192).fill(255) };
  assert.equal(prepare('android', { ndefMessage: [opaque] }, origin).projection[0]!.payloadHex.length, 16384);
  assert.throws(() => prepare('android', { ndefMessage: [{ ...opaque, payload: Array(8193).fill(0) }] }, origin));
  assert.throws(() => prepare('android', { ndefMessage: [opaque, { ...opaque, payload: [1] }] }, origin));
  assert.throws(() => prepare('android', { ndefMessage: [{ ...opaque, id: 'ff' }] }, origin));
  assert.throws(() => prepare('android', { ndefMessage: [{ ...record(), type: Array(256).fill(1) }] }, origin));
  const maximum = prepare('android', { ndefMessage: [opaque] }, origin).sourceDocument;
  assert.ok(maximum.length < MAX_PHONE_NDEF_DOCUMENT_CHARACTERS);
  assert.equal(load(maximum + ' '.repeat(MAX_PHONE_NDEF_DOCUMENT_CHARACTERS - maximum.length), 'android').projection.length, 1);
  assert.throws(() => load(maximum + ' '.repeat(MAX_PHONE_NDEF_DOCUMENT_CHARACTERS - maximum.length + 1), 'android'));
});

test('logical TNF constraints reject fragments and inconsistent fields', () => {
  for (const tnf of [-1, -0, 6, 8, 1.5, NaN, '1', null]) assert.throws(() => prepare('android', { ndefMessage: [{ ...record(), tnf }] }, origin));
  for (const tnf of [0, 5, 7]) assert.throws(() => prepare('android', { ndefMessage: [{ ...record(), tnf }] }, origin));
  assert.equal(prepare('android', { ndefMessage: [{ tnf: 7, type: [], id: '', payload: [255] }] }, origin).projection[0]!.value.kind, 'opaque');
});

test('malformed known encodings reject, unknown types remain opaque and URI data stays inert', () => {
  for (const payload of [[], [0x40], [3, 101], [1, 255], [0, 0xc0, 0x80], [0, 0xed, 0xa0, 0x80], [0x80, 0], [0x80, 0xd8, 0]]) {
    assert.throws(() => prepare('android', { ndefMessage: [{ ...record(), payload }] }, origin), /encoding/);
  }
  assert.throws(() => prepare('android', { ndefMessage: [{ ...record(), type: [85], payload: [0, 255] }] }, origin));
  for (const type of [[83,112], [87], [], [255]]) assert.equal(prepare('android', { ndefMessage: [{ ...record(), type, payload: [255] }] }, origin).projection[0]!.value.kind, 'opaque');
  const malicious = 'javascript:alert(1)';
  assert.deepEqual(prepare('android', { ndefMessage: [{ ...record(), type: [85], payload: [0, ...Array.from(malicious, c => c.charCodeAt(0))] }] }, origin).projection[0]!.value,
    { kind: 'uri', prefixCode: 0, uri: malicious, actionable: false });
});

test('import refuses duplicated/extra fields, source/verification claims and unsupported formats', () => {
  const doc = fixture('android');
  assert.throws(() => load(doc.replace('"tnf": 1', '"tnf": 1, "t\\u006ef": 1'), 'android'), /Duplicate/);
  for (const mutate of [
    (d: any) => { d.source.version = '4.1.0'; }, (d: any) => { d.source.sdk = 'CoreNFC'; },
    (d: any) => { d.verification = { authenticated: true }; }, (d: any) => { d.snapshot.id = 'tag'; },
    (d: any) => { d.snapshot.ndefMessage[0].header = 0xd1; }, (d: any) => { d.provenance.origin = 'native-verified'; },
    (d: any) => { d.provenance.label = ''; }, (d: any) => { d.provenance.label = '\ud800'; },
    (d: any) => { d.provenance.label = 'x'.repeat(129); }, (d: any) => { delete d.source; },
    (d: any) => { d.inputKind = 'serialized-ndef-message'; }, (d: any) => { d.schemaVersion = 2; },
  ]) { const d = JSON.parse(doc); mutate(d); assert.throws(() => load(JSON.stringify(d), 'android')); }
  assert.throws(() => load('[[[[[[]]]]]]', 'android'), /depth/);
  assert.throws(() => importNdefObservation(doc)); assert.throws(() => prepareNdefEvidenceInput(doc));
});

test('UTF16 payload interpretation is reused without constructing message framing', () => {
  const out = prepare('android', { ndefMessage: [{ ...record(), payload: [0x80, 0xff, 0xfe, 0x48, 0] }] }, origin);
  assert.deepEqual(out.projection[0]!.value, { kind: 'text', language: '', text: 'H', encoding: 'utf-16le' });
});

test('deterministic generated opaque records roundtrip exact selected source', () => {
  let seed = 12345; const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let i = 0; i < 500; i++) {
    const p = i % 2 ? 'android' : 'ios';
    const idBytes = Array.from({ length: next() % 10 }, () => next() & 255);
    const r = { tnf: 2, type: [97], id: p === 'android' ? idBytes.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase() : idBytes,
      payload: Array.from({ length: next() % 64 }, () => next() & 255) };
    const input = { ndefMessage: [r] }, out = prepare(p, input, origin);
    assert.deepEqual(out.snapshot, input); assert.deepEqual(load(out.sourceDocument, p), out);
  }
});
