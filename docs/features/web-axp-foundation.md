# Experimental Web Bluetooth AXP foundation

Status: injected foundation now used by the explicit experimental application binding described in [web-axp-application.md](web-axp-application.md). The API design below remains intentionally independent of globals and UI. All verification is synthetic host-side work. No browser, device, native build, permission prompt, hardware interoperability, physical radio teardown, or authentication result is claimed.

## Browser scope

A future integration must check a secure context and the presence of `navigator.bluetooth` before injecting a host. Chrome documents GATT support on Android, macOS, supported Windows, and ChromeOS; Linux is qualified/experimental. Ordinary Safari/iOS does not provide native Web Bluetooth. Browser brand alone is insufficient, and an iPhone is not implicitly supported by installing a differently named browser. API availability, permissions policy, user permission, platform implementation, and device support remain separate conditions.

Sources (public documentation, not hardware validation):
- https://developer.chrome.com/docs/capabilities/bluetooth
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
- https://bluetooth.spec.whatwg.org/#bluetoothremotegattserver
- https://github.com/whatwg/bluetooth/blob/main/implementation-status.md

## API boundary

`src/experimental/web-axp.ts` exports local structural host interfaces and `WebAxpManager`. Import and construction do not inspect browser globals or perform any browser effect. One application should own one manager; separate managers are not coordinated by this foundation.

- `chooseAccessory()` must be called directly by a future explicit click handler. It reserves chooser ownership and invokes exactly `requestDevice({filters:[{services:[AXP_SERVICE]}]})` synchronously before any await or observer publication. No enumeration, `getDevices`, broad advertising, fallback scan, or arbitrary service request exists.
- Selection returns a frozen copied candidate: local opaque ID, at most 80 code units of claimed name with controls/bidi formatting removed, and `rssi: null`. It does not expose the browser device ID, MAC address, RSSI, browser object, or persisted record. The selected device reference exists only in memory.
- `connect(id)` synchronously reserves a one-use lease and returns an already-fulfilled promise containing a frozen cleanup-owning GattConnection facade. It performs no browser effects. Invalid/stale/busy selection returns an inert failure handle whose subscribe rejects and whose disconnect succeeds without touching other leases. This prevents unchanged core code from having a rejected acquisition without a cleanup handle.
- `subscribe()` installs the close callback before acquisition, then connects, obtains exactly the owned AXP service/write/notify characteristics, validates write-with-response and notify/indicate properties, installs the listener, and starts notifications. Returned server and notification characteristic identities must match the owned objects. Subscription resolves only after notification startup. Close before subscribe has no browser effect.
- `writeWithResponse()` is unavailable before setup or after fencing; only 1..20 byte copied chunks go to the exact write characteristic with a response. The unchanged BleTransport is authoritative for 524-byte frame limits, serialization, and its queue of 16. No arbitrary command API is added.
- `snapshot()` returns frozen data only: state, copied candidate, raw-pending count, and bounded error. Observer exceptions are isolated. `active` means browser notification setup is active, **not** that DeviceSession has completed protocol negotiation.
- `cancelCurrentLease()` atomically clears an unacquired local selection without browser effects. With a pending picker or lease it immediately fences adapter wrappers and requests local browser disconnection. It does not itself certify cleanup. Finish with session close, or explicit `retryCleanup()` when appropriate.

The exact UUID constants are imported from unchanged core: service `6f1d0001-8632-4a97-a816-7776d2b7a101`, write `6f1d0002-8632-4a97-a816-7776d2b7a101`, notify `6f1d0003-8632-4a97-a816-7776d2b7a101`. UUID matches, claimed names, READY, and protocol identity are not authentication or proof of ownership. The only application negotiation is unchanged system.info, system.capabilities, and system.ping. There is no raw RF, unlocking, or authentication feature.

## Readiness, notification bytes, and deadlines

Only real characteristic notifications are passed to unchanged BleTransport. The adapter never manufactures AXP_READY. READY received while startNotifications is still pending is delivered, but subscription still waits for startup settlement. Core rejects missing/wrong READY and independently runs DeviceSession negotiation.

Notification DataView slots are read intrinsically, preserving byte offset and exact length, then copied. Only 1..512 bytes from fixed, nonshared ArrayBuffer storage are accepted. Malformed, detached, shared, resizable, or oversized values fence the lease. No host payload references escape snapshots or callbacks.

Web Bluetooth exposes no negotiated MTU. The returned `mtu: 23` is only a conservative transport budget yielding 20-byte fragments; it is not a measured MTU.

Default public deadlines are 4 seconds per effect, 12 seconds total subscribe setup, and 5 seconds per cleanup attempt. Configuration is validated (effect <=12s, setup <=20s, cleanup <=10s). A future browser BleTransport must use its existing `timeoutMs: 30000`: that single READY deadline spans adapter acquisition and actual READY, without a restart after setup. The application binding now instantiates that transport only on explicit selected Connect. DeviceSession's existing request timeout remains independently applicable to negotiation and ping.

## Raw work and cleanup ownership

Core tracks bounded adapter promises, while this adapter retains every raw connect, service/characteristic discovery, notification start/stop, and write promise separately. Public timeout or explicit cancellation rejects wrappers and requests this page's browser GATT disconnect **before** waiting for raw settlement. It never frees the lease just because a timer or disconnection event fired. Every asynchronous setup continuation checks fencing before another browser effect; a late connect resolution requests disconnect again rather than discovery. A hung raw promise can retain the manager indefinitely, honestly.

States are idle, picking, selected, reserved, acquiring, active, closing, and cleanup-unknown. One chooser or lease remains exclusive until retirement. Cancelling a chooser rejects its local result but cannot abort the browser dialog or revoke a browser permission grant. Raw chooser ownership persists until its promise settles, and late results are ignored rather than connected.

Cleanup is reserved before calling any observer or close callback, so reentrant retries join the same promise. Listener removal is synchronous on unsubscribe. An unsubscribe may dispatch a tracked stopNotifications while the owned server is still connected, then immediately fence/disconnect. Direct teardown never dispatches a new stopNotifications on a disconnected, invalidated characteristic. An already dispatched stop, even if rejected, must settle before handle retirement. A rejected stop is not described as successful: release is instead based on settled raw work, removed local listeners, and a confirmed disconnected browser handle. A hung stop remains cleanup-unknown until it settles.

Disconnect resolves only after raw work settles, listeners are removed, and the owned browser GATT handle reports disconnected. An already-connected foreign/shared server is refused without disconnecting it. Failure, unconfirmed connected state, or deadline expiry retains exclusive ownership and reports cleanup-unknown. A later raw settlement does not auto-release a poisoned lease; an explicit cleanup retry is required. Concurrent retries share pending cleanup work. Once retired, old handles and callbacks cannot disconnect or mutate a newer lease. Each new lease discovers fresh characteristics.

A core-only close may wait until the adapter's public effect/setup deadline because unchanged BleTransport drains driver-facing work before calling handle disconnect. Use the explicit adapter cancellation seam before closing when immediate local fencing is wanted. Neither approach certifies physical radio teardown or disconnection of other apps, and neither forces reconnect or replacement after uncertainty.

## Verification

Run only host checks for this stage:

```
node --test tests/web-axp-foundation.test.ts
node_modules/.bin/tsc --noEmit
```

The synthetic fixture exercises unchanged BleTransport and DeviceSession with exact AXP READY and encoded info/capabilities/ping responses, including 0/20/21/512 byte payloads. It covers chooser activation/order/cancellation, local handle ownership, no-effect closure, all acquisition-phase failures and hangs, late settlement, explicit cancellation, write deadlines, stop settlement, malformed byte storage, stale callbacks, observer exceptions/reentry, and session transportReleasePending retention. Independent review adds its own host fixtures. Failed logs are retained with final evidence; no unprepared aggregate/native/browser run is part of this foundation.
