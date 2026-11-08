# APEX hybrid FFT proof: preserve the JS numerical contract

**Host numerical compatibility gate passed. Not integrated into APEX. Rust wrapper is source-only and uncompiled.**

The prior `experimental/cpp-iq` replacement was rightly rejected: native `hypot` rounding changed strict peak selection in almost tied impulse spectra, even with frozen JS coefficients. This experiment changes the boundary rather than weakening the test. The calling JS runtime generates Hann/twiddle coefficients and retains magnitude, logarithms, exact-zero/null handling, frequency axes and first-strict-maximum peak selection. C++ performs only bounded FFT arithmetic and returns complex values. A dependency-free Rust wrapper is supplied for ownership and FFI validation, but no Rust compiler is available here and it has **not** been compiled, run, or independently reviewed.

No production source, mobile importer, Flipper code, app dependencies, hardware operation or existing numerical version is changed.

## Verified result

Reference: current merged APEX main commit `d4434c5cf789938447e83e49a5cfcbdf68b59277`. The runner checks exact Git blob IDs before compiling, preventing a stale oracle from silently passing after reference changes.

Both optimized and AddressSanitizer/UndefinedBehaviorSanitizer builds passed:

- 61 historical fixtures, including all previously failing impulse cases: 190 windows / 137,216 bins.
- Every single-impulse position at every supported FFT size, grouped into bounded requests: 7,936 windows / 22,347,776 bins.
- 60 seeded full-range cases with overlapping/gapped selections, boundary sample rates and RF center values: 798 windows / 544,256 bins.
- Total: **1,485 requests, 8,924 windows, 23,029,248 bins**, with bit-identical raw real/imaginary binary64 values and `deepStrictEqual` numerical projection. Every amplitude, raw dB, display dB, null, peak, timestamp and axis value matches. No differential tolerance, epsilon clamp or altered peak rule is used.
- 51 hostile native requests/arguments and 21 invalid response/context cases rejected; no partial native output.
- 14 independent quadratic-DFT cases / 3,584 bins, maximum linear-amplitude difference 8.864818974100696e-15. This independent approximate oracle uses a separate tolerance; exact compatibility does not.
- Existing current-core IQ tests: 15 passed, zero skipped. Negative controls detected reversed FFT sign, a finite output perturbation and reference-source drift.
- Independent reviewer: 30 additional exact projection cases / 259,584 bins, 86 hostile native inputs, 14 malformed response/context cases. See `review/REVIEW.md`.

The earlier frozen C++ experiment was rerun and still fails its strict compatibility gate. Its failure is retained in `proof-results/prior-frozen-reproduction.json`; passing this hybrid proof does not rewrite that historical result.

Sanitizers: no ASan/UBSan diagnostics in the full new corpus. Leak detection is explicitly disabled; the independent reviewer reproduced the environment's ptrace incompatibility with LeakSanitizer. This is not a leak-freedom claim. Finite tests are not a universal compatibility or memory-safety proof.

## Reproduce with installed tools

From the repository root, with Node 24 and G++ 14 already installed:

    node experimental/hybrid-iq/proof.mjs verify
    node experimental/hybrid-iq/proof.mjs sanitize
    node experimental/hybrid-iq/proof.mjs benchmark
    node --test tests/iq-analysis.test.ts tests/iq-time-frequency.test.ts
    node experimental/hybrid-iq/failure-controls.mjs

No network, package installs, external DSP libraries or device access are needed. Runners write authoritative JSON and compiler/ABI logs under `proof-results/`, with source and executable hashes. Build binaries are ignored and excluded from source delivery. Flags include `-fno-fast-math -ffp-contract=off`; changing them invalidates the arithmetic assumptions. The kernel refuses a non-nearest runtime rounding mode.

The copied oracle and fixture inputs match the pinned upstream blobs exactly. An early local materialization added one final blank line; it was removed and every input blob reverified before the final verify/sanitize/benchmark reports. Only the separately retained historical-failure reproduction used the extra final blank lines; no arithmetic was changed.

## Boundary and implementation

`src/kernel.h` is a small C ABI using fixed-width window fields, explicit lengths, borrowed read-only input buffers and a caller-owned output buffer. The C++ kernel allocates nothing, retains no pointer, and throws no exception. It validates all dimensions and coefficient bounds before touching output. It preserves binary64 arithmetic order, including the reference's FFT sign and periodic Hann multiplication.

`contract.mjs` generates coefficient plans in the calling JS runtime, caches them privately, serializes a bounded snapshot and performs exact JS numerical projection. The native code computes no transcendental functions. This avoids relying on either C++ libm or Rust libm producing the same answers as JS. No fixed V8 coefficient file is required.

The host-only AXHF/AXHR framing is a proof harness, **not** an app bridge, AXP protocol, trusted-evidence envelope or production interface. The trusted prepared-IQ/source-hash/provenance path remains outside this numerical projection. This is not the whole public `analyzeIqTimeFrequency` response and must not replace its validation, metadata or warnings.

Important conditions from independent review:

1. JS contexts prove codec ownership and expected shape, not request identity. A response from another same-shaped request can be paired with a legitimate context. The synchronous process pairing is trusted here; an asynchronous bridge must structurally pair each response to its request and reject stale/cancelled generations.
2. Runtime plans must stay owned and immutable while native work runs. Native range checks reject unsafe dimensions and nonfinite coefficients but cannot prove a bounded plan is the canonical Hann/FFT plan. Arbitrary same-shape bounded coefficients describe another transform.
3. C callers must supply valid initialized aligned memory and output disjoint from all inputs. Null/dimension checks cannot validate arbitrary pointer provenance or concurrent mutation. The host vectors satisfy these conditions; the proposed Rust wrapper is intended to enforce them through ownership and borrowing.
4. Host stdin must close; the byte budget does not create a wall-clock deadline for a slow writer. The runner supplies a subprocess timeout. A future worker/bridge needs deadline, cancellation and ownership rules.
5. Compatibility is observed for this Node/V8, CPU, compiler, flags and floating-point mode. Runtime-generated plans make other JS engines a plausible next target, not an already proven result. Hermes, ARM, Android/iOS bridges and physical devices were not tested.

## Diagnostic host timings, not a speedup claim

Host: shared AMD EPYC 9V74, Linux x86-64, Node v24.22.1, Debian G++ 14.2.0. Seven batches, 25 calls each, three warmups, alternating order. Median milliseconds:

| Synthetic workload | C++ FFT only | JS decode + projection | Complete JS reference | Host process roundtrip |
|---|---:|---:|---:|---:|
| 4096 x 1 | 0.061 | 0.825 | 1.674 | 9.330 |
| 256 x 64 | 0.143 | 2.204 | 5.090 | 16.223 |
| 4096 x 4 | 0.241 | 2.115 | 5.713 | 17.820 |

The process-based harness is **slower end to end** than the JS reference. Its purpose is numerical verification, not shipping a subprocess architecture. Native FFT timers reuse an allocated output buffer and include validation but exclude parsing and serialization. JS projection timers include response checking and array allocation. The complete JS reference also copies bytes and creates provenance/warnings. Summing separate medians is not measured bridge latency or an equivalent-work comparison. The roundtrip includes request/plan serialization, process creation, three warmups plus one call, output serialization and JS decoding/projection; it is not a cold-kernel timer or a mobile bridge measurement. Request/response bytes and raw batch arrays are retained in `benchmark.json`.

This demonstrates that FFT arithmetic can move to native code without the tested numerical regressions. It does not yet demonstrate user-visible acceleration, phone responsiveness, energy savings, acquisition throughput or release readiness.

## Rust status and next actual gate

`rust/` supplies a dependency-free ownership wrapper and tests. It validates dimensions before allocating, keeps coefficient arrays private, borrows inputs for the synchronous C call, and allocates a distinct initialized output vector. `build.rs` uses existing `g++` and `ar`, explicitly refuses cross-compilation/non-Linux targets, and downloads nothing.

**No rustc/cargo exists in this environment. No installation was attempted. These sources have not passed a compiler, linker, Rust tests or independent Rust review.**

`ci-host-check.sh` is a proposed CI entrypoint, not an executed GitHub workflow. On an already provisioned Linux runner with Node 24, G++, ar, rustc and cargo:

    bash experimental/hybrid-iq/ci-host-check.sh

It performs the host proof and `cargo test --locked --offline` in debug and release. It deliberately fails if required tools are missing; it does not install them. Rust tests must actually pass before calling this a compiled Rust/C++ hybrid. The source-only Rust AXHF/AXHR host harness is wired to `node proof.mjs verify rust`, which the CI entrypoint also invokes: it must pass the same 23-million-bin equivalence and hostile-input corpus through Rust-owned buffers. This Rust mode has not run locally. Rust timing/sanitizer modes are deliberately unsupported here; no uninstrumented Rust run can masquerade as a sanitizer pass.

After that gate, evaluate a bounded in-process mobile bridge with owned buffers and request-generation cancellation, on Hermes/ARM and real devices. Preserve trusted prepared-recording provenance and exact JS projection. Measure complete import-to-render latency, copies, frame time, cancellation and memory alongside JS fallback. Do not select a native default based on kernel-only timings.
