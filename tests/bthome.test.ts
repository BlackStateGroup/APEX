import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpretBleServiceData, importBleObservation, summarizeBleObservation, MAX_AD_BYTES, MAX_BTHOME_OBJECTS } from '../packages/core/ble-advertisements.ts';
const decode = (hex: string) => {
  const reading = interpretBleServiceData('FCD2', hex);
  assert.ok('format' in reading && reading.format === 'BTHome-v2');
  return reading;
};
const fixture = JSON.parse(readFileSync(new URL('./fixtures/bthome-observation.json', import.meta.url), 'utf8'));
const values = (hex: string) => decode(hex).objects.map(x => x.value);

test('official advertising example imports offline and retains source provenance', () => {
  const observation = importBleObservation(JSON.stringify(fixture));
  assert.equal(observation.rawAdvertising!.status, 'parsed');
  assert.equal(observation.provenance.origin, 'synthetic-fixture');
  assert.equal(observation.physicalReceptionVerified, false);
  assert.equal(observation.authenticatedIdentity, false);
  const reading = decode('4002c40903bf13');
  assert.deepEqual(observation.serviceReadings[0]!.reading, reading);
  assert.equal(reading.status, 'format-match');
  assert.equal(reading.parseStatus, 'complete');
  assert.equal(reading.sensorTruthVerified, false);
  assert.equal(reading.authenticated, false);
  assert.deepEqual(reading.objects.map(x => [x.offset, x.objectId, x.rawInteger, x.scaleDivisor, x.value]), [[1, 2, 2500, 100, 25], [4, 3, 5055, 100, 50.55]]);
});
test('original numeric IDs match official wire examples (packet-id is synthetic)', () => {
  for (const [wire, value] of [
    ['0001', 1], ['0161', 97], ['02ca09', 25.06], ['03bf13', 50.55],
    ['04138a01', 1008.83], ['05138a14', 13460.67], ['0c020c', 3.074],
    ['12e204', 1250], ['2e23', 35], ['451101', 27.3], ['57ea', -22],
    ['5bea0234ea', -365690134], ['5c02fbffff', -12.78],
  ] as const) assert.deepEqual(values('40' + wire), [value], wire);
});
test('signed little-endian minima, maxima, negative one and zero are numeric, not invented sentinels', () => {
  for (const [id, width, divisor] of [[0x02, 2, 100], [0x45, 2, 10], [0x57, 1, 1], [0x5b, 4, 1], [0x5c, 4, 100]]) {
    for (const n of [-(2 ** (8 * width! - 1)), 2 ** (8 * width! - 1) - 1, -1, 0]) {
      let unsigned = n < 0 ? n + 2 ** (width! * 8) : n;
      let wire = id!.toString(16).padStart(2, '0');
      for (let i = 0; i < width!; i++) { wire += (unsigned % 256).toString(16).padStart(2, '0'); unsigned = Math.floor(unsigned / 256); }
      const reading = decode('40' + wire).objects[0]!;
      assert.equal(reading.rawInteger, n); assert.equal(reading.value, n / divisor!);
    }
  }
});
test('unsigned 8, 16, 24-bit extrema stay unsigned without range clamping', () => {
  for (const [wire, expected] of [['01ff',255], ['03ffff',655.35], ['04ffffff',167772.15], ['0cffff',65.535], ['0100',0]] as const) {
    assert.deepEqual(values('40' + wire), [expected]);
  }
});
test('ordered repeated object IDs retain every occurrence and byte position', () => {
  const result = decode('4002010002ffff020080');
  assert.equal(result.parseStatus, 'complete');
  assert.deepEqual(result.objects.map(x => [x.occurrence, x.offset, x.value]), [[1,1,0.01], [2,4,-0.01], [3,7,-327.68]]);
  assert.equal('40' + result.objects.map(x => x.rawHex).join(''), result.payloadHex);
});
test('descending IDs stop without reordering or overwriting the parsed prefix', () => {
  const result = decode('40030100020100');
  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.issues, [{ offset: 4, code: 'object-order' }]);
  assert.equal(result.unparsedHex, '020100');
  assert.equal(result.objects.length, 1);
});
test('unsupported object IDs stop at the ID, with no guessed length or resynchronization', () => {
  for (const unknown of ['0f', '3a', '53', '54', 'ff']) {
    const result = decode('400101' + unknown + '02c409');
    assert.equal(result.status, 'opaque'); assert.equal(result.parseStatus, 'unsupported-object');
    assert.equal(result.objects.length, 1); assert.equal(result.unparsedHex, unknown + '02c409');
    assert.deepEqual(result.issues, [{ offset: 3, code: 'unknown-object' }]);
  }
});
test('all proper prefixes of each supported field preserve the truncated ID and bytes', () => {
  for (const field of ['0000','0100','020000','030000','04000000','05000000','0c0000','120000','2e00','450000','5700','5b00000000','5c00000000']) {
    for (let cut = 2; cut < field.length; cut += 2) {
      const result = decode('40' + field.slice(0, cut));
      assert.equal(result.status, 'invalid'); assert.equal(result.objects.length, 0);
      assert.deepEqual(result.issues, [{ offset: 1, code: 'truncated-object' }]);
      assert.equal(result.unparsedHex, field.slice(0, cut));
    }
  }
  assert.equal(decode('').issues[0]!.code, 'missing-header');
  assert.equal(decode('40').issues[0]!.code, 'missing-object');
});
test('every header byte gates version, encryption and reserved bits before measurements', () => {
  for (let header = 0; header < 256; header++) {
    const payload = header.toString(16).padStart(2, '0') + '02c409';
    const result = decode(payload);
    if (header === 0x40 || header === 0x44) {
      assert.equal(result.status, 'format-match'); assert.equal(result.triggerBased, header === 0x44);
    } else {
      assert.equal(result.status, 'opaque'); assert.equal(result.objects.length, 0);
      assert.equal(result.unparsedHex, payload); assert.equal(result.triggerBased, null);
    }
  }
});
test('official encrypted example and plausible plaintext with encryption flag stay opaque', () => {
  for (const payload of ['41e445f3c9962b332211006c7c4519', '4102c40903bf13', '45', 'ff02c409']) {
    const result = decode(payload);
    assert.equal(result.status, 'opaque'); assert.equal(result.objects.length, 0);
    assert.equal(result.payloadHex, payload); assert.match(result.reason!, /Encrypted/);
  }
});
test('object and common input bounds are enforced at exact boundaries', () => {
  assert.equal(decode('40' + '0000'.repeat(MAX_BTHOME_OBJECTS)).status, 'format-match');
  const result = decode('40' + '0000'.repeat(MAX_BTHOME_OBJECTS + 1));
  assert.equal(result.objects.length, MAX_BTHOME_OBJECTS); assert.equal(result.parseStatus, 'limit-exceeded');
  assert.equal(result.unparsedHex, '0000');
  assert.equal(decode('41' + '00'.repeat(MAX_AD_BYTES - 1)).status, 'opaque');
  for (const invalid of ['00'.repeat(MAX_AD_BYTES + 1), 'f', 'ff ', 'zz', '0x40']) assert.throws(() => decode(invalid));
});
test('iOS and recorded envelopes preserve provenance without an identity or native claim', () => {
  const input = { schemaVersion: 1, inputKind: 'ios-advertisement-fields', rssiDbm: null,
    provenance: { origin: 'recorded-import', label: 'Synthetic test of recorded envelope, not actual reception', capturedAt: '2026-11-07T00:00:00.000Z' },
    fields: { localName: null, serviceUuids: ['FCD2'], serviceData: [{ uuid: 'FCD2', payloadHex: '4002c40903bf13' }], manufacturerDataHex: null, txPowerDbm: null, isConnectable: null } };
  const result = importBleObservation(JSON.stringify(input));
  assert.deepEqual(result.provenance, input.provenance); assert.equal(result.rawAdvertising, null);
  assert.equal(result.captureCompleteness, 'not-exposed'); assert.equal(result.physicalReceptionVerified, false);
  assert.equal(result.authenticatedIdentity, false);
  assert.deepEqual(result.serviceReadings[0]!.reading, decode('4002c40903bf13'));
});
test('summary distinguishes TLM and BTHome counts and exports no measurement or label', () => {
  const observation = importBleObservation(JSON.stringify(fixture));
  const summary = summarizeBleObservation('bthome-test', 'a'.repeat(64), observation).summary;
  assert.match(summary, /public TLM v0 format matches=0/);
  assert.match(summary, /public BTHome v2 complete format matches=1/);
  for (const secret of ['50.55', 'c409', fixture.provenance.label]) assert.ok(!summary.includes(secret));
  assert.ok(summary.length <= 1024);
});
test('deterministic malformed sweep preserves every byte and never exceeds object bound', () => {
  let state = 0x12345678;
  for (let trial = 0; trial < 4000; trial++) {
    const octets = Array.from({ length: trial % 512 }, () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state >>> 24; });
    // Exercise supported headers often enough to hit object parsing, not just rejection.
    if (octets.length && trial % 2 === 0) octets[0] = 0x40;
    const payload = octets.map(x => x.toString(16).padStart(2, '0')).join('');
    const result = decode(payload);
    assert.deepEqual(result, decode(payload)); assert.equal(result.payloadHex, payload);
    assert.ok(result.objects.length <= MAX_BTHOME_OBJECTS);
    const prefix = result.parseStatus === 'opaque' || result.deviceInfo === null ? '' : payload.slice(0,2);
    assert.equal(prefix + result.objects.map(x => x.rawHex).join('') + result.unparsedHex, payload);
    for (const object of result.objects) assert.ok(Number.isFinite(object.value));
  }
});
