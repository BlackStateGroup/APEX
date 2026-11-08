import { readFileSync } from 'node:fs';
import { importBleObservation } from '../packages/core/ble-advertisements.ts';
const document = readFileSync(new URL('../tests/fixtures/bthome-observation.json', import.meta.url), 'utf8');
console.log(JSON.stringify(importBleObservation(document), null, 2));
