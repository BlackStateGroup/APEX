# Current APEX build status

Updated 10 November 2026. This index supersedes older status sentences for the named work only; historical verification remains intact. The complete user-supplied scope is retained in [the build outline](vision/BUILD_OUTLINE_20261110.md). No overall completion percentage is assigned.

## Work available for review

| Review | Concrete result | Acceptance boundary |
| --- | --- | --- |
| [PR #22](https://github.com/BlackStateGroup/APEX/pull/22) | Signed-read S3 laboratory firmware, native verification and Android USB client | Separate branch. Physical S3/phone operation, iPhone transport and production trust still open |
| [PR #24](https://github.com/BlackStateGroup/APEX/pull/24) | Stock Flipper iPhone BLE status workflow and installation profiles | Separate branch. Signing, installation and a real Flipper still needed |
| [PR #26](https://github.com/BlackStateGroup/APEX/pull/26) | Durable cases, source/derived lineage, export/restore, paired observations, bounded learning and reusable profiles | Stacked on #24. Software verification recorded in [case status](CASE_WORKSPACE_STATUS.md); synthetic fixture is not physical accuracy |
| [PR #27](https://github.com/BlackStateGroup/APEX/pull/27) | Full REA/Ghidra decompilation, snapshot restart and reconstructed CRC vector experiment | Independent research branch. See its engine report; no authenticated worker service or third-party target acceptance |
| [PR #23](https://github.com/BlackStateGroup/APEX/pull/23) | Wi-Fi reports and authenticated status companion | Separate branch. Physical phone/Pi acceptance still open |
| [PR #25](https://github.com/BlackStateGroup/APEX/pull/25) | Device intelligence and recovery blueprint | Planning only, not an implemented router integration |

## Requirements to implementation and remaining work

The WP-V identifiers from the existing roadmap remain stable. “Implemented” below refers to the listed software component, never automatic hardware or production acceptance.

| Package | Existing or newly implemented code | Work still required |
| --- | --- | --- |
| WP-V01, preservation | `research/SOURCE_COPIES.md`, `docs/vision/`, full supplied outline retained | Locate the earlier local-only Flipper RPC/clock-extension source and exact verification records. Current workspace and targeted file searches found no recoverable implementation bundle. Three unnamed upstream identities and the exact Pwnagotchi fork remain unresolved |
| WP-V02, lifecycle | Existing BLE/USB ownership and cancellation suites; case/native file single-flight handling added | Repeat on actual iOS/Android versions; retain unknown-cleanup fencing |
| WP-V03, native I/Q files | `src/native-iq-files.ts`, `src/platform/iq-input.native.tsx` | Real phone storage-provider and interruption tests |
| WP-V04, C8 | `packages/core/mayhem-c8-import.ts` | Original recording and actual phone import/analysis acceptance |
| WP-V05, phone acceptance | `eas.json`, native build workflows; Cases in default app and Flipper build | Authorised Apple/Expo signing configuration, iPhone registration, signed distribution and physical device checks. An Apple Developer account alone is not configured signing |
| WP-V06, performance baseline | Reference implementation and Android parity/fallback checks | Actual ARM/Hermes latency, memory, power and thermal measurements |
| WP-V07, mobile Rust | `experimental/rust-iq/` host proof | Mobile ABI, Android/iOS linking, lifecycle audit and measured benefit. Not implemented by this batch |
| WP-V08, C/C++ | `modules/apex-iq/` Android implementation | iOS native integration only with parity and performance evidence; not implemented by this batch |
| WP-V09, Flipper | #24 status workflow; #26 saves a device-reported receipt to cases | Recover/complete protocol 0.25 RPC bridge, shared-manager lease integration, useful capture operations and actual accessory acceptance |
| WP-V10, S3 derivative | #22 signed info/capabilities/ping | Explicit flashing approval, chosen board/cables, key provisioning and physical acceptance |
| WP-V11, receive-only RF | Existing `firmware/` RadioLib work | Chosen radio/board/antenna, known permitted capture and physical reception checks |
| WP-V12, Pwnagotchi | #23 generic Linux status companion | Exact fork/API/device intake. Generic companion reachability is not Pwnagotchi protocol support or password recovery |
| WP-V13, instrument families | Existing NFC/BLE, IR, HCI, I/Q, C8 inspectors | Versioned Meshtastic, Chameleon/Proxmark, specialist USB, IR receiver/control and SDR sidecar integrations remain individual work packages |
| WP-V14, full REA engine | #27 `tools/research-full-engine.mjs` and pinned full-engine CI | Six functions and 260 reconstructed CRC vector results verified in CI and retained in #27. Independent review, broader owned firmware questions and interruption tests remain |
| WP-V15, research worker | Existing local CLI and offline report import | Authenticated bounded submit/status/cancel/result API, durable jobs, deployment, restart uncertainty and phone connection. Not implemented |
| WP-V16, recovery entry | Case source/result lineage can retain a complete record | One exact supported device/version/failure, permitted recovery method and observed physical outcome. No universal root/access claim |
| WP-V17, benches | Existing offline CAN parsing | Named isolated CAN/OBD, Modbus/BACnet/OSDP simulators and fixtures before live adapter work |
| WP-V18, durable evidence | #26 `case-store.ts`, SQLite/IndexedDB CAS, original text, DAG parents, duplicate handling, verified export/restore and explicit deletion | Production encryption/key custody, migration from future versions, binary storage above current limits, real-phone durability/fault injection and retention policy |
| WP-V19, learning/AI | #26 paired BLE/ranging replay; deterministic two-class, discovery-only selection with calibration/holdout gates, unknown-class abstention and scoped profile reuse | Independent labelled captures, randomised controls, new phones/sessions, larger candidate families, selected provider/model, explicit cloud disclosure and live provider integration |
| WP-V20, command centre/release | New Cases workspace, journal attachment, Flipper receipt saving, current index | Shared instrument sessions, richer case navigation, production signing/store packaging, SBOM/license closure and release gate |

## Research theories retained

The phone-radio audit, differential and missing-observation sensing, cross-band fusion, indirect effects, aliasing, clock uncertainty, multiband reconstruction, model-specific firmware/CSI and receiver-assisted tracks remain in the outline. This batch implements **paired recorded-observation replay and a small declared-dataset classifier**. It does not obtain new raw handset radio access, reconstruct an unheard waveform, validate the aliasing model physically or prove an RF side channel.

The paired importer records missing observations instead of imputing them. A fixed 50 ms upper bound includes the declared alignment uncertainty and validity window. A session identifier cannot appear in different partitions. Learning selects centres and radii from discovery only; calibration and held-out labels cannot retune them. Required control/sham and unknown examples can prevent publication. Sensor/source/session labels remain operator declarations.

Aliro/Matter, camera/datasheet assistance and the radio-shadow-map proposal remain optional research candidates. APEX Learn remains one component of the wider platform.

## Equipment and release gates

No purchase, deployment, main-branch merge, phone installation, provisioning or flashing has occurred. Next physical inputs are a named iPhone/OS and installed signed build, the selected Flipper or S3/cables, and permitted independent sensor/reference data. Later bands and interfaces require their specific hardware and versioned tests. Source preservation is not recursive dependency or licence closure.
