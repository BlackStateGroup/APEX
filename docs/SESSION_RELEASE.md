# Local session state and transport cleanup

A closed DeviceSession is a closed protocol conversation, not a claim that native
resources are released. The read-only transportReleasePending property records
whether transport cleanup is still unconfirmed. Ownership is marked before
listener setup so synchronous registration failures also receive cleanup.
Listener removal errors do not prevent other removals, pending-request rejection
or transport cleanup. Late callbacks cannot reopen a closed session.

Automatic terminal and failed-open cleanup share an attempt. A rejected attempt
is retained; only a later explicit close may retry it. The original open/terminal
error is preserved. The optional ByteTransport disconnect retry context carries
that distinction through the BLE adapter so nested catches do not silently retry.
Concurrent explicit closes join an in-flight attempt.

If an early disconnect succeeds while transport.connect is still pending, the
session retains release-pending state. Once acquisition settles, a distinct final
cleanup is required before the state clears. This follows a successful early
cancellation; it is not an automatic retry of rejected cleanup. A generic close
can therefore fulfill while transportReleasePending remains true during unresolved
acquisition. Callers must check the property before dropping the session handle.
The app's clearReleasedSession helper checks both that fact and exact object
identity. Stale completion cannot clear a newer session.

Failed open retains the app's closed session when cleanup is uncertain, leaving
its existing Disconnect action available for explicit cleanup. Labels say no
active local APEX session and closed locally, not that physical disconnection
is proven. A clean failure with confirmed transport cleanup may clear the slot.
The UI behavior remains source/host tested; browser and phone execution are unrun.

USB and BLE have different recovery contracts:

- [USB lifecycle](validation/usb-lifecycle.md) retains a per-native-object lease.
  After an explicit native close rejects, retry may be a link-null no-op. That
  lease stays uncertain even if a later retry fulfills; attempted cleanup is not
  guaranteed recovery. An open rejection without a valid token also stays fenced.
- [BLE transport](BLE_TRANSPORT_RELEASE.md) retains an exact GATT cleanup handle
  and raw pending effects. Failed handle cleanup can be explicitly retried. A
  rejected driver acquisition without a handle remains uncertain. Confirmed
  Android manager destruction is an existing separate recovery boundary; iOS's
  native destruction-acknowledgement gate is unchanged.

A JavaScript timeout, callback, local closed flag or successful no-op does not
establish physical release. Hung native promises can retain ownership indefinitely.
No automatic reset, OS setting change, permission expansion or command authority
is added by these source changes.

The [future transport acceptance checklist](TRANSPORT_RELEASE_ACCEPTANCE.md)
keeps physical and injected-failure cases explicitly NOT RUN until separately
performed on a recorded provisioned build and authorized fixtures.
