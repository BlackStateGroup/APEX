# Readiness settlement correction

Runtime/test review commit: `873062e8309613b14099a3706f82acc5995a6e44`.
Base: `4623faea6a851e9799f7a5730e351e22f055df63`.
Reproduction imported unchanged as `8988d40` from investigation `e485989`.
UI-copy imported as `7707ff8` from `95d1822`; its two UI files were not edited by
this correction. Current-manifest updates follow separately.

## Runtime boundary

Preparation records the first readiness outcome, waits until registration returns,
and attempts timer, SDK subscription, and abort-listener cleanup independently.
One rejection value is returned unchanged, including undefined/null/false/0/empty
string. Multiple failures use AggregateError in readiness, registration, timer,
subscription, abort-listener order. No arbitrary thrown value is stringified.
A registration throw supersedes synchronous success and preserves its exact value.

Observed SDK registration/removal uncertainty sets both managerUnhealthy and a
persistent readinessCleanupUnknown latch before rejection. Both destruction paths
and reset check it. Competing preparations check before success and before return.
Existing owned connection cancellation still works. Ordinary readiness failures
and pure timer/AbortSignal cleanup faults do not set the restart-only latch when
SDK ownership is known. Stale callbacks are no-ops even if local cleanup fails.
No receipt certifies readiness; transport acquisition rejection remains unknown.

The SDK may delete its removal registry entry before the underlying remove throws,
so an Android destruction acknowledgment cannot certify that lost ownership. The
code requests app restart rather than automatic reset. No restart is performed.
Ordinary iOS scan dispatch semantics and the existing iOS destruction gate are
unchanged. The touched scan comment now distinguishes JS dispatch settlement from
native completion for void iOS exports.

## Regression evidence

- `before.log`: the exact 55-case regression source executed against the unchanged
  base native adapter, exit 1, 9 pass / 46 fail. This includes explicitly captured
  harness failures and unhandled callback errors on the old implementation.
- `after.log`: 55 pass / 0 fail on the corrected adapter, exit 0.
- `consumers.log`: 137 pass / 0 fail across readiness, scanner facade, independent
  scanner, exact iOS void, unissued acquisition, PLX C facade, and two app/PLX suites.
- `typecheck.log`: full TypeScript check, exit 0 (empty successful output).
- `inputs.sha256.json`: exact correction inputs. Installed SDK bytes are verified
  before and after tests by the existing unchanged loader and SDK pin manifest.

Cases cover installed PLX event/async initial callbacks, explicitly labelled
alternate synchronous contracts, falsy and hostile thrown values, registration
throw after callback, aggregated independent cleanup failures, normal states,
abort/timeout, pure local failures, competing owners, exclusive cleanup fences,
transport uncertainty, and still-usable owned connection cancellation.
The competing-owner fixture deliberately drops the old AbortSignal callback while
the actual scan controller releases its local lease; this is an adversarial
boundary fixture, not evidence that a real AbortSignal drops notifications.

## Historical preservation and current consumers

The original evidence/readiness-cleanup files and historical verification manifests
remain byte-exact. New `verification/plx-scan-facade-current/inputs.sha256.json`
retains every historical scanner input path and adds the independent consumer;
both executable scanner consumers read that current overlay. The current iOS
scan-void manifest retains all its required paths and receives the new native hash.
The explicitly mutable browser-c-host current-inputs manifest is refreshed. No
check is disabled, removed, or made optional.

## Limits

Installed PLX published ESM and adapter code execute with synthetic RN/SDK-boundary
exceptions. These are not observed phone failures or native runtime, radio,
physical-release, readiness, Metro, Hermes, ABI, or device evidence. The SDK's
separate uncaught initial state-query rejection is not rewritten here; normal
teardown tests explicitly settle that synthetic query before destroying the manager.
No dependencies, lockfile, native projects, native SDK build, firmware, devices,
radios, USB/NFC, settings, credentials, providers or remotes were changed. The
separately denied ESP startup/configuration review was not retried or investigated.

## Independent-review correction

Fresh review found that null/undefined removal handles from an alternate
synchronous SDK contract could pass optional removal and continue to connect.
Commit `27effc528f66028684fed383d469f38a1ac28268` adds a single production validation
line after registration returns. Missing/noncallable cleanup is now registration
uncertainty and rejects before success. Eight additional tests cover null,
undefined, empty, and noncallable handles with both PoweredOn and Unknown callbacks.
`review-fix-tests.log` records 63 passing tests; `final-consumers.log` records 145
passing tests, with no failures or skips. Full typecheck again passes.
The previous 55-case logs deliberately retain the initial review snapshot, rather
than claiming the later eight cases were part of that earlier run.

The original unprepared-clone full-suite attempt is retained as
`unprepared-clone-full-tests.log`: 2,030 tests, 2,012 pass, 18 fail because this
isolated clone lacked the existing portable host binary and REA dependencies.
This is setup failure, not a runtime finding. `setup.json` records the byte-verified
copy of main's existing portable binary into this clone's own build directory and
the existing dependency symlink. No portable firmware rebuild or install was
performed for this correction. The prepared rerun uses the fixed runner's offline,
notifier-disabled environment and concurrency=2 without omitting any Node test.

Prepared full Node regression (`full-tests.log`) completes with 2,038 tests passed,
0 failed, 0 skipped, exit 0. It includes every `.test.ts` file in this clone; no
suite was omitted. This is not the parent's nine-stage aggregate or native/device
verification. The copied portable binary remains byte-identical to main afterward.
