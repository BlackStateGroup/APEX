# BTHome numeric extension: actual offline verification

Base: `31763290d72e5e672759831dc1dd94791588a756`.
Isolated worktree; no changes made to the main continuation worktree.

All test/typecheck/build commands used these environment settings:

```sh
export CI=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false
node --test --test-concurrency=2 tests/bthome*.test.ts
node node_modules/typescript/bin/tsc --noEmit
python3 tools/build_firmware.py
node --test --test-concurrency=2 tests/*.test.ts
```

- Focused BTHome tests: 22 passed, 0 failed/skipped (14 existing, 8 added).
- Full strict app TypeScript check: exit 0; empty typecheck.txt is expected.
- Firmware host build: exit 0, output retained in firmware-build.txt.
- Full host Node suite: 310 passed, 0 failed/skipped, concurrency 2. This
  includes the existing local static REA firmware inspection tests.
- Existing installed app and isolated REA node_modules reused through symlinks;
  no installation, dependency or lockfile change.
- Retained constants and MIT license verified by SHA-256 and Git blob hashes in
  the new automated tests. Original source pins and copies remain unchanged.
- Browser/UI, Expo export, native builds, physical devices, live RF reception,
  pairing, encryption, authentication and sensor-truth validation were not run.
- No network request, source download, upload, remote write or provider call was
  made. Tests are offline host checks, not platform or hardware acceptance.

The production change only extends the numeric specification table. Parser flow,
resource limits, provenance, byte retention, unknown-stop behavior and opaque
ciphertext handling are unchanged.

## Combined integration check

After merging with the separate BLE trial UI on baf9ec0, 318/318 Node tests, portable C checks and full semantic TypeScript passed under the offline/notifier-disabled safeguards. Logs: combined-host.txt, combined-c.txt and combined-typecheck.txt. This is still software-only validation; current combined web/mobile JavaScript exports will be recorded at the next packaged checkpoint. No browser or physical acquisition was performed.
