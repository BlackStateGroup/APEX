# Owned initial Bluetooth state query: proposed contract, not implementation

Base: deb5f27a8a0781f518479c1e84aee26e316a29df. Read-only evidence:
assessment commits 3f6ea2d20260307580af88907f8a807f540e3550 and
782e5b89bab751a60ab78d87917332b2aec7af62. This isolated clone changes no production
source. No repository AGENTS.md or .agents skills were found. Existing runtime
and stable v42 aggregate remain untouched. Model tests below are design evidence,
not adapter, SDK, native or physical acceptance.

## Decision

Use onStateChange(callback, false), followed by explicitly owned state(). Reject
cancellation, timeout and readiness errors promptly; retain an independent,
module-local query fence until the exposed SDK Promise settles. Do NOT await a
stuck query before rejecting a cancelled caller. Do NOT publish successful
preparation, start any new acquisition, destroy the manager or reset its epoch
while the query remains outstanding. Do not destroy to force its Promise to
settle. If it never settles, full app/process restart is required; no HMR/reimport
recovery claim. Keep existing owned connection/scan stop and cancellation usable.

A successful event and successful preparation are distinct. A PoweredOn event
locks the readiness decision, but successful preparation additionally requires
query drainage, cleanup, live signal/deadline and unchanged manager/epoch.
Cancellation/deadline while waiting for drainage can still fail preparation.
This is an explicit behavior change, not preservation of all prior scheduling.

## Ownership and ordering

1. Reserve one preparation token synchronously on entry to prepare(), before any
   await/permission request. Refuse a second preparation rather than share a
   cancellation domain or start a second query. Hold this token until prepare's
   finally, not merely readiness Promise resolution. Tag with captured manager
   and epoch when available. New acquisition entry points check preparation and
   query fences. This also prevents preparation waiting for permission/import
   from crossing shutdown; shutdown now refuses that reservation. Internal
   cleanup is not acquisition and must remain exempt.
2. Preserve existing readinessCleanupUnknown exactly. Registration begins only
   after abort/health/epoch checks. Subscribe false, validate callable remove,
   complete registration handshake, then recheck cancellation and terminal
   decision before query dispatch. A synchronous terminal callback can make the
   query unnecessary; do not dispatch it. A registration throw/malformed handle
   retains the old lost-subscription latch, deterministic cleanup/error ordering,
   and process-restart requirement. Even an earlier success cannot excuse a
   malformed handle or registration error.
3. Allocate a query ownership record BEFORE calling state(). Invoke in a separate
   try/catch and immediately attach fulfillment AND rejection handlers in the same
   stack. The consumed continuation must itself be nonthrowing; no finally chain
   that silently creates another rejected Promise. Do not use SDK private fields,
   global unhandled-rejection handlers, or installed SDK changes.
4. state() synchronous throw means no exposed Promise exists. Retire its pending
   record into a SEPARATE persistent query-dispatch-unknown latch, since arbitrary
   native dispatch-before-throw cannot be disproved by the public contract. Fail
   preparation with the exact thrown value, even null/undefined/false. Remove the
   available subscription. This is not automatically lost subscription ownership.
   A failed remove still sets the existing readinessCleanupUnknown latch. Both
   uncertainty latches prohibit acquisition/destruction/reset, never owned cleanup.
5. Readiness decisions are selected once: a terminal event, query rejection, or
   eligible terminal query value. Terminal states retain current PoweredOn,
   PoweredOff, Unauthorized, Unsupported classification. All later query outcomes
   are consumed and retire tracking only; they cannot replace a selected decision.
   Query state values are initial snapshots: if ANY live state event was already
   observed since subscription, ignore a later query value, even if that event was
   Unknown/Resetting. This prevents a stale PoweredOn snapshot defeating a newer
   nonterminal event. Query rejection with no terminal decision still fails fast.
   If query callback runs first, its terminal decision wins; Promise creation/native
   timestamp does not determine precedence. Events after a selected terminal
   decision do not revise it, matching existing first-terminal intent.
6. Preparation completion has its own write-once result. Readiness failure,
   cancellation and deadline can complete immediately. Readiness success is
   eligible only when no owned query remains, registration is complete, cleanup
   succeeds, signal is live and captured manager/epoch still match. Therefore a
   ready event followed by cancellation while its query is pending produces a
   cancelled preparation, without rewriting the recorded readiness decision.
   The original 10-second deadline remains active until preparation completes;
   ready event plus never-settling query fails at that deadline, retaining fence.
   Errors/cleanup continue to preserve falsy values with explicit hasError flags.
7. Keep timer, signal listener and subscription alive until eligible completion;
   ignore later state decisions once one is selected. On failure, remove them
   promptly even with a pending query. All independent cleanup attempts run; SDK
   removal failures latch permanently. Late query continuation cannot invoke
   cleanup twice, clear a latch, reconnect, publish a receipt or revive a token.
   On query drainage, delete its own identity record before evaluating success,
   then evaluate in the same callback; do not use an unowned queued start.
8. Wrapper settlement is NOT general native-release proof. PLX state() races its
   input with destruction, so calling destroy first would break the inference.
   In this design all adapter destruction is forbidden while the query is pending.
   Under that constrained, pinned wrapper path, ordinary settlement permits
   retirement of the SDK-query fence, not a claim about physical radio release.
   state() is read-only and never creates a connection-acquisition receipt. Unknown
   dispatch stays latched; no successful future query or reset rehabilitates it.

## Integration points in src/platform/bluetooth.native.ts

- Module state near readinessCleanupUnknown: preparation token, identity-scoped
  query Set, separate query-dispatch-unknown latch; narrow assertions for no new
  preparation/acquisition versus safe destruction. Avoid adding query checks to
  assertManagerHealthy globally, which is also used by existing connection I/O.
- prepare (currently lines 98-190): reserve/finally, manager/epoch checks, false
  subscription, explicit query tracking, split decision/completion, same cleanup
  aggregation. Before getManager and after its await, check reservation and
  shuttingDown. No SDK query after cancellation has been observed.
- assertScanAvailable and startSelectedServiceDataObservation: block query/token
  pending or unknown. Keep prepare's own reserved token exempt internally.
- bleDriver.connect after scanner.stop and after prepare: recheck cancellation,
  reservation/query availability and epoch immediately before connect dispatch.
  Also recheck the clean permission-receipt prefix against these new fences;
  don't let a permission denial during another pending query create new evidence.
  No readiness path calls permissionExit. Existing initial-abort receipt remains
  only exact local non-acquisition evidence, not permission to destroy manager.
- makeScanner.start and exclusive startBroad: assert no query pending/unknown at
  dispatch, in addition to existing epoch/signal checks. A queued start must not
  cross a newly established fence. Stop paths stay exempt.
- accessoryConnectionOwnership: unknown for query-dispatch-unknown; owned while a
  preparation/query is pending, even after connectionPreparing resets. Existing
  latches/unknown leases continue taking precedence. Never report idle while a
  pending query is the only remaining owned work.
- shutdownBluetooth: reject pending preparation/query before setting shuttingDown,
  and recheck after asynchronous scanner.stop/loading before destroy. Mark
  shuttingDown before any await as today. Do not clear pending query records.
- exclusive destroyAndRelease: after owner.pending drains, assert no preparation/
  query/unknown dispatch immediately before destroy. Its failed acquisition catch
  may still stop scanning; destroy rejects rather than waiting forever or forcing
  query settlement. Existing owner remains for explicit retry after drainage.
- resetDestroyedManager: assert no preparation/query/unknown dispatch. Never
  clear either persistent uncertainty latch. Existing closed iOS reset/destruction
  policy and ordinary iOS void start/stop meaning remain unchanged.
- Existing connection cancel/disconnect, notification removal, scanner stop and
  exclusive stop: no new availability assertion. They release owned work without
  manager destruction and must still run across pending query/latch uncertainty.

## Required implementation evidence, independent of this model

Exact installed ESM tests must prove one error conversion (101 retained), zero
unhandled rejections, successful direct query, cancellation/timeout/PoweredOff
before late success AND rejection, ready event before pending query failure,
ready event then cancellation/deadline, Resetting event before stale PoweredOn,
query-before-event precedence, synchronous registration/query throws including
falsy values, malformed removal handle/removal throw, microtask ordering,
concurrent preparation, cancellation during permission/import, shutdown/exclusive
cleanup/reset across pending query, retry after drainage, permanent uncertainty,
existing owned connection cancellation during the fence, and no receipt expansion.
Run affected adapter/connection/scan tests, typecheck, then the full stable
aggregate; independent reviewer should test exact final production source and
have enough time to investigate failures. Existing tests that only fake
onStateChange(true) need a separate state() fixture, not weakened assertions.

## Time decision (09:30 UTC design assessment)

Roughly 35 minutes remained to 10:05. A prototype might fit, but implementation,
all updated adapter/installed-ESM fixtures, independent race review and full
aggregate are NOT responsibly promised inside that window. Recommend approve
this contract now only if there is time beyond that checkpoint; otherwise retain
verified stable v42 and this explicit remaining gap. Do not integrate a rushed
unreviewed substitution. Final 10:23 deadline does not change acceptance gates.

## Executable model result

`node --test docs/proposals/owned-state-query/model.test.mjs`: 18/18 pass;
raw output is `model-results.tap`. The model covers the decision/completion split,
query fence, cancellation/deadline, stale snapshots, first-observed precedence,
falsy errors, concurrent reservation, existing owned cancellation and permanent
uncertainty. It intentionally abstracts subscription registration/cleanup, SDK
Promise conversion and actual asynchronous bridge scheduling. In particular its
synchronous registration test assumes a valid returned handle; production must
retain the explicit registration-complete handshake before publishing anything.
A model pass cannot substitute for the required adapter/ESM and independent tests.
