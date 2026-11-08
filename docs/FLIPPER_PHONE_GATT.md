# Optional Android Flipper GATT bridge

## Scope and status

`packages/adapters/flipper-ble-plx.ts` is a concrete, optional Android bridge for
APEX's read-only Flipper RPC client. It calls the existing
`react-native-ble-plx` 3.5.1 manager APIs to connect to one selected device,
discover characteristics, establish serial subscriptions, read RPC status and
credit, obtain version/identity/power, and clean up the connection.

It is **not wired into the app UI or the shared Bluetooth manager**. The host must
supply an exclusive manager lease, explicit device selection, already-granted
Android permissions and foreground lifecycle callbacks. No second BleManager is
created. No scans, automatic manager destruction/recreation, USB entry, app
launch, GPIO, storage, radio-transmit, firmware update or RPC-reset operation is
implemented. The three outbound RPC requests remain the existing read-only
allowlist. The bridge does not write the RPC status characteristic or manually
write descriptors; PLX's monitor setup configures the normal CCCDs.

All current execution evidence is from **mocked native APIs and synthetic wire
fixtures**, not a phone, radio or Flipper. iOS is rejected before native calls.
**No merge or release until checks and physical acceptance clear.**

## Calling contract

`readFlipperPhoneSnapshot(lease, options)` returns one version/identity/power
snapshot only after cleanup is confirmed. It is deliberately a one-shot API,
not a persistent background connection. The result is device-supplied text and
integers, not authenticated identity or certified physical provenance.

The host supplies `FlipperPhoneLease`:

- `manager`: the existing PLX manager, not a newly constructed lookalike. PLX
  implements a singleton; `new BleManager()` can return another feature's manager.
- `assertCurrent()`: throw unless the host still holds an exclusive reservation
  covering scans, connects, writes, pending preparation, shutdown and uncertain
  operations. The host must not hand over a manager with untracked pending work.
- `isForeground()` and `onForegroundChange(...)`: reflect actual app foreground
  state. A transition out of foreground aborts the operation. Do not simulate
  these methods with always-true callbacks in app wiring.
- `complete({ state })`: release the reservation only for `closed`. For `unknown`,
  retain it until the host's explicit, verified recovery completes. Do not treat
  a JavaScript timeout as proof native work stopped.

The host also owns Android Bluetooth permissions, any permission denial, explicit
user intent to connect to this device, and handling system authentication prompts.
Pinned Flipper serial characteristics require authenticated reads/writes. This
bridge does not invoke a pairing API or approve a prompt, but Android may display
an OS pairing prompt when GATT authentication is required. Matching service UUIDs
and returning protocol 0.25 do **not** authenticate an arbitrary peripheral as an
owned or genuine Flipper.

Options include `deviceId`, an optional lifetime `AbortSignal`, setup/request/
cleanup deadlines (15 s / 5 s / 5 s defaults, each limited to 1–30,000 ms).
Identity and power each have their own request deadline. Packets remain at the
safe default-MTU payload of 20 bytes; there is no optimistic MTU negotiation.
Preflight errors (unsupported platform, invalid options, pre-abort, unavailable
lease/manager, background state) occur before adopting the lease and do not call
`complete`. The host retains ownership of that rejected lease. Once admitted,
`complete` is called exactly once with the cleanup result.

## Protocol lifecycle

1. Check foreground/exclusive ownership and Bluetooth `PoweredOn`. Install the
   identifier-scoped disconnect listener **before** issuing connection.
2. Call `connectToDevice` with `autoConnect: false` and a bounded timeout. Discover
   the serial service and require exactly one each of device RX, TX, flow control
   and RPC status with the expected capabilities.
3. Request TX **indications**, flow notifications and status notifications using
   distinct transaction IDs. No data request is sent yet.
4. Read each remote Client Characteristic Configuration Descriptor (CCCD,
   `00002902-0000-1000-8000-00805f9b34fb`). Require little-endian `02 00` for TX
   indication and `01 00` for flow/status notification. A zero value is polled
   within the setup deadline; malformed or wrong-mode values fail closed.
5. Require active RPC status `01 00 00 00` (the pinned STM32 uint32 enum).
   Acquire the initial four-byte **big-endian** credit window. A newer flow
   notification supersedes a stale read's value or rejection. A read which never
   settles can still leave cleanup unknown; notifications do not certify that
   native operation has ended.
6. Connect the prepared port to `FlipperBleCreditTransport` and the existing
   strict RPC client. Perform version negotiation (exact 0.25), identity and
   power. Report only the complete result; there is no partial-success result.
7. Invalidate callbacks, cancel transactions and explicitly cancel the device
   connection. Drain issued native operations and require a post-connect-settlement
   terminal disconnect event before reporting `closed`.

### Why CCCD reads matter

PLX's JavaScript `monitorCharacteristicForDevice` returns a subscription without
an enabled-subscription acknowledgement. A callback normally carries data/error,
not readiness. Its Android `isNotifying` property checks only CCCD bit zero, so it
cannot certify indication-only TX. Pinned native source shows descriptor reads
perform a remote `connection.readDescriptor(...)`, and the sixth monitor argument
selects indication versus notification. This bridge reads the actual descriptor
bits instead of using a delay or a Boolean that misses indications. These source
facts do not replace native/device acceptance of callback and GATT ordering.

### Ownership and cancellation

An internal WeakMap prevents simultaneous bridge operations on the same manager
object, quarantines uncertain cleanup and bounds attempted identifiers to 32.
An identifier is never retried on that manager object. This is a supplemental
fence, **not proof of all earlier host use** and not a replacement for the host's
exclusive lease. PLX disconnect events have no generation token, and PLX's own
connect path may cancel an earlier same-ID connection.

For that reason cleanup always calls `cancelDeviceConnection` for any issued
connect, even after a disconnect callback. It never skips cancellation based only
on an untagged event. SDK `DeviceNotConnected` (205) is tolerated only when all
other cleanup conditions, including terminal-event and pending-settlement proof,
subsequently hold. Other cancellation failures remain errors and quarantine the
manager. A late successful connect after timeout is cancelled again. A rejected
connect is not retried or cancelled a second time just because its promise rejects.
An early event during pending connect cannot alone prove the later outcome.

A hung native operation, failed cancellation, missing terminal event or failed
listener cleanup yields `unknown`, even if a valid snapshot was already received.
The API rejects instead of returning that snapshot. Application bounds apply to
bytes delivered into JavaScript, not to all buffering inside PLX or the native
Bluetooth stack. Late callbacks cannot trigger
new RPC writes. A late successful connection is still cancelled, but that does
not silently clear an already reported quarantine. There is no automatic manager
reset. Host recovery must follow APEX's existing native ownership rules.

## Sources, licenses and dependencies

[`research/flipper-phone-gatt-sources.json`](../research/flipper-phone-gatt-sources.json)
records exact existing lockfile pins, SHA-256 digests of reviewed installed
PLX JavaScript/TypeScript/Android files, and independently matched upstream Git
blobs at [v3.5.1 commit 1136d154](https://github.com/dotintent/react-native-ble-plx/commit/1136d1542487e8836f9b833bedf76e858329dd2e). The complete existing authoring checkout's lockfile Git blob was compared
with the private branch's remote lockfile and matches; the focused adapter
checkout itself does not contain a lockfile. This pins the inspected
installed source bytes; it is not a claim of byte-for-byte validation of an
independently downloaded npm archive. Flipper protocol/firmware source pins remain
in `flipper-adapter-sources.json`.

No package or lockfile changes were made. `base64-js` 1.5.1 was already a runtime
dependency. PLX's package metadata and lockfile declare MIT, while the installed
package's LICENSE contains Apache License 2.0 text. Both observations are recorded;
this increment does not resolve that discrepancy or provide release-license
clearance. No PLX/Flipper implementation files were copied into APEX.

## Verification and acceptance

Host commands:

```sh
node --test tests/flipper-phone-gatt.test.ts tests/flipper-rpc-adapter.test.ts tests/flipper-offline.test.ts
npm run typecheck
```

Phone-bridge tests cover the successful concrete manager call sequence, CCCD
readiness, inactive status, malformed/wrong-source values, version rejection,
foreground/lease/permission-boundary preconditions, concurrency, same-ID fences,
monitor errors, disconnects, abort, unacknowledged cleanup, late connect,
pending-connect rejection, stale credit reads and untagged disconnect events.
Mocks deliberately simulate native failures; a passing mock is not Android API
execution. Separate independent adversarial reproductions also exercise the
reviewed cancellation and stale-read races.

Still required before UI integration or merge/release: implement/review the host
exclusive lease seam without weakening AXP/scan ownership; build the native app;
test the real PLX bridge and CCCD ordering; and perform authorized physical
acceptance with recorded phone/OS, app commit, Flipper model/firmware/protocol,
pairing/denial, MTU 23, status loss, low credit, backgrounding, disconnect and
cancel/timeout cases. Retain redacted real-device fixtures with provenance.

### Authoring verification, 8 November 2026

On Node 24.22.1, the final focused checkout passes 60 repository tests
(21 phone-GATT, 25 RPC/credit, 14 existing parser), three additional independent
adversarial review cases, and TypeScript checking. Independent review covered
stale credit, pending-connect rejection, identifier-only disconnect races and
write-ACK validation. Native Android execution, the full main suite and physical
acceptance have not been run for this increment. The branch remains private,
unmerged and unreleased.
