# Independent extended HCI workbench review

Reviewed production commit: `790feaa80bb45c34f45b2b7fa8c0d54779bb25b2`.
Baseline: `fe14d5cca841c0efc004a7413e084cd899e95960`.
Sibling review checkout uses equivalent cherry-pick `9151548`; do not integrate that duplicate.

## Results

- `node --test tests/hci-*.test.ts`: 67 passed, 0 failed on final source, including 8 distinct reviewer cases. Raw output: `hci-final.log.txt`.
- `npm run typecheck`: exit 0. Raw output: `typecheck-final.log.txt`.
- `node node_modules/@playwright/test/cli.js test --list`: exit 0, 34 scenarios listed only. Raw output: `browser-list-final.log.txt`.
- `source-boundary.log.txt` records source hashes, exact equality of candidate/reviewed committed trees, and unchanged HCI core, digest adapters, CLI, App, modules and dependency files against baseline.

All commands reused installed dependencies. Environment: CI=1, EXPO_OFFLINE=1, EXPO_NO_TELEMETRY=1, npm_config_update_notifier=false, npm_config_offline=true, npm_config_audit=false, npm_config_fund=false. npm emits its existing http-proxy configuration deprecation warning; no installation or network action was requested.

## Independent coverage

Actual TSX was compiled with installed TypeScript and statically rendered with React DOM server and narrow React Native primitive mocks. Authored byte builders independently exercised status 0/1/2/3 and payload ASCII/hex marker omission, reserved/contradictory event bits and diagnostics, unknown coded-PHY context, unavailable SID/power, reserved RSSI, interval arithmetic and field offsets. Anonymous/reserved advertiser addresses and inapplicable/reserved directed addresses never acquire MAC strings. Directed types 2/3 show controller-resolved TargetA/scanner-address context rather than asserting definitive target identity. Exact raw event/status values remain visible.

Controller tests cover explicit visible-candidate selection, four-row/four-report pages, off-page and stale observed-state refusal, both-kind switching, malformed final report atomically clearing prior selection, deep-frozen nested aliases, private state fields, all reset categories, late hash success/rejection after each reset, and old/new hash completion order. Hash input equals exact decoded bytes; upper/lower hex spelling yields identical bytes and SHA-256. Long forged strings and oversized report/diagnostic arrays stay bounded in the extended display. Existing legacy AD/service/BTHome tests were retained and passed.

## Preserved reviewer failures

`first.log.txt`: 4 passed, 1 failed in an initial 5-test suite. Reviewer expected literal wording “not definitive target identity”. Actual TSX already displayed the correct conditional TargetA-or-scanner-address meaning and global no-identity claim. Corrected the assertion to verify the actual conditional disclosure; no production fix required.

`typecheck-snapshot.log.txt`: reviewer forged a long enum string without an explicit intentional fixture cast. Added the cast; `typecheck-snapshot-corrected.log.txt` passed. This was reviewer test typing, not a production defect.

`second.log.txt` records 8/8 snapshot passes; `hci-snapshot.log.txt` records 61/61 HCI passes before the builder’s additional tests were committed. Final logs supersede these snapshots without deleting them.

## Limits

No production defect identified within reviewed scope. Static React rendering does not mount hooks or run browser events, React Native layout, accessibility behavior, device APIs or platform native code. Controller tests independently exercise callback guards but do not substitute for mounted lifecycle acceptance. Browser scenarios were listed, never launched; prior browser restrictions were not retried or worked around. No real logs/captures/tags, native/device/provider operations, credentials, persistence, exports, sharing, package installations or publication. No aggregate firmware/export suite was run by this reviewer; parent owns integrated validation. Metadata remains structural evidence with unknown scanner/host context, not full semantic legality, authentication or physical RF reception.
