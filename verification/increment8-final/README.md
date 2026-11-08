# Eighth combined local checkpoint

Code revision: 40ce61e48801fedfaff2f1f28d21c3a8d5f56b40. Adds supported BTHome numeric scalars, current-versus-historical capability evidence labels, native source parking protection, and exact rational checks of one operator-declared numeric BLE candidate. This checkpoint is local and unpushed.

Combined validation:

- 351/351 Node host tests, concurrency 2, plus portable C checks.
- 22/22 Python source-archive tests and 5/5 REA preflight tests.
- Semantic TypeScript and unchanged 541-entry dependency inventory.
- Offline Expo iOS, Android and web JavaScript exports.
- 20 authored Playwright scenarios discovered, zero executed.

Existing approved dependencies only. Commands used CI=1, EXPO_OFFLINE=1, EXPO_NO_TELEMETRY=1, npm_config_offline=true, npm_config_update_notifier=false, npm_config_audit=false and npm_config_fund=false. The existing host-test log completed before continuation resumed. The partial original source-archive output is retained unchanged; a new complete run passed. Empty initial typecheck output has no independent exit-status record, so TypeScript was repeated successfully to typecheck-complete.txt. All repeated stages exited zero. No source code changed between those checks.

Offline host tests and JavaScript exports do not demonstrate native compilation or device compatibility. No browser acceptance, live BLE/NFC, firmware flashing, provider/account connection, dependency installation, permission change or remote publication occurred. Original archive pins and backup identities remain unchanged. Native process-group tests use fake Expo programs and temporary source sentinel files only.
