# Independent local continuation review

Reviewed on 2026-11-08. Scope: the seven files listed in
`INDEPENDENT_SOURCE.sha256`, covering test runners, test process transport,
Java lifecycle stress checks and documentation. No production change was part
of this continuation.

## Outcome

Accepted for local host-test hardening. No remaining harness blocker found.
The three issues from the initial review are corrected:

1. The process client consumes stdout through EOF and rejects additional chunks.
   It no longer depends on only its private buffer being empty. The regression
   control deliberately emits a later-chunk tail and verifies rejection.
2. Retained stderr is capped at 65,536 bytes. Timeout and explicit abort escalate
   TERM to KILL, then close streams and detach an uninterruptible child after a
   bounded grace period. Failure to observe termination rejects; it cannot be
   reported as successful completion. Controls exercise TERM refusal, explicit
   abort, diagnostics overflow, process-start failure and malformed/nonzero exits.
3. EngineProbe records injected-engine exceptions independently of coordinator
   callback behavior. The controlling test thread checks the recorded failure
   after completion. A permanent negative control demonstrates that cancellation
   cannot hide a deliberate engine assertion. The recorded teardown-cancel
   mutation also fails as expected.

Reviewed request/response limits, framing, identity checks, oracle blob pins,
exact projected-report comparisons and raw `Object.is` comparisons remain intact.
The Java packet adapter invokes the production coordinator and JNI, not a canned
FFT result. The app-level leg additionally requires native selection and the
expected 17 qualification calls before accepting its complete reports.

## Independent execution and evidence checks

- Reran `node --test modules/apex-iq/tests/jni-host-client.test.mjs`: 8/8 passed.
  Log: `independent-host-client-controls.log`.
- Compiled production Java coordinator/native declarations plus the final
  lifecycle checks with `java com.sun.tools.javac.Main -Xlint:all -Werror`.
  Reran the lifecycle suite: all four race families completed 100 rounds each;
  8,773 assertions passed, including the engine-failure negative control.
  Log: `independent-lifecycle.log`. Assertion totals may vary with legal schedules.
- Verified `SOURCE.sha256` and `PRODUCTION_UNCHANGED.sha256` successfully.
  Confirmed `git diff HEAD -- src packages/core modules/apex-iq/android/src/main`
  is empty and `git diff --check` passes.
- Inspected, rather than redundantly rerunning, both completed ordinary and fatal
  UBSan parity logs: each records 1,485 requests, 8,924 windows, 23,029,248 bins,
  46,058,496 raw components, 17 app qualification calls plus eight app reports,
  and 163,885 JNI boundary assertions. Both have the same corpus digest and
  explicitly disclaim Android, Hermes, Expo marshalling, Rust mobile and speed.
- Inspected the repeated-stress and mutation-rejection logs. Stress provides
  evidence about the exercised schedules, not a universal concurrency proof.

## Limits and publication

This acceptance is for Linux host evidence only. Android Kotlin/Gradle/NDK
compilation, Expo marshalling, Hermes/ARM behavior, real-device teardown,
16-KiB device loadability, native iOS, mobile Rust and performance remain outside
these checks. The test stdin adapter is not a production transport or a tested
cancellation transport.

No external publication, remote commit, PR, CI run, installation or production
source modification was performed during this independent review.
