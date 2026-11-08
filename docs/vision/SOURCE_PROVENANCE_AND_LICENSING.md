# Source acquisition, reuse and licensing

## 1. What was actually preserved

The independent 8 November 2026 restoration review recovered **all 31 registered root repositories** at their exact manifest commits. All **32 archive parts**, totalling **1,986,961,997 bytes**, matched their recorded SHA-256 hashes. The restored roots contain **164,492 tracked entries**, clean worktrees and the recorded licence paths. The two Mayhem firmware archive parts were joined and verified before extraction.

The actual recovery was into an isolated research corpus, outside the active application checkout. This documentation commit carries portable receipts and a complete inventory, not another 1.99 GB source copy. The original archive identities remain in `research/source-imports.json`; the source bodies are available through the preserved archives and restored research corpus. That distinction must remain visible when handing off only the lightweight repository patch.

The roots include **63 unmaterialized Git submodule entries**: the original 58 plus REA's five providers. Root restoration is not recursive dependency closure. SDKs, npm/Maven packages, Git-LFS objects outside the snapshots, proprietary engines and device firmware remain separate acquisitions. Recovery executed no upstream scripts, built no upstream project and operated no hardware.

Evidence: [full inventory](sources/INVENTORY.md), [portable receipt](sources/recovery-inventory.json), [original acquisition manifest](../../research/source-imports.json), [original source preservation guide](../../research/SOURCE_COPIES.md).

## 2. Provenance distinctions

Maintain separate records for:

1. **Reference source:** exact upstream repository/commit, selected files, original licence/notices and read-only research finding.
2. **Installed release:** exact package/version, resolved artifact/integrity, actual installed licence and transitive/native components. It need not equal the reference Git pin.
3. **Copied or modified implementation:** original file hashes, copied regions, changes, purpose, author notices, resulting binary and distribution obligations.
4. **Original interoperable implementation:** published format/specification used, independently written code, fixtures and any copied test data. “Original” requires a real provenance record, not a label applied after copying.
5. **External tool/service:** executable/engine versions, invocation contract, licences, artifact inputs/outputs and operational acceptance.
6. **Recordings/datasets:** producer/authority/consent, original versus derived bytes, transformations and data rights. A library's software licence is not the licence for arbitrary captures or private identifiers.

No single top-level licence label resolves all six.

## 3. Current concrete reuse opportunities

| Source | Examined interface | APEX value and next gate |
| --- | --- | --- |
| Expo R14 | `packages/expo-document-picker/src/index.ts`, `packages/expo-file-system/src/File.ts` | Native selected-file access for existing I/Q workbench; choose SDK-compatible releases, bound reads, handle cancellation/stale completion, then signed phone acceptance |
| Mayhem Mobile R29 | `web/src/dsp/capture.ts` | Signed int8 I/Q `.c8` plus `.txt` format; original APEX core/CLI conversion now exists, but no native picker, persistence or real recording acceptance |
| Flipper R01 | `rpc_system.c`, BLE serial service and protobuf submodule | Real version/identity/power/ping adapter; restore exact schema, implement its framing/flow control and test a named device |
| RadioLib R08 | `src/hal/ESP-IDF/EspHal.*`, module drivers, ESP-IDF example | Receive-only accessory candidate using native ESP-IDF HAL; select board/radio/wiring and do not run the transmitting example as a default baseline |
| Android USB serial R13 | CDC, CP21xx, CH34x, FTDI drivers and IO manager | Expand selected Android device support behind existing ownership/permission contracts; verify actual dependency release and hardware |
| Meshtastic R07 | `PhoneAPI.*`, `NimbleBluetooth.cpp` | Separate ToRadio/FromRadio protobuf adapter; missing schema and notification semantics must be resolved, not copied from AXP |
| IRremoteESP8266 R09 | `IRrecv.*`, `IRutils.cpp`, `IRrecvDumpV3` | Receiver-capture import and later physical IR module; clarify timing/carrier/repeat assumptions and LGPL integration |
| rtl_433 R17 | Saved-file input, JSON output and device decoders | Explicit external decoded-event import with source/version/hash/units; bundling a decoder is a separate GPL review |
| PyModbus R23 | Simulator and client/server examples | Isolated deterministic bench fixtures first; vendor register maps required for real systems |
| libosdp R25 | `osdp.h`, CP/PD examples, channel callbacks | Configured RS-485 bench with explicit keys; keep refresh timing near hardware; missing `utils` source remains a gate |
| HackRF R06 | `host/libhackrf/src/hackrf.c` | Desktop receive-only sidecar candidate; selected libhackrf file terms differ from root GPL, libusb duties remain separate |
| ChameleonUltra R05 | Version, chip, battery, model, capability getters | Narrow read-only adapter candidate; no live connector or credential operations inferred |
| REA R31 | CLI/provider architecture, `LICENSE`, `THIRD_PARTY_NOTICES.md` | Active research worker; MIT applies to REA, not every analysis engine; five provider roots are absent |

The table is a prioritized source-mining result, not an assertion that these adapters are installed. [The per-project inventory](sources/INVENTORY.md) covers all remaining sources: DIY hardware trade-offs, Bruce modularization, Proxmark specialist clients, TinyUSB, Zephyr, GNU Radio, SoapySDR, libnfc, CAN utilities, python-can, BACnet, SigMF, URH and libusb.

## 4. Important source-specific corrections

- The original DIY technical notes state the last published build lacks RFID/NFC and has only SPI plus two GPIOs on the external header, with CC1101 working. An early conversation suggestion claimed broader NFC support. Prefer the pinned technical evidence and keep the earlier statement as history, not a capability claim.
- Bruce's `THIRD_PARTY.md` identifies AGPL/GPL/LGPL and separate concerns around proprietary manufacturer material. Study architecture without importing keystores or assuming code licences grant rights to them.
- RadioLib's ESP-IDF HAL is real; Arduino is not required. Timing assumptions include a 1 kHz FreeRTOS tick unless a relaxed timing option is chosen. The example transmits automatically, so a receive-only integration needs an original explicit configuration.
- `usb-serial-for-android` research metadata identifies `3.12.0beta`, while its README install example says `3.11.0`. Pin the intended release instead of treating documentation examples as installed truth.
- Meshtastic's BLE source warns that adding NOTIFY to FromRadio breaks compatibility. A generic BLE service wrapper is insufficient.
- libosdp requires frequent refresh calls, at least every 50 ms. Do not put real-time bus handling on a mobile JS event loop.
- Mayhem Mobile's source includes Android USB and WebUSB paths, not an iPhone Safari WebUSB capability. Its README itself leaves some decoder validation open.
- Pwnagotchi is an explicit user request but is absent from the 31-root manifest. Resolve the intended repository/fork/version before acquisition; no name or pin was invented.
- Three earlier suggested repositories are still unnamed. The original text preserves only their descriptions. Adjacent projects are not substitutes for the missing identities.

## 5. Licence position and release gates

APEX original source remains private/all-rights-reserved pending the owner's decision. Keeping research copies private does not erase obligations or authorize copying all upstream code into a private app.

- MIT/BSD/Apache candidates still require notices, selected-file provenance and dependency review. Apache patent/NOTICE provisions and BSD non-endorsement obligations matter.
- GPL/AGPL/LGPL incorporation requires a concrete distribution, source-provision, linking/relinking and app-store assessment. A plugin, sidecar or process boundary is not by itself legal clearance.
- HackRF is a mixed example: root GPL terms coexist with inspected BSD-3-Clause-style libhackrf files; libusb has its own LGPL terms.
- CAN utilities and BACnet contain file-level variation; do not license the entire selected component from a repository API label.
- SigMF specification/schema is CC-BY-SA-4.0. Copying/adapting specification text or schema needs its own analysis; using field conventions in original code is a different action.
- Rust crates and C/C++ libraries selected for the new engine must be inventoried from their actual chosen releases, features and transitive build graph. A language change does not remove old obligations.
- Hardware CAD, firmware, documentation, trademarks, recorded data and secrets require separate treatment.

Before a release: produce per-artifact SBOMs for mobile, accessory, worker and shipped native libraries; reconcile installed licences; retain notices; record modifications; supply source/relinking materials where required; review signing/store packaging and applicable radio/electrical compliance. This document is an engineering record, not a legal opinion.

## 6. Known installed dependency discrepancy

The current app actually depends on **react-native-ble-plx 3.5.1** and **react-native-nfc-manager 4.2.0**. Historical “research only” labels do not describe their current runtime status.

PLX 3.5.1's inspected installed `LICENSE` contains **Apache-2.0**, while its package metadata and lockfile say **MIT**. The licence-file SHA-256 is `f6387df69841a4423411e83f739fd4e4b80dc0622d3da948f67d9606e9d996fe`. This remains unresolved; do not select the more convenient label. NFC manager's installed licence and metadata both identify MIT. Full inspected file hashes and capture corrections are in [CURRENT_DEPENDENCY_AND_CAPTURE_STATUS](LOCAL_CHECKPOINT_REFERENCES.md#ref-3f1e0bb70d61).

## 7. Safe source restoration and future intake

Use the existing restore tool with an explicit new destination, recorded archives and exact manifest. Validate archive-part and combined hashes, safe extraction, Git HEAD and clean worktree. Existing dirty trees must not be overwritten. For a missing submodule, record the parent Git link and `.gitmodules` URL, acquire that exact source only through an approved route, preserve its own receipt and licence, and report missing/broken URLs rather than substituting another repository.

Do not recursively execute setup/build scripts just because root source is present. Do not put the full corpus into Metro, the mobile bundle or production firmware to satisfy the appearance of source inclusion. Keep source research, package dependency adoption and actual shipped code separately auditable.
