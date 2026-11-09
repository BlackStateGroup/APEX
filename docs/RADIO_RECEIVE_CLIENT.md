# Opt-in receive-only AXP client foundation

The existing fixed-profile receiver service now has a bounded TypeScript protocol
decoder and one-owner request coordinator. This closes the software negotiation
gap without enabling reception in the application by default.

**This slice is a library/client foundation.** It does not add phone Start/Poll/
Stop controls, change App connection options, or opt existing sessions in. A
future foreground UI and its cleanup/lifecycle acceptance remain separate work.
Nothing was flashed, connected to a phone, tuned, transmitted or received over RF.

## Explicit negotiation

`new DeviceSession(transport, { allowRadioReceive: true })` permits either the
original exact three-operation manifest or the exact six-operation manifest from
`firmware/radio_rx/rx_service.cpp`. The original three operations remain required.
The receive triad must be complete: `radio.rx.start`, `radio.rx.poll` and
`radio.rx.stop`. Unknown, partial and duplicate manifests are rejected.

Without the option, the existing exact-three-operation behavior remains. A
frozen operation map is not a capability grant. The session captures its opt-in
and negotiated set privately, so changing the public capability array cannot
authorize another operation. Neither negotiation nor coordinator construction
starts reception. Peer names and firmware identity strings grant no permission
and are not authenticated by AXP CRC.

The ABI remains profile 1 only. Start is six bytes (version/profile 1, little-endian
duration 50–30000 ms and event limit 1–64). Poll and Stop are a four-byte nonzero
capture ID. No arbitrary opcode, frequency, modem, key, transmit, replay, storage
or shell operation is added. For the narrow physical profile and separate
hardware gates, see [receive-only firmware](RADIOLIB_RECEIVE_ONLY.md).

## Coordinator behavior

Create the retained coordinator with `createRadioReceiveClient(session)` only
after an explicitly opted-in receive-capable session opens. The same session
returns the same coordinator, preserving capture ownership across callers.

- `start(durationMs, eventLimit)` requests one bounded capture. No auto-start,
  automatic polling, reconnect or timeout retry occurs.
- `poll()` requests at most one queued packet. At most the requested 64 events
  and 64 returned packets are retained. Polling must be explicit, including
  draining packets after a terminal status. Payload bytes are immutable arrays.
- `stop()` queues one stop behind any outstanding request. Concurrent Stop calls
  join the same Promise. If a deferred Start has not dispatched yet, Stop cancels
  it without sending Start. Once Start is dispatched, its reply must settle and
  supply a validated capture ID before cleanup can target it. No ID is guessed.
- Stop does not discard queued evidence. A known non-running capture must be
  drained before a new Start. Successful capture IDs must strictly increase;
  exhaustion and a fault prevent another Start.
- The caller owns the DeviceSession and transport. Stop does not close either.
  A closed connection is not evidence of physical RF stop. Callers must handle
  every returned Promise, including a Start cancelled by a concurrent Stop.

Unknown/error responses latch Start and Poll off. A previously validated ID may
still be explicitly stopped, but even a later stop response does not erase the
earlier uncertainty. A start response lost before its ID is validated cannot be
cleaned up by guessing an ID. The firmware lease bounds its intended behavior;
it is not a hard-real-time or physical-stop guarantee. Native I/O can remain
pending, and this client does not promise cancellation of the issued request.

## Response integrity and scope

Status decoding accepts exactly 24 bytes without a packet, or 31 plus 1–60 packet
bytes. Intrinsic typed-array accessors reject shared, resizable, detached, proxy
and nonbyte storage without trusting shadowed properties. Version, profile,
flags, counters, queue and lengths are checked before an immutable status is
exposed. Signed RSSI/error values retain their exact integer units.

The coordinator additionally checks capture identity, requested event/lease
bounds, monotonic counters, FIFO packet time order and terminal-state coherence.
An expiry cannot precede the requested deadline. A terminal capture cannot gain
events, change its saved elapsed time or invent queued packets. Same-millisecond
packets are permitted. A first fault can carry a clock rollback, which is exposed
as `clockMonotonic: false`; fault does not authorize restarting.

`unreturnedAccepted` separately counts accepted, non-queue-dropped packets absent
from this client's retained list and the peer's remaining queue. An out-of-band
drain can create that gap. It is not an RF packet-loss measurement, an inference
about missing traffic, or proof of exclusive access to the receiver.

Every status, identity, counter, timestamp and RSSI remains an unauthenticated
peer claim. A valid response proves neither physical reception nor stopping,
ownership, regulatory compliance, hardware compatibility or source completeness.
No evidence save, export, sharing or provider transmission is added here.

## Verification and remaining integration

Host tests run the actual TypeScript coordinator, DeviceSession, AXP codec and
existing C/C++ receiver service through a bounded stdio transport. The Receiver
and clock are explicitly synthetic; the tests do not link RadioLib, run ESP-IDF,
exercise GPIO/SPI/USB/BLE, or use real RF. First initialization consumes a modeled
150 ms, exposing cold 50 ms expiry without assuming receive startup succeeded.
Exact packet bytes, signed metadata, CRC/length rejection counters, event limits,
queue drainage, new IDs, disabled service and sticky faults are exercised.

Real Expo development/production transforms cover iOS, Android and web. They are
host execution of transformed JavaScript, not Hermes/native-device acceptance.
Metro application exports preserve the existing default-off path. No native
Xcode/Gradle application build or phone UI activation is claimed.

Before enabling phone controls, integrate explicit foreground consent and owned
session checks, navigation/background Stop with retained uncertainty, and visible
queue drainage. Then separately verify native compilation, authorized accessory
transport, physical receiver wiring, firmware configuration, RF behavior and
stop timing. The existing radio firmware target uses USB; this slice does not
invent an iPhone USB driver or supply a BLE/network bridge.
