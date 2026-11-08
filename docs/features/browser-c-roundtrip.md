# Browser client to actual C data-path integration (host only)

This test-only infrastructure connects the unchanged WebAxpManager → BleTransport →
DeviceSession chain to the actual revised C access_characteristic → portable parser
and dispatcher → response queue → transmit path. It closes a software-test gap
between synthetic JavaScript responders and separate C callback tests. It does
**not** review or accept the SDK initialization/configuration delta. That independent
review gate, SDK build gate, browser acceptance and physical-device gate remain open.

Base: `386c390ee8950d22e386247746cad28d19d2bd16`. No production firmware, portable
core, browser, native, dependencies, source registers or existing fixtures changed.
The exact production C file is included by a new translation unit and linked with
firmware/core/apex.c using GCC and existing fake headers. There is no SDK library,
installation, network, browser execution, device/radio/USB, credential or user data.
Neither apex_ble_start nor app_main is invoked. Explicit fixture initialization
sets the fake connection/notify handle and resets the portable peer. Retirement
resets that peer and invalidates the fake connection, without advertising.

Current continuation note: a later independently reviewed [native acquisition
cancellation correction](../NATIVE_ACQUISITION_CANCELLATION.md) changes BleTransport
and updates only that entry in the shared input hash manifest. The original
infrastructure evidence below is scoped to its stated baseline. Current combined
checks are linked from [VERIFICATION.md](../VERIFICATION.md). The firmware data
callback source and its separate open review gate are unchanged.

## What is real and what is fake

- Real: client request encoding, request IDs and CRC, conservative browser writes,
  incoming DataView handling, READY recognition, session negotiation and matching,
  actual C write callback/parsing/dispatch/staging/queue/response encoding and
  notification chunking. JavaScript never fabricates a peer response.
- Fake: chooser and GATT promises, subscription event, connection state, MTU,
  write acknowledgments, mbufs, five-ms scheduler and notification delivery.
  Existing tests/esp32-reviewed-host/fakes owns the fake SDK behavior. No queue
  algorithm is duplicated. Every command drains scheduled callbacks synchronously
  under a 64-tick limit, delivering notifications before the write acknowledgment;
  this is not a realistic timing or concurrency simulation.
- Browser writes always remain at most 20 bytes. Fake peripheral MTUs 23 and 517
  exercise 20- and 244-byte notification limits respectively. This is **not**
  browser MTU negotiation. No throughput or radio-cleanup claim is made.
- N records contain bytes captured from actual C notify_custom calls; only these
  enter the fake characteristic and client decoder. R records, commands, process
  exits and failure diagnostics are fixture control information, never AXP data.
  JSON traces identify each origin and hash the actual C/core/client/fixture/header
  inputs. Production/core/client and every included fake/header input are pinned
  in inputs.sha256.json and asserted before compilation. The production firmware
  hash is integrity evidence only, not review.

The line protocol has one serialized command in flight, with a bounded monotonic
sequence number echoed in its result and strictly checked before resolution.
Raw stdout must be ASCII and result numeric fields are bounded and validated. Client AXP request IDs remain end-to-end. Input is bounded
to 512 commands and 490 command characters, C writes to 244 bytes, notification
records to 244 bytes, stdout to 256 KiB, retained stdout to 8 KiB and commands to two
seconds. An owned non-forking subprocess has a 15-second watchdog; EOF is requested
and process exit is awaited during disposal. A timeout/protocol failure kills only
that owned fixture. GCC is bounded to 30 seconds and 1 MiB output. No unbounded
background subprocess is intentionally retained. The bridge is trusted local test
infrastructure, not a general hostile-process adapter or SDK ABI substitute.

## Coverage and counting

`tests/browser-c-roundtrip.test.ts` is included by the existing `tests/*.test.ts`
aggregate glob. Six named Node tests pass, not six hardware scenarios:

1. Fake MTU 23: actual READY, identity/capabilities, marker-shaped ping, empty ping,
   maximum 512-byte binary ping, matching frame IDs/CRC, explicit close and stale
   client/C callbacks, then an actually rejected C write on the retired link.
2. Same client flow with fake MTU 517 and actual 244-byte notification splitting.
3. C fake-mbuf flatten rejection (ATT 14) propagates through GATT to the client;
   no response publishes and explicit close confirms fixture retirement.
4. Corrupt-CRC maximum request sent through the browser transport yields no C
   response; the following real session ping succeeds and matches its own ID.
5. Six malformed/over-bound control inputs, each a nested assertion within **one**
   Node test, exit nonzero without notifications. These are not six named tests.
6. Unexpected fixture process failure rejects the in-flight and subsequent
   command and reports failed process cleanup rather than success.

The first two tests each contain three ping payload assertions; the final READY-
shaped fragment is generated by C (the payload ends in AXP_REA and CRC supplies DY).
Successful protocol traces are independently decoded and re-encoded for byte-for-
byte equality, with zero discarded/remaining bytes. Close checks an empty C parser
and queue, balanced fake mbuf allocations/frees, retired fake connection, removed
listeners and no stale data publication. Browser-local release and C fixture
retirement are checked separately; neither establishes physical radio teardown.

## Verification and retained failures

Final focused suite: **6/6**. Broader focused client/core/portable-host suite:
**228/228**, with no skipped/cancelled tests. Full TypeScript check passes.
Portable C build/checks pass. Evidence is in `evidence/browser-c-roundtrip/`.

The first compilation failed because the reused fake header's erase_calls counter
was not referenced under -Werror. The fixture now asserts it stays zero alongside
other forbidden startup effects. Initial TypeScript errors were a missing pair of
required methods on the fake characteristic and optional assertion-message typing.
They were fixed in tests only. The initial marker payload also had an extra byte;
it was corrected to the exact existing collision regression before the first
behavioral run could compile. The first behavioral run then passed four tests;
two infrastructure-boundary tests were subsequently added. Infrastructure review
then requested pinned hashes, command correlation, strict numeric result ranges
and raw ASCII validation; these were added only to the new test infrastructure.
Original logs remain.
`initial-inputs/` contains reconstructed first-run source snapshots, explicitly
historical and not runnable acceptance artifacts. Final traces include source
hashes, exact input/control traffic, actual C bytes and process exit outcome.

Run:

```sh
python3 tools/build_firmware.py
APEX_BROWSER_C_EVIDENCE=evidence/browser-c-roundtrip node --test tests/browser-c-roundtrip.test.ts
node_modules/.bin/tsc --noEmit
```

Broader focused command adds: web-axp-foundation, web-axp-independent-review,
web-axp-application, web-axp-application-independent, ble-ready-collision,
ble-transport-release, ble-session-release, session, session-controls,
session-release-boundary, session-review-races, protocol, protocol-byte-boundary,
protocol-byte-independent and firmware.integration (all tests/*.test.ts).

The full aggregate was **not** executed here: existing reviewed-host tests include
startup execution and would cross this assignment's explicit restriction. Existing
host transport/startup suites were not run or represented as reapproved. The new
bridge and portable host/core tests supply the allowed focused C coverage. No SDK
initialization/configuration delta review, SDK/native build, browser/device test or
production source fix is part of this result.
