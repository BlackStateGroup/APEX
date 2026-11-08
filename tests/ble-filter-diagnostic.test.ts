import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importBleObservation } from '../packages/core/ble-advertisements.ts';
import { explainBleFilter, formatBleFilterDiagnostic, BLE_FILTER_DIAGNOSTIC_LIMITS } from '../packages/core/ble-filter-diagnostic.ts';
const fixture = JSON.parse(readFileSync(new URL('../src/fixtures/bthome-observation.json', import.meta.url), 'utf8'));
function android(advertisingHex: string, dataStatus = 'complete') {
  return importBleObservation(JSON.stringify({ ...fixture, advertisingHex, dataStatus }));
}
const present = 'present';
const absent = 'not-present-in-supplied-source';
const unknown = 'cannot-assess';
test('canonical synthetic BTHome example carries service data but no UUID-list entry', () => {
  const observation = importBleObservation(JSON.stringify(fixture));
  const before = JSON.stringify(observation);
  assert.deepEqual(explainBleFilter(observation, 'FCD2'), { requestedService: 'FCD2', serviceData: present, androidUuidList: absent, platformDelivery: 'unverified' });
  assert.equal(JSON.stringify(observation), before);
  assert.equal(explainBleFilter(android(fixture.advertisingHex + '0303d2fc'), 'FCD2').androidUuidList, present);
});
test('separate explicit-list synthetic fixture is 30 AD bytes with unchanged 25°C / 50.55% payload', () => {
  const explicit = JSON.parse(readFileSync(new URL('../src/fixtures/bthome-explicit-uuid-observation.json', import.meta.url), 'utf8'));
  assert.equal(explicit.advertisingHex, '0201060303d2fc0b094449592d73656e736f720a16d2fc4002c40903bf13');
  assert.equal(explicit.advertisingHex.length / 2, 30);
  assert.equal(fixture.advertisingHex.length / 2, 26);
  assert.equal(explicit.provenance.origin, 'synthetic-fixture');
  assert.equal(explicit.provenance.capturedAt, null);
  assert.notEqual(explicit.provenance.label, fixture.provenance.label);
  const positive = importBleObservation(JSON.stringify(explicit));
  const canonical = importBleObservation(JSON.stringify(fixture));
  assert.equal(positive.rawAdvertising?.status, 'parsed');
  assert.deepEqual(positive.rawAdvertising?.elements.map(field => [field.offset, field.type]), [[0, 1], [3, 3], [7, 9], [19, 22]]);
  assert.equal(explainBleFilter(positive, 'fcd2').androidUuidList, present);
  assert.equal(explainBleFilter(canonical, 'fcd2').androidUuidList, absent);
  assert.deepEqual(positive.serviceReadings, canonical.serviceReadings);
  const reading = positive.serviceReadings[0]!.reading;
  assert.ok('format' in reading && reading.format === 'BTHome-v2');
  assert.equal(reading.parseStatus, 'complete');
  assert.deepEqual(reading.objects.map(object => [object.property, object.value, object.unit]),
    [['temperature', 25, '°C'], ['humidity', 50.55, '%']]);
  assert.equal(positive.physicalReceptionVerified, false);
  assert.equal(positive.authenticatedIdentity, false);
});
test('16/32/128-bit lists and requested UUID forms normalize independently of service data', () => {
  const uuid128le = 'fb349b5f8000008000100000d2fc0000';
  for (const list of ['0302d2fc', '0303d2fc', '0504d2fc0000', '0505d2fc0000', `1106${uuid128le}`, `1107${uuid128le}`]) {
    for (const uuid of ['FCD2', '0000FCD2', '0000FCD2-0000-1000-8000-00805F9B34FB']) {
      const result = explainBleFilter(android(list), uuid);
      assert.equal(result.androidUuidList, present, list);
      assert.equal(result.serviceData, absent);
    }
  }
  for (const ad of ['0316d2fc', '0520d2fc0000', `1121${uuid128le}`]) {
    assert.equal(explainBleFilter(android(ad), 'fcd2').serviceData, present);
    assert.equal(explainBleFilter(android(ad), 'fcd2').androidUuidList, absent);
  }
});
test('FEAA list and data are distinct; duplicate valid lists remain membership facts', () => {
  for (const uuid of ['FEAA', '0000feaa', '0000feaa-0000-1000-8000-00805f9b34fb']) {
    const result = explainBleFilter(android('0303aafe0316aafe0303aafe'), uuid);
    assert.equal(result.androidUuidList, present);
    assert.equal(result.serviceData, present);
  }
  assert.equal(explainBleFilter(android('0303aafe'), 'fcd2').androidUuidList, absent);
  assert.equal(explainBleFilter(android('0303d2fc0302aafe'), 'fcd2').androidUuidList, present);
});
test('service solicitation and lookalike unknown/name fields do not count as UUID lists', () => {
  for (const ad of ['0314d2fc', '03ffd2fc', '0309d2fc', '03fed2fc']) {
    const observation = android(ad);
    if (observation.rawAdvertising?.status === 'parsed') {
      assert.equal(explainBleFilter(observation, 'fcd2').androidUuidList, absent);
    } else {
      assert.equal(explainBleFilter(observation, 'fcd2').androidUuidList, unknown);
    }
  }
});
test('incomplete lists permit positive membership but not negative conclusions', () => {
  for (const ad of ['0302aafe', '0504aafe0000', '1106fb349b5f8000008000100000aafe0000', '0102']) {
    assert.equal(explainBleFilter(android(ad), 'fcd2').androidUuidList, unknown);
  }
  for (const status of ['unknown', 'truncated']) {
    assert.equal(explainBleFilter(android('', status), 'fcd2').androidUuidList, unknown);
    assert.equal(explainBleFilter(android('', status), 'fcd2').serviceData, unknown);
    assert.equal(explainBleFilter(android('0303d2fc0316d2fc', status), 'fcd2').androidUuidList, present);
    assert.equal(explainBleFilter(android('0303d2fc0316d2fc', status), 'fcd2').serviceData, present);
  }
});
test('malformed, unparsed, over-limit and unavailable sources cannot assess', () => {
  for (const ad of ['0203d2', '0403d2fc', '0303d2fc0203aa', '00ff', '0101'.repeat(129)]) {
    const result = explainBleFilter(android(ad), 'fcd2');
    assert.equal(result.androidUuidList, unknown, ad);
    assert.equal(result.serviceData, unknown, ad);
  }
  assert.equal(explainBleFilter(null, 'fcd2').serviceData, unknown);
  for (const uuid of ['180d', 'fcd2 ', 'x', '0001fcd2']) {
    assert.equal(explainBleFilter(android('0303d2fc'), uuid).requestedService, null);
    assert.equal(explainBleFilter(android('0303d2fc'), uuid).androidUuidList, unknown);
  }
});
test('iOS normalized fields never imply Android AD bytes or CoreBluetooth matching', () => {
  const observation = importBleObservation(JSON.stringify({ schemaVersion: 1, inputKind: 'ios-advertisement-fields',
    provenance: fixture.provenance, rssiDbm: null, fields: { localName: null, serviceUuids: ['fcd2'],
      serviceData: [{ uuid: '0000fcd2', payloadHex: '4002c409' }], manufacturerDataHex: null, txPowerDbm: null, isConnectable: null } }));
  assert.equal(explainBleFilter(observation, 'fcd2').serviceData, present);
  assert.equal(explainBleFilter(observation, 'feaa').serviceData, absent);
  assert.equal(explainBleFilter(observation, 'fcd2').androidUuidList, unknown);
  assert.equal(explainBleFilter(observation, 'fcd2').platformDelivery, 'unverified');
});
test('presentation scopes absence and explicitly disclaims capture, reception, identity and OS support', () => {
  assert.equal(formatBleFilterDiagnostic(explainBleFilter(android(fixture.advertisingHex), 'FCD2')),
    'FCD2: service data present; Android UUID-list entry not present in supplied source.');
  for (const phrase of ['not a full capture', 'OS scan result', 'Unknown scan-response', 'Reception, identity and device support remain unverified', 'iOS matching is not assessed', 'not general BTHome discovery']) {
    assert.ok(BLE_FILTER_DIAGNOSTIC_LIMITS.includes(phrase));
  }
});
