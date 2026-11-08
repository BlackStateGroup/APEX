# Native build source parking

`node tools/native-build.mjs ios|android [--prebuild-only]` keeps the reference
corpus outside the app while Expo prebuild runs. Normal prebuild/run arguments
are unchanged. The wrapper now owns an exclusive sibling directory named
`.<app-directory-name>-native-build.lock` through the entire command, including
native run. `owner.json` records the wrapper PID, child PID/process-group ID, command, and exact source/recovery paths. The lock is created with mode `0700`.
Concurrent wrapper invocations refuse to start. Do not edit or recreate the
source directory while a build owns this lock.

SIGINT, SIGTERM and SIGHUP request child termination before restoration. On POSIX
the signal includes the child's process group; SIGKILL is scheduled after a
five-second grace period, even if the group leader has already exited. On every child
completion, including ordinary success/failure, the wrapper polls the tracked
process group for up to six seconds. A first interrupt during that window extends
the deadline, if necessary, to six seconds after that interrupt, allowing the
five-second SIGKILL escalation and one further second of observation. Repeated
signals do not extend the deadline again. Both deadlines use the same monotonic
clock, so wall-clock adjustments do not change the observation bounds. An error
probing the group fails closed immediately rather than waiting for escalation;
signal delivery itself may also fail. Only an ESRCH result proves absence. A live
group, unreaped zombie group, permission error, or any other uncertain probe
result retains the corpus, ownership record, and lock instead of restoring or
continuing to native run. Merely observing the leader's close event is not proof
that descendants are gone. Ordinary completion does not kill surviving helpers;
it fails closed after the bounded observation window.

The wrapper reports a nonzero interruption result. This is not protection from
power loss, SIGKILL of the wrapper, or descendants that deliberately detach or
escape the tracked process group/session. On Windows, an existing corpus causes
failure before moving sources because equivalent containment cannot be verified
with the built-in tools used here. Builds with no corpus can still proceed on
Windows, without a child-tree quiescence guarantee.

If restoration finds an existing destination, it refuses to replace it, reports
both locations, and retains the parked corpus and lock. Restoration and command
errors are both retained. The destination check coordinates wrapper invocations
through the lock; it is not an OS-level no-replace rename against unrelated
processes racing to write the destination.

## Manual recovery

1. Inspect the lock's `owner.json`, parked corpus, and destination. Confirm that
   no build or descendant process is still running before changing either path.
2. Preserve both locations if the destination exists. Compare their contents and
   move any conflicting destination aside deliberately; never delete either
   corpus merely to make the wrapper proceed.
3. Restore the parked `upstream-sources` directory to the exact `source` path in
   `owner.json` only once that destination is absent.
4. Once the corpus is verified restored, remove the inspected ownership record
   and empty lock directory. Do not recursively remove a lock or reclaim it on
   the strength of a stale PID alone.

A lock with unexpected contents is never recursively cleaned by the wrapper,
and its ownership record is retained (or exclusively recreated if contents
appeared during cleanup).
Abrupt termination intentionally requires inspection rather than an automatic
retry that could expose a still-parked corpus to a second build.

## Offline validation

`node --test tests/native-build.test.ts tests/native-process-group.test.ts` creates isolated temporary apps and a
fake local Expo CLI with synthetic sentinel bytes. It never invokes the actual
Expo CLI, a compiler, device, SDK, dependency installer, or network service.
Tests cover successful prebuild/run ordering, failure restoration, missing CLI
and optional corpus, destination collisions, retained primary errors, concurrency,
invalid platform, stale locks, graceful signals, bounded escalation, and SIGKILL
recovery records. Descendant tests cover leader success/failure and interruption
after leader exit; deterministic process-group tests cover permission errors,
timeouts, and eventual verified absence. Native build/device compatibility remains unverified.
