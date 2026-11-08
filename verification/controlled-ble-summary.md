# Controlled BLE seam verification

Isolated worktree: `apex-ble-controlled`, base `21869d8592b0b49efc0573ee84c77143ef4343d9`.

Logs retain command output with trailing whitespace normalized. No installs. Root node_modules reuses `/workspace/scratch/b96d3539d24d/apex-ui-validation-20261107/node_modules`; REA reuses `/workspace/scratch/b96d3539d24d/apex-rea-worker-prep/node_modules` under tools/reverse-engineering/node_modules. These are ignored local symlinks, not patch content.

- `node --test tests/ble-scan-session.test.ts tests/ble-native-observation.test.ts tests/ble-plx-observation.test.ts tests/ble-plx-source-evidence.test.ts tests/accessory.test.ts`: 42 passed. Log `controlled-ble-targeted-tests.txt`.
- `npm run typecheck`: passed full semantic check. Log `controlled-ble-typecheck.txt`.
- `npm test`: firmware build and 168 tests passed. Log `controlled-ble-full-tests-retry.txt`. Initial run without the REA symlink had two REA CLI failures; retained in `controlled-ble-full-tests.txt` rather than hidden.
- `HOME=/tmp/apex-ble-home CI=1 EXPO_NO_TELEMETRY=1 npm run build`: web/iOS/Android exports passed. Log `controlled-ble-export-retry.txt`. Initial default-HOME attempt could not create /home/agent/.expo; retained in `controlled-ble-export.txt`. Writable temporary HOME fixes cache placement only.
- `git diff --check`: passed.

Native wrapper tests intercept JS module loading and inject mocks. No native app, permission prompt, pairing, radio, physical capture, browser, account action, upload or push occurred. Exports are bundles, not native builds or phone acceptance. Browser execution was intentionally not retried because the parent had already established environment restrictions.

Deliberate AXP lifecycle changes: one shared exclusive scanner, overlapping starts reject, cancellation handle is available during preparation, terminal error callback is single-shot, count/character caps, stop-error/timeouts fail closed. Existing service filter and GATT transport remain unchanged. Observation has no UI trigger and cannot save/export evidence automatically.

Review regression fixes: poisoned/failed-destruction health gates all new manager work and existing connection operations; setup lease spans deferred connect/discovery and rejects shutdown/overlaps; old connection handles reject after reset. Added mock tests for these cases and setup rejection cleanup.
