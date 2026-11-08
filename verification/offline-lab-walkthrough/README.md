# Offline lab walkthrough validation

Base: `f8aa135`. Changes are a standalone synthetic CLI, host integration test and usage documentation; no core API/schema, package or lockfile changes.

Validation environment: `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false`. Existing approved dependency symlinks were reused; nothing was installed.

- `typecheck.txt`: `npm run typecheck`.
- `firmware-build.txt`: `python3 tools/build_firmware.py`, before the full host run.
- `focused.txt`: `node --test --test-concurrency=2 tests/offline-lab-walkthrough.test.ts`.
- `full-suite.txt`: `node --test --test-concurrency=2 tests/*.test.ts`.
- `demo-summary.json`: captured CLI output, fixed synthetic demonstration timestamp. The capture is shell redirection performed during validation; the CLI itself only reads fixtures and writes stdout/stderr.

The host tests execute the CLI with Node permission mode and repository-only filesystem read permission (no filesystem write permission), test deterministic complete output, and inject late NDEF/digest failures. This is not native build/device QA, a physical reception test, a trusted timestamp, a signature or calibrated RF validation.
