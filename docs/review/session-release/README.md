# Independent session and BLE release review

Reviewed source stack: session 4367bd4 + 398ca7f, BLE e902ee6 + bfd8090,
and session retry-context integration 0edfd80.

Initial review reproduced skipped cleanup after listener setup failure, late
acquisition surviving early cleanup, BLE setup cleanup failure losing ownership,
automatic retry across transport/session catches, and final-chunk success after
cancellation. Corrections pass the original independent cases (70/70).

Retained additional regressions cover early-release/connect settlement order,
concurrent close callers observing failed late cleanup, repeated native cleanup
failure, and terminal/connect-catch coalescing followed by explicit retry.
Final retained focused suite: 60/60. TypeScript --noEmit exited 0 (empty log).
The terminal-repro-expectation-mismatch log records a reviewer test expectation
mistake: the preserved original terminal error is correct; the assertion was
corrected to expect it. No product change was needed for that mismatch.

All commands used CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1
npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false
npm_config_fund=false and existing dependencies. No aggregate test, native action,
provider operation, installation, or device validation was performed.

Evidence is synthetic JS ownership testing, not proof of radio/native release.
No-handle acquisition rejection remains uncertain. Confirmed Android manager
destruction remains the existing separate recovery boundary; this review adds no
permission or automatic reset. iOS destruction acknowledgement remains unresolved.
