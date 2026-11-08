# Functional feature rollout: Flipper and the wider instrument ecosystem

The owner explicitly confirmed the product should include the features of Flipper and similar devices. APEX should eventually expose useful supported **functions**, not merely list the devices or show their battery level. Initial read-only adapters are a reliable connection milestone, not the final product definition.

Do not copy an upstream feature list into APEX's supported list. Each feature needs the correct physical interface, device firmware/API, licence/provenance, implementation, testing and permitted target. A smartphone does not acquire a missing antenna, NFC mode, voltage level or authentication credential by changing its programming language.

## Feature groups and progression

| Feature group | Intended useful function | Phone role | Instrument / prerequisites | Current gap and acceptance |
| --- | --- | --- | --- | --- |
| Instrument management | Connect, identify, configure supported options, manage sessions and firmware compatibility | Unified workflow and clear capability negotiation | Flipper/DIY or named specialist device, exact protocol/version | Live connectors not yet accepted; begin identity/status, then implement explicit supported controls |
| NFC/HF RFID | Read supported public/application data, organise records, write supported writable tags and integrate supported reader workflows | Native public NFC APIs where permitted, evidence/UI | External reader for unsupported modes; correct tags/credentials | Current selected NDEF/offline work is not broad reader/writer parity; per-mode phone and accessory tests required |
| LF RFID / contact interfaces | Identify supported tags and interoperate with configured supported systems | Catalogue/workflow | Correct LF front end/antenna or contact interface; exact protocol | No broad live adapter; phone NFC is not an LF replacement; authenticated access separate |
| Infrared | Learn/capture remote commands, organise device controls and operate supported appliances | Remote UI, workflow and capture library | IR receiver/transmitter or supported handset, timing/carrier definition | Offline IR parsing exists; physical capture and controlled transmit acceptance remain |
| Sub-GHz | Receive/decode compatible devices, analyse recordings and later operate supported equipment | Signal views, known-device workflows and evidence | Correct transceiver, tuned antenna, firmware and region/frequency limits | No accepted live radio module; receive-first milestone followed by separately tested supported operations |
| SDR | Live/recorded spectrum and time-frequency analysis, capture management, selected decoders | Bounded analysis/visualisation or native processing | HackRF/SDR and high-throughput host/adapter | Offline math/C8 prototype exists; real data import/live acquisition/decoder validation remain |
| Bluetooth | Device discovery, supported telemetry and device-specific controls | OS API integration, cases and control UI | Supported BLE peripheral/protocol, authentication if required | Strong host lifecycle groundwork, no current physical acceptance or broad vendor controls |
| Wi-Fi instruments | Device management, scoped assessment/capture imports, findings and supported recovery workflows | Case management and result review | Pwnagotchi or other selected instrument, exact supported management API and permitted network | Pwnagotchi absent from corpus; first status/import, then specifically scoped functions; no universal password claim |
| GPIO / UART / I²C / SPI | Inspect and communicate with development boards, sensor modules and supported electrical systems | Console, decoded views and workflows | Correct adapter/levels/power/timing and device map | General electrical bridge not delivered; board safety and timing remain instrument responsibilities |
| USB | Connect selected serial/instrument interfaces and exchange supported bounded commands | Native permission/lifecycle/UI | Android-compatible devices, supported iPhone accessory path separately | Conservative Android CDC source only; no implied iPhone USB or arbitrary driver support |
| CAN / vehicle diagnostics | Read diagnostic data, interpret traffic and support specific permitted service/recovery workflows | Diagnostics and evidence | CAN/OBD instrument, vendor definitions, isolated bench initially | Offline classic CAN only; no generic ECU/immobilizer control |
| Industrial / access control | Monitor, diagnose and execute supported configured workflows | Case/UI and integration orchestration | Modbus/BACnet/OSDP instruments/maps/keys and controlled bench | Sources only; live read/control/recovery each need separate acceptance |
| Mesh / off-grid | Status, telemetry and later supported messaging/configuration | Team/device workflow | Correct LoRa/Meshtastic device and protobuf version | Schema and connector missing; AXP/CC1101 cannot substitute |
| Research tooling | Firmware/software investigation and evidence-backed capability development | Job selection, result review and capture comparison | REA and selected analysis engines/host | Full engine, persistence and app-worker integration unfinished |
| Automation | Compose verified instrument operations into explicit reproducible workflows | Workflow editor/state/evidence | Only supported operation contracts with preconditions and cancellation | Proposed future capability; not arbitrary upstream command execution or AI-directed device actions |

This table preserves the functional ambition without promising every upstream mode or security-sensitive feature. Individual capabilities remain version-specific and subject to the applicable technical, legal and operational requirements. Security mechanisms are not bypassed merely because a tool can decode a signal. Unrequested credential theft, disruption or unsafe actuation is not implied by feature parity.

## Four integration levels for each instrument

1. **Connect and identify:** exact transport/protocol/version, status and reliable lifecycle. This proves only the connection layer.
2. **Observe and import:** real reads/captures/telemetry and preserved source evidence, with bounds and actual hardware tests.
3. **Use supported functions:** meaningful device-specific operations, including supported configuration/control where appropriate, with explicit target, preconditions, authorization, acknowledgement and independent outcome verification.
4. **Compose a complete case:** multiple instruments, analysis, supported recovery/operation, reporting, repeatability and failure recovery.

Do not label level 1 as completion of levels 2–4. Do not postpone every useful function indefinitely behind a generic platform rewrite. Build one complete supported feature path at a time, then expand coverage.
