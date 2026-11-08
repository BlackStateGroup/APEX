import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { importBleObservation, interpretBleServiceData, parseBleAdvertisingHex, summarizeBleObservation, MAX_AD_BYTES, MAX_AD_ELEMENTS } from '../packages/core/ble-advertisements.ts';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/ble-observations.json', import.meta.url), 'utf8'));
const load = (index = 0) => importBleObservation(JSON.stringify(fixtures[index]));
const tlm = '20000bb81980000000010000000a';
const expectedTlm = { status: 'format-match', format: 'Eddystone-TLM-v0', batteryMillivolts: 3000, temperatureCelsius: 25.5, advertisementCount: 1, uptimeDeciseconds: 10, authenticated: false };

test('Android-shaped synthetic input decodes a documented public telemetry layout', () => {
  const result = load();
  assert.equal(result.rawAdvertising!.status, 'parsed');
  assert.deepEqual(result.serviceReadings[0]!.reading, expectedTlm);
  assert.deepEqual(result.rawAdvertising!.elements.map(x => x.offset), [0, 3, 7]);
  assert.equal(result.provenance.origin, 'synthetic-fixture');
  assert.equal(result.validation, 'offline-format-check');
  assert.equal(result.physicalReceptionVerified, false);
  assert.equal(result.authenticatedIdentity, false);
});
test('iOS normalized fixture yields the same telemetry without inventing raw bytes', () => {
  const result = load(1);
  assert.deepEqual(result.serviceReadings, load().serviceReadings);
  assert.equal(result.rawAdvertising, null);
  assert.equal(result.captureCompleteness, 'not-exposed');
  assert.equal(result.normalizedFields!.serviceUuids[0], '0000feaa-0000-1000-8000-00805f9b34fb');
});
test('unknown AD types, duplicate fields, names and signed TX power are preserved', () => {
  const fields = load(2).rawAdvertising!.elements;
  assert.deepEqual(fields[1]!.value, { kind: 'name', complete: true, text: 'APEX Lab' });
  assert.deepEqual(fields[2]!.value, { kind: 'tx-power', dbm: -20 });
  assert.deepEqual(fields.filter(x => x.type === 0xff).map(x => x.value), [
    { kind: 'manufacturer-data', companyId: 0x1234, payloadHex: '0102' },
    { kind: 'manufacturer-data', companyId: 0x1234, payloadHex: '0304' },
  ]);
  assert.deepEqual(fields.at(-1)!.value, { kind: 'unknown' });
  assert.equal(fields.at(-1)!.dataHex, 'deadbe');
});
test('16-, 32- and 128-bit UUIDs use little-endian AD encoding', () => {
  const values = parseBleAdvertisingHex('03030f180505785634121107ffeeddccbbaa99887766554433221100').elements.map(x => x.value);
  assert.deepEqual(values, [
    { kind: 'service-uuids', complete: true, uuids: ['0000180f-0000-1000-8000-00805f9b34fb'] },
    { kind: 'service-uuids', complete: true, uuids: ['12345678-0000-1000-8000-00805f9b34fb'] },
    { kind: 'service-uuids', complete: true, uuids: ['00112233-4455-6677-8899-aabbccddeeff'] },
  ]);
});
test('all service-data widths split UUID bytes from opaque payload without guessing', () => {
  for (const [input, uuid, payloadHex] of [
    ['04160f1864', '0000180f-0000-1000-8000-00805f9b34fb', '64'],
    ['062078563412aa', '12345678-0000-1000-8000-00805f9b34fb', 'aa'],
    ['1221ffeeddccbbaa99887766554433221100aa', '00112233-4455-6677-8899-aabbccddeeff', 'aa'],
  ]) {
    const value = parseBleAdvertisingHex(input!).elements[0]!.value;
    assert.deepEqual(value, { kind: 'service-data', uuid, payloadHex });
    assert.equal(interpretBleServiceData(uuid!, payloadHex!).status, 'opaque');
  }
});
test('UTF-8 names decode, invalid UTF-8 remains preserved with a diagnostic', () => {
  assert.deepEqual(parseBleAdvertisingHex('040941c3a9').elements[0]!.value, { kind: 'name', complete: true, text: 'Aé' });
  const bad = parseBleAdvertisingHex('0309c328');
  assert.equal(bad.status, 'malformed');
  assert.equal(bad.elements[0]!.dataHex, 'c328');
  assert.equal(bad.elements[0]!.value.kind, 'invalid');
});
test('truncated AD structure preserves parsed prefix and exact undecoded tail', () => {
  const result = parseBleAdvertisingHex('0201060416aa');
  assert.equal(result.status, 'malformed');
  assert.equal(result.elements.length, 1);
  assert.equal(result.unparsedHex, '0416aa');
  assert.deepEqual(result.issues, [{ offset: 3, code: 'truncated-element' }]);
});
test('only all-zero trailing padding is accepted, with no parsing beyond it', () => {
  assert.equal(parseBleAdvertisingHex('020106000000').paddingBytes, 3);
  const result = parseBleAdvertisingHex('02010600020106');
  assert.equal(result.elements.length, 1);
  assert.deepEqual(result.issues, [{ offset: 3, code: 'nonzero-padding' }]);
  assert.equal(result.unparsedHex, '00020106');
});
test('malformed known fields retain original bytes and do not abort later fields', () => {
  for (const input of ['0203aa', '02ff34', '0116', '020a80']) {
    const result = parseBleAdvertisingHex(`${input}01fe`);
    assert.equal(result.status, 'malformed');
    assert.equal(result.elements[0]!.value.kind, 'invalid');
    assert.equal(result.elements.at(-1)!.type, 0xfe);
  }
});
test('Flags allow zero or more octets as specified by CSS, without inventing missing flags', () => {
  assert.deepEqual(parseBleAdvertisingHex('0101').elements[0]!.value, { kind: 'flags', bytesHex: '' });
  assert.deepEqual(parseBleAdvertisingHex('03010601').elements[0]!.value, { kind: 'flags', bytesHex: '0601' });
  assert.equal(parseBleAdvertisingHex('').elements.length, 0);
});
test('host capture truncation is separate from structurally valid AD bytes', () => {
  const input = { ...fixtures[0], dataStatus: 'truncated' };
  const result = importBleObservation(JSON.stringify(input));
  assert.equal(result.rawAdvertising!.status, 'parsed');
  assert.equal(result.captureCompleteness, 'truncated');
  assert.equal(result.physicalReceptionVerified, false);
});
test('TLM uses big-endian unsigned counters and signed fixed-point temperature', () => {
  assert.deepEqual(interpretBleServiceData('FEAA', '20000bb8fd80ffffffffffffffff'), {
    ...expectedTlm, temperatureCelsius: -2.5, advertisementCount: 4294967295, uptimeDeciseconds: 4294967295,
  });
  assert.deepEqual(interpretBleServiceData('feaa', '2000000080000000000000000000'), {
    ...expectedTlm, temperatureCelsius: null, batteryMillivolts: null, advertisementCount: 0, uptimeDeciseconds: 0,
  });
});
test('unknown, encrypted, future-version and incomplete TLM are not guessed', () => {
  for (const [uuid, payload] of [['180f', tlm], ['feaa', '2001' + tlm.slice(4)], ['feaa', '3000'], ['feaa', '20'], ['feaa', '']]) {
    assert.equal(interpretBleServiceData(uuid!, payload!).status, 'opaque');
  }
  assert.equal(interpretBleServiceData('feaa', tlm.slice(0, -2)).status, 'invalid');
  assert.equal(interpretBleServiceData('feaa', tlm + '00').status, 'invalid');
});
test('hex format, byte and element bounds are enforced', () => {
  for (const value of ['a', '0x00', '00 01', 'gg', '0\n', '00'.repeat(MAX_AD_BYTES + 1)]) assert.throws(() => parseBleAdvertisingHex(value));
  assert.equal(parseBleAdvertisingHex('').status, 'parsed');
  assert.equal(parseBleAdvertisingHex('00'.repeat(MAX_AD_BYTES)).paddingBytes, MAX_AD_BYTES);
  const excessive = parseBleAdvertisingHex('01fe'.repeat(MAX_AD_ELEMENTS + 1));
  assert.equal(excessive.elements.length, MAX_AD_ELEMENTS);
  assert.equal(excessive.status, 'limit-exceeded');
  assert.equal(excessive.issues.at(-1)!.code, 'element-limit');
  assert.equal(excessive.unparsedHex, '01fe');
});
test('strict offline envelope rejects native claims and fabricated extra fields', () => {
  for (const input of [
    { ...fixtures[0], schemaVersion: 2 },
    { ...fixtures[0], command: 'connect' },
    { ...fixtures[0], physicalReceptionVerified: true },
    { ...fixtures[0], rssiDbm: 127 },
    { ...fixtures[0], dataStatus: 'attested' },
    { ...fixtures[0], provenance: { ...fixtures[0].provenance, origin: 'native-android' } },
    { ...fixtures[0], provenance: { ...fixtures[0].provenance, capturedAt: '2026-11-07T00:00:00.000Z' } },
    { ...fixtures[1], advertisingHex: fixtures[0].advertisingHex },
    { ...fixtures[1], fields: { ...fixtures[1].fields, rawPacket: '00' } },
  ]) assert.throws(() => importBleObservation(JSON.stringify(input)));
  assert.throws(() => importBleObservation(' '.repeat(16385)));
  assert.throws(() => importBleObservation('null'));
});
test('recorded imports retain source-supplied timestamps without attesting physical reception', () => {
  const input = { ...fixtures[0], provenance: { origin: 'recorded-import', label: 'Test envelope, not a real capture', capturedAt: '2026-11-07T00:00:00.000Z' } };
  const result = importBleObservation(JSON.stringify(input));
  assert.equal(result.provenance.origin, 'recorded-import');
  assert.equal(result.physicalReceptionVerified, false);
  for (const date of [null, 'not-a-date', '2026-02-30T00:00:00.000Z']) assert.throws(() => importBleObservation(JSON.stringify({ ...input, provenance: { ...input.provenance, capturedAt: date } })));
});
test('iOS normalized values have strict field, aggregate and dictionary limits', () => {
  for (const fields of [
    { ...fixtures[1].fields, serviceUuids: ['bad'] },
    { ...fixtures[1].fields, serviceUuids: Array(33).fill('180f') },
    { ...fixtures[1].fields, localName: 'x'.repeat(249) },
    { ...fixtures[1].fields, txPowerDbm: 128 },
    { ...fixtures[1].fields, isConnectable: 'yes' },
    { ...fixtures[1].fields, manufacturerDataHex: '01' },
    { ...fixtures[1].fields, serviceData: [{ uuid: 'feaa', payloadHex: '00' }, { uuid: '0000FEAA-0000-1000-8000-00805f9b34fb', payloadHex: '01' }] },
    { ...fixtures[1].fields, serviceData: [{ uuid: '180f', payloadHex: '00'.repeat(1000) }, { uuid: '180a', payloadHex: '00'.repeat(1000) }] },
  ]) assert.throws(() => importBleObservation(JSON.stringify({ ...fixtures[1], fields })));
  const fields = { ...fixtures[1].fields, manufacturerDataHex: '34120102', txPowerDbm: 127, isConnectable: null };
  assert.equal(importBleObservation(JSON.stringify({ ...fixtures[1], fields })).normalizedFields!.manufacturerDataHex, '34120102');
});
test('metadata-only summaries fit existing hypothesis input and omit raw private values', () => {
  const input = JSON.stringify(fixtures[2]);
  const digest = createHash('sha256').update(input).digest('hex');
  const summary = summarizeBleObservation('ble:fixture:3', digest, load(2));
  assert.equal(summary.kind, 'signal-metadata');
  assert.equal(summary.inputSha256, digest);
  assert.ok(summary.summary.length <= 1024);
  assert.match(summary.summary, /synthetic-fixture/);
  assert.match(summary.summary, /physical reception unverified/);
  for (const privateValue of ['APEX Lab', 'deadbe', '0102', fixtures[2].provenance.label]) assert.ok(!summary.summary.includes(privateValue));
  assert.throws(() => summarizeBleObservation('bad id', digest, load()));
  assert.throws(() => summarizeBleObservation('good-id', 'wrong-hash', load()));
});
test('deterministic malformed-input sweep is bounded and retains every byte', () => {
  let seed = 0x12345678;
  for (let trial = 0; trial < 2000; trial++) {
    const data = Array.from({ length: trial % 256 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 24; });
    const input = data.map(x => x.toString(16).padStart(2, '0')).join('');
    const result = parseBleAdvertisingHex(input);
    assert.equal(result.inputHex, input);
    assert.ok(result.elements.length <= MAX_AD_ELEMENTS);
    let reconstructed = result.elements.map(x => ((x.dataHex.length / 2) + 1).toString(16).padStart(2, '0') + x.type.toString(16).padStart(2, '0') + x.dataHex).join('');
    reconstructed += result.unparsedHex + '00'.repeat(result.paddingBytes);
    assert.equal(reconstructed, input);
  }
});
