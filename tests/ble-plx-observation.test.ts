import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBlePlxBase64, prepareBlePlxObservation, MAX_PLX_IOS_RAW_BYTES } from '../packages/core/ble-plx-observation.ts';
import { MAX_AD_BYTES, importBleObservation } from '../packages/core/ble-advertisements.ts';
import { prepareBleEvidenceInput } from '../packages/core/ble-evidence.ts';
const provenance = { origin: 'synthetic-fixture' as const, label: 'Synthetic BLE PLX-shaped fields; not a capture', capturedAt: null };
const encode = (hex: string) => Buffer.from(hex, 'hex').toString('base64');
const ios = () => ({ id: 'DAF46000-1111-2222-3333-444444444444', name: 'Cached name', rssi: -60, mtu: 23,
  manufacturerData: encode('4c000102'), rawScanRecord: Buffer.from('{"localName":"Test"}').toString('base64'),
  serviceData: { '0000FCD2-0000-1000-8000-00805F9B34FB': encode('400164') }, serviceUUIDs: ['FCD2'],
  localName: null, txPowerLevel: null, solicitedServiceUUIDs: null, isConnectable: false, overflowServiceUUIDs: ['180F'] });

test('Android retains byte order, padding, repeated unknown AD and malformed tail, not normalized replacement', () => {
  const hex = '0201060616d2fc40016402eeff02eeaa0516d2';
  const input = { ...ios(), id: 'AA:BB:CC:DD:EE:FF', rawScanRecord: encode(hex) };
  const result = prepareBlePlxObservation('android', input, provenance);
  assert.equal(result.snapshot.rawScanRecord, input.rawScanRecord);
  assert.equal(result.observation?.rawAdvertising?.inputHex, hex);
  assert.equal(result.observation?.captureCompleteness, 'unknown');
  assert.equal(result.observation?.rawAdvertising?.status, 'malformed');
  assert.equal(result.observation?.serviceReadings.length, 1);
  assert.equal(result.observation?.physicalReceptionVerified, false);
  assert.equal(result.observation?.authenticatedIdentity, false);
  assert.deepEqual(importBleObservation(result.document!), result.observation);
  assert.equal(prepareBleEvidenceInput(result.document!).source, 'offline-fixture');
  const padded = prepareBlePlxObservation('android', { rawScanRecord: encode('0201060000') }, provenance);
  assert.equal(padded.observation?.rawAdvertising?.paddingBytes, 2);
});

test('iOS rawScanRecord JSON remains opaque, UUID is not MAC, no cached name fallback', () => {
  const input = ios(); const result = prepareBlePlxObservation('ios', input, provenance);
  assert.equal(result.representation, 'ios-normalized-fields-with-opaque-json-base64');
  assert.equal(result.snapshot.rawScanRecord, input.rawScanRecord);
  assert.equal(result.snapshot.id, input.id);
  assert.equal(result.snapshot.serviceUUIDs?.[0], 'FCD2');
  assert.deepEqual(result.snapshot.overflowServiceUUIDs, ['180F']);
  assert.equal(result.observation?.rawAdvertising, null);
  assert.equal(result.observation?.captureCompleteness, 'not-exposed');
  assert.equal(result.observation?.normalizedFields?.localName, null);
  assert.equal(result.observation?.normalizedFields?.manufacturerDataHex, '4c000102');
  assert.equal(result.observation?.serviceReadings[0]?.reading.status, 'format-match');
  assert.ok(!result.document!.includes(input.id));
  input.serviceUUIDs.push('180D'); input.serviceData['0000FCD2-0000-1000-8000-00805F9B34FB'] = '';
  assert.deepEqual(result.snapshot.serviceUUIDs, ['FCD2']);
  assert.equal(Object.values(result.snapshot.serviceData!)[0], encode('400164'));
});

test('null, missing, empty, sentinels and unavailable Android raw bytes remain distinguishable', () => {
  const missing = prepareBlePlxObservation('android', {}, provenance);
  assert.equal(missing.status, 'raw-scan-record-unavailable');
  assert.equal(missing.document, null); assert.equal(missing.observation, null);
  assert.ok(missing.unavailableFields.includes('rawScanRecord'));
  const explicit = prepareBlePlxObservation('android', { rawScanRecord: null }, provenance);
  assert.ok(!explicit.unavailableFields.includes('rawScanRecord'));
  assert.equal(prepareBlePlxObservation('android', { rawScanRecord: '' }, provenance).status, 'prepared');
  const result = prepareBlePlxObservation('ios', { serviceData: null, serviceUUIDs: [], rssi: 127, txPowerLevel: null }, provenance);
  assert.equal(result.snapshot.serviceData, null); assert.deepEqual(result.snapshot.serviceUUIDs, []);
  assert.equal(result.snapshot.rssi, 127); assert.equal(result.observation?.rssiDbm, null);
  assert.equal(result.snapshot.txPowerLevel, null); assert.equal(result.observation?.normalizedFields?.txPowerDbm, null);
});

test('canonical base64 round trips all byte values and bounded random-shaped lengths', () => {
  for (let length = 0; length <= MAX_AD_BYTES; length++) {
    const input = Buffer.from(Array.from({ length }, (_, i) => (i * 67 + length) & 255));
    assert.equal(decodeBlePlxBase64(input.toString('base64')), input.toString('hex'));
  }
});

test('malformed, noncanonical and oversize base64 is rejected without truncation', () => {
  for (const value of ['A', 'AAA', 'AA=', 'A===', 'AA===', '=AAA', 'AA==\n', ' AA==', 'AA-_', 'AB==', 'AAB=', '!!!!', 123, null]) {
    assert.throws(() => decodeBlePlxBase64(value), /base64/);
  }
  assert.throws(() => decodeBlePlxBase64(Buffer.alloc(MAX_AD_BYTES + 1).toString('base64')));
  assert.throws(() => decodeBlePlxBase64('AAAA', 2));
  assert.throws(() => decodeBlePlxBase64('', Infinity));
  assert.throws(() => prepareBlePlxObservation('ios', { rawScanRecord: Buffer.alloc(MAX_PLX_IOS_RAW_BYTES + 1).toString('base64') }, provenance));
  assert.throws(() => prepareBlePlxObservation('ios', { manufacturerData: 'AB==' }, provenance));
});

test('bounds and schemas reject bad dictionaries, duplicates, metrics and aggregate excess', () => {
  for (const patch of [{ rssi: NaN }, { rssi: -128 }, { txPowerLevel: 128 }, { txPowerLevel: -128 }, { txPowerLevel: -2147483648 }, { isConnectable: 1 },
    { localName: 'x'.repeat(249) }, { id: 'x'.repeat(129) }, { serviceUUIDs: Array(33).fill('180F') },
    { serviceUUIDs: [null] }, { serviceData: [] }, { serviceData: { bad: '' } }, { serviceData: { FCD2: null } },
    { serviceData: { FCD2: '', '0000fcd2-0000-1000-8000-00805f9b34fb': '' } },
    { manufacturerData: encode('01') }, { serviceData: { FCD2: Buffer.alloc(MAX_AD_BYTES).toString('base64') } },
    { serviceData: Object.fromEntries(Array.from({ length: 32 }, (_, i) => [i.toString(16).padStart(4, '0'), Buffer.alloc(600).toString('base64')])) }]) {
    assert.throws(() => prepareBlePlxObservation('ios', { ...ios(), ...patch }, provenance));
  }
  const accessor = Object.defineProperty({}, 'rawScanRecord', { get() { throw new Error('Accessor executed'); } });
  assert.throws(() => prepareBlePlxObservation('android', accessor, provenance), /must not be accessors/);
});

test('source time must be supplied and validated; never invents timestamp or live provenance', () => {
  const recorded = { origin: 'recorded-import' as const, label: 'Source callback receipt time supplied by caller', capturedAt: '2026-11-07T10:00:00.000Z' };
  assert.deepEqual(prepareBlePlxObservation('ios', {}, recorded).provenance, recorded);
  for (const invalid of [{ ...recorded, capturedAt: null }, { ...recorded, capturedAt: '2026-02-30T00:00:00.000Z' },
    { ...provenance, label: '' }, { ...provenance, capturedAt: recorded.capturedAt }]) {
    assert.throws(() => prepareBlePlxObservation('android', {}, invalid));
  }
});


test('all one-byte and two-byte tails round trip and reject nonzero pad bits', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let value = 0; value < 65536; value++) {
    const input = Buffer.from([value >>> 8, value & 255]);
    const encoded = input.toString('base64');
    assert.equal(decodeBlePlxBase64(encoded), input.toString('hex'));
    const last = alphabet.indexOf(encoded[2]!);
    for (let bits = 1; bits < 4; bits++) assert.throws(() => decodeBlePlxBase64(encoded.slice(0, 2) + alphabet[last | bits] + '='));
  }
  for (let value = 0; value < 256; value++) {
    const input = Buffer.from([value]); const encoded = input.toString('base64');
    assert.equal(decodeBlePlxBase64(encoded), input.toString('hex'));
    const last = alphabet.indexOf(encoded[1]!);
    for (let bits = 1; bits < 16; bits++) assert.throws(() => decodeBlePlxBase64(encoded[0]! + alphabet[last | bits] + '=='));
  }
});
