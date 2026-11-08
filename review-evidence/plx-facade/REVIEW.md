# Independent installed-PLX facade review

Candidate: a687f1f08e105bc6d9b65703413eb3bb8cff5f22.
Baseline: 0c38590ff379dd09fdae31b9356634302ffeb150 (v39).
Reviewed in an isolated local clone; existing installed dependencies were linked read-only in practice, with no install or installed-file edit.

## Result

No production defect found within this host-only scope. Candidate 18 cases reproduced. Eleven added independent challenges and 21 existing native-C cases pass together: 50/50. Typecheck passes. These results are not native Android/iOS, Metro, Hermes, native ABI, RF, or physical-device validation.

The published PLX 3.5.1 ESM facade executes unchanged. Loader source returns installed bytes directly, changing module classification and extension resolution only, and propagates the exact importing case query through the module graph. Each synthetic RN object and event bus is keyed by that owner; there is no current-fixture variable. Every executed PLX module matches an explicit pin, with the complete ten-module execution graph asserted independently. Flow entry and native source are only inspected/pinned. All 24 installed pins and all 31 candidate artifact manifest entries matched. All 20 original traces report one clean owned child exit.

## Added challenges

- Both platforms: retain ReadEvent through close, deliver a late error, then reject the native monitor Promise. Real SDK rejection cleanup removes its listener without reviving or changing ownership of the retired adapter session.
- Both platforms: malformed base64 length and oversized notification values close the active session before explicit test cleanup. Single connection cancellation, idle ownership and removed listener are asserted.
- Both lazy import orders: inject an Android transaction on the iOS event bus, then fail and destroy iOS first. Its unknown/unacknowledged state cannot affect the still-working Android adapter. Android completes a further C-backed ping and acknowledged shutdown.
- Exact executed module graph/pins, mutation of callback-owned notification copy without changing recorded C bytes, and malformed C command causing bounded owned-process disposal.

## Source and lifecycle review

Real BleManager, Device, Characteristic, Service, error conversion and generated transaction handling remain in the installed graph. Device operations flow through the unchanged native TypeScript adapter and BleTransport/DeviceSession to the existing C callback bridge. Actual C notification bytes are copied and encoded into synthetic characteristic dictionaries; synthetic native Promise and event schedules remain chosen inputs.

PLX `_handleMonitorCharacteristic` returns a remove function that calls native cancelTransaction. It does not immediately remove its ReadEvent subscription. Resolution and rejection handlers on the monitor Promise remove the wrapped subscription; rejection first invokes the callback with a parsed error. The adapter's closed/current ownership guards suppress late callbacks, as both existing and new cases observe. None of this proves native cancellation ordering or radio release.

C compilation remains the existing host-data fixture with fake headers. There is no firmware startup call: the C bridge requires startup, host-start, callout-init, advertising, erase and NVS counters to stay zero. Its command/output limits, two-second command deadline, fifteen-second lifetime watchdog and owned-child SIGKILL cleanup were inspected. A malformed command produces the expected code-2 exit, and disposal reports the failure rather than hanging. This does not establish process behavior for arbitrary forked programs; the fixture does not fork.

The iOS void destroy export remains unacknowledged. Tests preserve unknown ownership and the adapter reset gate remains closed. No firmware SDK-delta review was performed or reassessed.

## Evidence and limitations

- `baseline.txt`: original 18 tests. An extra nonmatching test path was passed in the initial invocation; Node ran only the 18 PLX cases. The final focused invocation uses the actual `tests/native-c-roundtrip.test.ts` path.
- `independent-initial.txt`: retained first review failure. The reviewer incorrectly assumed Android and iOS monitor IDs would match. They are 13 and 10 because Android performs an additional MTU operation. Corrected test explicitly asserts distinct IDs and cross-bus filtering; no candidate or helper correction was needed.
- `focused.txt`: `node --test tests/plx-facade-c.test.ts tests/native-c-roundtrip.test.ts`, 50/50.
- `typecheck.txt`: `npm run typecheck`, exit zero; preexisting npm environment warning only.
- `integrity.txt`: original candidate artifact hashes, installed pins, trace disposal checks and local tool versions.

Only independent tests and review evidence changed. Production source, loader/helper, dependencies/lockfile, App, NFC, native Android/iOS sources, firmware and CI were not edited. No install, SDK/native build, prebuild, browser, device, radio, USB, flash, credential, setting, provider or remote action occurred. Original candidate manifests describe their exact candidate revision and are intentionally not regenerated to describe the review additions.
