# Receive-only CC1101 accessory increment

## Actual status

Implemented original bounded capture/service code and a CC1101 adapter linked to
the real pinned RadioLib library. Host tests execute that combination against a
**synthetic register/FIFO model**, not physical RF. GCC/G++ 14.2 normal and
AddressSanitizer/UndefinedBehaviorSanitizer builds pass. LeakSanitizer cannot run
in the current ptrace-based sandbox; that stage is not claimed as passed.

A separate opt-in ESP32-S3/ESP-IDF target is included. **Its cross-build has not
run in this workspace:** ESP-IDF, CMake and the Xtensa toolchain are absent.
The dedicated CI workflow includes host checks and both disabled/enabled
cross-builds, but creating that workflow is not evidence that it has run.
There has been **no flash, wiring validation, phone connection or RF reception**.

This increment changes no phone UI, Flipper adapter, IR import, native engine,
existing AXP firmware target or shared `firmware/core` implementation. The new
target reuses AXP framing and adds its own explicit receive-only opcodes. The
existing strict mobile capability validator does not yet support these new
operations. A phone-side adapter and acceptance tests remain separate work.

## Narrow RF scope

Profile 1 is fixed in firmware:

- CC1101, 433.920 MHz, 2-FSK at 4,800 bit/s, 5 kHz frequency deviation.
- 58 kHz receiver bandwidth, 16-bit preamble, sync bytes `12 AD`.
- Variable-length packet mode, no address filtering, CRC filtering enabled.
- Payloads 1–60 bytes. Length byte plus 60-byte payload plus two status bytes
  fit the 64-byte FIFO. The upstream nominal 255-byte packet limit is **not** safe
  for this polling-only implementation without an additional FIFO-drain path.
- One packet is read per service tick; reception pauses between packets.
  This is intentionally lossy under load. Missing packets are not inferred from
  software counters. Software queue drops are counted separately.

This is a matching lab packet receiver, not a general sub-GHz sniffer, raw IQ
capture, OOK decoder, key extractor, rolling-code decoder or access operation.
Frequency, modulation, sync, registers and payload transmission are not writable
through the protocol. No protocol implements RF transmission, replay, jamming,
storage operations, shell commands, credential use or unlocking.

RadioLib initialization configures its PA table and flushes its TX FIFO, but
neither operation transmits RF. The wrapper never calls its transmit API.
A separate CC1101-specific SPI filter blocks STX, SFSTXON, TX FIFO writes,
pin-controlled TX, automatic RX/TX-to-TX states and direct/random modem modes.
Status-register reads are restricted to their documented burst-bit form so a
command-strobe alias cannot pass as an ordinary read. Every illegal operation
latches a fault before it reaches the platform SPI function.

The linked library still contains other methods, and arbitrary replacement
firmware could bypass this wrapper. This is a software receive-only boundary,
not a hardware-enforced RF interlock or proof of regulatory compliance. A prior
chip state or electrical failure can prevent a confirmed stop. Power-cycle and
review owned lab hardware; use an independent physical RF interlock if required.

## Default-disabled hardware target

`firmware/esp32s3-radio-rx` is independent of `firmware/esp32s3`.
By default `APEX_RADIO_RX_ENABLE` is off, pins are unset, receive operations are
not advertised and `radio.rx.start` returns `NOT_CONFIGURED`. No SPI/GPIO radio
initialization occurs at boot or on information/ping requests. With reviewed
configuration, a valid start request initializes the chip and opens a finite
receive lease. There is no auto-start, persisted configuration or auto-resume.

Before enabling, review the exact ESP32-S3 board and CC1101 module, 3.3 V logic
and power requirements, common ground, decoupling, SPI wiring, GDO0 and a matching
antenna. Select distinct valid GPIOs in menuconfig. Native USB GPIO19/20 are
excluded, but flash, PSRAM, strapping and other board-specific conflicts still
require manual electrical review. CI pin numbers are compile-only placeholders,
**not a wiring recommendation**. The firmware owns SPI2 exclusively; it refuses
to take over an existing bus. It starts no Wi-Fi or Bluetooth stack.

The original bounded ESP-IDF HAL uses one queued SPI transaction, static buffers
and finite 10 ms enqueue/result waits, with no retries. Buffers remain valid if a
queued transfer times out. SPI failures latch the receiver closed. GPIO errors
latch in the platform HAL, but RadioLib's void GPIO callbacks cannot report them
directly to the wrapper. Without a subsequent SPI operation, a final CS-deselect
failure can remain undetected by the service until lease expiry. Immediate GPIO
fault propagation and physical stop behavior remain hardware acceptance limits.

USB output has a 25 ms overall budget. The service requires a synchronous,
non-reentrant output callback returning success only for a complete in-budget
frame. Failed, partial, absent or uncertain output permanently faults the
transport and immediately attempts to stop any active capture. Remaining input
in that chunk and later chunks is ignored; no reply is retried, and later ticks
cannot poll or re-arm. Read errors use the same terminal latch, checked before
the main loop's next tick. Recovery requires a fresh service instance or reboot.
Host disappearance is bounded by the capture lease even if USB disconnect
notification is unavailable. Software cannot guarantee a physical stop when
the GPIO or SPI control path itself has failed.

The loop checks deadlines between driver calls. Scheduling and finite SPI/
standby calls can delay the physical stop; this is not a hard-real-time or
electrically guaranteed cutoff. Firmware/driver/phone lifecycle behavior needs
real measurements before any hardware claim.

## Bounded AXP protocol

The existing AXP/1 envelope and CRC remain unchanged. This target accepts only
request-kind frames; system info/capabilities/ping retain their existing opcode
numbers. Unknown opcodes return `UNSUPPORTED_OPERATION`. CRC is corruption
detection, not authentication or authorization. Use only an owned bench connection.

All multibyte fields below are little-endian. Requests are exact length:

- `0x60 radio.rx.start`: 6 bytes: version `1`, profile `1`, uint16 duration in ms
  (50–30,000), uint16 event limit (1–64). The lease includes initialization time.
  An expired initialization does not arm the receiver. A live capture or
  undrained prior queue returns `BUSY`, preserving existing evidence.
- `0x61 radio.rx.poll`: 4-byte current capture ID. Returns status and at most one
  queued packet. IDs start at one and never wrap/reuse during a boot.
- `0x62 radio.rx.stop`: 4-byte current capture ID. Stops reception and preserves
  the queue for draining. Repeating stop for the same finished capture is harmless.

### Cold starts and short leases

The pinned RadioLib [`CC1101::config()`](https://github.com/jgromes/RadioLib/blob/3a664b64099e4bdbdb3e6f28a5ca6b833050b21e/src/modules/CC1101/CC1101.cpp#L1090-L1095)
requests a 150 ms delay during first initialization, before other setup costs.
**A first 50 ms lease cannot capture.** In the synthetic host model, cold leases
of 150 ms or less expire without arming. They return a normal status
response with state `EXPIRED` (3), no packet and zero observed events, not a
promise that capture started. Clients must inspect the returned state.

For an initial lab capture, choose a total lease with initialization headroom
(for example 1,000 ms). This is not a guarantee of hardware startup time or a
minimum receive window: scheduling, SPI and driver work consume that same lease.
The clock is not restarted after initialization and the lease is never silently
extended. Host tests reproduce exactly 150 ms of setup only in the synthetic
model; real timing still requires physical acceptance.

After successful initialization, a **new explicit** start request may use the
50 ms minimum without paying the reset delay again. Even a cold request that
expires after successful initialization leaves it ready for a later explicit
start. Expiry never auto-retries or auto-arms. A later request receives a new
capture ID and must independently satisfy its own lease and event limits.

Wrong/stale IDs, sizes, versions, profiles and ranges are errors. No input can
change the modem profile or become a generic command tunnel. A faulted session
cannot restart. A firmware restart or fresh service instance is required.

All three successful operations return the same binary structure, 24 bytes
without a packet, 31–91 bytes with one:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 1 | Response version 1 |
| 1 | 1 | State: 0 idle, 1 running, 2 stopped, 3 expired, 4 event limit, 5 fault |
| 2 | 1 | Profile 1 |
| 3 | 1 | Bit 0: packet present; other bits zero |
| 4 | 4 | Capture ID |
| 8 | 2 | Observed packet events, including CRC rejection |
| 10 | 2 | Accepted CRC-valid packets, including queue drops |
| 12 | 2 | Accepted packets dropped because the software queue was full |
| 14 | 2 | Rejected packet events |
| 16 | 1 | Remaining queued records after this reply |
| 17 | 1 | Payload length, zero without a record |
| 18 | 4 | Last checked elapsed lease milliseconds, capped at 30,000 |
| 22 | 2 | Signed RadioLib/HAL error, zero if none |
| 24 | 4 | Packet elapsed milliseconds, only when present |
| 28 | 2 | Signed RSSI in tenths of dBm, only when present |
| 30 | 1 | RadioLib LQI, only when present |
| 31 | 1–60 | Packet payload |

The queue holds eight records. Records and counters are cleared only on an
accepted new capture, after the previous queue has drained. Each CRC rejection
counts toward the event limit. An impossible reported length faults the receiver
rather than truncating a packet and misreading its CRC/status bytes. No partial
payload is exposed after an SPI failure. Packets read after deadline are discarded.
Capture data stays in bounded RAM; this increment does not save or upload it.

## Reproducible source and build

RadioLib source pin: `jgromes/RadioLib` at
`3a664b64099e4bdbdb3e6f28a5ca6b833050b21e` (version metadata 7.8.1).
`research/radiolib-rx-pin.json` lists the exact 16 required source/license Git
blob hashes. `prepare_radiolib_rx.py` checks every one before compiling, never
downloads anything and refuses to modify the supplied checkout.

Sanitizers found an upstream command-only path calling `memcpy` with a null
source and zero length in `Module.cpp`. Staging adds `if (numBytes)` to four
payload-copy sites. Positive-length operations are unchanged. The patched file's
SHA-256 is `300521b05a0f6581b82cc2dde0465693f0e101fec2de35b750adb7d7c27234f8`.
The input files remain pristine and the generated source stays under the build
directory. This is a local compatibility fix, not an upstream-accepted change.
No sanitizer error is suppressed to claim a pass.

Only Hal, Module, Utils, PhysicalLayer and CC1101 compilation units are linked,
with static RadioLib buffers and direct-bit reception disabled. No Arduino
runtime, networking, other radio family or protocol package is included.
RadioLib's MIT notice is retained as `firmware/radio_rx/RADIOLIB-LICENSE.txt`;
include it when distributing a linked binary. Original APEX files retain their
existing rights. This records source use, not blanket legal clearance.

With the exact RadioLib checkout already present:

```sh
python3 tools/check_radio_rx.py --radiolib-root /path/to/RadioLib
python3 tests/test_radio_rx_pin.py --radiolib-root /path/to/RadioLib
ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 \
  python3 tools/check_radio_rx.py --radiolib-root /path/to/RadioLib --sanitize
```

`detect_leaks=0` is needed only in the current ptrace sandbox. The CI workflow
requests leak detection on its normal runner. The tests check all 256 one-byte
SPI commands plus forbidden writes/aliases, actual linked-driver transactions,
all start-frame split points, malformed/unknown commands, source-pin mutation,
default disablement, stale captures, maximum packets, queue preservation/drops,
CRC and SPI failures, initialization expiry, clock rollback and stop/re-arm.

With ESP-IDF v6.1 and its ESP32-S3 toolchain installed, the separate compile gate is:

```sh
idf.py -C firmware/esp32s3-radio-rx \
  -DRADIOLIB_SOURCE_DIR=/absolute/path/to/RadioLib set-target esp32s3 build
```

The build above is intentionally disabled by default. Configure reviewed wiring
through menuconfig for an enabled target; do not flash CI's placeholder settings.
`.github/workflows/radio-rx.yml` pins the same ESP-IDF container digest and checkout
action used by the repository's existing foundation workflow. It never flashes.

## Remaining acceptance gates

1. Independent review of firmware, SPI filter, protocol and ESP-IDF lifecycle.
2. Actual ESP-IDF cross-build, both disabled and explicitly configured variants.
3. Owned-fixture wiring/power review, no-RF-TX measurement and reliable stop test.
4. Known CRC-valid and CRC-invalid lab packets, maximum length, bursts, FIFO
   overrun and incomplete packets, measured loss and RSSI/clock behavior.
5. USB host disconnect, stalled reads/writes, partial replies, suspend/reset,
   stale buffered requests and power failure. Confirm lease cutoff electrically.
6. A phone-side protocol adapter plus platform-specific device-selection,
   permission, transport and lifecycle acceptance. Neither Android nor iPhone
   connectivity is demonstrated by these host tests.
