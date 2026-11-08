# Native readiness audit, 7 November 2026

## Result

Configuration introspection passes; this continuation is not yet native-build or physical-device verified. No installs, prebuilds, native builds, radio operations, signing, OS permission grants or remote writes were performed. The app Bluetooth purpose text was subsequently corrected to describe observation; no permission scope was expanded.

## Concrete gates

- The selected snapshot initially lacked tools/native-build.mjs and the Android sources declared by modules/apex-device/expo-module.config.json; exact originals are now restored. Exact original copies from BlackStateGroup/APEX commit e51750ec0b34b280399877d67e1036058874c373 were verified with git hash-object against their GitHub blob SHA, recorded in verification/native-readiness/original-manifest.json. They are included in the exact synthetic baseline, not represented as new feature additions.
- Local Linux host has OpenJDK 21.0.13 at /usr/lib/jvm/java-21-openjdk-amd64. No javac launcher, Gradle, adb or sdkmanager is in PATH; JAVA_HOME, ANDROID_HOME and ANDROID_SDK_ROOT are unset, and usual Android SDK locations are absent. A deeper check confirmed java.compiler, jdk.compiler, jdk.jartool and jdk.javadoc modules. `java -m jdk.compiler/com.sun.tools.javac.Main -version` succeeds with javac 21.0.13. The compiler is available through its module entry point; Gradle toolchain discovery is untested. Do not infer an absent compiler from the missing launcher. Xcode and CocoaPods are absent. No Android/iOS build was attempted.
- Original tree contains no generated root android/ios project or Podfile. Local ApexDevice module is Android-only; no iOS USB implementation is declared. Module Gradle uses com.android.library and expo-module-gradle-plugin. Its manifest declares optional NFC and USB host features. Kotlin implements foreground NFC and conservative single-pair CDC-ACM, not BLE; BLE is provided by react-native-ble-plx.
- Native wrapper parks research/upstream-sources outside the app root during Expo prebuild, restores it in finally, then normally runs expo run:android/run:ios. --prebuild-only suppresses the run step. It is not a readiness check and still writes generated projects. Use it instead of direct prebuild when source corpus exists.

## Read-only configuration check

Ran EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 CI=1 node node_modules/expo/bin/cli config --type introspect --json, exit 0; stderr empty. The verified output is verification/native-readiness/expo-introspect.json. It confirms plugin evaluation, not autolinking, manifest merging, native compilation or device execution.

- Android SCAN carries neverForLocation; CONNECT and legacy BLUETOOTH/ADMIN are declared. Coarse/fine location declarations stop at SDK30. Runtime adapter requests SCAN+CONNECT on Android31+, fine location on older Android. No background Bluetooth mode is configured.
- The original iOS Bluetooth description mentioned only accessory connections. It now accurately includes observation: 'APEX observes nearby Bluetooth advertisements when you start a foreground observation and connects to your AXP laboratory accessories.' Only this descriptive purpose string changed; existing declarations, neverForLocation and background-mode settings did not.
- NFC usage description and NDEF/TAG entitlements are produced. Entitlement generation is not provisioning/signing approval or proof of NFC on a physical iPhone.
- Introspection also lists development/default INTERNET, SYSTEM_ALERT_WINDOW, VIBRATE and legacy external-storage permissions; inspect the final merged release manifest before release. These are observations, not new permission grants.

## Advertisement limitations

Installed react-native-ble-plx README line 100 explicitly warns that neverForLocation filters some BLE beacons and is experimental. Its plugin implementation applies the flag and the SDK30 location cap. Missing observations cannot establish that a device is absent or unsupported. Retain this flag unless product intent and permission policy are explicitly reconsidered; do not silently broaden location access. Native code additionally scans with one selected service UUID, so this is not a comprehensive packet capture. OS scan responses, duplicate coalescing, filter behavior and BTHome delivery require named Android/iPhone fixture tests. 'Passive observation' means no app-level connection/write; it does not establish controller-level passive scanning or zero radio transmission.

## Compatibility evidence

- Installed Expo58.0.22 bundledNativeModules.json explicitly selects React19.3.0 and RN0.88.1, matching package.json/lockfile. Node24.22.1 satisfies Expo/RN Node constraints (24.3+); repository engines are looser than dependency requirements at the bottom of Node24 range. No basis found to call Expo58/RN0.88 intrinsically incompatible.
- BLE3.5.1 peer constraints are wildcards; NFC4.2.0 accepts RN>=0.76/React>=18.2. These allow installation, not proof of native compatibility. BLE README's tested-version table is older (RN0.74.1/Expo51; separate section says Expo49); do not extrapolate that table as current certification.
- BLE Android buildscript references AGP8.8.0 while installed RN libs.versions.toml lists AGP9.2.1, compile SDK37/build tools37.0.0 and NDK27.1.12297006. Generated project's effective resolution must be checked in actual build; this is a potential integration gate, not a demonstrated conflict. BLE podspec requires MultiplatformBleAdapter0.2.0 and RN native dependency helper; NFC podspec uses Swift5.7, iOS15.1 and native dependency helper. npm ci alone does not resolve Gradle/Pod dependencies.
- Baseline verification documentation cites successful full Android and unsigned iOS Simulator builds. GitHub API independently confirms run 41467890970 completed successfully at commit69d1d5d5ef9360188b8cd6de4d0a601b7f41bf7b (https://github.com/BlackStateGroup/APEX/actions/runs/41467890970). This is historical evidence, not validation of the current continuation. Documented known-good iOS environment is macOS26/Xcode26.6; do not infer Expo's full requirement from RN helper's lower Xcode16.1 minimum.

## Minimum next action

Original native source restoration and Bluetooth purpose-text correction are complete. Next use an Android builder with validated JDK discovery and matching SDK/NDK to generate via the protected wrapper and run :apex-device:compileDebugKotlin and :app:assembleDebug for arm64-v8a on the final continuation. A Mac with the repository's known-good Xcode26.6/CocoaPods setup is needed for unsigned Simulator compilation. Any new installations or remote CI dispatch are separate actions, not performed here. Finally run explicit foreground permission-denial/cancel/background/restart/duplicate/filter and evidence-persistence tests on owned/authorized phones and named BLE fixtures. Simulator/export tests cannot close the physical gate.
