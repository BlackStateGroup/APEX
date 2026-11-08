# Full product vision

## 1. Identity and purpose

APEX is the **Universal Master Key** project: one coherent mobile workspace that coordinates a growing set of electronic instruments, research tools, verified integrations and specialist recovery workflows. It should help Black State understand and interact with supported electronic systems, including cases where ordinary methods fail. It is not meant to stop at a generic diagnostics dashboard, a source catalogue or an isolated parser demonstration.

The owner's original instruction spans access control, vehicle electronics, NFC/RFID, Sub-GHz, SDR, Bluetooth, Wi-Fi, infrared, embedded hardware, industrial systems and AI-assisted protocol analysis. The specialist-security and emergency-recovery purpose is explicit. The ambition should remain visible as these domains develop in stages.

**What “universal” means as an engineering programme:** progressively broader supported devices, protocols, interfaces and verified operations in a common workspace. It cannot honestly mean automatic access to every protected system. Cryptographic credentials, enrollment, secure elements, rolling state, physical access, radios, OS APIs and system-specific recovery paths remain real constraints. A newly recognized protocol is useful progress but is not proof of access, authentication or successful physical action.

Sources: [full brief](conversations/implementation.md), [original ambition](conversations/origin.md), [specialist recovery discussion](conversations/capabilities.md).

## 2. User and operational needs

- The owner uses an iPhone. Both iPhone and Android must be supported from the outset of product acceptance; unequal OS capabilities should be shown honestly rather than hidden behind a shared UI.
- A specialist operator needs to know what equipment is connected, what it can actually do, what target and conditions a procedure supports, why the result is believed and what to try next.
- A researcher needs original source, captures, hypotheses, reproducible experiments, failed attempts and a route from discovery to a tested adapter.
- An engineer needs stable protocols, bounded interfaces, deterministic tests and enough history to continue without repeatedly asking the owner to restate the vision.
- A field case needs local/offline operation, useful diagnostics, instrument coordination, reliable cancellation, evidence retention and a verified outcome. Cloud processing should be optional and explicit.

## 3. Product layers

The original assistant proposed **APEX Mobile**, **APEX Core** and **APEX Intelligence**. These are useful architecture names, not separately accepted commercial products or permanent brands.

### APEX Mobile: the command centre

A cross-platform case and instrument workspace: discovery, connection, capability selection, capture review, signal visualisation, device inventory, research notes, supported controls, evidence, reports and explicit recovery workflows. It should remain usable without a remote AI service. Unsupported features must tell the operator which API, accessory, build or evidence is missing.

### Instruments and APEX Core

A compact modular accessory can extend a phone with physical interfaces it lacks. Existing Flipper/DIY hardware, RFID instruments, SDRs, LoRa devices and electrical adapters should also be connectable through their own native protocols. A custom APEX core is one supported instrument, not a mandatory replacement for every existing tool. The initial ESP32-S3 choice is a development direction, not proof that one board can cover all radio, RFID and timing needs.

### Analysis and research engine

The recommended shared Rust engine should own bounded parsing, data models, deterministic analysis, provenance and selected orchestration. Mature C/C++ components may provide drivers or DSP when their quality, performance, portability and licence justify reuse. Native Swift/Kotlin bridges retain OS-specific responsibilities. REA and heavyweight reverse-engineering engines belong in a desktop/private-worker service with a clear job contract, not inside the phone UI bundle by assumption.

### Intelligence

AI should help compare captures, explain known formats, propose testable protocol hypotheses, connect findings and assist reporting. It must reference evidence and distinguish uncertainty from verified decoding. It does not gain a transport handle or automatic authority to run arbitrary commands. Camera-assisted electronics inspection, datasheet assistance and local models were assistant proposals; their evaluation, datasets and privacy handling remain future work.

## 4. Complete workflows

### Research to capability

Choose a concrete question → preserve target/source identity and permitted scope → inspect source/firmware/captures → record a falsifiable hypothesis → run a controlled experiment → compare independent evidence → implement a bounded adapter or decoder → run regression and physical acceptance → publish a precise capability entry.

A successful source checkout or tool installation is only an input to this workflow. Research must be judged by useful, reproducible findings and working integrations, including recorded negative results.

### Specialist access and recovery

Create case and establish the target → identify hardware/firmware and failure conditions → connect appropriate instruments → collect evidence → distinguish power, wiring, protocol, configuration and credential problems → show supported recovery options with prerequisites → perform an explicitly supported intervention → independently verify the outcome → retain the result and limits.

The catalogue should say which system/revision, hardware, credentials or enrollment, method, conditions and failure modes are supported. A command acknowledgment alone does not establish that a lock opened, an engine started or a process recovered. No bypass procedure is implied by this architecture.

### Signal and protocol investigation

Import or explicitly acquire a bounded recording → preserve the original bytes and producer claims → select a deterministic analysis → compare time/frequency/event views → create candidate field interpretations → test against held-out captures → document uncertainty → integrate a verified decoder. High-rate acquisition belongs near the instrument, not as JSON over BLE.

### Connected instrument work

Select an adapter → request OS permission if needed → identify protocol/version/capabilities → reserve resources → expose only supported operations → handle cancellation, disconnect and late callbacks → preserve evidence → close with explicit ownership/release semantics. AXP is APEX's protocol; it is not the Flipper, Meshtastic or Chameleon protocol.

### Wi-Fi/Pwnagotchi

The owner explicitly requested this function. A concrete starting point is a pinned, version-specific status and owned-log/capture-import connector with evidence suitability and result reporting. Authorized password-strength/recovery research remains a separate scoped workstation job; capture alone does not imply a recovered secret. The intended fork, device, version and management channel are unresolved. The current build contains no working Pwnagotchi connector.

## 5. Capability spectrum

| Domain | Intended outcome | Required physical/software path | Present evidence boundary |
| --- | --- | --- | --- |
| NFC / RFID | Supported tag inspection, interoperable readers and authorized access workflows | Phone public NFC APIs for supported modes; specialist HF/LF hardware for others | Selected NDEF and static/offline analysis exist; arbitrary tag emulation, secret extraction and live specialist adapters do not |
| BLE | Observations, supported sensor interpretation, device connections and controlled accessory operation | OS BLE APIs plus per-device protocol adapters | Host-verified lifecycle and installed-JS tests; no current physical acceptance |
| Sub-GHz | Receive, classify and support specific sensor/control protocols with permitted hardware | Tuned radio/front end, antenna, firmware and protocol fixtures | Source corpus and offline analysis; no live receiver integration accepted |
| SDR | Record, inspect spectrum/time-frequency data and develop decoders | HackRF/other supported SDR and often a host/sidecar | Bounded I/Q analysis and original C8 converter; no live RF acquisition |
| IR | Capture, organise and use supported remote commands | IR receiver/transmitter accessory or supported handset hardware | Bounded IR/NEC offline inspection; no physical transmit/replay acceptance |
| Wi-Fi | Network assessment, supported device management and scoped recovery/strength workflows | OS-supported APIs, specialist device or host adapter | Pwnagotchi request recorded; exact upstream and implementation absent |
| Vehicle electronics | Diagnostics, owned-bench traffic analysis and supported recovery integration | CAN/OBD interfaces, vendor definitions and controlled bench | Classic CAN offline interpretation; no accepted ECU/immobilizer control |
| Embedded interfaces | UART, GPIO, I²C/SPI and firmware investigation | Electrical adapter, voltage/level safety and timing-local firmware | AXP C/TS foundation and Android CDC source; no broad hardware bridge |
| Industrial / buildings | Diagnose and interoperate with configured Modbus/BACnet/OSDP systems | Isolated simulators, RS-485/CAN/network instruments, device maps | Restored research sources; no live industrial adapter |
| Access control | Verified system-specific diagnosis and emergency recovery catalogue | Supported credentials/controllers/readers, correct target and test bench | Product direction; no universal opening capability established |
| Off-grid mesh | Supported Meshtastic status/telemetry and later scoped team workflows | Correct LoRa hardware and protobuf adapter | Source restored, schema dependency absent; no connector |
| REA / AI | Active reverse engineering, testable protocol hypotheses and implementation support | REA plus licensed engines, reproducible artifacts and reviewed outputs | ELF/objdump steps and import contract; full decompilation and persistent worker unaccepted |

These categories are a current authored synthesis of the explicit brief and recovered proposals. They are **not** a reconstruction of the unavailable original 12-module widget.

## 6. Product quality and success

Measure supported device-operation combinations, reproducible results, reconnect/cancel behavior, evidence completeness, latency distribution, CPU/memory/thermal cost, power and ease of use on real iPhone and Android. Include false interpretations and unsupported cases, not only successful examples. Count source roots, lines of code and tests as engineering measures, not product coverage.

The owner prioritizes the best outcome over the fastest superficial delivery. That supports careful native architecture, real benchmarks, complete research and physical acceptance. It does not justify a rewrite without parity evidence or an indefinitely expanding document set instead of working capability.

## 7. Scope not silently adopted

Free/pro tiers, enterprise packaging, subscriptions and accessory sales were assistant business ideas, not commitments. Wi-Fi Pineapple and Marauder were mentioned as alternatives, not explicit acquisition instructions. Unrelated eGPU or building-sensing conversations are not APEX requirements. Three unnamed source suggestions stay unresolved. A new radio, provider, account or live target requires its own concrete integration scope; a broad ambition is not a verified hardware capability.
