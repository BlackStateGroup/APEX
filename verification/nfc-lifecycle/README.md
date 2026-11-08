# NFC lifecycle repair verification

Local synthetic checks only. No phone, tag, native development build, permissions,
settings, installation, publication, or remote action was used to validate NFC.
The App Stop-button change is typechecked, not device/UI acceptance-tested.

## Before-repair findings

- **Medium: stale startup state.** Start A; invoke its SessionClosed callback while
  begin A is pending; start B; settle begin A. A publishes idle over B's starting
  state, permitting C to silently supersede B. Reproduced with the real reader
  and a deferred fake backend.
- **Medium: lost cleanup ownership.** Start; make unregister reject; stop again.
  Only one cleanup call occurs and the old reader reports idle while native
  release is uncertain. The native adapter also marked itself inactive before
  unregister succeeded, so retaining only the reader handle would not fix retry.
- **Medium: singleton listener loss.** Begin A; attempt B; reject B's registration
  as a duplicate. B's catch removes A's live listeners. Also, stopping A removes
  B's listeners if a permissive SDK mock accepts both. The first ordering matches
  the installed iOS SDK's duplicate-registration guard; neither is a device test.
- **Low/availability: pending cancellation.** An unresolved status/begin keeps
  stop waiting. This is an explicit underlying API limitation, not proof that a
  physical native promise hangs. The App previously disabled Stop during startup.

Original standalone audit script is retained outside the repository at
`/tmp/apex-nfc-audit/repro.mjs`; it exercised original source and mocked only SDK
imports for native adapter cases. Regression tests now encode the repaired
contracts without that environment-specific path.

## Repair

`NfcReader` retains an operation lease through startup, stop and uncertain cleanup.
It queues operations before state callbacks to support synchronous reentrancy.
Cancellation suppresses observations immediately; state becomes stopping while
native promises are pending. Failed cleanup retains its handle and blocks a new
start until explicit retry succeeds or SessionClosed confirms release after any in-flight
backend operation has settled. Old
completion/callback paths cannot publish state over a new lease.

`createNfcSessionController` owns the native manager's singleton listeners. A
competing begin is rejected before listeners are changed. Stop failure retains
ownership and the close listener, suppresses tags, and allows explicit retry.
Closure or confirmed cleanup clears only that lease's listeners, after an
in-flight register/unregister operation has settled. The platform
wrapper retains existing registration options, lazy loading, NFC status checks
and user-cancellation classification.

The installed iOS SDK resets session state before emitting SessionClosed, and
calls the unregister callback immediately before emitting that event. iOS cleanup
therefore requires the close event as well as unregister settlement (resolution,
or a rejection consumed because closure independently confirms release): a late old
global event must not land on a replacement listener. Android does not require
this iOS-only event. Closure before begin settles is held until registration
settles; synchronous closure alone is not presented as a demonstrated native leak.

The App keeps Stop available during startup and bypasses the start-operation lock
for cancellation. Its shared action dispatcher has an authored mock integration
regression proving Stop bypasses a pending start lock, does not unlock unrelated
actions, preserves a cleanup-failure notice, and does not clear another active
operation's busy state. This is not React rendering/device acceptance.
Metadata normalization, retained payload scope and permissions
are unchanged.

## Checks

- `node --test tests/nfc-lifecycle.test.ts tests/accessory.test.ts`: **28 passed**
  (20 new lifecycle/action tests plus 8 existing accessory tests); see `focused.log`.
- `node node_modules/typescript/bin/tsc --noEmit`: **passed**, exit 0;
  `typecheck.log` is empty because the compiler reported no diagnostics.
- `git diff --check`: passed.
- `npm test`: **interrupted, not passed**. Portable C tests completed and partial
  JavaScript successes were logged, but the tool reviewer stopped execution with:

  > The command runs npm test, which triggered access to registry.npmjs.org despite
  > the user explicitly restricting the task to no network or install actions.

  The exact partial output is `full-suite.log`. No retry or alternate aggregate
  execution was attempted. Read-only inspection found no registry URL/call in the
  test output, package test command, portable firmware builder, native-build
  wrapper, or its process-group helper. The precise trigger is **not established**;
  npm's notifier/config is only a possibility, not a verified cause. Configuration
  and dependencies were not changed. Parent integration owns the aggregate check.

## Remaining limits

No watchdog can safely assert cancellation of unresolved SDK status, register,
unregister, or missing iOS SessionClosed. The reader intentionally remains active
or stopping and refuses new ownership; it does not announce false success. A
persistent failure needs native closure, an explicit successful stop retry, or
runtime recovery. Unmount cleanup remains best effort; remount cannot steal an
uncertain native lease from an old reader.

The adapter follows the SDK contract that a rejected registration did not acquire
a new session. Listener setters are synchronous SDK operations. Tests model SDK
ordering deterministically; they do not validate bridge delivery, NFC hardware,
background OS enforcement, or device prompts. Non-APEX code replacing listeners
outside this controller remains outside its ownership guarantee.


## Review correction: closure while unregister is pending

The initial repair released the reader/native lease when SessionClosed arrived,
although its serialized stop operation could still be waiting on unregister.
That allowed a new start to report starting while permanently queued behind the
old operation. The corrected contract is conservative: closure does not cancel
or settle an already in-flight native operation. Both reader and controller remain
stopping/owned until that operation settles. Concurrent stop calls continue to
return the same pending promise, rather than incorrectly succeeding after closure.

Integrated regressions leave unregister unresolved indefinitely, deliver closure,
and confirm that both reader restart and competing native begin reject. Separate
coverage settles the operation afterward and verifies restart, and verifies a late
unregister rejection is consumed only when closure already confirmed session end.
This explicitly supersedes the initial test allowing replacement before a late
unregister outcome. No aggregate retry was performed for this correction.
