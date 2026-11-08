# Exclusive Android service-data adapter

8 November 2026. `startSelectedServiceDataObservation({ service, receiptClock })`
in `src/platform/bluetooth.native.ts` connects the pure controller to the existing
singleton manager. A separate experimental Android Devices card now obtains
explicit one-session opt-in and explains broad SDK reception. See
[workbench](BLE_SERVICE_DATA_WORKBENCH.md). No physical scans, permissions, native
builds or phone validation were run.
Web throws. **iOS deliberately throws before preparation.**

## Native completion evidence and platform gate

Pinned installed source is react-native-ble-plx 3.5.1:

- `src/BleManager.js` constructor returns `sharedInstance`. Creating another JS
  manager cannot isolate the scanner. `destroy()` awaits `BleModule.destroyClient`,
  removes subscriptions, clears `sharedInstance`, and rejects active JS promises.
- Android `android/src/main/java/com/bleplx/BlePlxModule.java` `destroyClient`
  invokes `bleAdapter.destroyClient()`, clears the adapter and then resolves its
  native promise. `stopDeviceScan` similarly resolves after the adapter call.
  These are SDK completion acknowledgements, not guarantees of RF silence or OS
  cache deletion. Android's adapter device cache is cleared by destruction.
- **iOS `ios/BlePlx.m` lines 63–66 exports a void `destroyClient`, without a promise
  resolver.** Its implementation invalidates and clears `_manager`, but the JS
  `await` is not an acknowledgement of that queued native execution. The declared
  Promise signature in `src/BleModule.js` does not change that implementation.
  Therefore this new mode cannot certify iOS destruction with the installed API.
  Existing global shutdown also retains unknown state after best-effort iOS
  destruction and throws rather than releasing leases/epoch or allowing manager
  recreation. Shutdown with no manager remains safe. Enabling iOS requires a separately reviewed native completion mechanism and
  native tests, not assuming JS promise settlement proves native teardown.

## Ownership and cancellation

Start validates foreground, service and receipt clock, then synchronously reserves
one module token before the pure controller's deferred acquisition. It refuses
ordinary scan/preparation, shutdown, owned/unknown connections, cancellation and
pending writes. A write retains its pending-operation fence even if a native close
removes the connection lease. Normal scans/connects/writes cannot use this token.
Existing AXP and advertised-UUID filtering remain unchanged. Only this new path
calls `startDeviceScan(null, { allowDuplicates: true }, ...)`.

Preparation uses existing permissions without declaration/request expansion.
Android permission resolution checks cancellation before manager creation. Readiness
failure/cancellation cleans an already created manager before reporting no ownership.
Background cancels; transient inactive does not. Initial Start requires active.
No automatic restart, persistence or provider submission is added.

Every lease operation is bound to the same manager epoch. Callback delivery checks
ownership, cancellation and destruction. Start and stop promises are tracked until
actual settlement. Ordinary filtered scanner start/stop promises have a separate
module-wide fence that outlives their core controller's cleanup timeout. Global
shutdown checks it both before stopping the controller and after that stop returns:
a controller timeout cannot authorize destruction while an old native effect is
still pending. Actual settlement alone does not heal the poisoned controller;
explicit successful shutdown is required before a later session. Ordinary scanner
callbacks and operations also check the manager epoch. Destruction waits all issued effects, including timed-out stop
calls, before touching the singleton. A hung operation can hold the token forever.
Timeout does not release it. Stop failure still leads to attempted destruction.
Only confirmed successful Android destruction resets manager/scanner state and
releases ownership. A late successful teardown may release native ownership but
never rewrites the controller's already returned nonreusable result.

Explicit global shutdown can retry a failed destruction only after acquisition,
start and stop have settled and cancellation has occurred; it refuses an active
observation or pending effect. It never destroys a replacement instance. A thrown
manager constructor has uncertain native effects and no reliable returned handle:
that state remains quarantined and requires an app restart rather than a false
successful no-manager reset.

## Limits and next steps

The pure controller's 10-second/100-callback/25-match/65,536-character budgets bound
cooperative JS acceptance and retention, not native allocations, radio packets,
bridge queue size or wall-clock stop during JS suspension. Matching source payloads
can include unrelated fields. SDK destruction is not OS cache erasure. No matches
does not establish absence, ownership, authentication or complete capture.

`tests/ble-review-pending-effects.test.ts` preserves the independent review
regression for ordinary start/stop timeouts, late resolve/reject, post-stop shutdown
fencing and explicit reset. `tests/ble-native-service-data.test.ts` uses injected JS-only mocks for synchronous
reservation and callbacks, filtered-path preservation, connection/unknown/write
fences, permissions, foreground/background, failed/hung preparation/start/stop/
destruction, late cleanup, stale callbacks and explicit recovery. These are not
Android/iOS hardware compatibility results. Android native build/device validation
remain future gates; informed UI integration is source-implemented and mock-reviewed,
not browser/phone accepted. iOS additionally needs the native
acknowledgement correction described above.
