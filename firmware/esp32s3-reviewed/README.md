# Opt-in reviewed ESP32-S3 source target

**Current review boundary:** the latest SDK initialization/configuration correction
has builder regression evidence, but fresh independent review is still open.
Earlier independent approval applies only to BLE source SHA-256
`4c4a7ac3829f87088c8c9bebbe361be752de200943401986c6cb69f20408dd7c`.
Current BLE source is
`57503eaabc1773bb46272d72bd3c9b04e85964d1666093e02bb672eaf569242c`.
See the [delta report](../../review-evidence/esp32s3-callout-init/REPORT.md) and
[pinned SDK research](../../docs/esp-idf-interface-research/REPORT.md). The
folder name does not certify the current delta, SDK build or hardware behavior.

This is a separate derivative, not a replacement for `../esp32s3`. The six
historical files remain byte-for-byte preserved. BLE implementation derives
from `../esp32s3/main/ble_accessory.c`, recovered from upstream commit
`e51750ec0b34b280399877d67e1036058874c373`. The project reuses historical USB
`main.c`, its BLE declaration header, and the unchanged portable `core/apex.c`.
Original APEX licensing remains applicable. See `docs/ESP32S3_RESTORATION.md`.

**Host fake-interface testing is not an ESP-IDF build, API/ABI validation,
physical acceptance, or permission to flash/run.** No SDK, radio, board, flash,
USB device, or native build was used for this change.

## Explicit startup policy

`CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN` defaults to **off** in this project's
Kconfig. With it off, `apex_ble_start()` is a no-op even though historical
`app_main` calls it. USB Serial/JTAG startup is still present and requires its
own authorized device execution. SDK Bluetooth features being compiled does
not by itself opt into this adapter's startup.

For separately authorized owned-bench operation, select this project (not the
historical target) and explicitly enable that Kconfig option. It enables the
functional NimBLE service, host and advertising path. NVS initialization errors
abort startup; this target NEVER automatically erases NVS. Storage repair is
an independently reviewed/authorized operation. Merely enabling a source flag
is not permission to flash, advertise, or access hardware.

The callout initialization result is checked before starting the NimBLE host
task. The pinned FreeRTOS NPL returns `-1` on allocation or timer creation
failure and leaves an unusable internal object. Failure follows `ESP_ERROR_CHECK`
abort semantics, consistent with other initialization checks: no host task is
started, and no cleanup, automatic retry, or storage erase is attempted. Earlier
NimBLE initialization already initializes/enables the controller under the
pinned SDK; this is fail-stop host-task startup, not a claim of complete
rollback or zero prior controller effects.

## Bounded transport and ownership contract

- All adapter callbacks/state run serially on the NimBLE host event queue.
  State-mutating callbacks must not reenter adapter operations. The pinned SDK
  can invoke NOTIFY_TX inline during notification; this adapter ignores it.
  One connection owns the stream until its matching GAP disconnect callback.
  A successful terminate request does **not** confirm disconnection.
- The four-slot response queue is unchanged in size. Each ATT write, at most
  244 bytes, is parsed against a staging copy of the real portable device.
  The embedded stream's context is repaired to point to the staged device.
  All generated output is collected in four bounded static frame slots.
  If output exceeds free queue slots, the entire write returns ATT insufficient
  resources without committing any parser bytes or output. The sender must
  retry the same bytes after drainage or fail/close; ATT ACK is not drainage.
- A write generating more than four responses cannot fit even an empty queue.
  It must be split by the sender, not blindly retried forever. The current
  client sends individual framed requests; an ATT error may close its session
  rather than implement retries. This target promises integrity, not arbitrary
  burst acceptance or recovery of client timeouts.
- Staging is safe because the portable dispatcher has no external effects and
  only implements info/capabilities/ping (and protocol errors). Any future
  side-effecting operation requires redesign; do not extend the dispatcher
  under this transaction assumption.
- The parser and every response commit atomically on successful admission.
  Partial frames, malformed-input resynchronization and counters are staged
  too. Inbound mbufs remain owned by NimBLE. Each outbound mbuf is handed to
  notify_custom once, which must consume it on success and failure under the
  selected SDK contract. The opt-in source rejects BLE_GATT_NOTIFY-disabled
  builds because that pinned branch returns without consuming the mbuf.
  Allocation failure owns no mbuf.
- Notifications use min(MTU minus 3, 244, remaining); ATT MTU below 23 fences
  the session. One pending queue is serviced via a 5 ms callout. Ten consecutive
  notification/allocation failures fence; successful chunks reset that count.
  A callout scheduling failure also fences immediately. There is no automatic
  unbounded retry loop, allocation, or output queue.
- Fencing locally clears pending output, stops the timer and rejects writes
  before requesting termination, irrespective of its return value. If the
  stack cannot disconnect, the adapter stays fenced indefinitely rather than
  pretending release. It does not advertise another session in that state.
  Previously ACKed requests can remain unanswered on link failure, as with any
  disconnected transport; clients must enforce their own request deadlines.
- The first enable queues one READY. Repeated enables are idempotent even with
  partial input or output. Disable after enable fences; re-enable is ignored
  until confirmed disconnection and a new connection. There is no in-session
  restart marker. Foreign handles cannot reset ownership. A stopped/stale timer
  callback can only service the current eligible queue, never reset its parser,
  resurrect a fenced queue, or inject READY. Same numeric handle reuse relies
  on NimBLE's serialized GAP event ordering, not an invented per-link token.
- Host reset without a matching GAP disconnect is an explicitly unrecovered
  state: this adapter installs no reset callback and does not infer ownership
  release from a later sync callback. The live-owner advertising guard remains
  closed, and subsequent notification errors can fence pending work. Recovery
  requires a separately authorized restart, not silent session reuse. Pinned
  ESP-IDF v6.1/NimBLE source resets established connections with matching GAP
  disconnect events before reset/sync callbacks, narrowing this hypothetical
  missing-disconnect case. That source ordering is not physical acceptance.

## Source and host verification

The [actual-source harness report](../../review-evidence/esp32s3-reviewed-host/REPORT.md)
records 18 revised scenarios, including 10,000 deterministic interleavings. The
[independent review](../../verification/esp32-reviewed-independent/REVIEW.md) passed
eight probe groups including 100 admission combinations and detected all eight
intentional source mutations. Normal, ASan and UBSan checks passed within the
explicit fake-interface model; ASan used leak detection disabled. The original
LeakSanitizer limitation remains recorded. These are host tests, including fully
stubbed startup paths, not production SDK/board startup.

Admission overflow rolls back without committing input. A scheduling failure
after commit instead fences, drops pending output and returns ATT_UNLIKELY; it is
not described as the same rollback guarantee. Review assumes serialized,
non-reentrant NimBLE callbacks and cannot validate that SDK contract.

## Remaining acceptance gates

Selected SDK headers/API/ABI and build,
NimBLE event serialization and callout stop/reset semantics, mbuf consumption,
static RAM/task-stack headroom, boot/config behavior, named board ownership,
authorized USB/radio execution, negotiated MTU and real notification pressure,
termination/reset/reconnect behavior and phone lifecycle all need their own
appropriate evidence. Host fake APIs cannot establish any of these physical
or SDK properties. The unchanged historical target remains hazardous to run
without its separately documented review; it is not silently redirected here.
