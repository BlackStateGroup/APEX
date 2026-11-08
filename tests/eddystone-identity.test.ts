import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpretBleServiceData, importBleObservation, summarizeBleObservation, MAX_AD_BYTES } from '../packages/core/ble-advertisements.ts';
const h = (value: number) => value.toString(16).padStart(2, '0');
const uid = '00ee000102030405060708090a0b0c0d0e0f0000';
const url = '10ee03676f6f2e676c2f417131387a46';
const decode = (payload: string) => interpretBleServiceData('feaa', payload);
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/eddystone-observations.json', import.meta.url), 'utf8'));

test('UID field offsets follow pinned specification; claimed namespace and instance are opaque identifiers', () => {
  assert.deepEqual(decode(uid), { status: 'format-match', format: 'Eddystone-UID', payloadHex: uid,
    namespaceHex: '00010203040506070809', instanceHex: '0a0b0c0d0e0f',
    calibratedTxPowerAtZeroMetersDbm: -18, authenticated: false });
});
test('URL spec example is decoded to inert text without canonicalization or navigation', () => {
  assert.deepEqual(decode(url), { status: 'format-match', format: 'Eddystone-URL', payloadHex: url,
    schemePrefixCode: 3, encodedUrlHex: url.slice(6), urlText: 'https://goo.gl/Aq18zF',
    calibratedTxPowerAtZeroMetersDbm: -18, authenticated: false });
  const reading = decode('1012032541322f2e2e2f3c3e');
  assert.ok('urlText' in reading);
  assert.equal(reading.urlText, 'https://%A2/../<>'); // wire text, not a URI validity/safety assertion
  assert.equal(reading.calibratedTxPowerAtZeroMetersDbm, 18);
});
test('every signed power octet is range checked in both frames', () => {
  for (let byte = 0; byte < 256; byte++) {
    const power = byte >= 128 ? byte - 256 : byte;
    for (const wire of ['00' + h(byte) + uid.slice(4), '10' + h(byte) + '03']) {
      const reading = decode(wire);
      assert.equal(reading.status, power >= -100 && power <= 20 ? 'format-match' : 'invalid');
      if ('calibratedTxPowerAtZeroMetersDbm' in reading) assert.equal(reading.calibratedTxPowerAtZeroMetersDbm, power);
    }
  }
});
test('UID strict length includes RFU; URL accepts zero through 17 encoded octets', () => {
  for (let length = 1; length <= 40; length++) {
    const wire = uid.slice(0, length * 2).padEnd(length * 2, '0');
    assert.equal(decode(wire).status, length === 20 ? 'format-match' : 'invalid');
  }
  for (let length = 1; length <= 40; length++) {
    const wire = ('100003' + '61'.repeat(38)).slice(0, length * 2);
    assert.equal(decode(wire).status, length >= 3 && length <= 20 ? 'format-match' : 'invalid');
  }
  assert.equal(decode('').status, 'opaque');
  assert.throws(() => decode('00'.repeat(MAX_AD_BYTES + 1)));
  assert.equal(decode('00'.repeat(MAX_AD_BYTES)).status, 'invalid');
  assert.equal(decode('100003' + '61'.repeat(MAX_AD_BYTES - 3)).status, 'invalid');
});
test('every reserved frame nibble and UID RFU value stays opaque without identity fields', () => {
  for (let value = 1; value < 256; value++) {
    for (const offset of [18, 19]) {
      const reading = decode(uid.slice(0, offset * 2) + h(value) + uid.slice(offset * 2 + 2));
      assert.equal(reading.status, 'opaque'); assert.equal('namespaceHex' in reading, false);
    }
  }
  for (let low = 1; low < 16; low++) for (const wire of [h(low) + uid.slice(2), h(0x10 + low) + url.slice(2)]) {
    assert.equal(decode(wire).status, 'opaque');
  }
  for (const wire of ['30' + uid.slice(2), '2001' + '00'.repeat(12), '40', 'ff']) assert.equal(decode(wire).status, 'opaque');
  for (const wire of [uid, url]) assert.equal(interpretBleServiceData('180f', wire).status, 'opaque');
});
test('all prefix, expansion, printable and reserved octets match exact spec tables', () => {
  const prefixes = ['http://www.', 'https://www.', 'http://', 'https://'];
  const expansions = ['.com/', '.org/', '.edu/', '.net/', '.info/', '.biz/', '.gov/', '.com', '.org', '.edu', '.net', '.info', '.biz', '.gov'];
  for (let code = 0; code < 256; code++) {
    const reading = decode('1000' + h(code));
    if (code < 4) { assert.ok('urlText' in reading); assert.equal(reading.urlText, prefixes[code]); }
    else { assert.equal(reading.status, 'opaque'); assert.equal('urlText' in reading, false); }
    for (let prefix = 0; prefix < 4; prefix++) {
      const result = decode('1000' + h(prefix) + '61' + h(code));
      if (code < 14 || code >= 0x21 && code <= 0x7e) {
        assert.ok('urlText' in result);
        assert.equal(result.urlText, prefixes[prefix] + 'a' + (expansions[code] ?? String.fromCharCode(code)));
      } else { assert.equal(result.status, 'opaque'); assert.equal('urlText' in result, false); }
    }
  }
});
test('Android/iOS fixtures give identical readings without upgrading provenance or exporting identifier/URL claims', () => {
  for (let i = 0; i < fixtures.length; i += 2) {
    const android = importBleObservation(JSON.stringify(fixtures[i]));
    const ios = importBleObservation(JSON.stringify(fixtures[i + 1]));
    assert.deepEqual(android.serviceReadings, ios.serviceReadings);
    assert.equal(android.rawAdvertising!.inputHex, fixtures[i].advertisingHex);
    assert.deepEqual(ios.normalizedFields!.serviceData, fixtures[i + 1].fields.serviceData.map((x: { payloadHex: string }) => ({ ...x, uuid: '0000feaa-0000-1000-8000-00805f9b34fb' })));
    for (const observation of [android, ios]) {
      assert.equal(observation.physicalReceptionVerified, false); assert.equal(observation.authenticatedIdentity, false);
      assert.equal(observation.provenance.origin, 'synthetic-fixture');
      const summary = summarizeBleObservation('fixture', 'a'.repeat(64), observation).summary;
      for (const privateValue of ['00010203040506070809', '0a0b0c0d0e0f', 'https://', 'goo.gl', 'Aq18zF', observation.provenance.label]) assert.ok(!summary.includes(privateValue));
    }
  }
});
test('deterministic malformed sweep never guesses unknown bytes, loses input or changes provenance', () => {
  let state = 0x12345678;
  for (let trial = 0; trial < 4000; trial++) {
    const octets = Array.from({ length: trial % 48 }, () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state >>> 24; });
    if (octets.length) octets[0] = trial % 2 ? 0x00 : 0x10;
    const wire = octets.map(h).join('');
    const result = decode(wire);
    assert.deepEqual(result, decode(wire));
    const input = { ...fixtures[1], fields: { ...fixtures[1].fields, serviceData: [{ uuid: 'feaa', payloadHex: wire }] } };
    const observation = importBleObservation(JSON.stringify(input));
    assert.equal(observation.normalizedFields!.serviceData[0]!.payloadHex, wire);
    assert.deepEqual(observation.serviceReadings[0]!.reading, result);
    if (result.status === 'format-match') {
      assert.ok('payloadHex' in result); assert.equal(result.payloadHex, wire); assert.equal(result.authenticated, false);
      if (result.format === 'Eddystone-UID') assert.equal(wire, '00' + h((result.calibratedTxPowerAtZeroMetersDbm + 256) % 256) + result.namespaceHex + result.instanceHex + '0000');
      else { assert.ok(result.format === 'Eddystone-URL'); assert.equal(wire, '10' + h((result.calibratedTxPowerAtZeroMetersDbm + 256) % 256) + h(result.schemePrefixCode) + result.encodedUrlHex); }
    }
  }
});
