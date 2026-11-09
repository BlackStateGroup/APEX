# APEX Learn verification and scope

This is a deterministic synthetic-only prototype. It does not integrate with the
app UI, connect an AI provider, control hardware, discover an unknown protocol,
or establish physical sensor accuracy. The implementation is isolated to new
files and uses the existing source-evidence and differential readers.

## Reproduce

```sh
node --test tests/ble-learn.test.ts tests/ble-field-hypothesis.test.ts tests/ble-differential.test.ts
node verification/apex-learn/independent-review/numeric-oracle.mjs
node tools/demo-ble-learn.ts > learn-report.json
cmp learn-report.json verification/apex-learn/report.json
npm run typecheck
```

The focused suite passes 32 tests, including 13 Learn tests. The independently
written Buffer oracle checks 672 predictions, exact residuals and tolerance
comparisons across 56 candidates, widths 1-4, endian variants, signedness,
zero/extrema and divisors 1, 3, 100 and 1000000.

The implementation was also tested before publication in a local integration
tree containing the pending mobile-evidence work: 2460 tests passed at concurrency
2, typecheck passed, and iOS/Android/web exports passed. A default-concurrency
run encountered one inherited test's 200 ms subprocess-start timeout; that test
passed in isolation and the unchanged inherited suite passed 2447/2447. These
local results do not substitute for the PR's current-base CI or native-device
validation. Raw local logs and workstation paths are not included in this PR.

## Designed synthetic result

- Declared candidate family: 24.
- Initial survivors: 4, so the system abstains.
- One selected query separates 5 of 6 candidate pairs.
- One additional reference measurement leaves one survivor.
- Separate held-out references: 4/4 match.
- A naive first-discovery-match baseline matches 3/4.
- A fresh sample decodes to 45/2 (22.5 operator-declared reference units).

This is one deliberately constructed example, not a budget-matched benchmark,
proof of active-learning superiority or a general accuracy estimate. Reference
labels, source identity, experimental control and blinding remain declarations.
The API does not enforce a globally sealed holdout or lifetime experiment history.

The range check uses exact replayed packet predictions. This avoids rejecting a
validated endpoint when its noisy reference is inside the accepted tolerance.
The range is a coarse extrapolation guard, not evidence covering every value or
condition inside that range. Independent review found and verified corrections
for this edge case and the canonical timestamp in a rejection fixture.

## Retained data-only evidence

`report.json` is byte-reproducible and contains only synthetic inputs, candidate
residuals, query predictions and hashes. `decoder.json` retains exact discovery
and holdout documents; decoding replays them rather than accepting stored
validation claims. `sample.json` is a new explicitly synthetic packet.

SHA-256 of artifact content excluding its file newline:
`a3e5137d6983b33a7818ecfb36901c1d2cee9b1af76464bfefb9f18c68eeec68`.

SHA-256 of compact report content excluding its final digest field:
`e025bb6c63c626775bb8e54ff145b2305564f6cba631abafc2f6cf4734de4d9d`.

Reviewed core SHA-256:
`215056766a5d7751b70792cde120c5af167fc1c408845c0b626ed895e213b8ec`.

The oracle prints the actual core hash and whether it matches the reviewed
snapshot. Hashes identify bytes, not authenticity, independent capture or truth.
