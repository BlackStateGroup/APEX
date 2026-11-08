# Installed PLX initial-state rejection assessment

## Decision

Confirmed host-reproducible failure on exact APEX runtime
`deb5f27a8a0781f518479c1e84aee26e316a29df`. Preserve production source and record
this limitation now. A supported-API correction is possible, but is not a safe
two-line replacement under the current ownership rules. No implementation is
recommended for this frozen aggregate without a separate contract and review.

This new isolated clone is `/workspace/scratch/b96d3539d24d/apex-initial-state-assessment`.
Only original investigation files under `evidence/initial-state-query/` were added.
No installed SDK, dependency, lockfile, native project or firmware changed.
No hardware, browser, remote action or excluded ESP review was performed.

## Reproduce and exact results

From this clone, reuse existing installed dependencies and run:

`node evidence/initial-state-query/reproduce.ts`

`results.json` and `run.log` preserve raw results and runtime/SDK SHA-256 hashes.
The existing unchanged ESM loader verifies every pinned SDK input before and after
execution. There are seven asserted scenarios. This is a standalone Node process
because observing an intentional unhandled rejection inside node:test would fail
the runner. Its process listener records the fault, not a proposed product fix.
The timeout case uses the real ten-second adapter timer, not a shortened timer.

- Rejected native state query: one unhandled SDK BleError; adapter opening stays
  pending, listener remains owned, SDK promise registry is already empty. Ten
  seconds later opening rejects with `Bluetooth did not become ready`, removes
  its listener and reports adapter idle. No connect dispatch and no receipt.
- Abort before query rejection: preparation rejects with cancellation, listener
  is removed, but both SDK promise wrappers are still pending. Later query
  rejection still becomes unhandled. Cancellation is not query cancellation.
- PoweredOff before query rejection: the event wins, listener is removed and
  adapter rejects with PoweredOff. The later query rejection remains unhandled.
- Abort then Android synthetic shutdown before the raw query rejects: shutdown
  is currently permitted while the two SDK wrappers are pending. SDK destruction
  rejects their races, producing the unhandled error before raw native settlement.
  The fixture subsequently rejects the raw promise. This is JS behavior, not
  native destruction/release evidence.
- Synchronous native state throw: the event listener has been installed but the
  SDK wrapper has not entered its registry or returned. Adapter preserves exact
  native error identity and correctly sets existing lost-subscription uncertainty.
  Listener remains present. No unhandled Promise rejection occurs in this case.
- Two API-only probes use `onStateChange(callback, false)` and owned `state()`:
  there is no hidden query, explicit rejection handler catches the converted
  error, and no unhandled rejection occurs. Removing the subscription first
  leaves the SDK query pending until the fixture actually rejects it.

For the normal asynchronous native failure, the injected Error.message is JSON
containing errorCode 101, reason `synthetic state fault`, androidErrorCode 73.
The SDK state() wrapper converts it to a new BleError with code 101 and the
original reason. onStateChange(true) wraps that Promise again, reparses its
human-readable message, and produces a different BleError with code 0 and reason
`Device is not authorized to use BluetoothLE`. The unhandled error is neither the
native object nor the eventual adapter timeout/cancellation/PoweredOff object.
The direct state() probe retains code 101 but still has SDK-converted identity.
These are synthetic adversarial inputs, not faults observed on phones.

## Source explanation

Installed `lib/module/BleManager.js`:

- Lines 146–160: `_callPromise` races the input with its destroy rejection,
  clears the SDK registry and reparses caught error.message.
- Lines 248–249: state() wraps BleModule.state(). Argument evaluation can throw
  synchronously before `_callPromise` runs.
- Lines 269–300: onStateChange installs the emitter listener first, then for
  emitCurrentState=true calls `_callPromise(this.state()).then(successOnly)`.
  There is no rejection handler and that derived Promise is not returned.
  remove() marks the callback cancelled, deletes its registry entry, then invokes
  the underlying removal. It neither cancels nor awaits the native state query.

Adapter `src/platform/bluetooth.native.ts` lines 98–190 only receives state
values through this API; its own correctly guarded settlement cannot catch the
SDK's detached rejected continuation. Current lost-subscription handling remains
necessary and correct for the synchronous-throw and removal-failure cases.

## Smallest supported correction and why it is not yet bounded

The minimum API-level idea is register with emitCurrentState=false, validate and
own the subscription, then call state() in a separate synchronous try/catch and
immediately attach both fulfillment and rejection handlers. Feed the converted
SDK error into existing finish(true, error), preserving identity and the current
explicit hasError flag. Do not patch SDK internals or install a global rejection
handler. This removes the demonstrated hidden rejection, but cannot alone meet
the requested ownership and semantic guarantees:

1. Subscribe before querying, preserving coverage of events while the query is
   outstanding. Both paths need the same terminal guard. Registration errors,
   malformed cleanup handles and local cleanup must retain current deterministic
   aggregation and module-instance lost-subscription latch.
2. Separate query synchronous throws from registration throws: with false, the
   subscription handle is available before state() dispatch. A query error is
   not automatically lost-subscription proof; cleanup failure still is. However
   a throw after dispatch may leave an unobservable raw native effect, so do not
   equate an available handle with fully known manager release.
3. A direct state() continuation has fewer Promise hops than the current nested
   _callPromise call. Queued state-event/query races can change which terminal
   value wins. Retaining first-observed terminal outcome is a new explicit
   contract, not proof that all scheduling matches the old implementation.
4. Define whether an event-success before query rejection may proceed to connect.
   First-terminal-wins preserves that existing event behavior but the late error
   must still be consumed. Requiring query settlement before publishing success
   or letting a late error replace success changes existing semantics. Either
   choice requires adversarial ordering tests and explicit acceptance.
5. Abort/timeout/event cleanup cannot retire the pending query. A module-level
   query fence must outlive individual preparation/controller completion and
   cover new acquisition, ordinary scanner reuse, exclusive destruction, shutdown
   and epoch reset. Existing ordinaryScanOperations and owner.pending do not
   track readiness state queries. Current tests permit adapter idle while those
   SDK promises remain pending; changing this affects consumer expectations.
6. Even a tracked state() Promise is a public SDK wrapper, not the raw native
   Promise. It races destruction. Its rejection on destroy is not proof that
   native query work settled. Do not inspect private SDK registry as a production
   contract or claim native release. Fence destruction before unresolved query
   settlement; a never-settling query needs conservative unknown/restart handling.
7. After cancellation or other first terminal result, late success/error must
   settle tracking without reentering finish, reconnecting, overwriting errors,
   certifying a receipt or clearing a pre-existing uncertainty latch. Abort may
   preserve a responsive caller result while retaining a separate ownership fence.
8. Preserve the closed iOS Reset/destruction gate, ordinary scan dispatch behavior,
   exact unissued-permission receipt eligibility and ability to cancel existing
   owned connections. No readiness error qualifies for that receipt. Never clear
   the lost-subscription latch on successful query settlement or epoch reset.
   It is module-instance state: HMR/reimport is not recovery; use a full app/process
   restart when required.

A future bounded implementation therefore needs a dedicated ownership design and
fresh independent tests for both API paths and all fences, not just the rejection
handler. Required tests include query/event/abort/timeout order permutations,
queued microtasks, synchronous dispatch and registration throws (including falsy
values), stuck queries, removal failures, late callbacks, competing preparation,
shutdown and exclusive cleanup, existing connection cancellation and receipt
noneligibility. Keep the current limitation rather than silently changing those
semantics in the frozen source. No production correction or aggregate pass is
claimed by this assessment; parent aggregate remains independent.
