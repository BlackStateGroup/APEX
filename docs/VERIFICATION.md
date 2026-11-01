# Verification record

## Platform foundation baseline (PR #2)

Verified locally on 1 November 2026 using Node 24.22.1, npm 11.9.0, Python 3.12.14 and GCC. Source inspection pinned 28 upstream repositories to exact commits and document blobs. No upstream security-tool firmware binary was executed and no physical hardware was tested.

| Check | Observed result | What it establishes |
| --- | --- | --- |
| npm test | 42/42 Node tests passed plus portable C checks | Framing, independent golden vectors, session lifecycle, JS/native boundary mocks, offline parsers, real C-process interoperability and provider validation/timeout |
| npm run typecheck | Passed | Strict TypeScript checks including application/native JS adapter |
| npm run demo | Passed | TypeScript negotiated identity/capabilities and echoed payload through a compiled C process |
| C ASan/UBSan | Passed with ASAN_OPTIONS=detect_leaks=0 | Address and undefined-behaviour checks including 1,000,000 noise bytes; LeakSanitizer could not inspect processes in this host and was disabled |
| Expo Android/web export | Passed | Android Hermes bundle and web production bundle, not an APK or physical-device execution |
| Expo prebuild/autolinking | Passed | Generated Android project resolves ApexDeviceModule; not native compilation |
| Lockfile inventory | 536 entries recorded | Declared package licences and integrity identifiers, not a selected-file audit |
| Native Android compile / debug APK | Passed in GitHub CI | ApexDeviceModule compiled and app:assembleDebug succeeded for arm64-v8a; no phone execution; local SDK unavailable |
| Browser UI smoke | Both scenarios passed in GitHub CI; also exercised locally with Chromium 153 | Simulator connect/ping/disconnect, native-unavailable states, NEC/CAN analyses, malformed input, research tab and phone viewport |
| ESP32-S3 cross-build | Passed in GitHub CI with ESP-IDF v6.1 | Built apex_accessory.bin (175,568 bytes); not flashed or hardware-tested |
| Phone/accessory/NFC/RF/CAN/industrial hardware | Not executed | No equipment attached; no hardware compatibility or unlocking claim |

Protocol tests cover every two-part split of a maximum 524-byte frame, coalesced data, invalid versions/flags/IDs/lengths, CRC corruption and bounded random input. Session tests exhaust all usable 16-bit request IDs without reuse, exercise errors/timeouts, queue bounds, failed-open cleanup, synchronous and asynchronous write failure, stale events and disconnect rejection. USB mock tests validate the JavaScript adapter only; they do not test Android OS permission or native endpoint behaviour.

The [first GitHub workflow run](https://github.com/BlackStateGroup/APEX/actions/runs/41286056964) validates source commit 72f43149354984cef407d3ea3c7ea396254005aa: all three jobs passed, including native Android debug APK assembly and the ESP32-S3 cross-build. The host CI sanitizer command also passed without the local LeakSanitizer workaround.

The [final source workflow](https://github.com/BlackStateGroup/APEX/actions/runs/41286965388) passed all three jobs on b7048a8694efeff27cc18a1daf6053b36ef5152e: 42 Node tests, C/sanitizer checks, strict TypeScript, both browser scenarios, production exports, inventory verification, native module compilation and the digest-pinned ESP32-S3 build. The native module, Android configuration, dependency lockfile and firmware source are unchanged from the full APK build. Later changes only record documentation and research evidence. Machine-readable results are in [verification.json](../research/verification.json).

The baseline PR workflow ran host/browser checks, native module compilation and the digest-pinned ESP32-S3 cross-build. Its explicit workflow_dispatch run assembled the full Android debug APK. PR #4 additionally assembles the full Android app and unsigned iOS Simulator target on pull requests. Documentation/research-only changes are excluded from repeated compilation; evidence cites the actual tested source commit. No build artefacts are uploaded automatically, avoiding persistent binary storage consumption.

Known limitations: AXP has no authentication/encryption; only system information/capabilities/ping are available. Native USB/NFC and the S3 entry point have target build evidence but require physical fixtures. No BLE, RF, SDR, access-control, vehicle or industrial hardware adapter is working yet. The AI provider contract/validator is tested; no model, provider endpoint or AI UI is connected. Persistent capture storage remains planned. CRC and device-reported identity are not security guarantees.

Release gates are defined in ENGINEERING_WORK_PACKAGES.md. A source file, generated project, mock or JavaScript bundle never substitutes for native compilation, flashing or measured equipment behaviour.

## Accessory workbench (PR #4)

The workbench adds native NFC/BLE integrations on iPhone and Android, an ESP32-S3 BLE peer, and persistent local evidence. This supersedes the baseline's planned BLE/persistence status; physical hardware remains untested.

Locally verified: 54 Node tests plus portable C checks; strict TypeScript; iOS/Android/web bundle exports; three browser scenarios run separately with Chromium 153, including evidence save/reload/digest verification and source search. A maximum 512-byte payload traverses an MTU-23 GATT test bridge to the compiled C peer and back. This is a transport test, not radio evidence. Real SQLite reopen, duplicate-insert preservation and digest mismatch tests pass. The lockfile inventory contains 541 dependency entries. iOS prebuild generated the expected NFC entitlements and Bluetooth usage string.

Address/undefined-behaviour checks pass locally with ASAN_OPTIONS=detect_leaks=0. This host's LeakSanitizer cannot inspect /proc tasks; the unmodified sanitizer command is separately run in GitHub CI.

Native compilation is tracked against source 904ca433f6567bc11439623c04c0200ef65c3dda in [workbench CI](https://github.com/BlackStateGroup/APEX/actions/runs/41300944586). All four jobs passed: host/browser, ESP32-S3, unsigned iOS Simulator and complete arm64-v8a Android debug APK assembly including native NFC/BLE dependencies. Host CI passed all 54 Node tests, all three browser scenarios, production exports, inventory verification and the unmodified C sanitizer checks. The Android job is 124831531389.

The iOS job uses macOS 26 and Xcode 26.6. Earlier attempts with Xcode 16.4 and 26.2 failed inside Expo tooling, below the SDK-supported toolchain requirement; neither failure is hidden. The successful iOS job is 124831531413. The BLE-enabled ESP32-S3 image is 458,336 bytes and fits the 1 MiB app partition. No binary was flashed and no phone was attached. Exact results are in [workbench-verification.json](../research/workbench-verification.json); physical acceptance steps are in [BENCH_ACCEPTANCE.md](BENCH_ACCEPTANCE.md).
