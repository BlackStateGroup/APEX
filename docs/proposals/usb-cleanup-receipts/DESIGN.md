# Native USB cleanup receipt proposal (UNAPPLIED)

## Status and exact source gate

Design review only. No active Kotlin, API, or App changes. No executable native
patch is provided. All proposed signatures and algorithms are non-executable design sketches.
Base commit: f75a74032b71f54dbdf87c81e7f6a6e11070696f.
Required SHA-256 of modules/apex-device/android/src/main/java/expo/modules/apexdevice/ApexDeviceModule.kt:
53887adec7cac4bf3be4e06c76aaddab20005546f4d569e2583995223eef7d30.
A reviewer must reassess the analysis against any other source hash and reassess
all line references. The companion test enforces this exact gate; it never
changes the source. There is no patch, automatic patch script, or install script.

## Source evidence and minimum change boundary

Read together with docs/SESSION_RELEASE.md and docs/validation/usb-lifecycle.md.
At this exact source: closeLink lines 210–219 drops link before cleanup, ignores
releaseInterface booleans, may skip control release after data release throws,
and may skip the terminal event after any cleanup exception. join(300) does not
check thread termination. Subsequent closeUsb can fulfill without doing work.
writeUsb lines 121–136 owns writeLock but closeLink does not. The reader can
invoke closeLink itself (204), while external close can join it (218).
openLink (170–207) holds lock while opening, claims interfaces with short-circuit
logic, and only creates a token/Link after configuration. Its catch can lose the
connection handle after a throwing close. Thread-start failure can also reach
that catch after link was published. OnDestroy (155–161) has no durable cleanup
owner beyond this module instance. These are source facts, not device behavior.

A safe recovery change therefore cannot consist only of returning a boolean from
closeUsb. It needs acquisition ownership, I/O quiescence, cleanup step receipts,
and lifecycle ownership. Keep the existing JavaScript permanent fence until an
explicitly versioned protocol is implemented and validated end to end.

## Proposed receipt protocol

Proposed version 2, not an implemented API: closeUsbV2(ownerId, token) requests
closure and returns a snapshot; getUsbCleanupV2(ownerId, token) only reads it.
An explicit retryUsbCleanupV2 may resume safe unfinished work, never infer
success from absence of a link. Receipt fields: version, ownerId, token, revision,
state, retryable, reason, writerQuiesced, readerExited, and bounded per-step
outcomes. Valid states:

- pending: exact owner exists and work is active or waiting for I/O quiescence.
- failed: exact owner retained; a recorded operation failed or has ambiguous
  effects. retryable defaults false; pending completion is not a failure.
- closed: exact owner was acquired, all required cleanup steps acknowledged,
  no writer remains, and reader exit was observed. It is a local resource cleanup
  acknowledgement only, never RF silence, physical unplug, or device reset.
- unknown: no verifiable exact-token record, wrong owner, evicted receipt, or
  unsupported version. It never releases a JavaScript lease.

Receipts carry no connection handles over the bridge. Revisions increase under
one state lock; callers ignore lower revisions. Only closed releases the new
protocol's lease, after outstanding acquisition/write bridge calls settle.
A bridge rejection is not a receipt; retain the token and query it. A lost reply
can be recovered by reading a committed closed receipt, unlike today's no-op.
Legacy events and closeUsb fulfillment must not be interpreted as v2 receipts.

## Ownership and acquisition

Use a process-lifetime coordinator, shared by module instances, to own at most
one unresolved USB acquisition/connection and its exact handle. A module-local
fence would allow recreation to bypass unresolved cleanup. Reserve an owner and
non-reused token before calling openDevice; publish the connection immediately
when it returns, before claim/configuration. Track each claim separately. A
throwing claim has ambiguous effects and retains the handle and fence. Acquisition
must settle before cleanup can acknowledge closed. Token allocation fails closed
before overflow, never wraps. A unique coordinator epoch disambiguates process
lifetimes; stale epochs return unknown and never target a newer connection.

To make failed-open tokens recoverable, v2 needs a reserve-then-open handshake:
reserve returns identity without touching hardware; openReserved targets that
identity. Failed or lost open responses can then be queried. Do not silently
change today's openUsb return/error contract. A token-less legacy open failure
remains fenced. Permission request ownership and cancellation also need a single
coordinator reservation; permission refusal before open can finish without a
connection. Process death provides no bridge receipt and is not a recovery claim.

## Concurrency and ordering

Separate active-I/O access from retained cleanup ownership. Stop new writes and
reader iterations when close is requested, but keep the exact connection,
interfaces, and thread record until resolved. Serialize cleanup attempts so
concurrent close/retry calls join one attempt or observe its snapshot.

Do not wait, invoke USB APIs, emit events, or join a thread while holding the
state lock. A dedicated cleanup executor waits for existing writer completion
and observed reader exit, then performs cleanup. The write path enters writeLock,
checks identity and closing under the state lock, and holds its operation permit
until its finally block. Writer errors request close without waiting for cleanup
while holding writeLock. Readers request close and acknowledge exit in finally;
they never join themselves or await a cleanup attempt that waits for them.

A timed join or thread interrupt is not exit acknowledgement. If the reader or
writer stalls, retain pending and deny open indefinitely; retry only rechecks
quiescence. This conservative ordering does not assume connection.close safely
cancels concurrent bulkTransfer. Validate reader publication/start races so that
cleanup cannot conclude there is no reader just before one starts. An executor
submission failure retains failed ownership, never drops the cleanup handle.

Commit a terminal receipt under the state lock before best-effort event dispatch.
An event throw must not undo the receipt or trigger another USB call. Include
identity and revision in a new v2 event, and make query authoritative. Data queued
before closing may arrive later; JS keeps generation fencing and ignores it.
Do not emit legacy onUsbClosed for pending/failed to an unchanged consumer.

## Cleanup steps and explicit retry limits

Record data-release, control-release, and connection-close separately as
unstarted/inflight/succeeded/failed-ambiguous (and not-required only when never
claimed with certainty). Each step must retain its outcome even if a later step
fails. Attempt independent best-effort cleanup without allowing one exception to
skip bookkeeping or later eligible cleanup. Always retain original acquisition
or I/O failure independently of cleanup failures.

A releaseInterface false or exception is not successful release. A close exception
is not proof that close had no effect. Neither is permission to invoke it again.
Do not repeat a succeeded, inflight, or ambiguous OS operation. After an ambiguous
step, attempt other independent steps only where reviewed safe; do not invoke
releaseInterface after a succeeded close. Conservatively keep failed even if
close returns normally after an unsuccessful release, until a separately reviewed
contract explicitly justifies treating connection close as sufficient. This can
leave an intentionally unrecoverable fence, not a claimed successful retry.

Initially retryable means only: resume an operation proven never started, or
recheck writer/reader settlement. It does not mean repeat releaseInterface or
close. If the desired product behavior requires retrying those exact methods
after exceptions, the candidate is BLOCKED on an explicit supported Android
contract or a carefully scoped, pinned implementation argument plus acceptance
criteria. No official API/AOSP guarantee was retrieved for this proposal; none
is asserted. No waitThread guarantee or OS method idempotency is invented.

## Destruction and bounded bookkeeping

OnDestroy synchronously seals the module and stops admitting work; it requests
coordinator cleanup without blocking the main thread. The coordinator retains
unresolved handles across module recreation. Handler.post completion, receiver
unregister, and NFC event dispatch are independent housekeeping, not USB receipts.
Do not let an exception in one housekeeping step skip the others. Bridge/event
loss on destruction does not establish closed; a future module queries the same
coordinator and cannot open while unresolved. Platform/process lifecycle and
executor lifetime require native review before implementation.

Retain the unresolved owner without eviction. Keep at most 64 closed receipts;
evicted identities return unknown and never closed. Do not retain connections in
closed receipts. Keep error details bounded and omit device identifiers from
unneeded diagnostics. If capacity for an unresolved owner cannot be retained,
refuse acquisition before calling openDevice. Receipt eviction can harm recovery
liveness but must not harm safety. A monotonic epoch/token pair prevents ABA reuse.

## Acceptance and blockers

The accompanying pure host model exercises receipt safety, not Kotlin locking,
Expo bridge ordering, Android APIs, or physical release. Native executable patch
is intentionally deferred: implementing only closeLink would leave acquisition,
module recreation, and ambiguous OS retries unsafe.

Before a native candidate: settle coordinator/Expo lifecycle ownership and API
migration, review precise Android contracts, and review lock ordering plus thread
publication. Then separately authorize compilation and fixture tests. Required
native cases: each claim/configure/thread-start failure, both release false/throw,
close throw before/after effects, blocked writer/reader, timed-out join with alive
thread, detach racing writes, destruction/recreation, event dispatch throw, lost
bridge response, concurrent duplicate closes, wrong/evicted tokens and exhaustion.
Record build/device/OS identities and distinguish public contracts from pinned
implementation observations. Native compilation, installation, execution,
Android/USB/device acceptance and RF checks: NOT RUN. No recovery guarantee is
provided by the source hash check or host state model.

## Hypothetical model limits and review correction

The model is a small synchronous illustration, not a complete implementation of
this proposed contract. It does not model ownerId, process epochs, receipt
revisions, bridge schemas, real thread/lock interleavings, executor submission,
reader publication, or Android effects. It uses one integer identity namespace.
Its reserve method creates a placeholder object immediately: that object is not
a UsbDeviceConnection and does not distinguish reservation from later acquisition
of a real OS handle. In the proposed native contract, reservation owns only the
identity/fence; openDevice returning a connection is a distinct transition whose
exact handle must be retained immediately. Failed-open tests demonstrate only
retention of the placeholder and fence, not correctness of native acquisition.
The model's event-throw example likewise does not simulate bridge delivery.

Independent review found that the original retry(token) finished the current
owner before checking the supplied identity. An unrelated token could therefore
commit another owner's closed receipt and release its fence. The original 13
checks missed this; the retained review-failure.log records the adversarial
failure (13 pass, 1 fail). Retry now checks identity before any finish, with
regressions for both unknown and historically closed tokens. This correction
is limited to the hypothetical model and changes no active native/API code.
Passing these checks does not cover the full receipt protocol or native safety.
