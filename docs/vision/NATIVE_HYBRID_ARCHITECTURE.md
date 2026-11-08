# Native hybrid architecture and migration design

**Status:** recommended architecture authorized to begin on 8 November 2026. This is a proposed target design, not a claim of completed Rust/C++ integration. Existing production code at the frozen baseline is primarily TypeScript/React Native, portable C and platform-native integration. Specific crate choices, ABI tooling and benchmark thresholds below must be recorded as implementation decisions when selected.

## 1. Why hybrid remains the best direction

The owner's question was whether Rust and C++ change the approach, followed by a clear preference for the best outcome rather than the least implementation time. The answer is a stronger native engine and carefully selected native reuse, not an automatic requirement to rewrite the interface.

- **Rust:** a common, testable core for parsers, structured data, numerical kernels where justified, state machines and worker-side services. Its ownership model helps prevent classes of memory mistakes, but FFI, OS lifecycle, logic bugs and resource exhaustion still need explicit design and testing.
- **C/C++:** use existing high-quality DSP, device libraries and embedded SDK code where rebuilding them would reduce quality or waste knowledge. Isolate unsafe boundaries and review licences before incorporation. Keep the small existing portable C AXP implementation unless a measured reason warrants replacement.
- **Swift/Kotlin:** own native OS permission, file, NFC, BLE/USB, lifecycle and background-task behavior. Android and iOS have different contracts; a shared facade must not erase them.
- **React Native/Expo UI:** retain current interaction, workbenches and tests initially. Move work out of JS when profiling, correctness or native file access warrants it. A fully native UI remains a future evidence-based choice, not a prerequisite for a native engine.
- **Accessory firmware and host workers:** keep tight timing with the instrument and large/long jobs on a suitable host. Rust on the phone does not add an SDR front end, public iPhone USB support or universal NFC emulation.

## 2. Component map

| Layer | Responsibility | Proposed implementation boundary |
| --- | --- | --- |
| Mobile presentation | Cases, workbenches, instruments, progress, result interpretation | Existing React Native/Expo initially; platform UI for OS-owned sheets |
| App orchestration | Identity-bound jobs, explicit actions, source selection and result publication | Thin TypeScript/native facade with a documented job contract |
| Shared engine | Bounded formats, evidence models, deterministic analysis, compatibility logic | Rust library with versioned serialized DTOs and opaque handles |
| Native OS adapter | Permission, document streams, BLE/NFC/USB, app lifecycle, secure storage | Swift/Kotlin; selected maintained libraries behind the adapter |
| DSP/device libraries | Narrow performant kernels and mature hardware APIs | Reviewed C/C++ through a small audited ABI, or host process when appropriate |
| Instrument adapter | Vendor handshake, capability negotiation and operation semantics | Separate adapter per instrument; no forced AXP translation at wire level |
| APEX accessory | Physical timing, drivers, resource reservation and safe stop | Existing C core plus ESP-IDF/C/C++ drivers; Rust embedded only if toolchain evidence supports it |
| Research worker | REA/engine jobs, artifact retention, heavy analysis | Versioned, authenticated job service; REA and engine subprocess isolation |
| Evidence store | Original/derived bytes, results, lineage, export and recovery | Versioned schema, bounded streaming/hash verification; secure retention design outstanding |

Proposed source layout could be `crates/apex-core`, `crates/apex-formats`, `crates/apex-dsp`, `crates/apex-ffi`, `crates/apex-worker`, `native/ios`, `native/android` and `native/vendor`. These directories do not exist merely because they appear here. Avoid mass moves of working code during the first engine slice.

## 3. Engine contract

### Data identity

Every job carries a schema/API version, unique invocation ID, selected input identity, adapter/parser version, parameters and explicit provenance class. A claimed filename/device/sample rate remains a claim. Hashing selected original bytes supports integrity comparisons, not trusted capture time, ownership or authenticity.

Input models separate original bytes, normalized OS fields, derived recordings and analysis results. Do not flatten Android scan bytes and iOS normalized data into a fictitious common raw packet. Keep the existing missing/null distinctions and bounded serialization semantics during migration.

### Buffers and files

Small control messages may cross a serialized bridge. Large sample/capture buffers should use bounded native file access or owned shared buffers, with lifetime and maximum lengths explicit. A file handle/path is not permission to read an arbitrary document. Validate declared size before a read, actual bytes after a read and all multiplication/offset arithmetic before allocation. Keep original byte snapshots or clearly disclose non-atomic source pairs.

Zero-copy is a design option, not a promise: document who allocates, who frees, which thread may access, and when the buffer is invalid. Do not expose raw Rust/C++ pointers to JavaScript. Benchmark copies before adding complex shared-memory ownership.

### Errors, cancellation and ownership

Use typed categories such as invalid input, unsupported format, permission denied, cancelled-before-dispatch, timed out, adapter failure and cleanup-unknown. Preserve the original diagnostic and bounded causal chain without leaking secret data.

Cancellation requests stop new work and publication where possible. They are not automatically proof that an OS operation, radio scan, subprocess or hardware effect has stopped. An invocation owns its raw work until settlement and cleanup evidence. New ownership cannot cross an unresolved previous operation. Exactly-one result publication and stale-callback fencing must survive native bridging, navigation, repeated requests and backgrounding.

Existing APEX tests around cancellation, late events and iOS void completion are compatibility requirements, not JS details to discard during a Rust rewrite. Keep a difference between a job decision, its completion and resource release. No error string or generic `AbortError` should certify native release.

### Numerical behavior

Document integer scaling, endianness, saturation, floating precision, FFT normalization/windowing, threshold equality, sample-count limits and out-of-range behavior. Existing C8 conversion uses signed int8 multiplied by 256 into the current ci16 profile; changing languages must not silently change amplitude convention. Golden vectors and independent reference calculations must distinguish acceptable numerical tolerance from a changed definition.

## 4. Rust ↔ C/C++ boundary

Prefer a narrow C ABI with explicit fixed-width integers, length-bearing byte spans, versioned structs and opaque handles when it offers predictable cross-platform support. UniFFI, cxx or other binding generators are candidates to evaluate, not dependencies selected here.

- Keep C++ exceptions inside the C++ boundary; return typed status to Rust.
- Do not unwind Rust panics across foreign calls. Select and test panic behavior for each artifact profile.
- Keep allocator ownership symmetric. Every allocated object has one documented destroy path, including cancellation and partially initialized handles.
- Verify alignment, padding, endianness, thread affinity, callback reentrancy and callback lifetime.
- Audit every `unsafe` block and foreign input precondition; constrain transitive native dependencies.
- Fuzz parsing/FFI edges, run sanitizers where supported and record unsupported sanitizers explicitly.
- Keep driver control verbs allowlisted and typed. No generic “run upstream CLI” or shell string API.

A process boundary is useful for crash containment, resource limits or licence separation analysis, but is not automatically a security sandbox or a guarantee that licensing duties disappear.

## 5. Platform integration

### iPhone

Use public iOS APIs and a signed development build. NFC capability and entitlement restrictions, session UI, app lifecycle, file security-scoped access and BLE callback contracts must be verified for the actual SDK/app version. The existing iOS BLE start/stop bridge exports void; JavaScript Promise settlement is not OS acknowledgment. Retaining that distinction is mandatory in a replacement bridge.

External instrument links must use genuinely supported BLE/Wi-Fi/accessory interfaces. Desktop WebUSB or an Android HackRF driver does not create iPhone Safari USB access. Core engine portability is distinct from transport availability.

### Android

Use Kotlin/native APIs for USB permission/interface ownership, document URIs, BLE permissions and lifecycle. USB CDC is not a guarantee of FTDI/CP210x/CH34x support; add selected drivers behind a consistent lifecycle contract only when a concrete device requires them. Permission prompts, detached handles and process/lifecycle restarts need real-device tests.

### Shared presentation

Keep input selection, inspection, analysis and saving separate where the current UX relies on explicit action. Show staged, running, cancellation-requested, cleanup-pending, unsupported and failed states accurately. A model/native engine rewrite must not make background acquisition or cloud export implicit.

## 6. Control and data planes

AXP remains a bounded original control protocol: 512-byte payload, 524-byte total frame, fixed C memory and correlation IDs. Its current info/capability/ping commands are not a generic upload or radio stream. CRC is accidental-error detection, not authentication. Add new capability-specific operations deliberately, with versioning, authorization, preconditions, resource ownership and independent result verification.

High-rate SDR belongs in native files/buffers near the instrument. A 20 Msamples/s stream with one 8-bit I and one 8-bit Q is roughly 40 MB/s before overhead. Do not route that through BLE/JSON. The phone should receive bounded previews, selected ranges and data references, or a separately designed high-throughput local link.

## 7. Worker and AI boundary

REA job inputs should specify one approved artifact, target hash, engine/version, bounded operation, output limits and timeout. Keep the target unexecuted during static inspection. Record stdout/stderr/exit/cleanup and input/output hashes. Analysis results must not become executable instructions. Engines and providers have independent licences and environment needs; REA's MIT licence grants none of their proprietary rights.

An eventual private worker needs actual authentication, per-job authorization, encrypted transport, retention policy and restart/persistence acceptance. No worker or credentials are provisioned by this document. AI uses data-only result/hypothesis contracts and explicit export selection. No model/provider is assumed connected.

## 8. Migration sequence and rollback

1. Freeze current baselines, source hashes and observable semantics. Identify a small high-value workload with tests and real phone measurements.
2. Implement one Rust library slice, preferably a bounded pure parser or I/Q kernel, behind an experimental adapter. Keep existing TS/C reference paths.
3. Run golden vectors, malformed-input cases, randomized differential tests and independent review on both implementations. Record all differences; no silent fallback that hides failures.
4. Build Android and iOS artifacts reproducibly. Test FFI behavior, lifecycle, thread ownership and file IO on actual phones.
5. Benchmark the same workload/input/settings on both paths. Decide using latency, memory, thermal, energy, correctness and maintainability together.
6. Switch the selected operation only after parity and device evidence. Keep a documented rollback and versioned saved-data compatibility.
7. Expand by measured need, not language enthusiasm. Preserve the existing C firmware unless its replacement earns its cost.

## 9. Benchmark and acceptance plan

| Measure | Required method | Decision use |
| --- | --- | --- |
| Result correctness | Exact values or justified numerical tolerance against independent fixtures; malformed and boundary cases | No performance gain compensates for silent semantic change |
| Cold/warm latency | Named phone/OS/build, workload hash, warm-up, repetitions, p50/p95/p99 | Establish where native work improves the user path |
| Memory | Peak resident/native/JS memory and allocation profile at maximum supported input | Verify resource budgets and cleanup, not only average allocations |
| Thermal/energy | Repeated sustained workloads on battery with recorded conditions | Avoid fast short runs that throttle or drain excessively |
| UI responsiveness | Interaction/frame delay while work runs and cancels | Keep engine work off UI-critical threads |
| Binary/startup cost | Artifact size, startup time and packaging/licence dependencies | Account for the cost of native libraries |
| Lifecycle | Cancel, background, permission denial, disconnect, stale completion, repeated job, process restart | No resource leak, implicit restart or successor corruption |
| Maintainability | Reproducible build, API surface, unsafe/FFI review, dependency support | Choose reliable integration over isolated microbenchmark wins |

No speedup, energy saving or threshold is claimed yet. Choose budgets before accepting the migration, against baseline measurements on the owner's supported phone class. A host benchmark is useful preparation, not a substitute for this comparison.

## 10. Decisions still required

Exact Rust toolchain/MSRV; iOS/Android minimum versions and architectures; bridge tooling; selected C/C++ dependencies/licences; first engine workload; real handset/board fixtures; supported desktop/worker OS; packaging/signing; secure evidence storage and retention; authentication for privileged accessories; performance budgets. Record each with alternatives, evidence and reversibility in [decision history](DECISION_HISTORY.md).
