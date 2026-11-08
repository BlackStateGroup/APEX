# Installed PLX scan lifecycle boundary

This increment executes installed **react-native-ble-plx 3.5.1 published ESM**,
unchanged `bluetooth.native.ts` and `ble-scan-session.ts`. It deepens existing AXP
accessory discovery only. There is no production change or established production
bug. The existing per-case PLX loader and its historical pins remain unchanged.

## Actual SDK findings

Installed `lib/module/BleManager.js:318-336` registers ScanEvent **before** native
start is invoked. A scan event converts its error with `parseBleError` and wraps
its dictionary in the real `Device`. The SDK start returns a Promise, not a void
fire-and-forget acknowledgment. Stop removes the JS subscription **before** native
stop is invoked, then returns that native call through `_callPromise`.

`_callPromise` at lines 146-160 races the supplied native Promise against manager
destruction and converts rejected `error.message` through `parseBleError`.
Thus stop listener removal does not prove native stop settlement. Conversely a
queued callback retained before removal can still reach the real SDK callback;
the controller must separately reject publication after its logical terminal state.

The actual adapter/controller satisfies those tested boundaries. Cancelling an
unacknowledged start causes an immediate stop, waits for start settlement, then
stops again. Replacement remains blocked during cleanup. A start or stop held past
the actual 2000 ms cleanup bound poisons the controller; the adapter retains its
outstanding SDK-operation fence and refuses manager reset. After raw settlement,
explicit Android-model reset allows replacement. Stale stop handles do not stop
that replacement. Native stop rejection is converted to BleError and poisons reuse.

## Checks and exact scope

Run from repository root with the already installed dependencies:

```
node --test tests/plx-facade-scan.test.ts
APEX_PLX_SCAN_EVIDENCE=verification/plx-scan-facade node --test tests/plx-facade-scan.test.ts
```

18 tests cover:

- Android and iOS models pass **only `[AXP_SERVICE]`** with `allowDuplicates: false`.
- Actual SDK event/Device conversion reaches bounded candidates: 100 callbacks
  maximum, 128-character names, null-name fallback, missing device ignored,
  oversized projected candidate refused before publication. Duplicate callbacks
  consume the cap; this is not unique-device counting.
- Cancellation during held start and stop; listener removal, saved late callbacks,
  repeated/stale stop handles, and stop acknowledgment before connection handoff.
- Actual BleError conversion for scan events, native start rejection and native
  stop rejection; reusable start failure versus poisoned stop failure.
- Cancelled Android permission preparation cannot start when its Promise resolves.
- Raw start/stop held beyond real cleanup grace block reset until settlement.
- Two per-case module owners, in reverse lazy-import order, keep isolated SDK
  singletons/listeners; destroying the Android model does not affect the iOS model.

The last case tests **test-fixture module isolation**, not support for multiple
native BLE managers in one application. Production PLX has a shared singleton.

`verification/plx-scan-facade/` retains focused 18/18 and combined 101/101 results,
typecheck output, synthetic traces, and exact executable input hashes. The combined
run overlaps focused coverage and includes the existing installed-PLX/C suite,
scanner core, native observation, service-data and native-acquisition suites.
Historical evidence and `tests/browser-c-host/current-inputs.sha256.json` are not
rewritten. The new scan suite itself does not invoke C or firmware startup.

## Limits

RN NativeModules/EventEmitter, permissions, readiness, native device dictionaries,
Promise settlement and event ordering are explicit synthetic inputs. The native
model asserts exact arguments but does not emulate radio filtering. Saved callback
invocation models a queued event; it does not establish whether or when an OS
would deliver one. These are Node execution of published ESM artifacts, not
Metro/Hermes, RN ABI, native SDK, OS permission, radio or physical-release evidence.
No browser, real device, SDK/native build, install, firmware change, provider,
credential or remote action occurred. iOS destruction acknowledgment remains
unresolved and untested here. The denied firmware-startup delta review is outside
this work and was not retried or examined. The first development run needed a
missing synthetic Android `isDeviceConnected` method; this was a fixture defect,
not an application failure. No production fix is proposed.
