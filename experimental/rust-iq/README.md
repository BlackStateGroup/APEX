# Experimental shared Rust I/Q numerical core

This is a **source-level proof candidate**, isolated from the APEX application.
The Rust compiler is unavailable in the inspected cloud environment. Rust
compilation, unit tests, Rust/TypeScript parity and Rust benchmarks have **not run**.
Do not describe this as a validated native engine or as phone-ready code.

The JavaScript harness and independent mathematical oracle have been executed.
They verify the harness/reference, not the Rust implementation. The executable
verification command fails closed with `BLOCKED` when Cargo is absent, rather
than skipping Rust tests and returning a successful parity claim.

## Scope and boundaries

The dependency-free Rust library ports one bounded numerical leaf from
`packages/core/iq-analysis.ts`: explicit periodic-Hann complex FFT windows.
It preserves negative-exponential FFT orientation, shifted signed bins,
coherent-gain-normalized amplitude, exact-zero/null dB, the -160 dB display-only
floor and first-strict-maximum selection. It accepts signed-int16 little-endian
I+jQ samples, not arbitrary formats or raw radio samples from a phone.

- Supported FFT sizes: 256, 512, 1,024, 2,048 and 4,096.
- Input: 1–65,536 complete complex samples, at most 262,144 bytes.
- Explicit windows: 1–64 frames, at most 16,384 cells; positive bounded hop.
- No padding, truncation, resampling, default-window fallback or inferred rates.
- Finite declared sample rate: 1–1e9; finite declared center frequency: ±1e12.
- Checked integer arithmetic rejects overflow before FFT/result allocations.
- Safe Rust only, with `#![forbid(unsafe_code)]`. Standard-library allocation is
  used; this is not `no_std`, allocation-free, zero-copy or hard-real-time code.

The core does **not** port full-file statistics, activity/rational comparisons,
lag/phase diagnostics, SigMF preparation, exact-byte evidence or source hashes.
It does not replace `PreparedIq` or validate supplier provenance. The existing
TypeScript parser, private snapshots, UI and evidence workflows are unchanged.

There is no app import, JSI/FFI/C ABI, JNI, Swift bridge, native worker,
cooperative cancellation, device acquisition, USB/BLE/NFC access, storage, radio
operation or deployment. The core is synchronous; a future mobile integration
must schedule it off the UI thread and preserve job ownership until settlement.
Rust memory safety does not itself establish lifecycle correctness or RF access.

## Files

- `src/lib.rs`: bounded numerical API and Rust unit tests, currently uncompiled.
- `src/wire.rs`, `src/main.rs`: experimental bounded host proof protocol/runner.
- `proof-codec.mjs`: strict binary host codec, 56 synthetic fixtures and comparison.
- `reference.mjs`: actual existing TypeScript adapter and independent direct DFT.
- `proof-codec.test.mjs`: Node-only harness/oracle tests; no Rust execution.
- `proof.mjs`: explicit oracle, verification and optional benchmark stages.
- `ARCHITECTURE.md`: long-term integration recommendation and migration gates.
- `evidence/`: retained results and source-review scope from this checkpoint.

No third-party implementation or dependency is added. The existing repository
licensing applies; this experiment does not grant new distribution rights.

## Reproduce with existing tools

From the repository root, Node 24.3+ within the project's Node 24 policy:

```sh
node --test experimental/rust-iq/proof-codec.test.mjs
node experimental/rust-iq/proof.mjs oracle
```

These run eight Node tests and compare 3,328 reference bins to an independently
implemented quadratic DFT. Test-only synthetic response bytes exercise decoder
branches and comparison failures. They are explicitly not Rust-generated output.

On a separately authorized, already-provisioned Rust builder, with Cargo and
Rust 1.75+ available on PATH:

```sh
node experimental/rust-iq/proof.mjs verify
node experimental/rust-iq/proof.mjs benchmark
```

Both require compiler presence, run `cargo test --offline --locked`, build the
release executable offline, compare all 56 fixtures to actual TypeScript and
probe invalid executable inputs. Benchmark mode runs verification first. Neither
runner installs packages, fetches crates, starts a device, updates the app or
contacts a service. Results/logs are written under ignored `proof-results/` with
source hashes, compiler details when available and the executable hash when built.
Optional formatting/clippy checks are separate future gates; neither ran here.

The host process accepts no arguments, reads one bounded request to EOF, writes
one binary response and exits. Its parent imposes a timeout. Do not expose this
test process as an unbounded service: the standalone process has no wall-clock
input deadline. Rejected inputs do not echo payload bytes or emit a partial
report. Output I/O failures may leave a partial response and must be discarded.

## Numerical equivalence contract

The comparison requires exact frame geometry, signed/raw-bin indices, zero/null
classification and selected peak. A peak disagreement fails even on near ties.
Linear amplitudes use `1e-12 * (1 + abs(reference))`; arithmetic may differ across
libm/runtime versions. Display dB is checked separately. Raw dB for amplitudes at
least `1e-10` is compared with a documented tolerance. Below that amplitude,
raw-dB differences are counted explicitly because logarithms amplify near-zero
roundoff. Every returned raw dB must still match its returned linear amplitude.

This contract is **not bit-for-bit report equivalence**. Below-floor raw-dB
differences remain visible evidence of changed numerical output, even if the
comparison passes. A production replacement needs an explicit versioned numeric
compatibility policy, fixture review and native-platform acceptance. Do not
silently relax peak or zero/null semantics to obtain a passing result.

The corpus includes 15 nonzero-location impulses across all FFT sizes. Their
mathematically flat spectral magnitudes can reveal strict-peak changes caused by
finite-precision math. They deliberately strengthen the replacement gate rather
than treating a tiny amplitude difference as permission to change a visible peak.

## Host benchmark interpretation

Benchmark mode uses three warmups, seven alternating-order batches and 25 calls
per batch on three synthetic workloads. It records per-call samples and medians,
not an asserted speedup. Preparation/hashing, process startup, wire transport,
serialization and UI are outside the timers. Validation, numerical work and
result allocation are inside.

The existing TypeScript path copies private data and produces its existing
metadata/output structure; Rust computes only the numerical projection and
stores an axis per frame. Rust deterministically drops previous results whereas
JavaScript GC is runtime-dependent. These are prototype versus existing-path
costs, not an isolated language-only comparison. A device benchmark must include
the actual bridge, scheduling, copies, rendering, battery and thermal behavior.

No Rust benchmark has run in this checkpoint, and no mobile speed, battery,
real-time throughput or additional RF capability is claimed.

## Experimental wire v1

All numeric fields are little-endian. This is **not AXP**, a final mobile ABI or
a security/authentication protocol. Reserved fields must be zero.

Request: 48-byte header followed by exact `dataLength` bytes. Offsets are:
`0 AXIQ[4]`, `4 version:u16=1`, `6 mode:u16=1`, `8 dataLength:u32`,
`12 fftSize:u32`, `16 startSample:u32`, `20 hopSamples:u32`,
`24 frameCount:u32`, `28 iterations:u32` (1–1,000),
`32 sampleRate:f64`, `40 centerFrequency:f64`.

Response: 40-byte header: `0 AXIR[4]`, `4 version:u16=1`, `6 reserved:u16=0`,
`8 fftSize:u32`, `12 frameCount:u32`, `16 elapsedNs:u64`,
`24 binSpacingHz:f64`, `32 windowDurationSeconds:f64`.

Each frame then has 24 bytes: `0 start:u32`, `4 endExclusive:u32`,
`8 peakShiftedIndex:i32` (-1 for null), `12 reserved:u32=0`, `16 windowSum:f64`.
It is immediately followed by `fftSize` 56-byte bins:
`0 signedBin:i32`, `4 rawIndex:u32`, `8 offsetHz:f64`, `16 declaredRfHz:f64`,
`24 amplitude:f64`, `32 hasDb:u8`, `33 reserved[7]=0`,
`40 rawDb:f64` (zero placeholder if absent), `48 displayDb:f64`.
Trailing bytes, invalid booleans, nonfinite values and inconsistent zero/peak
representations are rejected by the test decoder.
