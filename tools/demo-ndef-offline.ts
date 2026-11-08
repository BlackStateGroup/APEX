/** Synthetic offline demonstration only. Does not interact with NFC hardware. */
import { readFileSync } from 'node:fs';
import { importNdefObservation } from '../packages/core/ndef-offline.ts';
const fixtures: unknown[] = JSON.parse(readFileSync(new URL('../tests/fixtures/ndef-observations.json', import.meta.url), 'utf8'));
for (const fixture of fixtures) {
  const observation = importNdefObservation(JSON.stringify(fixture));
  console.log(JSON.stringify({ label: observation.provenance.label, origin: observation.provenance.origin,
    verification: observation.verification, status: observation.decoded.status,
    records: observation.decoded.records.map(r => ({ offset: r.offset, rawHex: r.rawHex, value: r.value })) }, null, 2));
}
