# Independent selected HCI document UI review

Reviewed source: `78b11919040959cbe8642bf38b6e31e69467c13e` (builder), copied unchanged by local cherry-pick `badb765`. Independent tests: `c9dbd00`.

Status: no production defect found in the reviewed source. No production changes made by reviewer. This is a source/controller/static-render review, not mounted browser or native acceptance.

## Coverage and findings

- Explicit valid legacy selection and Prepare precede one-shot exact document handoff. No automatic preparation or verification. Reviewed App diff adds one inspector/source route and callback; prior inspector mounts and routes remain present.
- Out-of-order overlapping verification success and failure cannot overwrite a newer verified draft. Overlapping preparation for two selections publishes only the newer selection's source record index. Clear, rejected edits, source delivery, extended selection and navigation fence pending work.
- Malformed direct edits, 4096 UTF-16 budget, rejected-edit retention across navigation, exact whitespace, stale state callbacks, invalid/replayed IDs, hidden source delivery and immutable private state are tested.
- Actual repository document TSX and shared legacy-report TSX are transpiled and statically rendered with React DOM server, mocking only React Native host primitives. Five-report pagination, malformed AD, opaque/format-match service states, unsupported BTHome status, inert escaped labels, disabled controls, UNVERIFIED references, binary hash scope, sensitive multiple-advertiser retention and derivative-relative offsets are asserted.
- Pending work is described as fenced, not cancelled. The document remains bounded selectable text. No file, journal, persistence, share, clipboard-write, radio or provider action was introduced in reviewed source.

## Commands and results

All runs used existing sibling node_modules with CI=1, EXPO_OFFLINE=1, EXPO_NO_TELEMETRY=1, npm_config_offline=true, npm_config_update_notifier=false, npm_config_audit=false, npm_config_fund=false.

- Initial `node --test tests/hci-document-ui-independent.test.ts tests/hci-document-render-independent.test.ts`: 7/8 passed; one reviewer fixture failed core context validation because its label contained a newline. No production regression. Original failure, test hashes and exact failed rendering fixture are retained. Corrected only the label to a space.
- Final `node --test tests/hci-*.test.ts tests/analysis-navigation.test.ts`: 115/115 passed, 0 skipped/cancelled, exit 0.
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0.
- `node node_modules/@playwright/test/cli.js test --list`: exit 0, 37 scenarios discovered. List only, no browser/server run.
- `git diff --check`: exit 0 before commit.

Tested production and independent test hashes are retained in tested-source-sha256.txt. Logs are unchanged raw command outputs. Initial source under test was the same production source; only the review fixture changed for the final run.

## Limits

No full aggregate run in this isolated UI review; parent owns integrated checkpoint with separate CLI work. Static React rendering does not execute effects, mounted event handling, native callbacks, layout or accessibility behavior. No browser/native/device execution, network, installs, settings, credentials, provider or remote actions. No acquisition, sensor truth or original-source authenticity established.
