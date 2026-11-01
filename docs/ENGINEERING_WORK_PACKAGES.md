# Engineering work packages

Each package requires a reviewable PR, a reproducible command/test log and explicit residual limitations. Estimates are ordering aids, not delivery promises. Merge only complete, reviewed slices; never mark a hardware package done using simulated results.

| ID | Package and requirements | Dependencies | Deliverable and acceptance | Initial state |
| --- | --- | --- | --- | --- |
| WP01 | Research/PRD intake (F01–F15) | None | 28 immutable repository snapshots, licence observations, architecture, matrix and unresolved questions; machine register validated | Implemented documentation |
| WP02 | AXP/1 protocol (F02) | WP01 | C/TS framing, fixed bounds, CRC reference vector, fragmented/coalesced/corrupt/unknown-version tests and shared golden vectors | Implemented host foundation |
| WP03 | Session manager (F01,F02) | WP02 | Capability/identity negotiation, finite pending limit, timeouts, opcode/ID checks, failed-open cleanup and disconnect rejection | Implemented host foundation |
| WP04 | Portable accessory firmware (F04) | WP02 | Host executable with identity/capabilities/ping and error dispatch; real cross-language tests and sanitizer run | Implemented host foundation |
| WP05 | Expo operator console (F01,F11) | WP03 | Explicit simulator selection, capability view, ping, offline analyses, error states and Android/web JS bundles | Implemented initial UI |
| WP06 | Android local module build (F03) | WP05 | Native module autolinks, generated manifest reviewed, debug APK compiles with pinned toolchain | Source; build gate separate |
| WP07 | Android USB transport (F03) | WP03,WP06 | CDC interface association, OS grant/denial, partial writes, detach events, timeout and reopen tested on named handset | Source; physical validation pending |
| WP08 | ESP32-S3 target (F04) | WP04 | ESP-IDF v6.1 cross-build, UART-only logs, flashed native USB board, recovery and repeated round trips | Source; board validation pending |
| WP09 | NFC metadata reader (F05) | WP06 | Foreground activity lifecycle, unavailable/disabled hardware states, two tag technologies, NDEF summaries and stop/restart on a real phone | Source; physical validation pending |
| WP10 | Device/fixture registry (F01,F14) | WP03 | Persistent versioned board/driver/fixture inventory, attestation separate from claimed identity, migration tests | Planned |
| WP11 | Evidence vault (F13) | WP10 | Encrypted local captures, UTC/monotonic provenance, SHA-256 content identity, retention and export/reimport verifier | Planned |
| WP12 | BLE byte transport (F02,F07) | WP03,WP06 | MTU/fragmentation, permissions, GATT identity, backpressure, disconnect storms and foreground/background behaviour on two devices | Planned |
| WP13 | IR receive module (F08) | WP08 | Hardware pulse timestamps, bounded buffer/drop counters and standard NEC corpus matched to logic-analyser captures | Offline decoder only |
| WP14 | IR appliance operation (F08) | WP13 | Known appliance, reviewed LED driver/current, deliberate command and observed state-change evidence | Planned |
| WP15 | Sensor Sub-GHz receive (F06) | WP08,WP11 | Band-matched CC1101, RadioLib intake/licensing, owned sensor corpus, measured receive and noise rejection | Planned |
| WP16 | Specialist RFID adapters (F05) | WP10,WP11 | Bounded version/identity/trace operations for one Proxmark or Chameleon firmware; fixtures and licence intake per adapter | Planned |
| WP17 | NDEF/application NFC (F05) | WP09,WP11 | Validated record parsing and permitted read/write on owned tags; phone/tag support matrix; no unsupported secure data claims | Planned |
| WP18 | Meshtastic adapter (F06) | WP12 or WP07 | Current PhoneAPI/protobuf integration, version checks, owned node telemetry, reconnect and bounded queue tests | Planned |
| WP19 | SDR sidecar (F06) | WP11 | Local authenticated bounded RPC, HackRF/SoapySDR intake, receive-only bounded capture, throughput/drop/format evidence | Planned |
| WP20 | Capture interchange (F11,F13) | WP19 | SigMF-compatible export, independent import, sample/frequency metadata validation and file integrity | Planned |
| WP21 | CAN bench adapter (F09) | WP11 | Isolated interface, virtual CAN corpus, listen-only hardware baseline, clock/error metadata and known signal maps | Offline classic-log parser only |
| WP22 | Industrial simulator adapters (F10) | WP11 | Local Modbus and BACnet fixtures, bounded read operations, malformed response tests and no subnet scanning | Planned |
| WP23 | OSDP access bench (F10) | WP08,WP11 | Isolated RS-485 controller/reader, valid secure-channel commissioning, per-operation proof and key-handling design | Planned |
| WP24 | Embedded diagnostic modules (F14) | WP08,WP10 | Per-board bus/resource/voltage manifests, probe/stop lifecycle, conflicts rejected and external equipment protections verified | Planned |
| WP25 | Wi-Fi application integrations (F07) | WP06,WP10 | OS inventory with result age and permission handling, then authenticated known-device API fixtures | Planned |
| WP26 | Analysis workbench (F11) | WP11,WP20 | Typed observations, deterministic decoder registry, input provenance and independent interpretation fixtures | NEC/CAN subset implemented |
| WP27 | AI hypothesis provider (F12) | WP26 | Explicit input selection, structured output, source-ID validation, prompt-injection tests and benchmarked abstention/false-positive rates | Planned |
| WP28 | Accessory trust and update (F15) | WP08,WP10 | Threat model, device authentication, signed manifests/firmware, board checks, rollback/recovery and independent negative tests | Planned |
| WP29 | Field release qualification | WP07–WP28 as included | Complete actual feature matrix, physical regressions, electrical/region/distribution checks, notices and reproducible release artefacts | Planned |

## Immediate delivery order

Review the research PR first and the implementation PR second. Run the documented clean install, protocol/firmware tests, TypeScript checks, Expo exports and native/IDF build jobs. Source-only packages remain explicitly open if the target SDK/toolchain or hardware is unavailable.

Next hardware sequence: WP06–WP09 together, because a compiled phone app, a flashed board and a measured cable round trip are all required for a physical claim. Then WP11 and WP13–WP16 provide useful real interoperability before broadening into more systems. AI integration follows a useful recording/analysis substrate.

## Review gates

Protocol changes require C/TS conformance fixtures and version compatibility notes. New dependencies require selected-file licence and transitive inventory updates. New physical drivers require a named fixture and measured evidence. New state-changing operations require target authority, explicit effects, bounded execution, acknowledgement semantics and physical verification; no automatic raw-command forwarding. Hardware identity claimed by an accessory is not trusted attestation.

An error, timeout, unavailable capability or unbuilt target is a legitimate result. Avoid replacing it with demonstration data. Simulator, host process, emulator and physical hardware evidence must remain distinct in code, UI, PR text and release notes.
