# Baseline harness tuple typing correction

Initial full-repository typecheck diagnostics are copied verbatim from
apex-continuation/verification/increment37-second/typecheck.{stdout,stderr}.log.txt
at main commit 3c0e86d. The parent reports that run passed all 1,619 Node tests
before failing typecheck; later gates were not run.

Correction: add "as const" to the exact two expected-failure pairs, making them
readonly tuples. Under noUncheckedIndexedAccess, flag and assertion now retain
their known string types rather than possibly undefined array elements.
No non-null assertion, string, runtime behavior or production source changed.

Validation in the isolated apex-transport-harness checkout:
- node --test tests/esp32-host-transport.test.ts tests/esp32-reviewed-host-transport.test.ts
  Exit 0; two wrappers pass, with baseline 17 and revised 18 scenarios and the
  two intentional historical failure reproductions still enforced.
- ./node_modules/.bin/tsc --noEmit
  Exit 0; full repository typecheck, not a focused file-only check.
- git diff --check passes.

Existing dependencies were reused through an ignored node_modules symlink to
the parent's installation. No packages installed or changed; no sanitizer rerun,
SDK/device operation or remote write. The parent's final integrated aggregate
rerun remains separate.
