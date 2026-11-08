# Long-term hybrid architecture decision

## Recommendation

Keep the React Native/Expo interaction layer. Use Rust for new shared,
deterministic compute/parsing code after measured, tested migrations. Preserve C
firmware and use C/C++ for mature, selected drivers or specialist libraries where
they are the practical fit. Use platform-native Swift/Objective-C and Kotlin/Java
adapters for acquisition, permissions, entitlements and operating-system lifecycle.

A native-only Swift/Kotlin UI rewrite is not necessary to obtain native compute
or native radio APIs. React Native already renders through native UI machinery;
the important issue is keeping heavy work and high-volume data off its JavaScript
and UI paths. Native screens remain an option for a demonstrated platform UX or
performance requirement, not a prerequisite for this architecture.

Choose one principal new core language, rather than duplicating every algorithm
in Rust and C++. Rust is the preferred default for new bounded core code; C/C++
remain targeted interoperability tools. The TypeScript implementation stays the
reference until each migrated operation is independently accepted. No existing
APEX module is replaced by the current proof.

## Boundaries

1. UI/workflow: navigation, explicit user actions, source selection, evidence
   presentation and lifecycle state. Permission and authorization cannot be
   inferred from an analysis result or accessory capability claim.
2. Platform adapters: public Bluetooth/NFC/network APIs and Android supported USB
   paths. These record exact platform-specific provenance, errors and cleanup
   acknowledgements. iOS and Android remain separately tested clients.
3. Shared Rust library: explicit immutable inputs and bounded typed outputs;
   deterministic parsing/compute without ambient device or network authority.
4. Native worker ownership: one bounded job, explicit generation/request IDs,
   cancellation semantics and settlement. Navigation must fence stale output
   without pretending that an uncancelled job has stopped using its buffers.
5. C/C++ integration: audited selected-file licences, narrow adapters and
   isolation appropriate to the upstream library's risk. Unsafe boundaries,
   allocation ownership and error/panic/exception handling require explicit design.
6. Accessory firmware: physical timing, peripheral/DMA resources, bounded
   acquisition and board-specific drivers. Language changes do not create
   missing analog hardware, antenna coverage or authentication credentials.
7. High-rate receiver/host path: keep bulk recordings near acquisition. Send
   bounded summaries, chunks or recording references to the phone over a measured
   suitable transport. A BLE control link is not a generic wideband sample pipe.

The host proof's binary format is a temporary test boundary. A production mobile
boundary should be versioned and separately tested, with explicit ownership and
copy behavior. No promise of zero-copy or stable ABI follows from this source.
Rust FFI bindings and a C++ JSI adapter may be useful, but introduce unsafe
boundaries and are not implemented or selected here.

## Migration order and evidence gates

1. Preserve current exact-byte fixtures, evidence formats and TypeScript/C
   conformance tests. Establish current iPhone and Android build/device behavior.
   Toolchain availability and physical acceptance remain independent blockers.
2. Isolate one pure numerical leaf, as this FFT-window proof does. Write bounds,
   independent mathematical expectations and cross-language comparison before
   app integration. Keep all Rust failures visible; source review is not a build.
3. Compile and test on an approved host, then on iOS and Android targets. Run
   malformed-input tests, native memory/sanitizer tooling where appropriate and
   differential tests. Decide deliberately how numerical roundoff is versioned.
4. Profile the real existing path. Compare algorithmic improvements, worker
   scheduling and batched binary transfer alongside language changes. Make no
   performance promise from a desktop microbenchmark.
5. Introduce a narrow mobile worker bridge with real ownership/cancellation
   tests. Validate on both platforms: foreground/background, interruption,
   destruction, stale callbacks, repeated requests, memory pressure and errors.
6. Measure end-to-end latency, UI responsiveness, memory, battery/thermal behavior
   and sustained workloads. Retain an explicit reference fallback where useful;
   never hide a native failure by silently presenting simulated hardware success.
7. Expand only where proved useful. Parsing/evidence migration requires exact
   format/validation equivalence and new threat-boundary review; driver reuse
   requires hardware, protocol, licence and authority checks independently.

## Tradeoffs

Rust improves memory-safety guarantees for new native code, not automatically
application correctness or performance. TypeScript is already memory-safe.
C++ offers broad mature DSP/driver ecosystems and familiar native integration,
but requires stronger memory/ownership review. A mixed stack increases build,
debugging, packaging and ABI maintenance costs. Whole-stack replacement would
risk discarding extensively checked behavior without resolving phone API limits.

The best long-term outcome is a tested separation of responsibilities, not the
largest rewrite or the largest number of languages. This source-only experiment
is a reversible first step toward that architecture, not acceptance of it.
