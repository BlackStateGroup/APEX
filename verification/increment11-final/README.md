# Eleventh combined local checkpoint

Final application/core code revision: f41901c. Includes v10 plus explicit one-tag
normalized phone NDEF capture, monotonic acceptance timing, connection ownership,
Android recovery, and an Android-only exclusive service-data backend. That backend
is not yet wired to a Start button. iOS is gated off before preparation because the
pinned bridge does not acknowledge native manager destruction.

Completed with approved existing dependencies, direct local binaries, CI=1,
EXPO_OFFLINE=1, EXPO_NO_TELEMETRY=1, npm_config_offline=true,
npm_config_update_notifier=false, npm_config_audit=false, npm_config_fund=false:

- 507/507 Node tests with concurrency 2, plus portable C checks.
- 22/22 Python archive tests and 5/5 REA preflight tests (534 combined).
- Semantic TypeScript, unchanged 541-entry inventory, all three offline Expo
  JavaScript exports (iOS, Android, web).
- 23 authored Playwright scenarios listed; zero executed.

The first combined run passed. After a catalogue display-copy change, the complete
Node suite, semantic TypeScript and all exports were rerun against f41901c. Both
sets of logs are retained. No core/app edits followed those final runs.

Independent review:
- Phone NDEF capture passed 75 focused tests plus direct boundary reproductions.
  Transient inactive state no longer cancels pending permission preparation;
  background does. Deadline timing is monotonic, receipt metadata remains wall
  time. Cleanup uncertainty blocks Inspect/restart; no automatic save occurs.
- BLE ownership passed 28 native/scan tests. Recovery initially passed 32 then 33
  after actual DeviceSession/BleTransport cleanup integration coverage. Only
  confirmed Android teardown clears the BLE session/candidate list.
- New backend review reproduced an inherited ordinary-scan timeout hole: global
  shutdown could reset while an old native stop remained unresolved. The fix
  tracks ordinary start/stop promises beyond timeout and checks before/after
  shutdown stopping. Four regression cases cover pending start/stop with late
  resolution/rejection. Independent final review passed 88 targeted tests and
  TypeScript; no further blocker found in reviewed scope.

PLX 3.5.1 Android destroy resolves after the adapter call. Its iOS void bridge
method lacks that acknowledgement, despite a JavaScript Promise signature.
Therefore iOS reset is disabled and best-effort shutdown cannot release unknown
ownership. Normal iOS advertised-UUID observation and confirmed terminal-event
reconnect are distinct. No native completion, phone compatibility, RF silence,
physical reception, authenticated device identity or universal recovery is
inferred from mocks or source review.

No device/radio operation, permission grant, dependency/source-pin change, browser
execution, native build, credentials, provider connection or remote publication.
Original source registers and lockfile are unchanged. Historical failed/blocked
checks remain at their original paths. Native/browser/physical acceptance remain
open and the phone acceptance plan now includes NDEF and recovery cases, all NOT RUN.
