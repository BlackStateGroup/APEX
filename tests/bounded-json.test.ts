import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBoundedJson } from '../packages/core/bounded-json.ts';
import { importBleObservation, MAX_IMPORT_CHARACTERS } from '../packages/core/ble-advertisements.ts';
import { prepareBlePlxSourceEvidenceInput, prepareBlePlxSourceEvidenceDocument } from '../packages/core/ble-plx-source-evidence.ts';
const parse = (text: string, depth = 4) => parseBoundedJson(text, 16384, depth);
const provenance = { origin: 'synthetic-fixture' as const, label: 'JSON boundary test', capturedAt: null };
const android = JSON.stringify({ schemaVersion: 1, inputKind: 'android-scan-record', provenance, rssiDbm: null, advertisingHex: '', dataStatus: 'complete' });
const source = () => prepareBlePlxSourceEvidenceInput('android', { rawScanRecord: '', serviceData: { FCD2: 'QAAZ' } }, provenance).payload.document;

test('bounded JSON preserves native JSON values, keys, escapes and object semantics', () => {
  for (const text of [
    'null', 'true', 'false', '-0', '1e400', '0.01e-12', '"\\ud800"',
    '{"__proto__":{"constructor":1},"toString":2,"":3}',
    '{"x":"[{}] \\\" : \\\\ end","array":[{},[],{"x":null}],"unicode":"😀"}',
    '{"a":1,"A":2,"é":3,"e\\u0301":4}',
    ' \r\n\t {"x":[1,-2,3.5e+6,true,false,null,"\\b\\f\\n\\r\\t\\/"]} \n',
  ]) assert.deepEqual(parse(text), JSON.parse(text));
  assert.equal(Object.hasOwn(parse('{"__proto__":1}') as object, '__proto__'), true);
  assert.equal(Object.getPrototypeOf(parse('{"__proto__":1}')), Object.prototype);
});

test('duplicate keys reject per object after JSON escape decoding, including special names', () => {
  for (const text of [
    '{"a":1,"a":1}', '{"a":1,"\\u0061":2}', '{"\\u0061":1,"a":2}',
    '{"😀":1,"\\ud83d\\ude00":2}', '{"\\ud800":1,"\\ud800":2}',
    '{"__proto__":1,"__proto__":2}', '{"":1,"":2}',
    '{"a":[{"b":1,"\\u0062":2}]}', '{"a\\\"b":1,"a\\u0022b":2}',
  ]) assert.throws(() => parse(text), /Duplicate JSON/);
  assert.deepEqual(parse('[{"a":1},{"a":2}]'), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parse('{"a":{"a":2}}'), { a: { a: 2 } });
});

test('malformed JSON is rejected rather than repaired or treated as a duplicate-key scan', () => {
  for (const text of ['', ' ', '{', '[', '}', ']', '{]', '[}', '[1,]', '{"a":1,}', '{a:1}',
    '{"a" 1}', '{"a":}', '{"a":1 "b":2}', '[1 2]', 'true false', '{}{}',
    '01', '+1', '.1', '1.', '1e', '1e+', 'NaN', 'undefined', 'True', 'nullx',
    '"unterminated', '"\\"', '"\\x20"', '"\\u123"', '"\\uZZZZ"', '"\n"',
    '\ufeff{}', '\u00a0{}', '{/*comment*/}', '{"a": [}', '"a":1',
  ]) assert.throws(() => parse(text), Error, text);
});

test('depth and character bounds are exact, strings cannot simulate structure', () => {
  assert.deepEqual(parse('[[[[]]]]'), [[[[]]]]);
  assert.throws(() => parse('[[[[[]]]]]'), /depth limit/);
  assert.throws(() => parse('['.repeat(4000) + '0' + ']'.repeat(4000)), /depth limit/);
  assert.throws(() => parse('{"a":'.repeat(1000) + '0' + '}'.repeat(1000)), /depth limit/);
  assert.equal(parse(JSON.stringify('[{'.repeat(2000) + '\\"}]'.repeat(2000))), '[{'.repeat(2000) + '\\"}]'.repeat(2000));
  assert.equal(parseBoundedJson('0 ', 2, 0), 0);
  assert.throws(() => parseBoundedJson('0  ', 2, 0), /character limit/);
  assert.throws(() => parseBoundedJson('{}', 2, 0), /depth limit/);
  for (const [characters, depth] of [[-1, 1], [1.5, 1], [Infinity, 1], [4, -1], [4, 65], [4, NaN]]) {
    assert.throws(() => parseBoundedJson('0', characters!, depth!), /Invalid JSON limits/);
  }
});

test('BLE envelopes reject overwritten claims at every supported object level and escaped aliases', () => {
  for (const key of ['schemaVersion', 'schema\\u0056ersion']) {
    assert.throws(() => importBleObservation(android.replace('{', `{"${key}":999,`)), /Duplicate JSON/);
  }
  assert.throws(() => importBleObservation(android.replace('"origin":', '"origin":"native-verified","origin":')), /Duplicate JSON/);
  assert.throws(() => importBleObservation(android.replace('{', '{"schemaVersion":' + '['.repeat(1000) + '0' + ']'.repeat(1000) + ',')), /depth limit/);
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/ble-observations.json', import.meta.url), 'utf8'));
  const ios = JSON.stringify(fixtures[1]);
  assert.throws(() => importBleObservation(ios.replace('"localName":', '"localName":"hidden","localName":')), /Duplicate JSON/);
  assert.throws(() => importBleObservation(ios.replace('"uuid":', '"uuid":"hidden","\\u0075uid":')), /Duplicate JSON/);
  assert.deepEqual(importBleObservation(android.padEnd(MAX_IMPORT_CHARACTERS)), importBleObservation(android));
  assert.throws(() => importBleObservation(android.padEnd(MAX_IMPORT_CHARACTERS + 1)), /size limit/);
  assert.throws(() => importBleObservation(android.replace('"rssiDbm":null', '"rssiDbm":[[[[0]]]]')), /depth limit/);
  for (const fixture of fixtures) assert.doesNotThrow(() => importBleObservation(JSON.stringify(fixture)));
});

test('selected source documents reject duplicates and deep values while preserving exact valid bytes', () => {
  const document = source();
  for (const text of [
    document.replace('{', '{"platform":"ios",'),
    document.replace('"origin":', '"origin":"native-verified","origi\\u006e":'),
    document.replace('"rawScanRecord":', '"rawScanRecord":"hidden","rawScanRecord":'),
    document.replace('"FCD2":', '"FCD2":"AAAA","FCD\\u0032":'),
  ]) assert.throws(() => prepareBlePlxSourceEvidenceDocument(text), /Duplicate JSON/);
  assert.throws(() => prepareBlePlxSourceEvidenceDocument(document.replace('"id":null', '"id":[[0]]')), /depth limit/);
  assert.throws(() => prepareBlePlxSourceEvidenceDocument(document.replace('{', '{"platform":' + '['.repeat(1000) + '0' + ']'.repeat(1000) + ',')), /depth limit/);
  const exact = ('\t' + JSON.stringify(JSON.parse(document), null, 2) + '\r\n').padEnd(4096);
  assert.equal(prepareBlePlxSourceEvidenceDocument(exact).payload.document, exact);
  assert.throws(() => prepareBlePlxSourceEvidenceDocument(exact + ' '), /bounded exact/);
  const braceLabel = document.replace('JSON boundary test', '[{\\"a\\":1}]');
  assert.equal(prepareBlePlxSourceEvidenceDocument(braceLabel).payload.document, braceLabel);
});

test('deterministic bounded fuzz agrees with JSON.parse on unique-key values and rejects injected aliases', () => {
  let seed = 0x12345678;
  const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  function generated(depth: number): unknown {
    if (depth === 0) return [null, false, true, -0, 1.2e30, '[{}]\\"', '\ud800', '😀'][random(8)];
    const size = random(5);
    return random(2) ? Array.from({ length: size }, () => generated(depth - 1)) :
      Object.fromEntries(Array.from({ length: size }, (_, i) => [`key${i}`, generated(depth - 1)]));
  }
  for (let i = 0; i < 1000; i++) {
    const text = JSON.stringify(generated(4));
    assert.deepEqual(parse(text), JSON.parse(text));
    assert.throws(() => parse('{"key":' + text + ',"\\u006bey":0}', 5), /Duplicate JSON/);
    // Mutate a generated document; any accepted result must equal native parsing.
    const position = random(text.length + 1);
    const mutated = text.slice(0, position) + ['}', ':', ',', '"', '\\', '\n', '0'][random(7)] + text.slice(position);
    let actual: unknown;
    try { actual = parse(mutated, 5); } catch { continue; }
    assert.deepEqual(actual, JSON.parse(mutated));
  }
});
