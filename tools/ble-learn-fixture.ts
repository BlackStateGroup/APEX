/** Fixed synthetic laboratory, deliberately confounded before one informative query. */
import { prepareBlePlxSourceEvidenceInput } from '../packages/core/ble-plx-source-evidence.ts';
export type FixtureRow = { id: string; temperatureCenti: number; humidityCenti: number };
export const LEARN_FIXTURE_SOURCE = 'synthetic-sensor-01';
export const INITIAL_ROWS: FixtureRow[] = [
  { id: 'discovery-a', temperatureCenti: 2000, humidityCenti: 2000 },
  { id: 'discovery-b', temperatureCenti: 2500, humidityCenti: 2500 },
];
export const QUERY_ROWS: FixtureRow[] = [
  { id: 'query-positive', temperatureCenti: 2300, humidityCenti: 4300 },
  { id: 'query-negative', temperatureCenti: -1250, humidityCenti: 4310 },
  { id: 'query-correlated', temperatureCenti: 2700, humidityCenti: 2700 },
];
// These references are NEVER passed into fit or query selection.
export const HELD_OUT_ROWS: FixtureRow[] = [
  { id: 'holdout-a', temperatureCenti: -500, humidityCenti: 6170 },
  { id: 'holdout-b', temperatureCenti: 125, humidityCenti: 3750 },
  { id: 'holdout-c', temperatureCenti: 1844, humidityCenti: 5030 },
  { id: 'holdout-d', temperatureCenti: 3175, humidityCenti: 5520 },
];
export function fixturePayload(row: FixtureRow): string {
  const bytes = Buffer.alloc(7);
  bytes[0] = 0x40; bytes[1] = 0x02; bytes.writeInt16LE(row.temperatureCenti, 2);
  bytes[4] = 0x03; bytes.writeUInt16LE(row.humidityCenti, 5);
  return bytes.toString('hex');
}
export function fixtureDocument(rows: FixtureRow[], kind: 'discovery' | 'held-out' = 'discovery', platform: 'android' | 'ios' = 'android'): string {
  const dataset = {
    schemaVersion: 1, scope: 'owned-lab', serviceUuid: 'FCD2',
    groups: [{ id: 'first', condition: 'Synthetic first reference setting' }, { id: 'other', condition: 'Synthetic varied reference settings' }],
    sources: [{ id: LEARN_FIXTURE_SOURCE, platform, snapshotId: LEARN_FIXTURE_SOURCE, origin: 'synthetic-fixture' }],
    trials: rows.map((row, index) => {
      const payload = Buffer.from(fixturePayload(row), 'hex');
      const raw = Buffer.concat([Buffer.from([payload.length + 3, 0x16, 0xd2, 0xfc]), payload]).toString('base64');
      return { id: row.id, groupId: index === 0 ? 'first' : 'other', sourceId: LEARN_FIXTURE_SOURCE, receiptId: `receipt-${row.id}`,
        document: prepareBlePlxSourceEvidenceInput(platform, { id: LEARN_FIXTURE_SOURCE,
          rawScanRecord: platform === 'android' ? raw : Buffer.from('{}').toString('base64'), serviceData: { FCD2: payload.toString('base64') } },
        { origin: 'synthetic-fixture', label: 'Controlled synthetic learning example, not a physical capture', capturedAt: null }).payload.document };
    }),
  };
  return JSON.stringify({ schemaVersion: 1, kind: `apex-learn-synthetic-${kind}`, dataset: JSON.stringify(dataset),
    measurements: rows.map(row => ({ trialId: row.id, readingMilliUnits: row.temperatureCenti * 10 })),
    ...(kind === 'discovery' ? { toleranceMilliUnits: 0, search: { byteOffsets: [2, 5], widths: [2], divisors: [1, 10, 100] } } : {}) });
}
export function fixturePool(): string {
  return JSON.stringify({ schemaVersion: 1, kind: 'apex-learn-synthetic-query-pool', sourceId: LEARN_FIXTURE_SOURCE,
    probes: QUERY_ROWS.map(row => ({ id: row.id, intervention: row.id === 'query-negative'
      ? 'Synthetic below-zero reference with decorrelated second channel' : row.id === 'query-positive'
        ? 'Synthetic positive reference with decorrelated second channel' : 'Synthetic correlated positive channels', payloadHex: fixturePayload(row) })) });
}
export function fixtureSample(payloadHex = '4002ca08036e14') {
  return JSON.stringify({ schemaVersion: 1, origin: 'synthetic-fixture', sourceId: LEARN_FIXTURE_SOURCE, serviceUuid: 'FCD2', payloadHex });
}
