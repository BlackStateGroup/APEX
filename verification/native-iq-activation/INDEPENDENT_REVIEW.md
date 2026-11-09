# Independent activation review

Reviewed on 2026-11-08 against the candidate based on main commit
`335efd95dbd3841094ad1618df06dab14a7bfdf5`. The exact reviewed implementation
hashes are in `independent-reviewed-sha256.txt`.

## Outcome

No remaining source-level blocker found in the reviewed activation path after
the ABI-selection correction below. This supports a guarded Android **C++**
verification-mode integration, not mobile Rust activation, a performance claim,
physical-device acceptance, or a release. Actual Android compilation is still
an outstanding gate. A rebuilt/installed app is required before this module can
run on a phone; old binaries continue to use JavaScript.

The code intentionally computes the unchanged JavaScript reference for every
request and accepts native projected results only on exact equality. It thus
adds work rather than establishing acceleration. Rust remains host-only; iOS
and web remain JavaScript. These limitations are stated in the code/UI/docs.

## Reviewed boundaries

- The existing prepared-recording validation, source hashes, provenance,
  full-file statistics, report metadata, warnings, and default-short-recording
  behavior remain controlled by the unchanged core. Core analysis blob is still
  `c1d65937e402e53f93e40838fa89fc4063b391b7`; analysis/offline/kernel/oracle files
  have no candidate diff.
- Seventeen synthetic runtime qualification cases compare raw doubles with
  `Object.is`, including signed zero. Every real request then compares the full
  projected numeric result against its unchanged JS report. Failed qualification,
  incompatible/unavailable native modules, malformed results, and projection
  mismatches select JavaScript and do not publish unverified native output.
- The controller keeps its generation and foreground-lease fences. Engine
  cancellation retains its busy slot until the native promise settles. Release
  closes the session only after drain. No newer selection or Clear can receive
  an older result.
- Synchronous reservation occurs before Expo's queued execute. Java maintains
  process-wide admission, nonreused session IDs, per-session monotonic request
  IDs, owner identity and cancellation state across JS context lifetimes.
  Closing a queued reservation cannot let its late execute consume another
  reservation. Running work holds ownership through actual native return.
- The dedicated worker owns the Java input, JNI copies into bounded vectors, and
  the existing bridge decodes aligned double buffers. JNI retains no pointer or
  cross-thread JNIEnv. Cancellation reads AtomicBoolean on the attached worker;
  it does not invoke JS. Completion is attempted once under the lifecycle lock.
- Source inspection found no added network, file, RF, or permission capability.
  Expo's initial ByteArray conversion precedes native bounds checks, so this is
  not a preallocation defense against arbitrary abusive JS module calls.
- Test-harness edits retain existing behavioral assertions while resolving the
  new factory/import location and updating truthful cancellation wording.

## Finding corrected during review

The first module Gradle candidate did not apply `reactNativeArchitectures` to
CMake `abiFilters`. Passing two architectures in CI therefore did not constrain
this native library's build, unlike Expo core's explicit configuration.

The final candidate validates the requested comma-separated ABI list and passes
it to `externalNativeBuild.cmake.abiFilters`. Empty, unsupported and duplicate
selections fail. New module checks request arm64-v8a and x86_64; whole-app debug
assembly remains the previous arm64-only job to avoid unnecessary CI expense.
This correction has source-guard coverage but has not been evaluated by actual
Gradle in this local environment.

## Independently executed checks

All commands ran locally; this review triggered no CI jobs or installs.

- `node --test tests/iq-native-engine.test.ts tests/iq-native-platform.test.ts modules/apex-iq/source.test.mjs`: 18/18 passed before the ABI source-guard addition.
- `node --test tests/*iq*.test.ts`: 390/390 passed.
- `npm run typecheck`: passed.
- `bash modules/apex-iq/host-check.sh --sanitize`: production Java lifecycle
  suite passed 56 checks; actual production JNI/bridge/kernel passed 163,885
  assertions under fatal UBSan and JVM `-Xcheck:jni`. Java compiler 21.0.13.
- Final `node --test modules/apex-iq/source.test.mjs`: 5/5 passed after the ABI fix.
- `git diff --check`: passed before this report was added.

The independently rerun pre-integration portable bridge suite also passed all
16 tests and its 1,485-request / 23,029,248-bin exact raw-double corpus. It is
host C++ evidence, not Rust or mobile evidence.

The captured local logs are adjacent to this report. No claim is made here about
full-repository checks performed by other runs.

## Gates that remain outside this review

- Real Android Gradle/Kotlin/NDK Debug and Release compilation, module autolinking,
  final APK linkage and packaging for the intended ABIs.
- Hermes/ARM execution, real-device cancellation/reload/teardown stress,
  16-KiB-page loadability, and final release/R8 packaging acceptance.
- Measured device import-to-render latency, frame responsiveness, memory and
  power. Runtime numeric checks cannot validate those properties.
- Mobile Rust static-library/C ABI, target-aware build and ownership/link tests;
  native iOS implementation and Apple-platform validation.

Do not describe host checks, source guards or Metro export as Android or
physical-device acceptance. Keep default-on selection conditional on successful
runtime qualification and exact request verification until separately justified
by the relevant platform evidence.
