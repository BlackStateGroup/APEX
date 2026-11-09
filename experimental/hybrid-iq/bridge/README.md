# Optional IQ bridge foundation (experimental)

This directory contains the reviewed portable boundary and executor. The later Android activation layer now imports its codec/client through `src/iq-engine.ts` and links its C ABI from `modules/apex-iq`. See `docs/NATIVE_IQ_ACTIVATION.md` for current integration scope and build status. The host proof results below predate that activation layer and do not establish Android packaging or device acceptance.

## Delivered

- `codec.ts`: runtime-neutral Uint8Array/DataView encoding and projection. It generates Hann/twiddle coefficients in the calling JS runtime, uses private request contexts, and validates session plus request identity before projection. No Node Buffer, process, crypto or platform module is needed.
- `client.ts`: optional executor. Native is absent by default, so the injected JS fallback runs. Native rejection, malformed data or mismatched identity also use a privately owned snapshot for fallback. The result explicitly identifies the backend and fallback reason. This returns the numerical projection only, not a provenance-bearing core report.
- `bridge.h` / `bridge.cpp`: bounded C ABI suitable for a later JNI or Swift/C wrapper. No host subprocess, benchmark iterations, native transcendental functions, peak selection or request timing enters this protocol. It calls the existing kernel one frame at a time and checks cancellation before work, before each frame, and before publication. Every failure leaves output bytes untouched. No pointer is retained.
- `proof.test.mjs` and `abi.test.cpp`: host-only exact numerical/raw-double checks, malformed boundaries, owned snapshots, identity, concurrency and cancellation tests. `host.cpp` is only a test driver, never the proposed phone transport.

## Ownership, scheduling and cancellation

Each executor admits one actual operation and no queue. Cancel immediately fences publication, asks native to cancel when applicable, and keeps the busy gate until that native promise actually settles. A promise timeout must **not** release the gate. If native hangs, this client stays busy; a module-level recovery protocol is not implemented. Dispose permanently closes the client and fences any late result. No result or fallback is published after cancellation.

A future native owner must allocate nonzero 32-bit session IDs that are unique for all live sessions, including JS reloads. Requests monotonically increase within one executor; exhaustion refuses work rather than wrapping. Do not reuse a session between clients. This JS module rejects a duplicate numeric session claim, even after disposal, and caps lifetime claims at 1,024 to bound registry memory. One long-lived executor should serve one native session. Native must still enforce cross-reload uniqueness; a JS registry cannot enforce that across runtime destruction. Both IDs are echoed and validated, so stale same-shaped responses are rejected. IDs identify work; they do not authenticate a hostile native implementation or cryptographically prove that output belongs to input. Native output is trusted only after backend qualification on that platform.

The native module must atomically reserve the session/request **before** enqueueing, copy input, hold its own single-flight gate, and settle once after the compute job drains. Cancel must travel on an independent fast control path and flip only thread-safe job state. Never call into JS from the C cancellation callback. Teardown must invalidate pending publications and preserve native memory until active calls drain. Running cancel behind compute on a serial queue cannot interrupt work.

The C layer observes cooperative cancellation between frames, not within a frame. Cancellation can race the final copy/return; the JS fence still discards the late result. A future binding must map status 4 to a rejected promise and retain ownership until execute has returned. Caller buffers and callback state remain alive for the whole synchronous C call. See `bridge.h` for pointer/disjointness preconditions. The boundary is stateless: global/session concurrency and teardown are the platform owner's responsibility.

JS byte snapshots reject SharedArrayBuffer and resizable buffers. Native inputs are decoded into aligned owned doubles, never cast from packet memory to double pointers. Coefficients and results are bounded. Failure does not expose partial frames. The new boundary does not change the existing kernel arithmetic; per-frame scheduling is still tested against all existing host proof cases.

## Version 1 wire contract

All integer fields and IEEE-754 binary64 values use little endian. No padding is inferred from C structs.

Request: 48-byte header, ci16_le sample bytes, then binary64 Hann[n], cosine[n-1], sine[n-1].

| Byte offset | Field |
|---|---|
| 0 | ASCII AXIB |
| 4 | u16 version = 1 |
| 6 | u16 operation = 1 (FFT) |
| 8 / 12 | u32 nonzero session / request |
| 16 | u32 sample byte length |
| 20 / 24 / 28 / 32 | u32 FFT size / start sample / hop samples / frame count |
| 36 / 40 / 44 | u32 reserved = 0 |

Maximum request: 360,480 bytes. Sample bytes: 4..262,144, multiple of four. FFT size: 256/512/1024/2048/4096. Frames: 1..64; total FFT cells <=16,384; window end must fit the sample bytes; start <=65,535 and hop 1..65,536. The exact length must match the declared geometry. No repetitions or benchmark work are accepted.

Response: 32-byte header, followed by frame-major binary64 [real[n], imaginary[n]] in raw unshifted FFT order.

| Byte offset | Field |
|---|---|
| 0 | ASCII AXOB |
| 4 | u16 version = 1 |
| 6 | u16 reserved = 0 |
| 8 / 12 | u32 echoed session / request |
| 16 / 20 | u32 FFT size / frame count |
| 24 | u32 payload bytes = frames * FFT size * 16 |
| 28 | u32 reserved = 0 |

Maximum response: 262,176 bytes. Errors have no response payload. C return statuses: 0 success, 1 invalid boundary/geometry, 2 kernel rejection, 3 native allocation/runtime failure, 4 observed cancellation. These statuses do not assert that an unobserved cancellation did not race completion.

## Expo implementation route and remaining platform gates

APEX currently uses Expo 58 / React Native 0.88.1. The new Android-only optional `modules/apex-iq` supplies a separate ApexIq module rather than coupling FFT computation to USB/NFC lifecycle. Platform build evidence and remaining gates are tracked in the activation documentation. The following source observations informed that implementation.

Installed Expo sources were inspected:

- Android's `FrontendConverter.cpp` converts Uint8Array to Kotlin ByteArray before async dispatch; ByteArray results convert to fresh Uint8Array. Typed-array views honor byteOffset.
- iOS `DynamicDataType.swift` copies Uint8Array into Swift Data before queue dispatch; ExpoModulesJSI Data conversion returns copied Uint8Array.
- Default async queues are shared and serial on both platforms. A dedicated bounded compute worker plus separate synchronous cancel/control function is required.
- ByteArray/Data automatic conversion occurs **before** module code can reject oversize inputs. Adapter bounds protect this supported path, but this is not a hard preallocation defense against arbitrary direct native-module calls.

Android needs Kotlin module registration, JNI shim, CMake/Gradle shared-library target and tested NDK ABI set. iOS needs Apple Expo registration, a podspec, Swift module and C bridge linked with libc++. Both require rebuilding the custom development client. Optional module lookup must preserve the JS fallback when the native binary is absent.

The existing Rust proof is Linux-host-only: its build script rejects HOST != TARGET/non-Linux, invokes host g++, links stdc++, and the crate has no mobile staticlib/C export ABI. This C++ portable boundary does not pretend otherwise. A genuine Rust-owned mobile layer additionally needs target-aware builds, stable allocation/free/error ownership and separate device/simulator libraries. Host CI Rust success is not mobile Rust linkage.

## Tests and remaining acceptance gates

Run from repository root with existing Node 24 and g++:

```
node --test experimental/hybrid-iq/bridge/proof.test.mjs
APEX_BRIDGE_SANITIZE=1 node --test experimental/hybrid-iq/bridge/proof.test.mjs
```

The tests compile only this authored C++ boundary and the existing kernel. No downloads or installs occur. ASan/UBSan builds explicitly disable LeakSanitizer in this constrained host; no leak-freedom claim. The full parity corpus must pass with exact raw doubles and deepStrictEqual projection, including signed zero and first-strict-max behavior. No epsilon relaxation is used.

Before any app opt-in:

1. Build native Debug/Release Android device + emulator and iOS device + simulator. Verify registration, absent-module fallback, effective strict FP flags, ABI ownership and Android 16 KB page compatibility.
2. Run the exact corpus within the actual mobile JS runtime using that runtime's coefficients. Linux/Node results do not establish Hermes/ARM acceptance.
3. Test cancellation before enqueue, during compute and at completion; overload, immediate resubmit, wrong identity, background/exit and JS reload. Verify single settlement, no stale UI publication and no destroyed-buffer access.
4. Wire through the current controller's generation/lease fences without bypassing explicit Inspect, provenance, metadata validation or privacy behavior. The executor's numeric projection is not a replacement for the complete report contract.
5. Measure complete device encoding, copies, scheduling, compute, projection, UI responsiveness and memory. No mobile speed claim exists here.

No Xcode/Swift toolchain, Android SDK/NDK, javac/Gradle or Rust mobile toolchain was available for this work. A Java 21 runtime alone is not an Android build toolchain. The Android binding is now implemented separately with actual host Java/JNI checks; its Kotlin/NDK packaging still requires Android CI, followed by actual-runtime/device acceptance. An iOS binding and Rust mobile toolchain remain separate work.

The dedicated `iq-bridge.yml` CI gate runs these two suites with preinstalled Node 24 and g++, contents-read-only permissions, pinned credential-free checkout and no install step. Automatic runs are limited to same-repository PRs from `experiment/optional-iq-bridge`; forks are not run. Manual dispatch is declared for use once the workflow is registered on the default branch. A successful host CI run is still not platform compilation or integration.
