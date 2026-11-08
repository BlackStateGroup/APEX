// Helper for the independent Python oracle. Inputs and expected values are not
// computed here. Run via the adjacent Python script, with Node 24+.
import { readFileSync } from 'node:fs';
import { validateBleFieldHypothesis } from '../../packages/core/ble-field-hypothesis.ts';
const inputs = JSON.parse(readFileSync(0, 'utf8'));
const output = inputs.map(document => validateBleFieldHypothesis(document).results.map(row => ({
  status: row.status, rawInteger: row.rawInteger,
  value: row.value && [row.value.numerator, row.value.denominator],
  residual: row.residual && [row.residual.numerator, row.residual.denominator],
  withinTolerance: row.withinTolerance,
})));
process.stdout.write(JSON.stringify(output));
