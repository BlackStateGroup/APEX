# Declared BLE numeric candidate checks

Base: c7e26fd9abe6181f074451c1075b4b8b37a4517c.

Local core/CLI-only implementation. No dependencies, source pins, UI, journal, providers, network behavior, native code or firmware source changed.

Executed on Node v24.22.1 with CI=1, npm_config_update_notifier=false, npm_config_offline=true, npm_config_audit=false and npm_config_fund=false:

- `npm test`: portable firmware build plus complete host suite (see host-tests.txt).
- `npm run typecheck`: passed (see typecheck.txt).
- `npm run inventory:check`: 541 entries verified (see inventory.txt).
- Synthetic CLI demonstration: completed successfully; output intentionally not duplicated here because it retains all original source documents.
- `git diff --check`: passed.

The isolated worktree uses existing approved main and REA dependency symlinks. An initial aggregate run lacked the REA symlink and failed eight REA tests with MODULE_NOT_FOUND; the missing local symlink was added without installing anything, after which the aggregate passed. Final logs correspond to the complete current test file.

All BLE samples are synthetic. No browser, native build, hardware, real RF capture, protocol discovery, calibration, authentication, blinded validation or physical sensor-truth verification was performed. Expected readings and subset assignments are operator declarations. The worktree and artifacts have not been uploaded or pushed.

## Independent-review BOM correction

Review found that the CLI's default TextDecoder would silently remove a leading UTF-8 BOM, while direct core input with U+FEFF is rejected. The CLI now preserves BOM through decoding (`ignoreBOM: true`) so the strict JSON parser rejects it consistently. Core and CLI BOM regressions pass. Original verification logs are preserved; `bom-focused-tests.txt`, `bom-typecheck.txt` and `bom-host-tests.txt` record checks after this correction.
