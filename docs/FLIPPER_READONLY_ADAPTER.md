# Flipper read-only RPC adapter

## What this implements

A separate, independently written protocol client now encodes **only** protocol
version, identity and power requests. It incrementally validates framed protobuf,
correlates command IDs and assembles streamed identity/power pairs. A separate BLE
transport enforces the vendor's byte-credit windows and serializes writes.

The client can run against an injected, already-established RPC byte stream. The
BLE transport can run against an injected GATT port. An optional concrete Android
PLX bridge is now provided separately in [FLIPPER_PHONE_GATT.md](FLIPPER_PHONE_GATT.md). Host tests
exercise both together with **synthetic** fixtures. This is implemented protocol
and transport logic, **not a working mobile pairing screen or a demonstrated
physical Flipper connection**. There is no change to AXP, app discovery, native
permissions, the mobile importer or firmware.

No storage operations, radio transmission, application launch, GPIO actions,
reboot, firmware updates or raw RPC opcode API are exposed by the read-only
client. The underlying byte transport is a low-level integration boundary, not a
security sandbox against other code that already owns the device connection.

## API and version gate

- `packages/adapters/flipper-rpc.ts`: `FlipperReadOnlyClient`,
  `encodeFlipperReadRequest`, `FlipperFrameDecoder`, `FlipperRpcTransport`.
- `packages/adapters/flipper-ble-credit.ts`: `FlipperBleCreditTransport`,
  `FlipperBleSerialPort`, `FLIPPER_SERIAL_UUIDS`, `decodeFlipperCredit`.
- `readVersion()`, `readIdentity()`, `readPower()` and `readSnapshot()` accept an
  optional AbortSignal. Call `close()` in a `finally` block when finished.
- Identity and power first negotiate protocol **0.25 exactly**, the reviewed
  schema version. Older/newer versions and different majors fail closed. This
  deliberately narrow application policy is not a claim that every other version
  is incompatible. Broadening it requires additional source/fixture review.
- A snapshot completes version, identity, then power, with one request in flight.
  Concurrent operations reject `busy`; there is no unbounded request queue.
- Identity/power return ordered `{ key, value }` pairs. Duplicate keys are
  preserved, not merged onto an object. Device strings are untrusted display data.
  Successful correlation is not authentication or proof of physical provenance.

Example for a caller which already owns a correctly configured, authorized port:

```ts
const transport = new FlipperBleCreditTransport(port, { packetBytes: 20 });
const client = new FlipperReadOnlyClient(transport);
try {
  const snapshot = await client.readSnapshot(abortController.signal);
  // Render as text; do not execute, interpret as HTML, or treat values as trusted.
} finally {
  client.close();
}
```

## BLE integration contract

The port implementer owns actual pairing, user device selection, platform
permissions, subscription setup, lifecycle cleanup and disconnection. The optional
Android bridge implements GATT operations but requires a host-owned exclusive
manager lease and is not connected to app UI. Web Bluetooth and iOS ports remain
unimplemented. The port
must belong to one fresh, dedicated authenticated Flipper serial RPC session, with
no other writer and no inherited credit consumption. Never attach it to AXP.

1. Use the serial service `8fe5b3d5-2e7f-4a98-2a48-7acc60fe0000`.
2. Deliver TX **indications** from
   `19ed82ae-ed21-4c9d-4145-228e61fe0000` to `subscribeData`. These are device TX,
   hence client receive. The platform must acknowledge indications.
3. Write with response to RX
   `19ed82ae-ed21-4c9d-4145-228e62fe0000`, device receive/client transmit.
4. Subscribe to notifications, then read flow control
   `19ed82ae-ed21-4c9d-4145-228e63fe0000`. Values are exactly four **big-endian**
   bytes describing an absolute credit window, not an increment. The source
   replenishes the window only after its prior allowance reaches zero and the RPC
   input buffer drains. Reserve credits before awaiting the GATT write ACK.
5. Subscription methods return only after the subscription is ready. Deliver each
   callback exactly once, in order, for this session. Real asynchronous SDK
   setup must be completed before exposing this port interface. GATT failures,
   RPC-status loss and disconnection must invalidate the port.
6. `packetBytes` defaults to 20 for default ATT MTU. A caller may pass the verified
   negotiated write payload size (MTU minus 3), no greater than 486. Source maximum
   length is not a negotiated MTU. The adapter never guesses a larger MTU.
7. `close` must disconnect/release this dedicated port. Observe abort signals and
   never issue further writes after cancellation. A platform write already in
   flight can have an uncertain outcome; neither layer retries it.

The RPC status UUID is exported for read/monitor integration and is used by the
optional Android bridge. Nothing
writes it: a zero status write requests a firmware BLE reset, which this adapter
does **not** perform. Source shows RPC session creation on serial-profile BLE
connect, not a USB CLI-to-RPC transition. USB session entry is still unimplemented.

The initial credit read cannot overwrite a newer notification. A synchronous
initial notification avoids an unnecessary read. Unexpected refill while unspent
credits remain closes the session rather than double-granting. Because the wire
counter has no sequence number, the driver must not replay duplicate events or
share a session with another writer. Old session callbacks must not reach a newly
created port/client.

## Bounds and failures

Engineering limits, not measurements from hardware:

- 8,192-byte protobuf payload, five-byte canonical uint32 length prefix.
- 65,536-byte incoming chunk and aggregate response budget.
- 256 frames per input chunk and request; 128 key/value pairs per request.
- Existing strict APEX parser caps fields and string bytes, rejects malformed
  UTF-8, duplicate known fields, ambiguous content and noncanonical integers.
- Five-second request and total BLE-write deadlines by default. Constructor
  options accept integer deadlines from 1 to 30,000 ms. A complete snapshot may
  take up to three request deadlines. Initial credit acquisition is also bounded.
- Finite command IDs, never reused during a client session.

The terminal identity/power pair itself finishes the stream; no additional empty
response is required. Effective protobuf defaults (omitted OK/has_next) are
interpreted only in the context of the matching active request. Unsupported
status, wrong ID/content, decode error (whose ID may be unreliable), unsolicited
frames, duplicate terminal data, trailing partial data, timeout, abort or transport
failure invalidate the whole session. Reconnect with a fresh dedicated port and
client; do not resynchronize by scanning ahead or reuse old pending requests.

The framing parser uses APEX's existing `flipper-offline.ts` decoder for individual
complete frames. Its internal `imported` provenance means bytes supplied to that
parser, not proof of a capture or a physical device. No offline observation is
promoted to hardware evidence.

## Source, license and dependencies

Exact pins, file blobs and source links are in
[`research/flipper-adapter-sources.json`](../research/flipper-adapter-sources.json).
The official firmware pin has GPLv3 license text; the official Android client pin
has MIT license text. The exact protobuf repository tree has **no license file**.
Do not assume a separately distributable schema license from the firmware's
license or the Android application's license.

No upstream source, `.proto` files, generated protobuf code, nanopb or Android
client implementation is vendored, linked or installed. This code uses documented
wire-format facts (tags, scalar types, UUIDs, credit byte order) and the existing
APEX parser. No npm dependencies or lockfile changes are introduced. This records
the source-use decision, not legal advice or blanket license clearance. Vendoring
schemas or generated artifacts requires a separate licensing review.

## Verification and remaining acceptance gates

Run with supported Node 24:

```sh
node --test tests/flipper-rpc-adapter.test.ts tests/flipper-offline.test.ts
npm run typecheck
```

The adapter tests include exact request vectors, all split points including a
multi-byte length prefix, strict decoding, version rejection, streamed terminal
pairs, wrong/stale IDs, duplicate terminal replies, pair/byte budgets,
pre-cancellation, disconnection, hung response and write, credit endian/limits,
refills during GATT acknowledgement, notification/read races, double-grant
rejection, input snapshots and a combined simulated BLE/RPC snapshot.

**Physical acceptance: NOT RUN.** Before exposing this as connected-device
functionality, integrate and physically test the optional Android GATT port and record phone/OS,
app commit, Flipper model and firmware revision, protocol version and explicit
owned-device authorization. Exercise fresh pairing, denial, reconnect, MTU 23,
fragmentation, low battery, timeout, disconnect during read/write, backgrounding
and stale callbacks. Compare returned identity and power with the device and
retain redacted captured fixtures with provenance. DIY firmware, iOS/Android
compatibility, radio behavior and USB session handling remain unverified.

### Authoring verification, 8 November 2026

The isolated checkout materialized relevant files from APEX main
`d4434c5cf789938447e83e49a5cfcbdf68b59277`, not the whole repository.
On Node 24.22.1, 25 adapter tests plus 14 existing offline-parser tests passed
(39 total). Strict adapter/test typechecking and `npm run typecheck` for that
focused checkout passed. An independent source/code review identified the stale
initial-read rejection and pre-write deadline races; both have dedicated passing
regressions. Full main regression, platform builds and device acceptance are not
implied by these focused results. Exact PR CI is the integration gate.
