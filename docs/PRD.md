# APEX product requirements

Version 0.1, 1 November 2026. Product identity: **APEX, Universal Master Key**. Owner: Black State Group. This document specifies the platform; it does not claim the first foundation implements every capability.

## Vision and success

Build the most capable modular electronic interoperability platform possible: one coherent workspace for understanding, connecting, diagnosing and operating supported electronic systems with the user's authority. Preserve the Universal Master Key ambition by expanding the number of verified integrations, supported devices and reproducible workflows. Never substitute an unsupported promise that every door, car or wireless device can be opened or controlled.

The unit of capability is a tested operation on a particular device, firmware revision, transport and environment. RF coverage, protocol recognition, payload interpretation, authentication and successful action are separate facts. Access credentials, rolling counters, secure elements, challenge-response, enrolment, physical interfaces and manufacturer policies remain real constraints. A protocol decoder does not generate cryptographic authority.

Success measures: number of independently reproduced device-operation combinations; successful sessions/attempts with denominators; time to connect a supported accessory; parser and reconnect reliability; evidence completeness; unsupported operations correctly identified. Do not publish a single universal compatibility percentage.

## Users and operating contexts

- Owner/operator: assemble a personal toolkit, see exactly what each attached module supports, retain local evidence and run permitted actions.
- Embedded engineer: implement and test a new accessory driver without changing the mobile application or inventing another transport protocol.
- Interoperability/security researcher: analyse owned equipment or explicitly authorised lab fixtures and reproduce results without touching unrelated systems.
- Field technician: inspect equipment identity and diagnostics, with offline operation and clear separation between observation and state changes.

Primary platform: Android phone plus USB accessories. Expo web provides a labelled simulator and offline-analysis console. iOS is a later compatibility target with its own hardware/API restrictions, not assumed parity. A desktop/Linux sidecar handles specialist native clients and high-rate SDR data.

## Product requirements and acceptance

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| F01 | Device and accessory inventory | Identity, firmware/protocol version, transport, advertised operations and evidence level visible; no fabricated hardware status |
| F02 | Unified sessions | Fragmented/coalesced binary frames, bounded queues, CRC corruption, timeouts, disconnect and unknown command cases covered by tests |
| F03 | Native Android integration | Enumerate USB devices; request per-device USB permission; open supported CDC interface; close on detach; foreground NFC tag metadata on real test phone |
| F04 | Modular firmware | Same original portable C dispatcher runs as host process and ESP32-S3 target; board-specific I/O outside protocol core |
| F05 | NFC/RFID | Metadata/NDEF first; external HF/LF adapters later; each tag technology and operation receives a separate compatibility record |
| F06 | Sub-GHz/LoRa/SDR | Explicit front-end, band, antenna, sampling and provenance; no implicit substitution of CC1101, LoRa and wideband SDR |
| F07 | Bluetooth/Wi-Fi | Normal OS discovery and authenticated application interfaces; permissions and OS constraints surfaced; specialist capture hardware is separate |
| F08 | Infrared | Offline NEC fixture decode first; later timed capture and a known appliance control fixture with hardware measurement |
| F09 | Vehicle electronics | Offline CAN trace import first; isolated CAN/OBD diagnostic bench later, with documented signal maps and separate read/write authority |
| F10 | Industrial/access systems | Local Modbus/BACnet/OSDP simulators then isolated hardware fixtures; register/property/secure-channel details recorded |
| F11 | Protocol analysis | Observations, derived hypotheses and verified interpretations separated; every derived result references its input and analysis version |
| F12 | AI assistance | Optional provider abstraction with explicit data export, schema-validated hypotheses and offline fallback; no direct hardware execution from model output |
| F13 | Evidence | Session source is simulator, host firmware or physical hardware; retained artefacts include timestamps, hashes and capability versions |
| F14 | Extensibility | New adapter supplies a manifest, transport mapping, licence inventory and tests; unimplemented operations are unavailable |
| F15 | Updates | Later signed firmware bundles, board/bootloader compatibility, recovery path and rollback policy verified before remote updates |

## First delivery and release boundaries

Foundation milestone M0: comprehensive research/design pack; original bounded wire protocol in TypeScript and C; host-compiled firmware with real process-level interoperability tests; Expo console with explicit simulator state and offline NEC/CAN analysis; native Android module source for USB and NFC; ESP32-S3 target source. This milestone is complete only with recorded automated results and an honest list of unexecuted hardware/build checks.

M1: native Android compilation and on-device USB permission, CDC round trip, detach/reconnect and NFC tests; flashed S3 target; measured timing and power evidence. M2: IR and sensor radio receive fixtures plus a specialist RFID adapter. M3: BLE, normal Wi-Fi application integrations, Meshtastic and desktop SDR receive sidecar. M4: isolated CAN, Modbus, BACnet and access-control benches. M5: reviewed AI hypothesis assistance and a larger verified device catalogue.

M0 does not imply M1 hardware acceptance. Keep code under review on feature branches; no automatic merge, deployment, flashing or publication.

## Functional workflows

Connect: select a simulator or a supported attached USB device, obtain OS permission if needed, start the transport, request identity and capabilities, then expose only the intersection supported by the host and device. Any failed negotiation closes the session. A simulator cannot silently stand in for a disconnected physical accessory.

Inspect: select an available observation, show its source and timestamp, run the request, display the result and any limitation. Results from synthetic fixtures remain labelled synthetic. A failed read never becomes a successful action.

Analyse: import a bounded local recording, select its format, validate size and shape, run deterministic decoders, and preserve the input identity with results. AI later proposes a labelled hypothesis referencing observation IDs; the operator checks that hypothesis against independent fixtures before promoting compatibility.

Operate: a later state-changing adapter must declare target identity, effect, authorisation, preconditions, physical bounds, timeout, acknowledgement semantics and recovery. A transport acknowledgement is not proof that a door opened or an actuator moved. There is no generic raw-command execution endpoint in M0.

## Non-functional requirements

Operate without a cloud account. No telemetry or automatic capture upload in M0. Control frames are at most 524 bytes, with a 512-byte payload; initial firmware requires no heap allocation. Mobile sessions bound concurrent requests, timeout every request and invalidate work after disconnect. IQ samples use files/shared buffers on the sidecar, not JSON over the mobile bridge.

Design target, not yet measured: a small control request returns within 500 ms on a wired local accessory under normal load; host timeout defaults to 2 seconds and is configurable within bounds. Measure p50/p95/p99 on real hardware before setting a release SLO. Memory, power and latency budgets are recorded per board, not inferred from a desktop run.

Maintain accessibility labels and readable contrast. Show unsupported hardware and permission failures as actionable states. Local source manifests and imports require validation. Binary parsing, malformed data, repeated connection cycles and asynchronous teardown receive higher test priority than cosmetic UI snapshots.

## Explicit technical/security boundaries

Authorised testing includes owned tags, lab readers, appliance fixtures, disconnected ECU benches and local industrial simulators. This foundation does not include credential theft, key recovery, rolling-code defeat, immobiliser bypass, wireless disruption, live-system exploitation or AI-directed attack automation. These are not prerequisites for interoperating through supported interfaces.

The modular vision remains broad: additional protocols and hardware belong in the research backlog with specific evidence, licensing and integration work. Unsupported authentication remains unsupported rather than being presented as a missing UI button.

## Decisions, risks and open questions

Decided: Android first, React Native/Expo, a small original C protocol core, ESP32-S3 wired target, specialist sidecars instead of embedding every upstream stack. Original code remains private pending an explicit licensing decision.

Open: actual handset and S3 board revision; accessory power source and enclosure; first real IR appliance/sensor/tag fixtures; allocation of cryptographic identity for accessories; supported desktop OS; future secure storage and evidence retention policy. Progress on host code does not depend on those choices, but hardware acceptance does.

Risks: phone USB power and vendor variation; JNI/Kotlin/Expo version changes; noisy RF front ends; board pin conflicts; security claims exceeding evidence; mixed upstream licences; high-rate data storage; incomplete test fixtures. Mitigations and measurable next steps are in the architecture, hardware strategy and work packages.

## Traceability

See [architecture](ARCHITECTURE.md), [capability matrix](CAPABILITY_MATRIX.md), [hardware strategy](HARDWARE_STRATEGY.md), [research register](RESEARCH_REGISTER.md), [licensing inventory](LICENSING.md), [engineering work packages](ENGINEERING_WORK_PACKAGES.md), [wire protocol](DEVICE_PROTOCOL.md), and [verification](VERIFICATION.md). Tests and build results are engineering evidence; planned tables are not implementation evidence.
