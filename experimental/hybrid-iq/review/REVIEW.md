# Independent hybrid FFT review

Review date: 2026-11-08. Scope: host-only C++ FFT kernel, request parser, JS codec/projection; no implementation edits. Reviewer tests live in this directory. No Rust compiler, mobile runtime or application integration was tested.

## Results

- `node experimental/hybrid-iq/review/independent.mjs`: PASS. 30 exact projection comparisons across all five supported sizes and six synthetic signal families, 259,584 cells. Tests use nonzero starts, overlapping frames, fractional sample rate, negative RF center, random full-range samples, extrema, impulse, off-bin tone, real symmetric/tied spectra, and zero input. Every amplitude, raw dB, display dB, peak, timestamp and axis entry compared with `deepStrictEqual` against current packages/core.
- Host request tests: 86 invalid/truncated/oversized/nonfinite/random requests rejected with exit 2 and no stdout.
- Decoder tests: 14 invalid response/context cases rejected.
- Existing C ABI tests passed with AddressSanitizer and UndefinedBehaviorSanitizer enabled. LeakSanitizer could not run under the environment's ptrace; rerunning with `ASAN_OPTIONS=detect_leaks=0` succeeded without ASan/UBSan findings. This is not a leak-sanitizer pass.

Build commands, from project root:

    g++ -std=c++17 -O2 -fno-fast-math -ffp-contract=off experimental/hybrid-iq/src/kernel.cpp experimental/hybrid-iq/src/host.cpp -o experimental/hybrid-iq/review/host
    g++ -std=c++17 -O1 -g -fno-fast-math -ffp-contract=off -fsanitize=address,undefined experimental/hybrid-iq/src/kernel.cpp experimental/hybrid-iq/src/abi_test.cpp -o experimental/hybrid-iq/review/abi-sanitized
    ASAN_OPTIONS=detect_leaks=0 experimental/hybrid-iq/review/abi-sanitized
    node experimental/hybrid-iq/review/independent.mjs

Exact ABI output:

    C ABI bounds, late coefficient failures, unchanged-on-rejection, rounding refusal, zero transform passed

Exact independent output:

    {"status":"PASS","exactProjectionCases":30,"exactProjectionCells":259584,"hostileRequestsRejected":86,"invalidResponsesOrContextsRejected":14,"sameShapeCrossContextAccepted":true}

## Boundary findings and conditions

1. Opaque JS contexts authenticate only that this codec created the context; they do not bind a response to its particular request. A response from another request with the same n/frame count is accepted and receives the new context's timestamps/RF axis. The independent test demonstrates this. Acceptable for a synchronous host proof whose invocation pairing is trusted; do not claim replay protection, request identity validation, or robust asynchronous routing. A future bridge should bind request/response identity or guarantee pairing structurally.
2. JS-generated coefficients preserve the same runtime's transcendental results, and C++ performs the same butterfly operation ordering. Keeping magnitude/log/strict peak in JS addresses the prior native observable mismatch. Bit-exact compatibility here is empirical on this Node/compiler/CPU/flags combination, not a guarantee for all mobile JS engines, CPU floating-point modes or compilers. Flags must remain `-fno-fast-math -ffp-contract=off`. FE_TONEAREST is checked; this does not establish every architecture's floating-point execution semantics.
3. Native input validates coefficient ranges/finiteness, not that a caller supplied actual Hann/trigonometric coefficients. A tampered but bounded plan is a different transform. JS plan generation and immutable-in-flight ownership are trusted. The returned request Buffer is mutable. A future integration must preserve the intended request bytes between encoding and execution. The <=2n decoder guard is appropriate for the intended transform, not a proof that any arbitrary accepted coefficient plan is canonical.
4. ABI memory safety requires the header's preconditions: valid initialized buffers of the declared lengths, suitable alignment, valid writable output, and no output/input overlap for the whole call. Dimensions/null checks cannot validate arbitrary pointer provenance or concurrent mutation. Do not test deliberately invalid pointers or claim the ABI sanitizes arbitrary foreign pointers. Native host vectors provide these preconditions. Allocation-free kernel validation precedes all output writes, with bounded index arithmetic.
5. Host memory and compute are bounded by request size, frame-cell budget and <=1000 iterations, but stdin must close. Byte-count bounds do not impose a wall-clock deadline on a slow writer. The reviewer subprocess uses a five-second timeout. Any bridge must own cancellation/deadline enforcement. Host benchmark elapsed time includes repeated kernel validation and execution only, not transport, encoding, JS projection or process startup.
6. This projection intentionally lacks v1 provenance, prepared-recording branding, analysis/kernel version, normalization descriptions and warnings. It is not the entire v1 API response and cannot replace the trusted prepared-IQ validation boundary. Performance claims must distinguish kernel-only timing from complete user-visible analysis and cannot establish mobile viability from this host experiment.

Conclusion: no implementation blocker found for the narrowly scoped synchronous host proof. Same-shape response/context pairing is an explicit integration hazard; broad drop-in, hostile-pointer safety, end-to-end speedup and mobile acceptance claims are not supported by this review.
