# Twelfth combined local checkpoint

Application/core and test code revision: 4af2303. Adds the separate experimental
Android service-data opt-in card/coordinator and an explicitly unapplied iOS
teardown acknowledgement proposal to v11. Installed dependencies, native builds
and iOS availability remain unchanged.

Combined direct-local verification uses CI=1, EXPO_OFFLINE=1,
EXPO_NO_TELEMETRY=1, npm_config_offline=true, npm_config_update_notifier=false,
npm_config_audit=false and npm_config_fund=false:

- 517/517 Node tests, zero skipped, concurrency 2; portable C passes.
- 22/22 Python archive and 5/5 REA preflight tests (544 combined).
- Full semantic TypeScript; unchanged 541-entry dependency inventory.
- Offline web, iOS and Android JavaScript exports.
- 24 authored Playwright cases listed, zero executed.
- Exact PLX 3.5.1 source/hash checked; proposal applies only in a disposable
  temporary fixture. Installed BlePlx.m bytes remain unchanged. No native compile
  or promise/queue execution test is represented by the static checks.

The initial run passed 516/517 Node tests: a catalogue copy edit had dropped the
advertised-UUID warning that service-data-only BTHome may be missed. The warning
was restored, new separate-mode/iOS-gate assertions added without removing the
original check, then the entire Node suite, TypeScript and exports were rerun.
Both the original failing log and final successful logs are retained.

The UI was independently reviewed with 97 focused coordinator/recovery/BLE/NFC
mock tests and TypeScript. No blocking defect was found. React effect replay was
reviewed statically, not through a mounted renderer. Per-session opt-in, separate
mode, bounded pages, exact-source handoff, Stop during preparation and synchronous
uncertainty fencing are source/mock evidence, not browser or phone acceptance.

The iOS proposal independently passed 3 static tests, no skips, and pinned source
review. It preserves callback-free native invalidation and promises only a local
invalidation acknowledgement if compiled into the actual native binary. Existing
start/stop remain void exports: a final acknowledgement fences earlier method
bodies only under reviewed same-instance ordered serial-queue assumptions, not
standalone start/stop completion or OS/RF effects. The proposal is UNAPPLIED and
iOS broad mode/reset stays disabled. Native build, interop/queue and device gates
remain required; the test name now says “declares a promise export.”

No actual scans, device writes, settings/permission grants, native builds,
provider connections, dependency/source-pin changes or remote publication.
Original source registers/lockfile unchanged. Historical failed/blocked checks
remain preserved. Source availability is not authenticated identity, complete
RF capture, universal access, native compatibility or safe arbitrary hardware use.
