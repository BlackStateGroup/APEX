import test from 'node:test';
import assert from 'node:assert/strict';
import { matchBlePlxSelectedServiceData as match } from '../packages/core/ble-plx-service-data-filter.ts';
import { MAX_AD_BYTES, MAX_AD_ELEMENTS } from '../packages/core/ble-advertisements.ts';
import { MAX_PLX_SERVICE_DATA_ENTRIES, MAX_PLX_SNAPSHOT_CHARACTERS } from '../packages/core/ble-plx-observation.ts';
import { prepareBlePlxSourceEvidenceInput } from '../packages/core/ble-plx-source-evidence.ts';
const b64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64');
const raw = (hex: string) => ({ rawScanRecord: b64(hex) });
const map = (serviceData: unknown) => ({ serviceData });
const uuid = '0000fcd2-0000-1000-8000-00805f9b34fb';
const fcd2 = '0616d2fc400164';

test('service-data-only FCD2 matches, service lists/name/RSSI/identity never establish membership', () => {
  assert.deepEqual(match('android', raw('020106' + fcd2), 'FCD2'), { status: 'match', source: 'android-ad-bytes', service: 'FCD2' });
  for (const fields of [raw('0303d2fc'), { ...raw(''), name: 'FCD2', id: uuid, rssi: -10, serviceUUIDs: [uuid] }]) {
    assert.equal(match('android', fields, 'FCD2').status, 'no-match');
  }
  assert.equal(match('ios', { serviceUUIDs: [uuid], serviceData: {} }, 'FCD2').status, 'no-match');
  assert.equal(match('ios', map({ [uuid]: b64('400164') }), 'FCD2').status, 'match');
  assert.equal(match('android', raw(fcd2), 'FEAA').status, 'no-match');
  assert.equal(match('android', raw('0416aafeee'), 'FEAA').status, 'match');
});

test('Android raw source wins contradictions; no normalized fallback; iOS never parses raw AD', () => {
  assert.equal(match('android', { ...raw(fcd2), serviceData: {} }, 'FCD2').status, 'match');
  assert.equal(match('android', { ...raw(''), serviceData: { FCD2: '' } }, 'FCD2').status, 'no-match');
  assert.equal(match('android', map({ FCD2: '' }), 'FCD2').status, 'unavailable');
  assert.equal(match('android', { rawScanRecord: '!', serviceData: { FCD2: '' } }, 'FCD2').status, 'malformed');
  assert.equal(match('ios', raw(fcd2), 'FCD2').status, 'unavailable');
  assert.equal(match('ios', { ...raw(fcd2), serviceData: {} }, 'FCD2').status, 'no-match');
  assert.equal(match('ios', { rawScanRecord: '!', serviceData: { FCD2: '' } }, 'FCD2').status, 'match');
});

test('missing, null and undefined differ from valid empty sources; inherited source is unavailable', () => {
  for (const platform of ['android', 'ios'] as const) {
    const key = platform === 'android' ? 'rawScanRecord' : 'serviceData';
    for (const device of [{}, { [key]: undefined }, { [key]: null }, Object.create({ [key]: platform === 'android' ? b64(fcd2) : { FCD2: '' } })]) {
      assert.equal(match(platform, device, 'FCD2').status, 'unavailable');
    }
    for (const device of [null, [], 1, 'x', () => {}]) assert.equal(match(platform, device, 'FCD2').status, 'malformed');
  }
  assert.equal(match('android', raw(''), 'FCD2').status, 'no-match');
  assert.equal(match('ios', map({}), 'FCD2').status, 'no-match');
});

test('UUID widths and case normalize; all dictionary aliases reject, even unrelated aliases', () => {
  for (const key of ['fcd2', 'FCD2', '0000FCD2', uuid, uuid.toUpperCase()]) {
    assert.equal(match('ios', map({ [key]: '' }), 'FCD2').status, 'match');
  }
  for (const aliases of [{ FCD2: '', fcd2: '' }, { FCD2: '', [uuid]: '' }, { FCD2: '', '180f': '', '0000180F': '' }]) {
    assert.equal(match('ios', map(aliases), 'FCD2').status, 'malformed');
  }
  for (const key of [' FCD2', '0xfcd2', '', 'x'.repeat(37), '__proto__']) {
    assert.equal(match('ios', map({ [key]: '' }), 'FCD2').status, 'malformed');
  }
  assert.equal(match('android', raw('0520d2fc0000'), 'FCD2').status, 'match');
  assert.equal(match('android', raw('1121fb349b5f8000008000100000d2fc0000'), 'FCD2').status, 'match');
});

test('duplicate selected raw payloads reject even when equal, empty or in different UUID widths', () => {
  for (const hex of [fcd2 + fcd2, '0316d2fc0316d2fc', fcd2 + '0520d2fc0000']) {
    assert.equal(match('android', raw(hex), 'FCD2').status, 'malformed');
  }
  assert.equal(match('android', raw(fcd2 + '03160f1803160f18'), 'FCD2').status, 'match');
});

test('strict raw framing and existing element limit checked through entire source, not first match', () => {
  for (const hex of [fcd2 + '0516d2', fcd2 + '00ff', fcd2 + '0216d2', fcd2 + '0203ff']) {
    assert.equal(match('android', raw(hex), 'FCD2').status, 'malformed');
  }
  assert.equal(match('android', raw(fcd2 + '01ee'.repeat(MAX_AD_ELEMENTS - 1)), 'FCD2').status, 'match');
  assert.equal(match('android', raw(fcd2 + '01ee'.repeat(MAX_AD_ELEMENTS)), 'FCD2').status, 'malformed');
});

test('payloads are service membership only: empty, unknown and encrypted data all match', () => {
  for (const payload of ['', 'ff', '41aabbcc', '4001']) {
    const hex = (3 + payload.length / 2).toString(16).padStart(2, '0') + '16d2fc' + payload;
    assert.equal(match('android', raw(hex), 'FCD2').status, 'match');
    assert.equal(match('ios', map({ FCD2: b64(payload) }), 'FCD2').status, 'match');
  }
  assert.equal(match('ios', map({ FEAA: b64('ff') }), 'FEAA').status, 'match');
});

test('source and map accessors are never invoked; unrelated callback fields are never read', () => {
  let calls = 0;
  const hostile = () => { calls++; throw new Error('must not run'); };
  for (const platform of ['android', 'ios'] as const) {
    const key = platform === 'android' ? 'rawScanRecord' : 'serviceData';
    assert.equal(match(platform, Object.defineProperty({}, key, { get: hostile }), 'FCD2').status, 'malformed');
    const device = platform === 'android' ? raw(fcd2) : map({ FCD2: '' });
    for (const field of ['id', 'name', 'rssi', 'toJSON', 'serviceUUIDs', platform === 'android' ? 'serviceData' : 'rawScanRecord']) {
      Object.defineProperty(device, field, { get: hostile });
    }
    assert.equal(match(platform, device, 'FCD2').status, 'match');
  }
  assert.equal(match('ios', map(Object.defineProperty({}, 'FCD2', { get: hostile, enumerable: true })), 'FCD2').status, 'malformed');
  assert.equal(match('android', { rawScanRecord: { toString: hostile, valueOf: hostile } }, 'FCD2').status, 'malformed');
  assert.equal(calls, 0);
});

test('plain dictionary shapes only; hidden keys, symbols, inherited maps, arrays and boxed strings reject', () => {
  for (const serviceData of [Object.create({ FCD2: '' }), Object.assign(Object.create(null), { FCD2: '' }), [], new Map(),
    { FCD2: new String('') }, { FCD2: { toJSON() { throw new Error('no'); } } }, { FCD2: '', [Symbol('x')]: '' },
    Object.defineProperty({ FCD2: '' }, '180f', { value: '' })]) {
    assert.equal(match('ios', map(serviceData), 'FCD2').status, 'malformed');
  }
  class DeviceLike { rawScanRecord = b64(fcd2); }
  assert.equal(match('android', new DeviceLike(), 'FCD2').status, 'match');
});

test('byte, key and aggregate character limits reject without truncating', () => {
  assert.equal(match('android', raw(fcd2 + '00'.repeat(MAX_AD_BYTES - fcd2.length / 2)), 'FCD2').status, 'match');
  assert.equal(match('android', raw(fcd2 + '00'.repeat(MAX_AD_BYTES)), 'FCD2').status, 'malformed');
  assert.equal(match('ios', map({ FCD2: b64('00'.repeat(MAX_AD_BYTES)) }), 'FCD2').status, 'match');
  assert.equal(match('ios', map({ FCD2: b64('00'.repeat(MAX_AD_BYTES + 1)) }), 'FCD2').status, 'malformed');
  const entries = Object.fromEntries(Array.from({ length: MAX_PLX_SERVICE_DATA_ENTRIES - 1 }, (_, i) => [(0x1800 + i).toString(16), '']));
  assert.equal(match('ios', map({ ...entries, FCD2: '' }), 'FCD2').status, 'match');
  assert.equal(match('ios', map({ ...entries, FCD2: '', FEAA: '' }), 'FCD2').status, 'malformed');
  const large = Object.fromEntries(Object.keys(entries).map(key => [key, b64('00'.repeat(MAX_AD_BYTES))]));
  assert.ok(JSON.stringify(large).length > MAX_PLX_SNAPSHOT_CHARACTERS);
  assert.equal(match('ios', map({ ...large, FCD2: '' }), 'FCD2').status, 'malformed');
  for (const payload of ['A===', 'AB==', 'AA', 'AA==\n', '!!!!']) {
    assert.equal(match('ios', map({ FCD2: payload }), 'FCD2').status, 'malformed');
    assert.equal(match('android', { rawScanRecord: payload }, 'FCD2').status, 'malformed');
  }
});

test('results never retain sources or payloads; mutation isolation and explicit evidence preparation', () => {
  const device = { serviceData: { FCD2: b64('400164'), '180f': b64('55') }, id: 'private-device', name: 'private-name' };
  const result = match('ios', device, 'FCD2');
  assert.deepEqual(Object.keys(result), ['status', 'source', 'service']);
  assert.ok(Object.isFrozen(result));
  const evidence = prepareBlePlxSourceEvidenceInput('ios', device, { origin: 'synthetic-fixture', label: 'Synthetic only', capturedAt: null });
  assert.ok(evidence.payload.document.includes('private-device'));
  device.serviceData.FCD2 = '!';
  assert.equal(result.status, 'match');
  assert.equal(match('ios', device, 'FCD2').status, 'malformed');
  assert.ok(!JSON.stringify(result).includes('private'));
  for (const statusDevice of [map({ '180f': '' }), map(null), map({ FCD2: '!' })]) {
    assert.deepEqual(Object.keys(match('ios', statusDevice, 'FCD2')), ['status', 'source', 'service']);
  }
});

test('unsupported caller selections throw fixed errors rather than infer membership', () => {
  assert.throws(() => match('web' as 'ios', {}, 'FCD2'), /Select Android/);
  assert.throws(() => match('ios', {}, '180F' as 'FCD2'), /Select Android/);
});

test('aggregate character cap is inclusive; malformed unrelated entries cannot hide behind a match', () => {
  const values: Record<string, string> = { FCD2: '' };
  for (let i = 0; i < 7; i++) values[(0x1800 + i).toString(16)] = b64('00'.repeat(MAX_AD_BYTES));
  // Eight 4-character keys plus seven 2200-character values leave 952 characters.
  values.FCD2 = b64('00'.repeat(714));
  assert.equal(Object.entries(values).reduce((sum, [key, value]) => sum + key.length + value.length, 0), MAX_PLX_SNAPSHOT_CHARACTERS);
  assert.equal(match('ios', map(values), 'FCD2').status, 'match');
  values.FCD2 = b64('00'.repeat(717));
  assert.equal(match('ios', map(values), 'FCD2').status, 'malformed');
  assert.equal(match('ios', map({ FCD2: '', '180f': '!' }), 'FCD2').status, 'malformed');
  let calls = 0;
  const device = Object.create(Object.defineProperty({}, 'serviceData', { get() { calls++; return { FCD2: '' }; } }));
  assert.equal(match('ios', device, 'FCD2').status, 'unavailable');
  assert.equal(calls, 0);
});
