# Ninth combined local checkpoint

Final code revision: 3363cb4. Includes the exact rational candidate Analysis workbench, strict stored-envelope duplicate-key refusal, source-specific service-data matching preparation, independent arithmetic oracle and reviewed NFC lease/cancellation repairs. Local and unpushed.

Completed final checks with CI=1, EXPO_OFFLINE=1, EXPO_NO_TELEMETRY=1, npm_config_offline=true, npm_config_update_notifier=false, npm_config_audit=false and npm_config_fund=false, using existing approved dependencies and direct local binaries:

- 393/393 Node host tests at concurrency 2, plus portable C checks.
- 22/22 Python source-archive tests and 5/5 REA preflight tests.
- Full semantic TypeScript and unchanged 541-entry dependency inventory.
- Offline Expo iOS, Android and web JavaScript exports.
- 22 authored Playwright scenarios discovered; zero executed.
- Independent Python exact arithmetic matched 2,400 synthetic rows across 1,200 datasets; scripts and result retained separately.

The earlier in-progress aggregate before NFC/service-data integration passed 360 tests and is retained as host-tests-before-nfc.txt, not confused with the final run. NFC's separate worker npm aggregate was interrupted for a reported registry access attempt and is not a pass. Its partial log is retained under verification/nfc-lifecycle/. That worker did not retry the operation. The final main checks above used established explicit offline safeguards, existing dependencies and local binaries; they completed successfully. No dependency or lockfile changes occurred.

Independent review reproduced the initial NFC restart-after-close/pending-unregister defect. The final correction keeps ownership until native operations settle and passed the independent 28-test focused review with no blocking finding. Core tests and source review do not establish native bridge event delivery or phone compatibility. iOS missing closure/pending native operations remain stopping rather than claiming success. Metadata payload scope and OS permission requests are unchanged.

The service-data matcher is preparation only: current native collection still uses advertised-UUID filtering and can miss service-data-only BTHome. No broad scan was wired. No actual BLE/NFC activity, native build, device, firmware flash, provider/account connection, OS setting or permission change, upload or remote publication occurred. Browser execution and native/physical acceptance remain open. Source pins and backup identities are unchanged. No signing, confidentiality or transmitter authenticity follows from local evidence digests.
