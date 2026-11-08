# Restored ESP32-S3 transport host fault injection

## Result and limits

17 deterministic scenarios pass, including 10,000 bounded callback/failure
interleavings. The suite also runs two deliberately failing safety assertions
and requires their exact failures. Those failures reproduce defects; this is
not a claim that the transport is safe or those defects have been repaired.

This compiles the **exact restored** firmware/esp32s3/main/ble_accessory.c
translation unit by inclusion and links the **real** firmware/core/apex.c.
ESP_PLATFORM is defined to exercise the target identity branch. Tests directly
call its static access, output, transmit and GAP callbacks, not copied queue
logic. All six restored files are SHA-256/Git-blob checked against the recovery
manifest before compilation. No production source, protocol, client, dependency,
native module, register or restoration manifest was changed.

These are behavioral host doubles, not ESP-IDF headers, SDK compilation,
API/ABI validation, radio timing, a real NimBLE queue or hardware acceptance.
The fake callout is one pending flag, manually consumed on each tick; there is
no concurrency, scheduler fidelity, controller congestion or real connection.
Our fake notify consumes its allocated buffer on either return path, matching
the source's stated contract; it does not independently establish the selected
SDK's ownership contract. Assertions count allocation/free balance only under
that fake contract.

Neither app_main nor apex_ble_start is invoked. Startup, NVS and host-task
doubles abort if reached. Advertising callbacks only increment fake counters.
No device library is linked, SDK installed, native target/prebuild run, radio,
device, board or flash accessed, network requested, setting/credential changed,
remote written, or real NVS erased. GCC builds a temporary host executable only.

## Confirmed issues (originals intentionally unchanged)

1. **Overflow acknowledges lost responses and assumes disconnect succeeds.**
   After READY drains, a single 240-byte write containing 20 empty ping requests
   queues four responses and makes 16 termination requests, dropping 16 replies.
   The ATT access callback returns zero. Injected termination failure leaves
   subscribed true; the first four responses drain and a later request still
   succeeds. Pending READY itself occupies a slot: four requests before its
   drain already cause one dropped reply. Fake termination success also does
   not synthesize a disconnect; cleanup waits for the later GAP event.
2. **Ten transmit failures can strand the live session.**
   Ten notify errors (or ten allocation failures) request termination then
   return without rescheduling. When termination fails, count remains nonzero,
   subscribed remains true and the timer is idle. Another accepted request
   increments count but does not schedule, because output schedules only when
   count becomes one. The stalled session persists until an external reset,
   unsubscribe/disconnect, or equivalent event. No app-level error is emitted.
3. **Repeated enabled subscription is a destructive reset.**
   After the first 20 bytes of a response, another enabled SUBSCRIBE for the
   same connection/attribute drops its tail and any partial incoming frame,
   then queues AXP_READY. Captured bytes are the 20-byte response prefix plus
   the nine-byte marker. Whether/when a selected SDK emits such repeated
   events must be established separately. This is distinct from the client's
   READY-shaped legitimate frame-tail defect handled in another workstream.

Before proposing production changes, retain these reproductions and choose an
explicit failure policy: mark failed/closing locally, reject later writes,
handle failed termination, and avoid dropping state on an unchanged subscription.
Admission/backpressure must account for multiple requests in one write and READY.
Fixes require a separate developed variant; do not silently edit recovery bytes.

## Covered behavior

- Initial subscription and literal READY; foreign subscriptions ignored.
- Owner and operation checks; zero/245-byte writes; flatten failure.
- Fragmented input and real core ping encoding/CRC; four coalesced requests FIFO.
- 512-byte payload / 524-byte response at MTU 23 (26 x 20 + 4) and
  MTU 517 (244 + 244 + 36), including 244-byte input splitting.
- Queue overflow and failed terminate; READY queue occupancy.
- Allocation failure, notification errors, retries without offset advance,
  successful retry counter reset, ten-failure dead-end.
- Repeated subscribe, unsubscribe, disconnect/reset and reconnect ownership.
- Failed connect reset; fake advertising callback invocation.
- 24,400 malformed input bytes, bad maximum-frame CRC and parser recovery.
- Direct output zero/oversize rejection.
- 10,000 seeded bounded interleavings of writes, ticks, subscriptions, resets,
  failures and MTU changes; queue indexes/lengths/offsets and buffer balance.
  This is a bounded smoke exploration, not exhaustive model checking.

## Reproduce

From the repository root with Node 24 and GCC already installed:

    node --test tests/esp32-host-transport.test.ts

The existing tests/*.test.ts discovery includes this test without package or
dependency edits. It creates and cleans a temporary directory, bounds compiler
execution to 30 seconds and each child to 10 seconds, verifies six source hashes,
runs 17 scenarios, then requires two known-issue runs to fail with exit 1 at the
expected assertions. It must be updated deliberately when a separate developed
transport replaces the historical source.

Standalone:

    gcc -std=c11 -Wall -Wextra -Werror -Wno-misleading-indentation -DESP_PLATFORM -Itests/esp32-host/fakes -Ifirmware/core tests/esp32-host/harness.c firmware/core/apex.c -o /tmp/apex-transport-harness
    /tmp/apex-transport-harness
    /tmp/apex-transport-harness --require-safe-overflow
    /tmp/apex-transport-harness --require-safe-retry

The final two commands intentionally exit 1. Their exact outputs are retained
as known-overflow-failure.txt and known-retry-failure.txt, separately from the
green known-behavior suite in final.txt.

Sanitizer run executed successfully:

    gcc -std=c11 -g -fsanitize=address,undefined -fno-omit-frame-pointer -DESP_PLATFORM -Itests/esp32-host/fakes -Ifirmware/core tests/esp32-host/harness.c firmware/core/apex.c -o /tmp/apex-transport-harness-asan
    ASAN_OPTIONS=detect_leaks=0 /tmp/apex-transport-harness-asan

asan-ubsan.txt contains all 17 passing scenarios with no reported ASan/UBSan
finding. Leak detection was explicitly disabled due to the pre-existing
environment restriction; no full leak gate was retried or passed. This is not
full sanitizer acceptance of firmware, SDK or hardware.

initial-harness-failure.txt preserves the first executable test failure:
the test incorrectly expected notify_calls == 0 after nine allocation failures,
forgetting the earlier READY notification. Corrected to == 1. It was a harness
expectation defect, not a discovered production regression.

Base: 38ab25a. Independent clone: apex-transport-harness.
Original provenance and outstanding SDK/board gates remain as documented in
docs/ESP32S3_RESTORATION.md and review-evidence/esp32s3/REVIEW.md.
