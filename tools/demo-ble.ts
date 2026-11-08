import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { importBleObservation, summarizeBleObservation } from '../packages/core/ble-advertisements.ts';

const inputs: unknown[] = JSON.parse(readFileSync(new URL('../tests/fixtures/ble-observations.json', import.meta.url), 'utf8'));
const results = inputs.map((input, index) => {
  const document = JSON.stringify(input);
  const decoded = importBleObservation(document);
  const summary = summarizeBleObservation(`ble:synthetic:${index + 1}`, createHash('sha256').update(document).digest('hex'), decoded);
  return { decoded, localHypothesisInput: summary };
});
console.log(JSON.stringify({ experiment: 'Offline BLE interpretation; no RF reception, no network, no device actions', results }, null, 2));
