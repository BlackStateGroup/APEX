import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { importBleObservation, summarizeBleObservation } from '../packages/core/ble-advertisements.ts';
import { suggestProtocols, validateSuggestion } from '../packages/core/hypotheses.ts';
import type { AnalysisProvider, ObservationSummary } from '../packages/core/hypotheses.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ble-observations.json', import.meta.url), 'utf8'))[0];
const document = JSON.stringify(fixture);
const observations: ObservationSummary[] = [summarizeBleObservation('ble:synthetic:contract', createHash('sha256').update(document).digest('hex'), importBleObservation(document))];

test('BLE metadata passes the unchanged APEX hypothesis contract with a local deterministic stub', async () => {
  let calls = 0;
  const provider: AnalysisProvider = {
    id: 'fixture-only-local-stub', location: 'local',
    async suggest(selected) {
      calls++;
      assert.equal(selected[0]!.kind, 'signal-metadata');
      assert.equal(JSON.stringify(selected).includes(fixture.advertisingHex), false);
      return JSON.stringify({ summary: 'Synthetic format-check input only. No model was invoked.', hypotheses: [{
        protocol: 'unknown', confidence: 0,
        rationale: 'The input summary reports a known public layout, but establishes no device identity or control authority.',
        observationIds: selected.map(x => x.id),
      }] });
    },
  };
  const result = await suggestProtocols(provider, observations);
  assert.equal(calls, 1);
  assert.equal(result.status, 'unverified');
  assert.equal(result.hypotheses[0]!.status, 'hypothesis');
});
test('existing data-export gate blocks a remote provider before it receives any observations', async () => {
  let called = false;
  await assert.rejects(suggestProtocols({ id: 'remote-never-called', location: 'remote', async suggest() { called = true; return ''; } }, observations), /Explicit data-export selection required/);
  assert.equal(called, false);
});
test('existing output validator still rejects invented evidence and unsupported BLE protocol labels', () => {
  for (const hypothesis of [
    { protocol: 'BLE', confidence: 1, rationale: 'Not an allowed output enum in the current baseline', observationIds: [observations[0]!.id] },
    { protocol: 'unknown', confidence: 1, rationale: 'An invented source reference', observationIds: ['never-observed'] },
  ]) assert.throws(() => validateSuggestion(JSON.stringify({ summary: 'Controlled negative test', hypotheses: [hypothesis] }), observations, 'local-stub'));
});
