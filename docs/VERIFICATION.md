# Verification record

Verified locally on 1 November 2026 using Node 24.22.1, npm 11.9.0, Python 3.12.14 and GCC. Source inspection pinned 28 upstream repositories to exact commits and document blobs. No upstream security-tool firmware binary was executed and no physical hardware was tested.

| Check | Observed result | What it establishes |
| --- | --- | --- |
| npm test | 35/35 Node tests passed plus portable C checks | Framing, independent golden vectors, session lifecycle, JS/native boundary mocks, offline parsers and real C-process interoperability |
| npm run typecheck | Passed | Strict TypeScript checks including application/native JS adapter |
| npm run demo | Passed | TypeScript negotiated identity/capabilities and echoed payload through a compiled C process |
| C ASan/UBSan | Passed with ASAN_OPTIONS=detect_leaks=0 | Address and undefined-behaviour checks including 1,000,000 noise bytes; LeakSanitizer could not inspect processes in this host and was disabled |
| Expo Android/web export | Passed | Android Hermes bundle and web production bundle, not an APK or physical-device execution |
| Expo prebuild/autolinking | Passed | Generated Android project resolves ApexDeviceModule; not native compilation |
| Lockfile inventory | 536 entries recorded | Declared package licences and integrity identifiers, not a selected-file audit |
| Native Android compile | Blocked locally: Android SDK location unavailable | Gradle 9.4.1 and Expo/RN plugins configured; native Kotlin compilation and APK assembly were not reached |
| Browser UI smoke | Not yet verified | Two reproducible Playwright scenarios are included; browser setup is being checked |
| ESP32-S3 cross-build | Not executed locally | ESP-IDF v6.1 target source and CI job supplied; local IDF/toolchain unavailable |
| Phone/accessory/NFC/RF/CAN/industrial hardware | Not executed | No equipment attached; no hardware compatibility or unlocking claim |

Protocol tests cover every two-part split of a maximum 524-byte frame, coalesced data, invalid versions/flags/IDs/lengths, CRC corruption and bounded random input. Session tests exhaust all usable 16-bit request IDs without reuse, exercise errors/timeouts, queue bounds, failed-open cleanup, synchronous and asynchronous write failure, stale events and disconnect rejection. USB mock tests validate the JavaScript adapter only; they do not test Android OS permission or native endpoint behaviour.

The GitHub workflow supplies independent host/UI, Android debug-APK and ESP32-S3 cross-build jobs. Their results must be checked on the actual PR head; merely adding a workflow is not evidence that it ran. No build artefacts are uploaded automatically, avoiding persistent binary storage consumption.

Known limitations: AXP has no authentication/encryption; only system information/capabilities/ping are available. Native USB/NFC source and the S3 entry point require their target builds and physical fixtures. No BLE, RF, SDR, access-control, vehicle or industrial hardware adapter is working yet. AI and persistent capture storage remain planned. CRC and device-reported identity are not security guarantees.

Release gates are defined in ENGINEERING_WORK_PACKAGES.md. A source file, generated project, mock or JavaScript bundle never substitutes for native compilation, flashing or measured equipment behaviour.
