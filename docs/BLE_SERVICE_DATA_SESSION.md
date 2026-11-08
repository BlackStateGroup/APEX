# Pure service-data observation lifecycle foundation

8 November 2026. `packages/core/ble-service-data-session.ts` is dependency-free
core orchestration tested with synthetic mocks. **The pure module does not perform native work.** A separate Android-only callable
adapter is now implemented; see [native adapter](BLE_SERVICE_DATA_NATIVE_ADAPTER.md).
A separate Android-only opt-in UI now calls that adapter. No hardware scan was
performed during development; no automatic persistence or network wiring was
added. Existing advertised-service scanner behavior is unchanged.

## Mode and budgets

A caller explicitly selects Android/iOS and FCD2/FEAA. The backend seam explicitly
requests `serviceUUIDs: null`, `allowDuplicates: true`; this describes broad SDK
acquisition, not a native selected-service filter. It is never a fallback from a
zero-result advertised-UUID scan. Native integration must require the separately
reviewed, informed one-session opt-in and exclusive foreground ownership.

Fixed limits are 10,000 monotonic milliseconds from Start (including acquisition
and preparation), 100 total application-processed callback invocations, 25
retained matches, and 65,536 serialized observation UTF-16 code units. No caller
can raise limits. Stop/background invalidates the callback immediately. A timer,
a check at callback entry, and a check after matching-source preparation enforce
the cooperative deadline. A callback at/after deadline is ignored before its
count increases. Invalid/nonfinite/backward monotonic readings poison reuse.

Every active callback, including error/undefined/duplicate/unrelated/invalid
values, increments total before inspection. The 100th callback may be processed
within the other budgets, then invalidates delivery. Source membership precedes
all full preparation and retention; unrelated callbacks do not invoke the receipt
clock or inspect other Device fields. Malformed gate input and SDK errors
terminate immediately, so their streams need not reach 100. After invalidation,
late callbacks are ignored: total is **not** native callbacks generated, queued,
received by the bridge, or attempted after termination.

Membership uses the existing source-specific matcher: Android raw AD only, iOS
normalized dictionary only. A match is prepared with the existing exact selected
source/provenance function. Preparation failure terminates without truncation.
Matching callbacks may retain unrelated bytes and selected metadata from that
same callback. This is not a redacted service-only projection or a complete Device
snapshot. No nonmatching Device or arbitrary SDK error object is retained.
Source objects must be ordinary trusted bridge data, not executable proxies.
Injected clock/timer/receipt functions are trusted, nonreentrant synchronous
infrastructure. Clock/timer exceptions are guarded and poison reuse without
stranding completion; they must not mutate callback objects. Callback receipt timestamps
remain caller-supplied receipt times, not RF timestamps.

`characters` sums `JSON.stringify(observation).length` for retained entries, not
heap bytes, result-envelope size, diagnostic stacks, or native caches. An entry
that would exceed the remaining budget is rejected whole. `match` may therefore
exceed `retained`. Total equals match + noMatch + unavailable + malformed +
sdkErrors. Malformed describes membership validation only; preparation-error
is a matched callback that could not become an exact bounded source. Termination
reason is the first cause (for example Stop stays Stop even if destruction fails).
Cleanup errors and `reusable: false` separately disclose teardown failures.

## Ownership and backend requirements before release

PLX 3.5.1 has a singleton manager. Two managers do not provide isolation. A future
adapter must meet **all** of this contract before this foundation can be wired:

1. `acquireExclusive(signal)` must arbitrate against every accessory connection,
   discovery, scan, and other manager owner. Acquisition includes preparation.
   Return a lease only with provable exclusive ownership. Return null only when
   no manager ownership or pending native effects remain. A rejection is unknown
   ownership and poisons the controller; do not use rejection for an ordinary
   busy/permission-denied response if effects are conclusively absent.
2. Honor cancellation. Acquisition may settle late; a late lease is stopped and
   destroyed, never started. A promise that never settles leaves ownership
   unknowable and the controller poisoned, not available for new work.
3. `startBroad` must settle only after startup effects finish or are conclusively
   canceled. No delayed start effect may occur after settlement. A rejection
   does not certify cleanup: explicit stop and destruction still follow.
4. `stop` success certifies stop completion. It must be idempotent, safe during
   pending start and repeatable after startup settles. During pending start an
   early stop is issued, then a final stop after settlement. Late callbacks must
   be harmless. A timed-out stop may still finish later; destruction must safely
   serialize/fence outstanding stop effects and may not revive ownership.
5. `destroyAndRelease` success must mean native destruction has completed and
   exclusive ownership has been released. Never resolve merely after issuing the
   request. Attempt destruction even after stop failure. Failure or timeout must
   quarantine the manager outside this controller as well. No new owner may use
   an unknown manager simply because this JS session's `done` has resolved.
6. Destruction is not attempted while start remains unresolved. After a bounded
   start grace expires, the controller completes poisoned; if start eventually
   settles, best-effort final stop/destruction follows. A permanently hung start
   cannot be safely declared cleaned up. The integration must expose this to its
   explicit shutdown/recovery workflow, not automatically construct a new manager.
7. A later explicit session is permitted only after certified no-acquisition or
   successful stop AND destruction, with no uncertainty. A future acquisition
   must explicitly recreate/own the destroyed singleton under the adapter's
   reviewed lifecycle. There is no automatic retry or unpoison operation here.

Cancellation grace and each cleanup operation have a separate 2-second
cooperative timeout. Total cleanup may take several such intervals; 10 seconds
bounds acceptance/preparation, not `done` latency or RF duration. Late acquisition
and startup cleanup can continue after `done`, but never restore health.
`controller.errors` reports safe fixed-stage late diagnostics; completed results
are stable snapshots. Each observation and its string/scalar source payload are
frozen as well as the outer result and arrays. Errors intentionally omit original messages, causes and
custom fields because SDK errors can contain device identifiers or callback
references. Successful destruction after an earlier uncertainty does not rewrite
history or assert reusable state.

## What this does not establish

JS cannot cap SDK caching or queued events before delivery, nor enforce hard
wall-clock/RF stop if JS is blocked. PLX Android's manager device map needs
successful destruction, not only stop. Native hard limits require native controls
before caching/emission. Destruction does not prove OS cache deletion; iOS cache
behavior still needs verification. No capture completeness, transmitter identity,
authentication, physical reception or RF passivity is established by these mocks.

Tests cover unrelated-only exhaustion, exact retention, whole-entry character
rejection, errors/invalid callbacks, clocks, synchronous callbacks/throws,
cancellation during acquisition/start, stale callbacks, foreground/background,
repeated stop, failed/delayed cleanup, unknown ownership and late settlement.
See [membership](BLE_PLX_SERVICE_DATA_MATCHER.md) and
[filter review](BLE_SERVICE_DATA_FILTER_REVIEW.md) for the source and native limits.
