# Explicit phone NDEF capture verification

Only direct local synthetic tests and TypeScript checks were run. Commands used
CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_offline=true
npm_config_update_notifier=false npm_config_audit=false npm_config_fund=false.

- `node --test tests/phone-ndef-capture.test.ts tests/nfc-lifecycle.test.ts tests/phone-ndef-workbench.test.ts tests/nfc-manager-ndef.test.ts`: see focused.log.
- `node node_modules/typescript/bin/tsc --noEmit`: see typecheck.log (empty on success).
- `git diff --check`: passed.

Tests cover synchronous exact selected-field snapshot, single/multiple/stale
callbacks, distinct absent/null/empty results, invalid and oversized refusal,
deadline during preparation, cancellation and failed late startup, duplicate
Start/Stop, cleanup failure/retry, background/tab/unmount cancellation, transient inactive-to-active preservation,
deadline rejection before timer dispatch, exact
handoff and stale edit/save guards, and integrated mock iOS singleton ownership
through closure while unregister remains pending. Existing lifecycle tests cover
the reviewed backend contracts. No test represents RF capture or device acceptance.

The browser scenario for unavailable web capture and separate draft/import behavior
is authored only, not executed. Real native-to-React handoff and rendering still
require acceptance testing. Browser execution remains blocked by the previously
documented environment restrictions. No SDK calls, NFC/radio operation, native
build, install, network request, remote write, dependency/source-pin change or
permission grant was performed. The parent owns aggregate checks and independent
review. Dependencies reuse the existing ignored sibling node_modules symlink.

The 30-second limit bounds accepting observations, not guaranteed native release.
SDK promises cannot be forcibly cancelled; restart/Inspect stay blocked until
startup and cleanup settle and required close events arrive. A failed cleanup can
be retried with Stop, and unmount remains best effort. Capture is memory-only;
Inspect copies the exact newly prepared selected-field document and expected
platform to the existing importer without automatically displaying interpretation or saving it. The adapter internally
computes a projection during validation. App receipt time
is separate and never misrepresented as RF/source time. Text-only usage-description
and alert changes are documented in docs/NFC_MANAGER_NDEF.md; scopes unchanged.


Follow-up lifecycle correction: the App now uses the tested lifecycle helper to
cancel on background only, preserving transient inactive states during native
preparation. New Start still requires active, and foreground return never starts
or resumes an operation. Focused suite after this correction: 61 tests passed.

Clock correction follow-up: duration uses monotonic performance.now, independently
of Date.now receipt metadata. Final focused suite: **75 tests passed**, including
forward/backward wall-clock changes at an elapsed deadline before timer dispatch,
exact independent receipt ISO retention, invalid/throwing receipt cleanup, invalid
monotonic startup refusal and backwards/nonfinite callback time refusal. Invalid
receipt tests explicitly hold cleanup pending and verify restart/Inspect remain
blocked until release. Strict typecheck and diff check passed. No device/browser,
network, dependency or permission operations were used for this follow-up.
