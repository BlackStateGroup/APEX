# APEX actual-device build readiness audit

Date: 8 November 2026 UTC. Final read-only check: 2026-11-08T06:56:02Z.
Source: `/workspace/scratch/b96d3539d24d/apex-continuation`.
Exact HEAD: `bb30f68ff4c4b959fdcfef0648ef86bd5caa9aef`; clean at final inspection.
Scope: read-only source/environment audit. Only the audit report was written. No build, prebuild, dependency/toolchain installation, device command, source restoration, settings change, browser retry, remote write or offline-computer startup.

## Changes after the audited source

The audit below is tied to `bb30f68`, not a claim that every source blocker
remains current. The six missing ESP32-S3 files have since been restored exactly
and independently verified; see [restoration](ESP32S3_RESTORATION.md) and the
[independent review](../review-evidence/esp32s3/REVIEW.md). Restoration resolves
the missing-source blocker only. Toolchain, target compilation and physical
acceptance remain unverified. The review also reproduced a client READY/data
collision; its current fix status is recorded with subsequent checkpoint evidence.

## Findings at the audited source

1. **ESP32-S3 target source is absent.** `git ls-tree -r --name-only HEAD firmware` lists only README, core/apex.c, core/apex.h and host/main.c. `firmware/esp32s3` is absent on disk. Historical documentation and the current workflow reference it; those references do not restore the target or establish current target-build readiness.
2. **Java correction:** absence of a `javac` launcher does not mean a JRE-only installation. `java --list-modules` contains java.compiler, jdk.compiler, jdk.jartool and jdk.javadoc at 21.0.13. `java -m jdk.compiler/com.sun.tools.javac.Main -version` succeeds with `javac 21.0.13`. Gradle acceptance/discovery of this installation remains UNTESTED. Do not repeat the earlier incorrect JRE-only inference.
3. Only the cloud is connected. The Mac is explicitly offline and was not inspected or attached. No alternative ready builder was established.
4. Native Android module source exists, but root android/ios projects do not. No current native compilation or physical acceptance was performed.

## Environment evidence

The available-environment inventory listed exactly two environments; no additional page remained. Environment identifiers are omitted here.

- Current Linux cloud environment: connected and inspected.
- Augustuss-Mac-mini.local: offline; uninspected. No attempt to start or attach it.

Same-session read-only observations: Linux6.18.57 x86_64, Node24.22.1/npm11.9.0, OpenJDK21.0.13, GCC available; JAVA_HOME/ANDROID_HOME/ANDROID_SDK_ROOT/IDF_PATH unset; no running adb process.

Additional checks performed here:

- `ls -l /usr/lib/jvm`; bounded file search for java/javac/jmod; listing the installation's bin directory. Launchers present: java, jpackage, keytool, rmiregistry. Compiler module checks above resolve the misleading launcher absence.
- `command -v cmake ninja python3 pod xcodebuild idf.py sdkmanager gradle adb javac`: only Python resolved among these names.
- Inspected usual Android/Gradle/ESP locations, including ~/.gradle, ~/Android, ~/.android, ~/.espressif, ~/.platformio, /usr/lib/android-sdk, /usr/local/lib/android/sdk, /usr/local/share/android-sdk and matching /opt paths: absent. /opt contains Codex runtime, Godot and Slicer, not an Android/ESP SDK. This is bounded location/PATH evidence, not an exhaustive whole-filesystem absence proof.
- No adb server/device enumeration was attempted.

## Platform blockers and smallest next steps

### Android

Existing module files: modules/apex-device/android/build.gradle, AndroidManifest.xml and ApexDeviceModule.kt. Module configuration declares Android only. No generated root android directory exists.

Current cloud lacks discovered SDK/NDK/build-tool and Gradle cache paths. RN's installed `gradle/libs.versions.toml` specifies compileSdk37, buildTools37.0.0, NDK27.1.12297006 and AGP9.2.1. BLE3.5.1's Android buildscript references AGP8.8.0: effective generated dependency resolution needs an actual native build; mismatch alone is not a demonstrated failure.

Next: select an already provisioned Android builder or obtain authorization for the necessary toolchain setup. Validate JDK discovery, then protected prebuild-only and `:apex-device:compileDebugKotlin` plus `:app:assembleDebug -PreactNativeArchitectures=arm64-v8a` on the exact final source. Default `npm run android` invokes Expo run behavior and is not merely a compile check. Physical app installation and acceptance are later, separately scoped steps.

### iOS

Linux cannot supply Xcode. Mac toolchains are uninspected because the Mac is offline; no generated iOS project exists. Known-good historical CI used macOS26/Xcode26.6. Restored BENCH_ACCEPTANCE's 26.4+ wording is not stronger evidence than the actual known-good build; VERIFICATION records failed older tooling attempts.

Next: reconnect the Mac, inspect Xcode/CocoaPods, then explicitly transfer the exact continuation and compile unsigned Simulator target. Physical NFC requires signed NFC-capable provisioning and an authorized iPhone/tag. Simulator compilation does not meet this gate. There is no ApexDevice iOS USB implementation.

Software gap independent of tooling: BLE3.5.1 iOS destroyClient is a void bridge method; teardown acknowledgement remains unresolved. Reset APEX Bluetooth must remain disabled on iOS. A successful build cannot resolve this acceptance gap.

### ESP32-S3

Missing firmware/esp32s3 source is the first blocker; ESP-IDF, cross compiler and usual tool caches are also absent. Historical host GCC success is not ESP compilation.

Next: recover the exact target source from the pinned historical upstream with file/hash provenance and review against the current portable core, then use an authorized ESP-IDF6.1 builder. No restoration was performed. Flashing and named owned-board USB/BLE acceptance are separate; no board availability was established.

## Versions and Node floor

Read package.json, package-lock.json and installed dependency package manifests directly; installed and locked versions agree for Expo58.0.22, React19.3.0, RN0.88.1, BLE3.5.1, NFC4.2.0 and expo-dev-client58.0.18. Expo bundledNativeModules.json selects RN0.88.1. The relevant engine ranges are recorded below.

Exact floor evidence:

- package.json:8-9: engines.node is `>=24.0.0 <25`.
- package-lock.json: `packages[""].engines.node` duplicates that same range.
- node_modules/expo/package.json:281-282: `^22.13.0 || ^24.3.0 || ^26.0.0 || >=27.0.0`.
- node_modules/react-native/package.json:23-24: `^22.13.0 || ^24.3.0 || >= 26.0.0`.
- The respective `package-lock.json` entries `packages["node_modules/expo"].engines` and `packages["node_modules/react-native"].engines` retain the dependency ranges with the same ranges listed above.

For the repository's existing Node24-only policy, `>=24.3.0 <25` is the supported minimal correction. Node24.22.1 already satisfies it. A reviewed change should synchronize only package.json engines.node and the lockfile root package engines.node; dependency versions, resolved URLs, integrity values and dependency entries need not change. Do not regenerate dependencies or silently broaden supported Node majors. No manifest/lock edits were made in this audit.

## Source-parking wrapper

Read tools/native-build.mjs, tools/native-process-group.mjs references and docs/native-source-parking.md. Local installed Expo CLI exists. Both research/upstream-sources and sibling .apex-continuation-native-build.lock are absent now.

Wrapper owns an exclusive sibling lock across prebuild/run, parks an existing corpus, checks child process-group quiescence and restores it before native run. Unknown surviving processes or restoration collisions retain the lock and corpus for explicit inspection. `--prebuild-only` still generates files. Direct prebuild commands in restored BUILD_HANDOFF and current workflow bypass this protection; prefer the wrapper when proceeding on continuation source, particularly if the corpus is restored.

## What can execute without new setup

Existing installed dependencies support TypeScript checks, Node/mock/fixture suites, inventory checks, portable GCC firmware checks and offline Expo JavaScript exports. Read-only Expo configuration introspection can evaluate plugin output. These suites were not rerun for this read-only audit. Checkpoint records remain the source of actual suite results.

These do not establish Gradle/CocoaPods resolution, Kotlin/Swift/target-C compilation, phone permission behavior, USB endpoints, BLE reception, teardown, NFC reading or durable phone storage. Existing browser execution denial was not retried or bypassed.

All cases in PHONE_ACCEPTANCE_PLAN and TRANSPORT_RELEASE_ACCEPTANCE remain NOT RUN. Physical runs need exact source/build hash, named authorized phones/accessories, explicit operation scope, actual observed results and separate fault-injection labeling. Historical CI and historical APKs are not current-build evidence. No current remote CI result was inspected in this audit.

## Sources reviewed

- docs/NATIVE_BUILD_READINESS.md, BUILD_HANDOFF.md, PHONE_ACCEPTANCE_PLAN.md, TRANSPORT_RELEASE_ACCEPTANCE.md, native-source-parking.md.
- docs/FOUNDATION_RESTORATION.md and manifest; docs/VERIFICATION.md; docs/BENCH_ACCEPTANCE.md; firmware/README.md.
- .github/workflows/foundation.yml; verification/native-readiness/original-manifest.json.
- package.json/package-lock.json; installed Expo/RN/BLE manifests and Gradle configuration; app.json; modules/apex-device/expo-module.config.json and Android module files.
- Historical successful CI referenced by the documents: https://github.com/BlackStateGroup/APEX/actions/runs/41467890970 at 69d1d5d5ef9360188b8cd6de4d0a601b7f41bf7b. Not revalidated here and not acceptance of bb30f68.
