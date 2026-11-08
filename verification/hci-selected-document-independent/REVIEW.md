# Independent selected legacy HCI document review

Reviewed production source: `36d1127b438e5f5d300d51e26fbb6f0983e5f77c`.
Builder's test-only follow-up: `83e326da61831f34b0515e689400129eb92b3491`, applied here as `05ebc19`.
Independent test commit: `2433fedea6b31bc9c3e70c8fb1adb4eddc46ad44`.
Baseline: `3c0aed4`; baseline.json was generated before the new source was integrated, with independently authored synthetic fixtures.

## Results

No production defect identified in this review. Fourteen independently authored test cases pass. The final focused run passes 54/54 cases (independent, builder and existing HCI regressions), with zero failures, skips or cancellations. Full TypeScript typecheck exits zero. No initial failures occurred; first and final raw logs are retained.

Independent checks cover literal minimum 55 and maximum 298 byte derivatives, exact original header and nonfirst record slices, binary SHA-256 oracle versus hex text/full-source digests, opaque command/ACL/key-event sentinels around selected data, explicit extended rejection, separate scan responses and multiple advertisers, frozen outputs, original/callback-buffer mutation, forged prepared objects, asynchronous hash errors, digest format rejection and dishonest-but-well-shaped callback limits. Existing metadata, legacy and extended serialized outputs match the frozen baseline exactly.

Schema checks cover missing/extra fields in every object, literal/escaped decoded duplicate keys, incorrect types, nested containers, malformed JSON and controls, escaped text preservation, exact 4096 UTF-16 code unit boundary, strict lowercase/even hex, exact header, derivative lengths, digest mismatches, source index/offset/size bounds and suffix plausibility. Rehashed structurally bad records and late-invalid reports reject atomically. Malformed/unknown/encrypted AD and inert URL bytes retain parser parity. Plausible original references can change without becoming verified, and actual source hashes, byte counts and report offsets remain derivative coordinates.

Inspection confirms production edits add APIs in the existing private-byte owner module without public raw range access or exports from the private WeakMap. Existing selectors/serialization are unchanged. This change adds no EvidenceStore, bundle, journal, CLI, App, platform/native, provider or automatic export wiring. All data/hash tests use local Node crypto and synthetic fixtures.

## Reproduction

All checks used Node v24.22.1 and the already-approved dependency tree linked from apex-ui-validation-20261107/node_modules; no install or network request was performed. Prefix both commands with:

    CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false

Commands:

    node --test tests/hci-selected-document*.test.ts tests/hci-offline.test.ts tests/hci-independent-review.test.ts tests/hci-extended-metadata.test.ts tests/hci-extended-independent.test.ts
    node node_modules/typescript/bin/tsc --noEmit

Raw logs: first.log, focused-final.log, typecheck-first.log, typecheck-final.log and typecheck-status.txt in this directory. Empty typecheck logs mean no diagnostics; the status file records the final exit code.

## Limits

Focused tests and source inspection are not a repository-wide aggregate, export/build, browser, UI, native/device, interoperability, acquisition, security audit or real-capture validation. No radio/device/ADB/logging/settings/credential/provider/publication action was taken. Digest verification depends on the caller's trusted callback; digest equality is not authentication or proof of acquisition, ownership, receiver/device identity, physical reception, completeness or truthful timing. Original source references are plausibility-checked only, not checked against an original source. The full selected event can contain sensitive vendor identifiers and multiple advertisers. No journal integration is claimed.
