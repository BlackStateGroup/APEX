# Verified Android IQ engine activation

This change connects the app's explicit IQ Inspect action to an optional Android
C++ FFT module. It is **not a mobile Rust/C++ hybrid release**. Rust remains the
separately validated Linux-host proof. iOS, web, Expo Go, old app binaries and
incompatible/unavailable modules retain JavaScript analysis.

## Selection and numerical contract

The native path is default-on only when Android supplies the compatible `ApexIq`
module and exact runtime qualification succeeds. Merely loading its library is
not acceptance. Nothing is computed when a file is picked or an example is
staged. Inspection still validates sizes, reads the exact chosen bytes, hashes
those bytes and prepares the strict SigMF profile before invoking analysis.

`src/iq-engine.ts` leaves `packages/core/iq-analysis.ts` unchanged. The existing
core still validates options/prepared recordings, computes full-file statistics
where required, and defines all provenance, metadata, warnings and report fields.

Before using native FFT output, the engine performs 17 synthetic checks in the
calling JavaScript runtime: zero, nonzero-position impulse and deterministic
full-range samples at all five FFT sizes, plus maximum frame/cell selections.
The native raw doubles must match the unchanged JS FFT with `Object.is`, including
signed zero. Request geometry, length, IDs and finite-result bounds are checked.
Hann/twiddle coefficients and magnitude/log/peak projection remain in JS.

Initial activation is deliberately **verification mode**: every actual native
request is also compared exactly to the full JS reference for that request.
Only equal native numeric arrays are inserted into the existing report structure.
Any self-test/request failure falls back to the JS result and quarantines that
engine until reload. No tolerance is introduced. This is more work than a
native-only implementation and is not advertised as an acceleration.

The UI says which backend actually produced the accepted result. Native output
is labeled C++, with JS verification and Rust-mobile absence stated. Short input
under the default 1024-point FFT still returns JS statistics only, without native
initialization. Selected-window energy/threshold remains a separate JS analysis.

## Ownership, cancellation and privacy

The original controller generation and foreground lease remain authoritative.
Clear, settings changes, replacement and background/exit invalidate results and
request cooperative cancellation. The actual outstanding slot is held until the
native promise drains. Late completion cannot republish a stale report. Reads,
hashes and synchronous JS computations are still not interruptible mid-call.

The Android module owns unique process-wide sessions and one reserved/running
job, including across JS context reloads. The adapter synchronously reserves
session/request identity before Expo can queue `execute`. Cancel is synchronous
and independent of the dedicated compute worker. Native checks the AtomicBoolean
between FFT frames; it does not claim interruption inside a frame. Closing or
destroying an owner cancels without freeing running buffers. Completion occurs
once after actual JNI return. The JS executor retains its own result fence.

No permissions, RF acquisition/transmission, upload, persistence, clipboard,
telemetry or sharing API is added. Module byte conversion and native copies are
bounded after entry. Expo's automatic ByteArray conversion happens before native
validation, so it is not a memory sandbox against arbitrary abusive JS calls.
See `modules/apex-iq/README.md` for API and native ownership details.

## Local verification

- Portable C++ boundary: previous full exact corpus is 1,485 requests, 8,924
  windows, 23,029,248 bins and 46,058,496 raw doubles per optimized/sanitized run.
- New real-C++ app tests cover all FFT sizes, complete single-window/TF report
  equality, source provenance, absence fallback, raw signed-zero failure,
  plausible finite corruption after qualification, cancellation/drain/reopen,
  and controller Clear. Native-adapter tests cover iOS exclusion, incompatible
  capability rejection, reserve-before-execute and independent cancel control.
- Actual Java host lifecycle and real JNI tests run with existing installed
  Java compiler support, g++ and React Native JNI headers. Both ordinary and
  fatal UBSan runs use `-Xcheck:jni`. These are Linux-host tests, not Android tests.
- Existing IQ render/source mocks now resolve the new engine factory and observe
  the same unchanged core through its new caller. Their behavioral assertions
  remain in place; cancellation copy assertions reflect the new native behavior.

No local SDK/NDK/Xcode installation was performed. Source, results and independent
review are retained under `verification/native-iq-activation/` when completed.

## CI and remaining gates

The existing foundation checks remain enabled. The Android job additionally runs
Java/JNI source/host checks, compiles the Kotlin module, runs its JVM lifecycle
suite and builds release libraries for arm64-v8a and x86_64. The existing whole-app
debug assembly remains arm64-v8a to avoid adding an unrelated second app build. Compilation is a gate, not a deployment/release. Existing iOS builds check
that the JavaScript fallback continues to bundle and compile.

A source patch or successful Metro export does not prove Android registration,
linking, Hermes/ARM numerical behavior, cancellation under device lifecycle,
16-KiB loadability, device responsiveness or performance. The linked backend's
runtime self-test and per-request checks protect numeric selection, but do not
replace physical-device stress/teardown testing. No device-speed claim is made.

Native iOS support still needs an Apple module/binding and platform validation.
Genuine mobile Rust ownership still needs a C export/staticlib ABI, target-aware
NDK/Apple builds and actual link/ownership tests. The Linux Rust crate has not
been relabeled as mobile support. Flipper firmware and its real-device merge gate
are outside this change and are untouched.

Final local checks: all 2,267 host tests pass, strict TypeScript and locked
inventory pass, and Android/iOS/web Metro exports pass. Independent review found
and fixed explicit NDK ABI filtering. Local browser UI execution is blocked:
Playwright's managed browser is absent and the installed Chromium aborts on a
forbidden socket operation. No browser security setting was changed; the
existing CI UI suite remains a required check. These local results do not replace
the pending Android compilation gate.
