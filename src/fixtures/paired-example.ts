import type { PairedDataset, PairedRow } from '../../packages/core/paired-observations.ts';
/** Deliberately synthetic. Separate sessions, explicit controls and unknowns. */
export function pairedExample(): string {
  const rows: PairedRow[] = [];
  for (const [partition, split] of (['discovery', 'calibration', 'holdout'] as const).entries()) {
    for (let n = 0; n < 8; n++) {
      const unknown = n >= 6, low = n < 3;
      const tMs = partition * 10000 + n * 1000 + 100;
      rows.push({ id: `${split}-${n}`, session: `${split}-session-${n % 2}`, split,
        condition: unknown ? n === 6 ? 'control' : 'sham' : 'signal', label: unknown ? null : low ? 'low' : 'high',
        ble: { tMs, rssi: (unknown ? -95 : low ? -70 : -40) + (n % 3) * 0.4 + partition * 0.1 },
        range: { tMs: tMs - 3, metres: 2 + n % 3 * 0.01 } });
    }
  }
  const dataset: PairedDataset = { schema: 'apex.paired-observations.v1', origin: 'synthetic', phone: 'synthetic-phone', reference: 'synthetic-range-reference', permission: 'operator-declared',
    clock: { offsetMs: 3, uncertaintyMs: 2, validFromMs: 0, validToMs: 40000, basis: 'independent-calibration' }, rows };
  return JSON.stringify(dataset, null, 2);
}
