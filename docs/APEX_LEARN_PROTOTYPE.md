# APEX Learn: a synthetic experiment loop

This isolated prototype combines APEX's existing BLE source-evidence parser,
controlled differential datasets, exact hypothesis checking, and a new bounded
candidate-elimination loop. It does not connect an AI provider, operate hardware,
discover an unknown protocol, authenticate a device, or send device commands.
There is no app UI or production/native integration in this slice.

## What is executable

1. Read strict, explicitly synthetic BLE source documents through the existing
   differential/source readers. Keep Android raw-AD and iOS normalized-field
   representations distinct; work with one declared source at a time.
2. Enumerate a declared, bounded family of integer interpretations: byte offset,
   field width, endian order, signedness, and scale divisor. The public BTHome
   parser supplies structural field boundaries and layout eligibility, **not**
   semantic labels or the correct signedness/scale to the search.
3. Compare every candidate to every discovery reference using exact integer
   arithmetic. Retain all candidates within the declared inclusive tolerance.
   Zero survivors means abstain; multiple survivors also mean abstain.
4. Choose a query from an unlabeled synthetic packet pool. Maximize the count of
   candidate pairs whose prediction intervals do not overlap at twice the
   reference tolerance. Ties use stable identifier order. If no query separates
   any pair, say so. This is pool-based reference-query selection, not physical
   intervention planning or measured entropy reduction.
5. Reveal the selected query's reference value, append it to discovery, and fit
   again. Only after a unique candidate exists does validation read a separate
   holdout. Holdout failure withholds the artifact; it never reranks candidates.
6. Export a data-only JSON decoder artifact retaining exact discovery and holdout
   documents. Every reuse replays candidate selection and holdout validation,
   binds the candidate ID, checks source/synthetic scope and exact packet layout,
   and abstains for output outside the range covered by replayed packet predictions.

## Reproduce

Node 24.3 or later within Node 24 and the repository dependencies are required.
No network, radio, model credentials, build output, or physical device is needed.

```sh
node tools/demo-ble-learn.ts > learn-report.json
node --test tests/ble-learn.test.ts tests/ble-field-hypothesis.test.ts tests/ble-differential.test.ts
npm run typecheck
npm test
```

The report contains exact input documents, a JSON-string decoder artifact under
`validation.artifactDocument`, SHA-256 digests, all candidate residuals, all query
predictions, and a fresh decode result. There are no timestamps or random seeds;
repeating the command produces byte-identical output. The `reportContentSha256`
is over compact `JSON.stringify` of the report without that final field.
To extract and reuse the artifact with a new explicitly synthetic packet:

```sh
node --input-type=module - <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBleLearnArtifact } from './packages/core/ble-learn.ts';
const report = JSON.parse(readFileSync('learn-report.json', 'utf8'));
const artifact = report.validation.artifactDocument;
writeFileSync('decoder.json', artifact + '\n');
console.log(decodeBleLearnArtifact(artifact, JSON.stringify({
  schemaVersion: 1,
  origin: 'synthetic-fixture',
  sourceId: 'synthetic-sensor-01',
  serviceUuid: 'FCD2',
  payloadHex: '4002ca08036e14'
})));
JS
```

The fresh packet decodes to the exact rational `45/2` (22.5 operator-declared
reference units), not a claim that a physical sensor measured 22.5 °C.

## Designed experiment and baseline

The synthetic fixture starts with two packets whose temperature and humidity
channels have deliberately identical positive numeric values. From 24 candidate
interpretations, four survive: either field, signed or unsigned, little endian,
divided by 100. The learner **does not arbitrarily choose one**.

Three unlabeled query packets offer different amounts of disagreement. The
selected packet combines a negative temperature with a decorrelated humidity
channel. It separates five of the six candidate pairs. Revealing that single
reference eliminates three candidates and leaves signed little-endian / 100 at
offset 2. Four held-out packets, including another negative value and fractional
readings, then pass. A naive first-discovery-match baseline chooses the unsigned
version and passes only three of four holdout cases.

This is one intentionally designed synthetic demonstration, **not** an
independent blinded benchmark, a real-world accuracy estimate, or evidence that
active learning universally outperforms a baseline. The existing independent
`validateBleFieldHypothesis` rational checker is exercised against all seven
reference readings as an additional regression cross-check.

## Guardrails and evidence limits

- Accepted evidence is complete unencrypted BTHome-v2 with one exact structural
  layout. The system already knows that public framing. It searches a small
  interpretation family inside it; unknown/encrypted protocols are out of scope.
- Measurements are bounded integer milli-units. Evaluation uses BigInt rational
  comparisons, including inclusive tolerances and signed decoding. Approximate
  numbers are display-only. There are no floating-point acceptance decisions.
- At least two distinct discovery references and three distinct holdout
  references are required. Every trial must have one measurement. Duplicate
  payloads within a split are rejected, as are reused trial IDs, receipts, or
  payloads across discovery and holdout. These conservative checks are not proof
  of independent capture, device identity or honest declarations.
- `fitBleLearn` and `selectBleLearnQuery` accept no holdout reference document.
  The holdout documents in this demo are fixed separately from discovery and
  query selection. The API does not cryptographically seal a holdout or enforce
  a lifelong experiment history: a caller can repeatedly inspect and redesign
  against a holdout. A new study must use new held-out measurements. Pool reuse
  and unseen prior experiments are not globally audited by this prototype.
- Candidate count reports finite-family ambiguity, not confidence probability.
  A unique candidate can still be wrong outside the family or reference range.
  The range uses replayed winner predictions, so tolerated reference error cannot
  make a validated endpoint reject itself. It is only an extrapolation guard, not coverage of
  every intermediate value or every environmental condition.
- Query scores concern disagreement, not expected information gain or causal
  validity. The fixture supplies synthetic packet bytes before reference labels.
  Real experiment planning would require an independently grounded model of
  available controls and the measurements those controls can produce.
- The decoder artifact includes private-capable source documents. Keep it local.
  Replay detects inconsistency, but an attacker can coherently replace evidence;
  hashes identify bytes and do not authenticate truth or a signer.
- All operations are deterministic, read-only analysis. Artifacts cannot contain
  execution commands, actions, model output authority, or software to eval.

## Verification record

`verification/apex-learn/` contains a deterministic synthetic report, reusable
decoder JSON and an independent numeric oracle. See
`verification/apex-learn/SUMMARY.md` for commands, outcomes, review findings and
the distinction between local integration checks and current-base CI.

## Next meaningful gate

A real breakthrough claim needs a preregistered, independently labeled study:
owned physical sensors with controlled interventions, a protected holdout,
uncorrelated nuisance variables, repeated sessions/devices, candidate-family
misspecification tests, calibration/noise handling, and explicit abstention
coverage/error measurements. A model may propose bounded hypotheses later, but
it should not set validation outcomes or gain hardware execution authority.
