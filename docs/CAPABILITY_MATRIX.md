# Capability matrix

This table separates the product roadmap from the foundation. **Host** means automated execution on this workstation, **source** means implementation awaiting the relevant native/board build and physical test, and **planned** means no working APEX adapter. The final evidence record in VERIFICATION.md takes precedence over an intended milestone.

| Domain | Protocols/operations | Phone alone | Accessory/host route | Foundation | Required proof / restriction |
| --- | --- | --- | --- | --- | --- |
| Device control plane | AXP/1 identity, capabilities, ping | Simulator | USB CDC; host C executable | Host | Corruption, fragmentation, timeouts and C/TS round trips; no device authentication yet |
| Android USB | Inventory, OS permission, CDC-ACM bulk stream | USB host handset | Native Kotlin module | Source | Native compilation, real permission, detach and S3 round trip; not FTDI/CH34x/CP210x |
| Android NFC | Tag ID/tech list and cached NDEF summaries | NFC handset | Foreground native reader | Source | Physical tag/device test; ID is not a credential secret |
| NFC application data | NDEF; ISO 14443 A/B, ISO-DEP; ISO 15693/FeliCa where supported | Controller-dependent | Native or external reader | Planned | Separate technology/operation fixtures; secure data requires valid application authority |
| LF RFID | 125/134.2 kHz tag-family observation | No | Proxmark/dedicated LF front end | Planned | Correct antenna/front end and owned tags; HF NFC cannot substitute |
| RFID research accessory | Version/identity, traces, permitted tag interaction | No | Proxmark/Chameleon adapter | Planned | Matched firmware/client and per-command conformance; no imported key material |
| Access controllers | OSDP/secure channel, vendor APIs | Network/API-dependent | Isolated RS-485 + libOSDP bench | Planned | Commissioned reader/controller and keys; support is not a universal door credential |
| Sub-GHz | OOK/ASK/FSK telemetry capture/decoding | No | CC1101, RTL-SDR or SDR | Planned | Band-matched hardware, fixture corpus and measured reception; authenticated systems remain authenticated |
| LoRa mesh | Meshtastic PhoneAPI/protobuf | BLE/USB client only | SX126x/SX127x node | Planned | Existing-device adapter, regional hardware and version tests; separate from CC1101 |
| SDR | IQ receive/capture, offline demodulation | No RF front end | HackRF/SoapySDR + desktop sidecar | Planned | Sample format/rate/frequency/drop evidence; device tuning range is not protocol coverage |
| Bluetooth | BLE discovery, GATT read/notify, enrolled control | OS APIs | BLE adapter or specialised capture hardware | Planned | Runtime permissions, MTU/reconnect/device fixtures; Classic differs from BLE |
| Wi-Fi | OS inventory and authenticated LAN/API control | OS APIs | Native/public network APIs | Planned | Scan age/throttling and credentials; monitor mode is not a stock phone capability |
| Infrared analysis | Standard 32-bit NEC offline pulse decode | Local analysis | Later receiver timing capture | Host | Inverse-byte and timing validation; extended NEC/repeats excluded initially |
| Infrared control | Known appliance protocols | Usually no IR hardware | IR LED driver + receiver | Planned | Timing/current checks and observed appliance effect |
| Embedded tools | UART/SPI/I2C/GPIO/SWD/JTAG diagnostics | No direct pins | Board-specific accessory | Planned | Pin/voltage/resource manifest and electrical protection; arbitrary pin writes absent |
| Vehicle traces | Classic CAN candump compact data frames | Local import | Future isolated CAN adapter | Host | Bounded offline parser; no CAN FD/RTR/error-frame parsing yet |
| Vehicle diagnostics | CAN/ISO-TP/OBD-II on owned bench | No direct bus | Isolated adapter + ECU/simulator | Planned | Signal maps, read-only baseline, no immobiliser/security bypass |
| Industrial | Modbus TCP/RTU, BACnet/IP/MS-TP | LAN API possible | Local simulator / isolated bus | Planned | Vendor register/object maps, topology and credentials; no live discovery now |
| Protocol workbench | Deterministic parsing, input statistics, hypotheses | Local compute | Later desktop processing | Host subset | NEC/CAN only; no claim of generic protocol inference |
| AI assistance | Schema-validated hypotheses with provenance | Optional local/remote model | Future provider interface | Planned | Evaluation corpus, explicit data export and no direct execution from model output |
| Capture/evidence vault | Hashes, provenance, retention/export | Local storage | Future encrypted store | Planned | Durable storage, permission, export/reimport and integrity tests; M0 is in-memory |
| Firmware lifecycle | Signed update, board identity and recovery | Management UI | Bootloader/secure accessory | Planned | Real flash/recovery/rollback evidence; no OTA endpoint in M0 |

Upstream protocol support is described in RESEARCH_REGISTER.md. It is not evidence that these APEX adapters exist. A compatible operation requires the whole chain: physical front end, transport, decoder, application semantics, authentication where applicable, and measured target behaviour.
