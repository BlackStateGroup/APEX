# Optional Android IQ backend

`ApexIq` is an Android-only local Expo module. It calls the existing C++ binary
bridge and FFT kernel under `experimental/hybrid-iq/`; it does not build or run
Rust. It has no device, radio, filesystem, network, or permission API. iOS, web,
Expo Go, and older app binaries can continue with the existing JavaScript path.

The app must qualify the native backend and validate each response before using
it. `available: true` means the library loaded, not that mobile parity, performance,
or a release has been accepted. This module does not enable RF transmission.

## API and lifetime

- `capabilities()` is synchronous and returns `{ available, backend: 'cpp',
  contractVersion: 1, cancellation: 'between-frames', mobileRust: false }`.
- `openSession()` synchronously allocates a unique nonzero u32. The process-wide
  counter survives JS/Expo context reloads, never wraps/reuses IDs, and allows up
  to 64 simultaneously open sessions. A module instance cannot use another
  instance's sessions.
- `reserve(session, request)` synchronously admits one operation process-wide,
  before any async call is queued. Request IDs must increase within a session.
- `execute(Uint8Array)` returns a Promise of a new Uint8Array using the version-1
  AXIB/AXOB binary contract. Its header must match that reservation. A dedicated
  single native worker performs the blocking JNI call; Expo's shared async worker
  returns immediately. No second request can be admitted while reserved/running.
- `cancel(session, request)` synchronously sets an AtomicBoolean. JNI reads it on
  the same attached worker thread before/between frames and after the bridge.
  Cancel does not mean completed, and it does not interrupt C++ or free buffers.
- `closeSession(session)` and module destruction invalidate ownership and cancel
  the operation. A reservation that never entered execute owns no native buffers
  and can be retired immediately. Once dispatched, the admission slot and owned
  bytes remain until actual native return. Late execute calls cannot consume a
  replacement reservation; late results are rejected before publication.

Completion is attempted once, after drain, under the lifecycle lock. A cancelled
or destroyed context never receives a successful result. JS must also fence late
callbacks because a successful completion can be enqueued just before JS cancels.
An already-destroyed JS runtime may not receive any callback, but that cannot
release a native slot prematurely or start a second native computation.

The executor has one internal handoff slot, not a caller work queue. This permits
submission while a previous *completed* runnable is returning. Global admission
allows only one reserved/dispatched/running operation. It is never shut down by
an individual JS context or interrupted as a substitute for cooperative cancel.

Malformed input that cannot identify its reservation does not retire another
request. A caller abandoning a successful reservation must close its session.

## Bounds and ownership

The maximum encoded request is 360,480 bytes; the response maximum is 262,176.
Kotlin/Java check byte length and reservation ownership, JNI checks length and IDs
again, and the portable bridge revalidates all dimensions, exact lengths,
magic/version/reserved fields, coefficient ranges, and floating-point rounding.
Native byte vectors and aligned double vectors own every buffer until return.
No heap pin, JS callback, cross-thread JNIEnv, or borrowed JS buffer is used.
C++ exceptions are converted to Java failures and never escape the JNI entry.

Expo converts a Uint8Array to ByteArray **before** the Kotlin entry. Therefore the
module cannot prevent that initial allocation for an oversized/abusive direct
JS call. The app adapter must bound and snapshot its input before calling Expo.
This module bounds every additional allocation after entry; it does not claim a
pre-conversion memory sandbox for arbitrary JavaScript.

The strict C++ build disables fast math and fused contraction and uses a 16 KiB
ELF alignment. A successful Android build still needs same-runtime exact-output
qualification and real-device cancellation/reload testing.

CMake compilation honors `-PreactNativeArchitectures=...`, not just the app's
packaging filter. Supported ABIs are `arm64-v8a`, `x86_64`, `armeabi-v7a`, and `x86`.
Omitting the property selects all four. An explicitly empty property, empty comma
entry, duplicate, or unsupported ABI fails configuration rather than silently
expanding the build. Whitespace around an otherwise valid ABI is trimmed.

## Validation

Run without downloading dependencies or installing toolchains:

```
node --test modules/apex-iq/source.test.mjs
bash modules/apex-iq/host-check.sh
bash modules/apex-iq/host-check.sh --sanitize
```

The host script invokes the JDK compiler through `java com.sun.tools.javac.Main`,
so it also works when only that launcher is present. It compiles the production
Java coordinator, runs deterministic and concurrent lifecycle tests, compiles
the production JNI entry/bridge/kernel against React Native's vendored JNI
header, and executes that library on the host JVM with `-Xcheck:jni`. The optional
sanitizer run enables UBSan and makes findings fatal. This is real host JNI
coverage, **not** Android compilation or device performance evidence.

For the full Java/JNI numerical integration corpus, add `--parity` (requires
existing Node 24, with no installation):

```
bash modules/apex-iq/host-check.sh --parity
bash modules/apex-iq/host-check.sh --sanitize --parity
```

The test-only stdin adapter sends the runtime-generated JS coefficient packets
through the **production Java coordinator and actual JNI library**, then checks
all 1,485 requests against the unchanged JS oracle: 8,924 windows, 23,029,248 bins
and 46,058,496 raw real/imaginary values, including signed zeros, without numeric
tolerance. The application's own qualification and complete-report logic also
runs through this route. These are Node/V8/Linux tests: Expo marshalling,
Kotlin registration, Android/Hermes/ARM and mobile performance remain untested.
This extra local corpus is opt-in and does not add a separate CI job.

The process-client negative controls reject trailing/truncated/oversized output,
nonzero exits and excess diagnostics. Its timeout and abort paths escalate from
TERM to KILL and destroy streams after a bounded grace period; retained diagnostics
are capped at 64 KiB. It is a test fixture, not a production transport.

The lifecycle suite includes 100 rounds each of eight-way admission, duplicate
execution with concurrent cancellation/teardown, execute-versus-retirement, and
reservation replacement. Synchronization gates define the races without sleeps.
Assertions inside injected engines are recorded and checked on the test thread
so cancellation cannot hide a failed assertion. A permanent negative control
verifies that failure path. No stress result proves absence of all possible races.

The same lifecycle suite is wrapped as an Android JUnit test. Required Android
checks, in a generated Expo Android project with SDK/NDK/CMake available:

```
./gradlew :apex-iq:compileDebugKotlin :apex-iq:assembleDebug :apex-iq:testDebugUnitTest -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon
./gradlew :apex-iq:assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --no-daemon
```

The source guard checks the ABI property validation and its placement in CMake's
`abiFilters`; it does not execute Gradle. In an SDK-equipped environment, also
confirm that `-PreactNativeArchitectures=`, `-PreactNativeArchitectures=unknown`,
and `-PreactNativeArchitectures=arm64-v8a,` fail configuration. Inspect both module
variants to confirm that their two-ABI commands produce only arm64-v8a/x86_64.

Also test a physical Android device: qualify all FFT sizes, compare every current
request with unchanged JavaScript, cancel during a multi-frame run, close and
reload while native code drains, then re-open and run again. Check release/R8
packaging and all shipped ABIs. No Android/physical-device or release acceptance
is implied by the host test output.
