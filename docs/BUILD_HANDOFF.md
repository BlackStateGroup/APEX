# Foundation handoff

Review order: research PR #1 into main, then the platform foundation PR into the updated baseline after its outstanding checks are resolved. The implementation PR is intentionally separate and remains draft while native/hardware acceptance is incomplete. Do not merge merely because portable host tests are green.

Reproduce with Node 24: `npm ci`, `npm test`, `npm run typecheck`, `npm run demo`, `npm run build`, `npm run inventory:check`. Browser tests require a compatible installed Chromium through Playwright. The C build requires GCC and Python 3. The host's LeakSanitizer process restriction is documented in VERIFICATION.md; do not mistake that restriction for completed leak analysis.

Native Android: `npx expo prebuild --platform android --no-install`, then `cd android` and `./gradlew :apex-device:compileDebugKotlin :app:assembleDebug -PreactNativeArchitectures=arm64-v8a`. Use the actual installed JDK/SDK supported by the generated Expo 58 project. Generated Android files are ignored; the local module under modules/apex-device/android is committed and autolinked.

Accessory: ESP-IDF v6.1, `idf.py -C firmware/esp32s3 set-target esp32s3 build`. Do not infer a successful flash from the host executable. Board USB Serial/JTAG, phone host mode, CDC interface layout, denied/granted permission, detach during requests, lifecycle/suspend and foreground NFC need named physical fixtures.

Immediate next work: complete WP06–WP09 target builds and bench tests, then durable evidence storage and the first IR receive fixture. Remaining RF/RFID/SDR/BLE/Wi-Fi/vehicle/industrial/access and AI work is itemised in the engineering work packages. No credentials, physical targets, regional radio settings or downstream authorisation can be inferred from this repository alone.
