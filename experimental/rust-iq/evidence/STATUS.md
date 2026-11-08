# Rust I/Q proof verification checkpoint

Date: 8 November 2026 UTC. Baseline: APEX `63f530d1f6f8f943d4fd2c1016904f3259daf77a`.
This checkpoint adds only the isolated `experimental/rust-iq/` tree. Existing
application, TypeScript numerical core, dependencies and firmware are unchanged.

## Completed checks

- Node-only proof codec/oracle tests: **8 passed, zero failed/skipped**.
- Independent quadratic DFT: **3,328 reference bins compared**. This exercises
  TypeScript/reference and the harness, not Rust output.
- Existing I/Q analysis, time-frequency and independent window regression subset:
  **34 passed, zero failed/skipped**. This is not a rerun of the full project suite.
- TOML syntax for the dependency-free manifest and lockfile parsed with Python's
  standard `tomllib`. This is not Cargo resolution, Rust syntax or compilation.
- Independent source review and repeat Node/oracle verification are recorded in
  `independent-review.json` with reviewed file hashes.

The 56-case corpus contains all five FFT sizes, zero/DC/signed quarter-cycle and
Nyquist tones, signed-rail/endian inputs, off-bin mixed tones, selected/overlapping/
gapped/maximal windows, Hann-zero endpoints and 15 nonzero-location impulses.
Its full actual-Rust execution remains pending.

## Blocked and unrun

`node experimental/rust-iq/proof.mjs verify` correctly returns **exit 2 / BLOCKED**
at `cargo --version`: Cargo is not installed or not on PATH. Rust compiler checks
also found no `rustc` in PATH or inspected standard toolchain locations. The
available environment inventory lists only this connected cloud and an explicitly
offline Mac; no other ready builder was established. No installation, machine
startup, attachment, external execution or toolchain download was performed.

Therefore Rust compilation, eight authored Rust tests, Rust/TypeScript
differential tests, executable malformed-input checks and Rust timings are
**not run**, not passed or skipped. Formatting/clippy and all iOS/Android/native
worker/physical-device checks are likewise **not run**. The compiled language
choice does not alter these acceptance gates.

## Preserved evidence

- `node-codec-tests.txt`: complete Node-only test output.
- `oracle.json`: scoped oracle run and exact source hashes, `rustExecuted:false`.
- `verify.stderr.json`, `verify-exit.txt`: actual blocked verification result.
- `verify.stdout.txt`: empty, retained to show no successful result was printed.
- `typescript-baseline-tests.txt`: exact existing subset test output.
- `independent-review.json`: review scope, limitations and file hashes.

No measured Rust speedup, production suitability, mobile compatibility, radio
acquisition or drop-in numerical equivalence is claimed. A future ready builder
must run the explicit verification command before this source can be called a
host-validated Rust implementation. Strict zero/null and peak differences must
remain failures, not be hidden by relaxing the comparator.
