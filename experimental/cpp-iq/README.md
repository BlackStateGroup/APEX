# APEX C++ I/Q host experiment

**Decision: do not integrate either candidate as a drop-in replacement.** Both compile and are numerically close, but strict observable semantics fail on valid synthetic inputs. This is a completed host experiment with intentionally failing compatibility gates, not an unfinished claim of acceptance. No main-checkout edits, app integration, real recording, RF acquisition, Android/iOS build or device test occurred.

## Reproduce

Requires existing Node 24.22.1 and G++ 14.2.0. There are no package installs, external DSP libraries, network calls or device access.

- `node proof.mjs benchmark baseline`
- `node proof.mjs benchmark frozen`
- `node proof.mjs sanitize baseline`
- `node proof.mjs sanitize frozen`

All four commands deliberately exit 1 while the strict compatibility failures remain. The JSON records individual stage results and the overall FAIL. Do not interpret the exit as compiler or sanitizer failure without reading the stage. `node --test proof-codec.test.mjs` runs seven codec/oracle contract tests; all pass. Frozen coefficient drift is checked automatically before compilation. Regeneration is an intentional source change via `node generate-coefficients.mjs`, not part of an ordinary run.

## Scope and numerical conventions

The original C++17 kernel implements only the numerical projection of the existing `analyzeIqTimeFrequency` function. The copied TypeScript reference comes from APEX commit `63f530d1f6f8f943d4fd2c1016904f3259daf77a`; its exact file hashes are recorded in every result. Original input parsing, snapshot ownership, source hashes, provenance/warnings, policy, lifecycle and UI stay outside the native kernel. AXIQ/AXIR framing is a test harness borrowed from the adjacent original Rust experiment, not AXP, an FFI ABI or a production bridge. The shared fixture/codec snapshot is the original **41-case** revision; later changes in the adjacent Rust experiment do not silently change this experiment.

- ci16_le I+jQ bytes, up to 65,536 complex samples (262,144 bytes). Signed samples divide by 32,768.
- FFT sizes 256, 512, 1,024, 2,048 and 4,096; negative-exponential unnormalized complex FFT.
- Periodic Hann window, coherent-window-sum-normalized magnitude, shifted signed bins. Not PSD, dBm, volts or calibrated power.
- Up to 64 explicit windows and 16,384 output cells. No padding or inferred selection.
- IEEE-754 binary64, no fast-math, no fused contraction. Flags: `-std=c++17 -O3 -fno-fast-math -ffp-contract=off -Wall -Wextra -Wpedantic -Wconversion -Werror`.
- Exact zero maps to null raw dB and display −160; first strict maximum selects the peak. These observable semantics are tested exactly, not hidden behind amplitude tolerance.
- Amplitude comparison tolerance: 1e−12 × (1 + absolute reference). Meaningful raw dB uses 1e−6 relative/absolute tolerance for amplitude ≥1e−10; smaller raw-dB differences are counted. Display dB tolerance is 1e−8 relative/absolute.

## What failed and why it matters

Both variants compared 61 cases / 137,216 bins: the shared 41-case corpus plus 15 original nonzero-location impulses and 5 seeded full-range cases. Both passed a separate quadratic direct-DFT amplitude oracle on 14 cases / 3,584 bins (maximum error below 8.87e−15). Both rejected all 39 malformed/range/argument tests with no partial output.

**Baseline:** 39/41 shared cases and 11/20 supplementary cases pass strict comparison, or 50/61 overall. Maximum linear-amplitude difference is 1.11e−16. It nevertheless disagrees on zero/null classification:

- selection-256-64-1-0, frame 35, signed bin −128: C++ 1.3877787807814457e−17; TypeScript exactly zero.
- selection-256-64-1024-0, frame 57, signed bin −128: C++ exactly zero; TypeScript 1.734723475976807e−18.

**Frozen coefficients:** 41/41 shared cases and 11/20 supplementary cases pass, or 52/61 overall. Exact JS-generated Hann/twiddle constants remove the two original zero/null mismatches, but 9/15 impulse cases still disagree on peak selection. For example a 256-sample impulse at position 37 gives native peak −115 versus TypeScript −120. The linear differences are tiny, but peak selection is a public behavior and the gate correctly rejects it. Same coefficients do not make native `hypot` and JS `Math.hypot` identical; rounding of nearly tied bins matters. This is evidence consistent with a magnitude-rounding cause, not an exhaustive runtime proof.

Frozen constants are 7,936 Hann, 4,095 cosine and 4,095 sine values emitted as exact C++ hex literals from Node/V8. This uses 129,008 bytes of coefficient values before compiler/linker choices. It is a deliberate coefficient lookup optimization as well as a numerical-stability experiment. It does not prove equivalence to Hermes or other JS engines, and it is not a language-only comparison. No epsilon clamp or peak tolerance was introduced to make tests pass.

## Diagnostic host timings

Host: INTEL(R) XEON(R) PLATINUM 8573C, Linux x86-64 6.18.57; Node v24.22.1; Debian G++ 14.2.0. Single shared host, no CPU affinity or exclusivity. Seven batches ×25 measured calls, three additional warmup calls per batch, alternating native-first/TS-first order. The Node process also runs verification before timing; each native batch uses a fresh process and its three warmups. Medians are descriptive, not confidence bounds or a device performance promise.

| Synthetic workload | Baseline C++ ms | Paired TS ms | Frozen C++ ms | Paired TS ms |
|---|---:|---:|---:|---:|
| 4096 × 1 window(s) | 0.427 | 1.391 | 0.171 | 1.382 |
| 256 × 64 window(s) | 1.383 | 4.685 | 0.689 | 4.610 |
| 4096 × 4 window(s) | 1.900 | 5.136 | 0.825 | 4.910 |

These are compute timers, not end-to-end speedups. They exclude process startup, parsing/framing, IPC, serialization, import/hash preparation and UI. Cold single-call latency was **not measured**. Both allocate numerical results; TS additionally snapshots bytes and constructs full source metadata/warnings, while C++ repeats axes per frame and has different object/destruction costs. Frozen coefficients eliminate runtime trig work. Raw batch arrays and native process roundtrip durations are retained in JSON; process roundtrip is per 25-call batch plus warmups and strict decoding, not per-call bridge latency. The baseline benchmark stage is FAIL because its overlapping-window output fails strict parity; the frozen timing stage has matching selected cases but the overall experiment remains FAIL because the impulse gate fails.

No ratio is promoted as a language-only advantage. These measurements justify continuing a bounded-native-kernel investigation, not bypassing semantic acceptance or claiming phone speed, responsiveness, battery savings, continuous RF throughput or production readiness.

## Safety and independent review

Both variants executed all 61 differential cases, 14 DFT cases and 39 rejection cases under AddressSanitizer and UndefinedBehaviorSanitizer without diagnostics. The reports remain overall FAIL for numerical incompatibility. LeakSanitizer **could not run**: this environment reports ptrace incompatibility. The initial failure is preserved, and subsequent sanitizer runs explicitly use `detect_leaks=0`; no leak-freedom claim is made.

An independent review found no bounded-parser, FFT-convention or coefficient-offset defect, reproduced the original 41 cases plus 20 additional seeded cases and 28 invalid requests under ASan/UBSan, and agrees that the impulse failures prevent general compatibility acceptance. See INDEPENDENT_REVIEW.md. The review identified two harness weaknesses; both were corrected: coefficient checks run before compilation, and benchmark parity failures mark the benchmark/report FAIL.

## Recommended next gate for a hybrid core

Keep the shipped TypeScript analysis and its exact-byte provenance path unchanged. Before introducing any native bridge, define and version one cross-runtime contract for coefficients, magnitude, exact-zero/null behavior and near-tied peak selection. Test that contract against impulse, zero, rail, off-bin, signed-tone, overlapping-window and full-range seeded cases. If behavior is intentionally changed, give it a new numerical version; do not silently clamp low amplitudes or change the peak rule. Then evaluate bridge/copy cost, cancellation/lifecycle integration and release builds on actual target devices. A memory-safe Rust boundary can be evaluated separately once a compiler/target exists; this C++ experiment supplies no Rust performance result.

## Files and evidence

- src/iq.hpp, src/iq.cpp: original bounded numerical kernel, baseline and frozen compile modes.
- src/host.cpp: bounded host-only framing and compute timer; no app/OS integration.
- generate-coefficients.mjs, src/coefficients.hpp: deterministic coefficient snapshot and check.
- proof.mjs, proof-codec.mjs, proof-codec.test.mjs, extra-fixtures.mjs, reference.mjs: reproducible harness, fixtures and oracles.
- packages/core/: exact read-only TypeScript source snapshots needed by the reference.
- proof-results/{baseline,frozen}-{benchmark,sanitize}.json: authoritative final results, source/executable hashes, failures and raw timing batches.
- proof-results/initial-strict-failure.json and initial-leak-sanitizer-failure.json: preserved first-failure evidence. Older original41 and verify files are historical checkpoints and explicitly superseded by the 61-case final reports.
- INDEPENDENT_REVIEW.md: separate review and commands.

Source-only delivery excludes executables; recorded executable hashes identify what was tested. No external DSP code was downloaded or bundled.
