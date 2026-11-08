# iOS BLE teardown acknowledgement proposal

Status: UNAPPLIED, source-reviewed only, 8 November 2026. No installed dependency,
app configuration, native project, permission, or mode gate is changed. No native
build, device, Bluetooth or radio action was performed. iOS broad service-data
observation remains gated. This proposal alone does not authorize enabling it.

## Smallest maintainable correction

The existing JavaScript `BleManager.destroy()` awaits `destroyClient()` through
`_callPromise`. PLX 3.5.1 exports the iOS method without promise callbacks. Awaiting
that non-promise return does not acknowledge native execution. A JavaScript delay,
extra queue turn or wrapping that return in `Promise.resolve` cannot repair this.

The adjacent [unapplied patch](proposals/react-native-ble-plx-3.5.1-ios-destroy-ack.UNAPPLIED.patch)
changes the exported method to a promise under the same JavaScript name. It calls
the original synchronous helper and resolves only after that helper returns.
The existing React Native `invalidate` entry point uses the same helper, without
creating or invoking a JavaScript callback during bridge teardown. A repeat call
on the module queue sees a nil manager and is a no-op that can resolve again.
This is queue-serialized idempotence, not a general cross-thread guarantee. No
private runtime module lookup, KVC, monkey-patching or speculative queue barrier
is used. Exceptions are not converted to success.

Keep this as a reviewed upstream change or an explicit, reproducible,
version-pinned dependency patch in a separately authorized integration. Do not
silently edit node_modules or assume Metro reload changes the installed native
binary. A separate shim that owns a second manager would not destroy PLX's actual
manager and is not a substitute.

## Exact applicability

- Installed `react-native-ble-plx`: **3.5.1**. Reviewed upstream commit:
  [`92a496d60f81642d2f45cecfc44f47a62904a86d`](https://github.com/dotintent/react-native-ble-plx/blob/92a496d60f81642d2f45cecfc44f47a62904a86d/ios/BlePlx.m).
- Exact installed `ios/BlePlx.m` SHA-256:
  `6ad0e48dd16c6587c279d81d06eb5553c0c9e135df4c653a91c8d8abf9990207`.
  The supplied checker refuses any changed bytes or version, even if a patch
  could apply with context fuzz. The patch targets a PLX package root.
- Podspec pins `MultiplatformBleAdapter` **0.2.0**, reviewed tag commit
  `3601846076c7749e9419ea93cf20f3357e7d5617`. Actual Pods and lockfile resolution
  are not established here; pin and verify them at integration time.
- Installed React Native **0.88.1**. Relevant local source:
  `ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/RCTInteropTurboModule.mm`
  lines 145–218 validates trailing resolve/reject parameters and selects PromiseKind.
  File SHA-256: `bfe6ad5e2b5a1847967abf6817b55125fc33e3d8722b1c7be60affc1c61f717b`.
  `RCTTurboModuleManager.mm` lines 655–721 sets/retains methodQueue and lines
  944–997 dispatch module invalidation on it. The actual generated architecture
  and resulting native binary still need validation.
- Legacy bridge source `React/Base/RCTModuleMethod.mm` lines 363–371, 510–520
  classifies promise signatures; `Libraries/BatchedBridge/NativeModules.js`
  lines 99–165 constructs a Promise only for promise methods. These are source
  facts, not proof that this app exercises the legacy bridge.

## What the native acknowledgement means

On the serialized module queue, the adapter's `invalidate()` has returned and
PLX has cleared its manager reference. At the reviewed adapter commit,
[invalidate, lines 100–119](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/classes/BleModule.swift#L100-L119)
disposes state/restoration, replaces the scan disposable, disposes transactions
and connection attempts, clears caches, subscribes to cancellation for connected
peripherals, and clears its connected/pending-read maps. It contains no
DispatchQueue.async scheduling or completion callback to await.

[SerialDisposable](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/RxSwift/Disposables/SerialDisposable.swift)
disposes the replaced scan subscription synchronously.
[DisposableMap](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/classes/Utils/DisposableMap.swift)
disposes each stored subscription and removes its map entries.
[QueueSubscribeOn](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/RxBluetoothKit/Observable%2BQueueSubscribeOn.swift)
uses an in-memory serialized subscription list and current-thread scheduling;
it is not an additional GCD completion barrier. Its disposal removes the queued
operation and disposes its source.
[BluetoothManager scan disposal](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/RxBluetoothKit/BluetoothManager.swift#L133-L155)
invokes stopScan when powered on. The
[Core Bluetooth wrapper](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/RxBluetoothKit/RxCBCentralManager.swift#L119-L130)
forwards cancellation and stop directly.

This acknowledges local invalidation, NOT:

- a `didDisconnectPeripheral` completion for every connection; cancellation
  subscriptions are started, not awaited, and powered-off/error paths may fail;
- physical RF silence, remote disconnection, OS-global cache erasure, guaranteed
  object deallocation, or a bounded native/bridge backlog;
- drainage of already queued events or immunity from operations enqueued after
  destroy. Existing epoch checks and exclusive ownership remain necessary;
- completion when the native method queue is blocked or the bridge is gone.
  The promise can remain pending. Timeout must retain uncertainty, never resolve
  teardown as successful. A bridge reload cannot be assumed to deliver callbacks.

The adapter's own
[cancellation documentation/implementation](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/RxBluetoothKit/BluetoothManager.swift#L240-L258)
explicitly separates local cancellation from immediate physical disconnection.
If the acceptance criterion requires per-device disconnect acknowledgement,
this small patch is insufficient: a separate adapter-level asynchronous contract
and error aggregation would be needed.

## Start/stop caveat and the final destruction fence

Pinned [PLX iOS start/stop exports, lines 98–105](https://github.com/dotintent/react-native-ble-plx/blob/92a496d60f81642d2f45cecfc44f47a62904a86d/ios/BlePlx.m#L98-L105)
are also void methods with no resolver/rejecter. The installed
`src/BleManager.js` lines 364–391 wraps their results in `_callPromise`, whose
`Promise.race` at lines 189–195 can settle on the undefined native return.
Consequently a resolved start or stop wrapper is not native completion evidence.
The destruction-only patch intentionally leaves these exports unchanged.
The existing advertised-UUID mode is source-implemented and native-unvalidated;
its resolved wrappers must not be described as acknowledged native start/stop.

For the **limited local teardown contract**, a final acknowledged destruction
can fence earlier start/stop method bodies without adding start/stop promise
exports, provided all calls target the same module instance and are submitted
in order to its same serial method queue, the exclusive owner prevents later
starts/replacement, and the actual binary contains this destruction patch.
Installed RN0.88.1 `RCTTurboModuleManager.mm` lines 109–125 dispatch async calls
to methodQueue; line 233 creates its default shared queue as serial, and lines
655–721 assign/retain that queue for this module. PLX passes its methodQueue to
the adapter at creation. Under those conditions, an earlier queued start/stop
body returns before the later destroy body invalidates the manager and resolves.
No extra start/stop patch is required merely to establish that local teardown
ordering. This is a source-backed conditional argument, not runtime acceptance.

It does not repair start/stop acknowledgement as an independent API contract,
prove the start succeeded or stop completed at the OS, fence work submitted
after destroy, cover a different instance/queue, or drain asynchronous callbacks.
Keep ownership until final destruction acknowledgement, keep timeout/failure
uncertainty, and reject late operations with existing epochs. If callers require
an independently acknowledged start or stop before destruction, review a separate
contract/correction rather than treating this patch as sufficient. No such patch
is included here.

Native acceptance must additionally delay the method queue, submit ordered
start → stop → destroy through the actual JS/interop path using a fake adapter,
and verify only destroy remains pending until native invalidation returns.
Assert native invocation order, no replacement or later start while teardown is
pending, old-event suppression, and retained uncertainty if the queue never runs
or the bridge disappears. Repeat with cancellation before start submission and
while start is already queued. These tests establish local ordering only;
real-device scan/cancellation acceptance remains a separate gate.

## Static verification only

Run from the repository root, supplying the actual installed PLX package:

```
node tools/check-ios-ble-teardown-proposal.mjs /path/to/node_modules/react-native-ble-plx
BLE_PLX_SOURCE_DIR=/path/to/node_modules/react-native-ble-plx node --test tests/ios-ble-teardown-proposal.test.ts
```

The checker reads and hashes the dependency, copies only BlePlx.m into a temporary
fixture, checks/applies the patch there, reads the result and deletes the fixture.
It never patches the installed package. Three tests passed with no skips against
the pinned installed source: export/order/helper structure, drift refusal, and
temporary application with unchanged installed bytes. These are textual/static
checks, not Objective-C compilation or an execution test of dispatch/Rx semantics.
When no dependency is available the exact-source test is explicitly skipped.

## Integration and native acceptance gate

1. Obtain authorization for dependency integration/build work. Retain the source
   hash guard and resolved pod revision; confirm no other package already fixes
   this contract. Make the patch reproducible and visible in build provenance.
2. Compile the actual Expo/RN0.88.1 iOS target and record Xcode, deployment target,
   architecture, resolved Pods and binary revision. Verify both exported JS name
   and promise result through the actual RN interop path, not only Objective-C.
3. With an injected fake adapter (the pinned adapter exposes a factory seam),
   hold the method queue and prove destroy stays pending until invalidate returns;
   assert one adapter invalidation for repeated destroy, destroy before create,
   and destroy followed by RN invalidation. Verify bridge invalidation has no
   JS resolver requirement. Use real native tests/Thread Sanitizer for queue
   ordering, not the static tests above. Do not invoke unrelated radio APIs.
4. Test ordinary app shutdown, reset, failed/hung destruction, cancellation while
   preparation/start is pending, late callbacks, and stale manager epochs.
   Block replacement/reuse until the app's exact required acknowledgement is
   observed. No automatic scans/connections after reset. Check concurrent JS
   destroy calls separately: this native idempotence does not establish PLX's
   shared-instance and active-promise behavior under JS concurrency.
5. Separately authorized named-phone/owned-emitter acceptance must verify
   background/foreground, real scan stop and connection cancellation behavior.
   A local acknowledgement is never relabeled as RF or remote-device proof.
   Preserve all existing bounded-session, privacy and explicit-start gates.
6. Only after those checks should the responsible owner consider a separately
   reviewed change to the iOS availability gate. Do not detect safety solely
   from a resolved JS promise, package version or presence of a method name:
   unpatched native binaries can still be paired with newer JavaScript.
