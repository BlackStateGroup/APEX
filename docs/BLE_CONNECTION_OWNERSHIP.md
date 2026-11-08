# Native accessory connection ownership

8 November 2026. This is native-adapter groundwork, exercised only with injected
JavaScript mocks. It enables no broad scanning, new permissions, UI acquisition,
automatic manager recreation, radio activity, or compatibility claim.

Each native connection attempt owns a module-level lease before calling
`connectToDevice`. The lease remains through setup, active use and uncertain
cleanup. Distinct identifiers may have multiple active handles, even when the UI
holds only one. The aggregate `accessoryConnectionOwnership()` seam exposes
`idle`, `owned` or `unknown`, never identifiers. It is **not** an exclusive
acquisition API: the new Android-only adapter separately reserves ownership and
arbitrates scanning, preparation, shutdown, scanner health and pending native
operations. See BLE_SERVICE_DATA_NATIVE_ADAPTER.md.

The manager-level disconnect listener is installed before connecting. Notification
unsubscribe does not remove it. A confirmed native close after connect settlement,
successful explicit cancellation, or confirmed Android manager destruction releases the
connection lease. A close event during pending connect does not certify the later
connection result: setup must settle and attempt cancellation. Failed cancellation
retains unknown ownership unless a post-connect native close independently proves
closure. Normal scans, connections and writes fail closed while any lease is
unknown. Explicit disconnect can retry cleanup despite unknown state.

Cancellation calls coalesce. Pending connect/setup or cancellation prevents global
shutdown, including when a close callback arrives during cancellation. Confirmed Android
destruction releases leases/listeners and invalidates old handles by manager epoch.
Failed destruction retains unhealthy state. Cleanup errors remain errors even if a
concurrent close proves the connection ended; they are not silently converted into
successful disconnect. Optional MTU negotiation rejection retains the previously
negotiated MTU, as before, while subsequent checks still reject a closed connection.

## Same-identifier reconnect fence

Pinned source is react-native-ble-plx 3.5.1:

- `src/BleManager.js`, `onDeviceDisconnected`, matches only the identifier. Events
  have no connection-generation token. `connectToDevice` also performs Android's
  existing-connected check/cancel before starting native connect.
- `android/src/main/java/com/bleplx/adapter/BleModule.java`,
  `safeConnectToDevice`, emits its single terminal `DISCONNECTED` notification
  from Rx `doFinally`. `cancelDeviceConnection` disposes the identifier's
  subscription and resolves separately.
- `android/src/main/java/com/bleplx/BlePlxModule.java` emits `[null, {id}]` for that
  event, independently of cancellation promise delivery.
- `react-native-ble-plx.podspec` pins iOS `MultiplatformBleAdapter` 0.2.0.
  Public source was inspected read-only at commit
  `3601846076c7749e9419ea93cf20f3357e7d5617`:
  [BleModule.swift lines 426–453](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/classes/BleModule.swift#L426-L453)
  installs `monitorDisconnection(...).take(1)` on successful connect before
  resolving. Its next/error handlers dispatch the adapter disconnect event.
  [Lines 458–483](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/classes/BleModule.swift#L458-L483)
  resolve cancellation on `cancelConnection` completion; absent connected state
  instead disposes the pending connect and rejects cancellation.
- Pinned [BluetoothManager.swift lines 240–250](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/RxBluetoothKit/BluetoothManager.swift#L240-L250)
  registers another `monitorDisconnection(...).take(1)` before calling native
  cancellation. [Lines 330–340](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/RxBluetoothKit/BluetoothManager.swift#L330-L340)
  filter the shared delegate stream. [RxCBCentralManager.swift lines 62–69](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/RxBluetoothKit/RxCBCentralManager.swift#L62-L69)
  publish CoreBluetooth's disconnect delegate callback to that stream.
  Cancellation settlement and event consumption therefore fence the single old
  adapter monitor for a successfully connected iOS peripheral. They do not
  promise instantaneous physical RF disconnection or cancellation of every
  queued command (the wrapper explicitly disclaims those guarantees).

Duplicate active/uncertain attempts are refused. On Android and after a
successfully resolved iOS native connect, same-ID reconnect is permitted only after connect/cancel operations settle and the terminal event has
been consumed after connect settlement. A successful cancel without the event
releases native ownership but keeps an identifier fence and its lifecycle listener
until the event or successful destruction. No notifications or user callbacks
remain on that retired connection. Retired listener callbacks are inert, including
if invoked directly by a stale mock. All retained fence listeners are removed by
successful shutdown. Missing events can retain a fence indefinitely; there is no
unsafe timeout-based release.

Failed/pending iOS connection differs: its error handler emits a close before
rejecting (BleModule.swift 418–424), and disposal rejects without the established
connection's monitor (441–443). An early close does not prove a pending attempt
cannot still produce a connection. Uncertain attempts or missing terminal events
can therefore still require explicit successful shutdown. The adapter error states
that requirement. Global shutdown is disruptive to all active handles and must be
an intentional recovery action, never an automatic reconnect fallback. A
user-reachable **Reset APEX Bluetooth** control now performs that explicit
recovery on Android only. It releases the app manager, not the phone's Bluetooth system setting,
and never restarts a scan or connection automatically. A failed destruction leaves
the current session and candidate list intact (ordinary scan stopping may still
update its progress UI); only confirmed destruction clears BLE candidates
and the BLE session. USB, host and simulator sessions are not closed. Saved
evidence is unchanged. Five coordinator tests cover these transitions, including
the actual DeviceSession/BleTransport local cleanup stack after simulated manager
invalidation. Expected old-handle cleanup errors are recorded separately from the
confirmed manager-release notice. The
authored (unexecuted) web scenario checks that the native-only control is
disabled. This control is for exceptional states, not ordinary confirmed
disconnect/reconnect.

Recovery is not universal: a native connect/setup/cancellation promise which
never settles keeps the manager busy and blocks shutdown indefinitely. The
control cannot safely prove release by imposing a JavaScript timeout. The UI
states that pending native operations may prevent recovery; native acceptance
must exercise these cases independently.

### iOS destruction acknowledgement gap

The installed PLX 3.5.1 `ios/BlePlx.m` lines 63–66 exports `destroyClient` as a
void bridge method with no promise resolver. `src/BleManager.js` lines 151–168
await that call and clear JavaScript subscriptions and the shared instance, but
this does not acknowledge native invalidation completion. Android's corresponding
bridge resolves after its adapter destruction call. Therefore a settled
JavaScript destroy promise alone must not certify iOS native release or safe
exclusive reuse. Reset is disabled on iOS, and the forthcoming broad
service-data adapter is gated off there before preparation. A source change
providing native acknowledgement and separate native acceptance would be needed
to remove that restriction. Existing successful-disconnect terminal fences are
separate from this destruction gap; they do not manufacture a destruction event.

These source-based fences do not prove arbitrary native/bridge correctness or
phone compatibility. Authorized Android/iOS native tests
remain required before enabling a new exclusive service-data mode.
