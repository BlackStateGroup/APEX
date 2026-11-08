# BLE transport release contract

`BleTransport` owns every returned `GattConnection` until that exact handle's
`disconnect()` resolves. Setup failure (including invalid MTU), explicit close,
and terminal callbacks do not erase the handle before cleanup succeeds.
Concurrent cleanup calls join one attempt. A rejected attempt retains the handle
for a later explicit retry; there is no retry loop or replacement acquisition.
The setup error remains the error returned by `connect()` when cleanup also fails.
A subsequent `disconnect()` exposes cleanup failure rather than a false no-op.

Disconnect closes the JS state immediately and drains raw driver acquisition,
subscription registration and native write promises before removing the
subscription and disconnecting the handle. READY, notification and close callbacks
cannot reopen cancelled setup. Pending subscription completion is retained and
unsubscribed before native release. Queued chunks cannot start after closure.
Write timeouts reject callers promptly, but the underlying driver write remains
owned until it settles. Neither timeout nor terminal event proves settlement.

## Current exact-attempt exception

The optional trusted `consumeUnissuedConnection(attempt, id, rejection)` contract
now lets one rejected raw dispatch avoid local acquisition uncertainty only when
the native adapter proves the exact attempt ended unissued. The token is fresh,
opaque and one-shot, with exact identifier, original rejection and receiver checks.
Only initial explicit cancellation or a normally settled, complete canonical Android
permission result selecting denial/cancellation before this attempt calls getManager can qualify.
Scanner stop must have settled successfully with no raw scan operation outstanding.
No error text, copied error, cleanup success or later retry supplies this proof.

Unexpected or malformed permission results, readiness, manager construction,
scanner/busy/health/epoch/duplicate-ID failures, and issued listener/connection
calls remain unknown. Missing/throwing/malformed driver proof remains unknown and
preserves the original rejection. This is local non-acquisition, not native release
or global manager rehabilitation. Raw effects still drain, exact handles still own
cleanup, and iOS teardown restrictions remain. See the
[scope, evidence and review corrections](proposals/ble-unissued-acquisition/IMPLEMENTATION.md).

## Limits and recovery

- An indefinitely pending connect, subscribe or write keeps disconnect pending.
  A bounded UI timeout cannot turn this into confirmed release.
- Outside the exact-attempt exception above, a rejected `BleDriver.connect()`
  provides no cleanup handle and remains acquisition-unknown. Repeated cleanup
  rejects explicitly; it does not invent identifier cleanup or bypass the native
  manager fence. Legacy drivers retain this conservative behavior.
- A failed unsubscribe retains its callback and the native connection for retry.
  Successful unsubscribe is not native release. A rejected disconnect retains
  the exact handle even if the driver has other evidence of closure.
- Existing `recoverBluetooth` may independently confirm Android manager
  destruction and clear the held session. Old-handle cleanup may then reject
  because its epoch is invalid; this is a distinct JS cleanup failure, not a
  claim that native destruction failed. No new reset permission or automatic
  destruction is introduced here. Pending native effects may prevent recovery.
- iOS manager destruction still lacks native acknowledgement under the pinned
  driver contract. This transport change does not solve that limitation.

Coverage is synthetic, exercising JS ownership and deferred driver effects;
there is no claim of hardware/radio validation. Native driver, manager and AXP
command authority remain unchanged. The related session/App integration preserves
cleanup state and the explicit retry context described below.

## Automatic cleanup versus explicit retry

`ByteTransport.disconnect({ retryFailedCleanup: false })` identifies automatic
cleanup. BLE keeps a failed cleanup promise so its setup catch, terminal handler,
and the session's automatic cleanup all observe that same failure rather than
silently starting a second native attempt. An in-flight attempt is always shared.
Direct `disconnect()` defaults to explicit retry; `DeviceSession.close()` forwards
its explicit retry context. Other transports may ignore the optional context.
A successful prior cleanup remains idempotent. Final-chunk write completion also
checks cancellation before reporting success, even when its native write resolves.
