# Local native activation continuation

Completed locally on 2026-11-08 after the first activation review. This addendum
changes tests, test runners and documentation, not the app, Java coordinator,
JNI, C++ kernel or pinned core oracle. It does not change repository state or
claim Android compilation, publication, deployment or release.

## New integration evidence

Both ordinary and fatal-UBSan runs passed using:

```
bash modules/apex-iq/host-check.sh --parity
bash modules/apex-iq/host-check.sh --sanitize --parity
```

Each run uses the Node runtime's JS packet encoder and coefficient generation,
the production process-wide Java coordinator, the production JNI library and
C++ FFT, then the unchanged JS oracle. The complete corpus passed 1,485 requests,
8,924 windows, 23,029,248 bins and 46,058,496 raw components with Object.is exact
comparison, including signed zeros. The same route passed the app engine's 17
qualification probes plus eight complete single-window/time-frequency reports.
The corpus digest is recorded in each log.

Each run also passed 163,885 real JNI boundary assertions under -Xcheck:jni,
eight process-client negative controls, and four lifecycle race families with
100 rounds each. Lifecycle assertion counts vary slightly with legal scheduling
outcomes; the number of race rounds is fixed.

## Review-driven test hardening

Initial independent review found three test-harness weaknesses, now corrected:

1. The subprocess client now consumes stdout through EOF and rejects trailing
   chunks instead of inspecting only already-buffered bytes.
2. Diagnostics retain at most 64 KiB. Timeout/abort escalates TERM to KILL and
   destroys streams after a bounded grace period. Controls cover a TERM-ignoring
   child, malformed output, excess diagnostics, process-start failure and
   nonzero exit.
3. Engine assertions are captured outside the coordinator's cancellation error
   handling, then checked by the controlling test thread after actual drain.
   A permanent negative control proves cancellation cannot hide a deliberately
   thrown engine assertion. A temporary-copy mutation removing teardown's cancel
   flag propagation must fail; production source is never changed by that check.

Ten corrected lifecycle runs additionally passed 4,000 synchronized race rounds.
The saved repetition and mutation logs document these checks. No production
coordinator defect was reproduced, and stress testing is not a proof that every
possible schedule is safe.

## Scope and remaining gates

These results are Linux x86_64, Node/V8 and host-JVM evidence only. The test stdin
adapter is not Expo marshalling, an Android/Hermes/ARM execution environment or
a production transport. Actual Android Kotlin/Gradle/NDK compilation, app linkage,
16-KiB device loadability, runtime/device cancellation and physical-device testing
remain outstanding. Rust mobile linkage, iOS native support and speedups are not
claimed. The app still uses exact per-request JS verification and safe fallback.

The extra parity mode is opt-in; no separate CI job, toolchain installation,
remote commit, PR or Actions run was created during this local continuation.
Previous full-app local results and blockers remain described in the parent
verification directory. The earlier source-review manifest is historical for
modified test files; this continuation has its own review and hash manifest.
