# Offline I/Q phase increment validation

Source commit: 3f6fd29be9f0bf69374771172afb323a5331522d
Base: 9ea5aa46f1369c7cec8fa7a932d8d48d89fd8703
Worktree: /workspace/scratch/b96d3539d24d/apex-iq-phase

All validation commands used:

```
export CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false
node --test tests/iq-phase-increment.test.ts tests/inspect-iq-phase-increment.test.ts > verification/iq-phase-increment/focused.log 2>&1
npm run typecheck > verification/iq-phase-increment/typecheck.log 2>&1
npm run firmware:build > verification/iq-phase-increment/firmware.log 2>&1 && node --test tests/*.test.ts > verification/iq-phase-increment/aggregate.log 2>&1
```

Results: focused 6/6; TypeScript clean; portable C firmware build and C checks pass; aggregate root test glob 621/621, no failures/skips/cancellations. Aggregate does not count separate reverse-engineering-suite commands or Expo builds. Parent handles combined validation. No dependencies installed. Existing approved node_modules symlinks reused. Raw outputs are preserved unedited, including the inherited npm http-proxy configuration warning.

Confidence: deterministic exact-integer and geometry behavior, strict options/provenance validation, branch/alias conventions and CLI fail-closed behavior are directly tested. This is not evidence of physical RF accuracy, sensor calibration, protocol detection or a hostile arbitrary-JavaScript sandbox. See docs/offline-iq-phase-increment.md for mathematical and ownership limits.
