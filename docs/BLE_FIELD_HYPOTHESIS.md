# Offline declared BLE numeric candidate checks

This offline core/CLI and Analysis workbench tool checks **one operator-supplied numeric candidate over recognized public formats**. It does not discover unknown protocols, layouts or sensor mappings. It never fits a scale, searches candidates, decrypts data, sends commands, scans, invokes a provider, writes the evidence journal or accesses a device/network. All fixtures are synthetic, not physical RF experiments.

Run with Node 24:

```sh
node tools/validate-ble-field-hypothesis.ts tests/fixtures/ble-field-hypothesis.json
node --test tests/ble-field-hypothesis.test.ts
```

## Exact input contract

The input is a JSON string with exactly these keys:

- `schemaVersion`: `1`.
- `dataset`: the **exact JSON document string** accepted by [controlled BLE differential comparison](BLE_DIFFERENTIAL_EXPERIMENT.md). Its existing bounds, source/group declarations, receipt uniqueness and platform-specific selection rules apply unchanged. This is not a path, journal record or interpreted output object.
- `candidate`: exactly `{ "byteOffset": 2, "width": 2, "byteOrder": "little", "signed": true, "divisor": 100, "valueOffset": 0 }`.
- `tolerance`: required nonnegative canonical decimal string, for example `"0"` or `"0.01"`.
- `assignments`: 2–32 objects, each exactly `{ "trialId": "android-baseline-1", "subset": "discovery", "expected": "20" }`. Trial references must exist and be unique. Subset is exactly `discovery` or `held-out`; each selected source must have at least one trial in each subset. Dataset trials without assignments are retained and listed as unselected, never included in numeric validation counts.

The outer document is limited to 262,144 UTF-16 code units and three simultaneously open JSON containers; the nested dataset independently retains its 196,608-character/four-container limits. Duplicate decoded JSON keys, unknown fields and invalid nested documents fail closed. Embedded strings count as strings for the outer depth limit, then undergo their own independent validation. A maximum-sized dataset with extensive escaped content may exceed the wrapper limit; neither input is silently truncated.

Candidate limits: `byteOffset` integer 0–1649 (existing `MAX_AD_BYTES - 1`), `width` integer 1–4, `byteOrder` exactly `little` or `big`, `signed` boolean, `divisor` integer 1–1,000,000,000, `valueOffset` integer −1,000,000,000 through +1,000,000,000. Negative zero is rejected for integer fields. Byte offsets are zero-based in the selected service payload, excluding UUID and AD headers. The candidate applies identically to every selected trial, with no source-specific fitting.

Expected readings and tolerance are strings with 1–15 integer digits and optionally 1–9 fractional digits. A minus sign is allowed for expected readings only. No leading plus, leading integer zeros (except the single `0`), exponent, whitespace, negative zero, omitted integer part, trailing decimal point or trailing fractional zeros is accepted. Examples: `"-0.125"`, `"0"`, `"999999999999999.999999999"`. `"1.0"` must instead be `"1"`. These bounds keep all exact arithmetic finite and modest; numeric JSON values are not accepted for these fields.

## Eligibility gate

Every **selected** payload must receive a full `format-match` from the existing pinned public-format decoder and be either unencrypted `BTHome-v2` or `Eddystone-TLM-v0`. BTHome encrypted flags, unsupported versions/reserved flags, unknown objects, partial/truncated objects and malformed layouts are rejected. FEAA UID, URL, EID, encrypted TLM, unknown frame types/versions and malformed TLM are rejected. No arbitrary unrecognized bytes are described as known plaintext. One ineligible selected trial refuses the whole report, even if the candidate would otherwise lie within its bytes. Unselected payloads remain evidence in the nested differential report only, including any opaque encrypted labels.

This conservative gate validates only the recognized supported public-format shape. It is not evidence of authenticity, reception, device identity, decrypted content, or physical sensor truth. Every result and subset summary repeats both the eligibility policy and the non-validation caveat. Existing BTHome/Eddystone semantic decoding is separate: this candidate may select a header, cross a field boundary or interpret an unavailable sentinel numerically. A numeric match does not override documented protocol semantics or establish a meaningful field.

## Exact arithmetic and report

A width-bounded integer is decoded with the requested byte order and optional two's-complement signedness. Then:

- Value = raw integer / divisor + valueOffset.
- Signed residual = value − operator-declared expected reading.
- Within tolerance means absolute residual ≤ declared tolerance, including exact equality.

All decoding, rational transformations and tolerance decisions use BigInt integer arithmetic. Values/residuals serialize reduced exact numerator/positive denominator **strings** plus a separately named `approximate` number for display. No BigInt reaches JSON serialization; no repeating decimal expansion is attempted. Approximate display values do not decide matches.

If a complete eligible payload lacks any candidate byte, the row is `incomplete` with null field/value/residual/match. Missing is never zero. A physically truncated recognized format is rejected earlier by the eligibility gate, rather than accepted as an incomplete candidate. Complete rows are `within-tolerance` or `outside-tolerance`.

The report retains the exact outer input, exact nested dataset and all differential evidence: original selected-source documents, receipt references, platform/representation, snapshot claims, provenance, group IDs, payload bytes and AD offsets. Assignments' expected strings and subset labels survive unchanged. Each source has separate discovery and held-out summaries with ordered trial IDs and match/mismatch/incomplete counts. Group IDs remain on every row and in the original dataset; no group-conditioned mapping is fitted. No source is pooled with another, and summary counts are not numbers of independent observations.

Both subsets are **operator-designated**, not proof of genuine blinding or independence. The tool cannot verify whether the operator inspected held-out data before choosing the candidate. Re-running it with new candidates can overfit the same designated held-out data. Expected readings, source identities, receipt references, collection order and ownership are all declarations. Even complete agreement in both subsets provides no statistical significance, calibration, causality, field discovery, authentication or physical validation claim.

The local CLI duplicates the proven bounded reader from the differential tool: regular files only; symlinks allowed only to regular files; pre-open and post-open descriptor type/identity checks; nonblocking open where supported to avoid a raced-in FIFO; maximum four times the character limit plus one byte; strict UTF-8 decoding with BOM preservation. A leading UTF-8 BOM is rejected by the same strict JSON parser as a leading U+FEFF passed directly to the core; it is never silently removed. It emits no partial JSON report after failure. Input files are not atomic snapshots: do not edit them during reading. Outputs contain exact source information and potentially private identifiers/untrusted labels, so keep them local and treat them as inert data.

## References and verification scope

No new protocol constants, downloaded sources or dependencies were added. Eligibility reuses `packages/core/ble-advertisements.ts`, based on [BTHome offline research](BTHOME_OFFLINE.md), [BLE offline experiment](BLE_OFFLINE_EXPERIMENT.md), `research/bthome-source-pins.json` and `research/ble-source-pins.json`. Source selection reuses `packages/core/ble-differential.ts` and [selected-source evidence](BLE_PLX_SOURCE_EVIDENCE.md).

Synthetic tests provide independently written golden integer/rational expectations, inclusive tolerance boundaries, missing bytes, integer extrema, cross-source and discovery/held-out isolation, encrypted/unknown refusal, strict declarations, schema limits and CLI special-file/encoding/size refusal. They demonstrate software behavior only. No browser, mobile build or real RF/device test is claimed.


## Analysis workbench

`src/BleCandidateWorkbench.tsx` exposes the same strict checker through the shared
React Native Analysis screen for iPhone, Android and web. This is offline software
availability, not a new scanner or native-device validation claim. Start BLE
candidate import clears the in-memory draft; paste the exact wrapper JSON or load
the explicitly synthetic fixture, then choose Analyze BLE candidate. Loading,
editing and fixture reloads never analyze automatically. Every edit clears prior
results, even an identical edit or a rejected oversized paste. Oversized edits
are refused whole with the previous draft retained; no TextInput maxLength silently
truncates the document. Parser errors leave no partial report.

The controller retains the exact document and complete core report in memory.
The workbench stays mounted across tabs; reload loses both draft and result.
There is no journal save, file upload, scanner, provider, device or network action.
Source selection resets bounded four-row pagination. Discovery and held-out
summaries are explicitly operator-designated, with separate source counts and
unselected-trial disclosure. Exact numerator/denominator values and signed
residuals precede approximate display-only numbers. Incomplete is never zero.
Untrusted identifiers appear only as quoted inert text and cannot create links.

Focused reducer tests cover invalidation, bounds, exactness, missing bytes,
source/subset separation, pagination and failed imports. Two Playwright scenarios
are authored for repeated actions, navigation, reload, oversize refusal, source
pages, inert labels and phone-width layout. Browser execution, mobile builds and
physical-device tests are not claimed for this increment. See
`verification/ble-candidate-ui/README.md` for local verification scope.
