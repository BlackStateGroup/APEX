# Independent exact-route expectation follow-up

Reviewed builder commit: 2b446e56f66c3551e66b5b0c9cbcfad4f1f18025. Local equivalent: 258fa1e. Original independent review HEAD: 96ba5f3.

No production changes. The follow-up updates only two test suites and retains logs. Exact assertions are not weakened: eleven IDs remain checked in full order, all five source routes remain checked as a full object, every previous mount remains checked, and the document mount is added in its exact position. Static NFC retains its exact label at updated index 10; Recording remains the default.

Independent results using existing node_modules and CI/offline/telemetry-disable environment variables:

- Before correction, `node --test tests/analysis-inspector-independent.test.ts tests/nfc-static-memory-review.test.ts`: 18/20 passed, two expected stale-list failures, exit 1. Raw output and initial test hashes retained.
- After correction, `node --test tests/hci-*.test.ts tests/analysis-navigation.test.ts tests/analysis-inspector-independent.test.ts tests/nfc-static-memory-review.test.ts`: 135/135 passed, no skip/cancel, exit 0. Includes eight independent document review tests beyond builder's 127.
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0.
- `git diff --check`: exit 0.
- `git diff 96ba5f3 HEAD -- App.tsx src packages`: empty.

During local cherry-pick Git's directory-rename inference proposed moving builder logs into the independent evidence directory. Restored all three new builder logs to their original verification/hci-document-ui paths; no content changed. The combined shell command following this conflict did not run tests: its directory variable was unset and attempted output redirection to root was rejected as read-only. No root file was written. Re-ran verification with explicit correct paths; authoritative corrected logs are included here.

No additional test edits were needed beyond builder's strict correction. Original failed test source is reproducible from initial-head.txt and initial-test-hashes.txt; corrected-source-hashes.txt identifies the tested files. Parent retains original integrated aggregate failure and owns full aggregate rerun. No browser/native/device/network/provider/install actions performed, and no mounted acceptance claimed.
