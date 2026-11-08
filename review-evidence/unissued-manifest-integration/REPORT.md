# Current input manifest integration correction

The combined v41 validation at 462ca82877238b1f02cf58ccf5af4c48aeba4d57 failed six browser-C cases because their shared current manifest now includes the native adapter, but this suite's fixed source hash list omitted that file. This was a verification integration mistake, not a runtime failure. The prior focused selection omitted browser-C and did not catch it. The full failed aggregate run is retained separately by the coordinator; this directory preserves an independent local six-case reproduction before correction.

Correction: include src/platform/bluetooth.native.ts in the browser-C suite's actual on-disk source hash collection. It is pinned and recorded as a shared-manifest input, not imported/executed by that browser-C client chain. No current pin is dropped, historical manifest modified, check skipped or expected hash changed. No production source changes.

Validation command:

    node --test tests/browser-c-roundtrip.test.ts tests/native-c-roundtrip.test.ts tests/plx-facade-c.test.ts tests/app-plx-cancellation.test.ts tests/app-plx-independent.test.ts tests/plx-unissued-acquisition.test.ts

Result: 90 passed, zero failed/skipped, covering all six browser-C cases and all three consumers of current-inputs.sha256.json (browser-C, native-C and installed-PLX fixture). TypeScript no-emit passes. The checked-in C data callback fixture is compiled with the host compiler; this is not a firmware/native SDK build, browser execution or physical validation. A fresh independent review and full combined rerun remain the coordinator's responsibility.

Keep this regression selection whenever shared current input keys change, including suites that pin but do not execute a particular shared input. Preserve both failed and passing logs; do not overwrite the original aggregate run.
