# Offline phone NDEF integration validation

Exact base: `170db6744f02b85791e298510cface88a06e008a`.

- `npm run typecheck`: passed (`typecheck.txt`, repeated as first stage of `full-host.txt`).
- `npm run firmware:build && node --test --test-concurrency=2 tests/*.test.ts`: passed; portable C checks and 290/290 Node tests (`full-host.txt`).
- `node --test tests/phone-ndef-workbench.test.ts`: 8/8 passed (`focused.txt`). Covers SQLite close/reopen for both platforms, source/platform/provenance binding, distinct absence states, inert URI and opaque preservation, exact cap/refusal, unchanged generic limits, digest tampering, async snapshot isolation, edits, duplicate-save lock, stale completions and retry.
- `EXPO_OFFLINE=1 CI=1 npm run build`: web, Android and iOS JavaScript exports passed (`offline-exports.txt`). Not native builds or device validation.
- `node_modules/.bin/playwright test --list`: 18 scenario definitions discovered, including three new phone NDEF scenarios (`browser-scenario-list.txt`). No browser was launched; existing environment blockers remain. No visual or browser acceptance claimed.
- `git diff --check`: passed.

Only already-approved app and REA dependencies were reused through ignored local symlinks. No install, lockfile change, native permission/scanner change, source-register change, provider call, radio/device action, upload, account operation or remote write occurred.

Limits: selected-field documents are not original NDEF wire captures. Provenance/platform are validated caller claims, not attestation. Source timestamp is unavailable; displayed journal time is save time. Source documents over 4096 characters remain previewable within adapter bounds but are rejected for saving without truncation. Original evidence schema, canonical digest implementation and generic total/depth limits are unchanged. Native metadata automatic saving remains unchanged.
