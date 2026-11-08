# BLE trial comparison UI validation

Base: `db96c1b7466063ae5419bfc1917a625f2e171a4f`.
Worktree: `apex-ble-trial-ui`, branch `work/ble-trial-ui`.
This increment does not include the later REA hardening commit `3176329`.

## Actual local checks

- `python3 tools/build_firmware.py`: portable C checks pass (host executable only, not a native phone or accessory build).
- `node --test --test-concurrency=2 tests/*.test.ts`: **298 pass**, zero failures/skips, including 8 new workbench tests. `host-tests.txt` is the actual output.
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0 (`typecheck.txt`).
- `python3 -m unittest discover -s tests -p 'test_*.py'`: **22 pass** (`python-tests.txt`).
- `node --test tools/reverse-engineering/preflight.test.mjs`: **5 pass** (`preflight.txt`).
- `node --check tests/ui.smoke.spec.mjs`: exit 0, syntax only.
- `node node_modules/expo/bin/cli export --platform ios --platform android --platform web`: exit 0; all three bundles exported (`export.txt`). This is JavaScript/Hermes bundling, not a native build or runtime test.
- `git diff --check`: passed for implementation and documentation.

The host run used `CI=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false`. Expo also used `EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 HOME=/tmp/apex-ble-trial-home`. Already-installed dependency directories were symlinked from `apex-ui-validation-20261107/node_modules` and `apex-rea-worker-prep/node_modules`; no npm command or dependency installation was performed. Export emitted only routine color-environment warnings; no connection attempt or denial was reported.

## Explicit limitations

The two new Playwright scenarios were **defined, not run**. No browser launched, no native app build or phone/device/radio test ran, and no account, network, publication or push operation was performed. Visual layout, actual touch navigation and oversize TextInput behavior still require permitted browser/native QA. Source integrity, experimental control, chronology, ownership, identity and receipt authenticity are not verified by this UI. No core parser, scanner, journal schema or existing workbench implementation changed.
