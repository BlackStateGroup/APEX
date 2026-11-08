# Research catalogue evidence labels

The catalogue describes evidence scope, not a phone-readiness checklist. Its
labels distinguish offline host checks, implemented but unaccepted native code,
historical baseline builds and planned acquisition. No app layout, native
behavior, dependency or original source pin/backup is changed by this copy update.

Evidence used:

- [Continuation](../APEX_CONTINUATION.md): offline imports, evidence replay and
  trial UI are implemented; current browser/native/physical acceptance is unrun.
- [Native readiness](NATIVE_BUILD_READINESS.md) and historical
  [verification](VERIFICATION.md): Android APK and ESP32 cross-build successes
  belong to baseline commits, not this continuation. Advertised-UUID filtering
  can miss service-data-only BTHome; iOS matching remains unverified.
- [BTHome](BTHOME_OFFLINE.md): the selected scalar subset contains 37 IDs;
  interpretation does not establish decryption, authenticity or sensor truth.
- [I/Q inspection](OFFLINE_IQ_INSPECTION.md): a narrow offline Node file tool,
  not phone RF reception, calibrated power or an app attachment store.
- NDEF import/framing and data-only hypothesis contracts are host-tested;
  raw-message acquisition and model integration are not claimed.

`tests/catalogue.test.ts` is a small copy-consistency guard, not a capability
acceptance test. It prevents historical build evidence or native collection
from silently becoming a current success label, keeps offline BLE/NDEF/IQ
separate from planned acquisition, and preserves the filter, persistence and
no-model caveats. Changes in actual acceptance evidence should update this guard
and the supporting documentation together.

## Checks for this label update

Based on `c7e26fd9abe6181f074451c1075b4b8b37a4517c`, using only the existing
approved dependency installation and `CI=1 npm_config_update_notifier=false
npm_config_offline=true npm_config_audit=false npm_config_fund=false`:

- `node --test tests/catalogue.test.ts`: 1/1 passed.
- `node node_modules/typescript/bin/tsc --noEmit`: passed, exit 0.
- `python3 tools/build_firmware.py`: portable C build/checks passed.
- `node --test --test-concurrency=2 tests/*.test.ts`: 319/319 passed,
  none skipped or failed.
- `git diff --check`: passed.

No browser tests, JavaScript exports, native builds, physical devices, network
requests, installation or remote actions were run for this label-only update.
