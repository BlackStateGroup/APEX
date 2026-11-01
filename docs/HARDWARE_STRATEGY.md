# Hardware strategy

## Build an extensible kit before a custom all-in-one board

The phone provides compute, display, local storage and normal NFC/Bluetooth/Wi-Fi APIs. USB modules add front ends the handset lacks. Reuse specialist equipment for difficult RF/analogue functions before deciding what deserves a combined PCB. No component purchase or availability is implied by this plan.

| Layer | Candidate | Role | Constraint and validation |
| --- | --- | --- | --- |
| Phone | NFC-capable Android handset with USB host | Expo/native console | Record model/Android version; test host power, foreground NFC, permission and suspend behaviour |
| Initial accessory | ESP32-S3 development board with native USB Serial/JTAG connector | Wired AXP control and later timed IR/peripherals | Dedicated native USB connector required; boards may expose a different UART bridge on another connector |
| Compact BLE accessory | nRF52840 board | Later low-power BLE and selected NFC accessory work | NFC peripheral capabilities differ from a general NFC reader; external HF front end may still be required |
| STM32 reference | STM32WB55-based hardware | Flipper/DIY design study and possible alternate accessory | Pin/package differences, radio stack and peripheral ports require separate validation |
| HF NFC | ST25R3916 or PN532 module; Proxmark for broad research | 13.56 MHz reader/tag research on owned fixtures | Front ends, antennas and protocol feature sets differ; phone controller support is not interchangeable |
| LF RFID | Proxmark or dedicated LF analogue front end | 125/134.2 kHz fixture observation | Not achievable with a phone NFC controller or an HF-only breakout |
| Sub-GHz | CC1101 board with band-matched RF network/antenna | Narrowband OOK/FSK fixture receiver | Silicon bands are 300–348, 387–464 and 779–928 MHz; module matching limits practical use |
| LoRa | SX126x/SX127x device with Meshtastic-compatible board | Separate mesh/telemetry accessory | LoRa is not supported by CC1101; regional variant and antenna matter |
| SDR | HackRF One; later alternative receivers | Wideband receive/capture sidecar | One is 1 MHz–6 GHz, half duplex, 8-bit, up to 20 Msamples/s; gain/filtering/input protection and host throughput matter |
| IR | Demodulating receiver, IR LED with appropriate driver | Appliance fixture capture/control | Carrier/timing, line of sight, duty and current limits must be measured |
| Vehicle bench | Isolated USB CAN interface plus known ECU/simulator | Listen-only acquisition then bounded diagnostic tests | S3 TWAI alone is classic CAN, requires a transceiver and is not CAN FD; do not connect an unvalidated bare MCU to a car |
| Industrial bench | Isolated RS-485 adapter and local PLC/controller fixtures | Modbus RTU/OSDP; network simulator for Modbus TCP/BACnet | Signal levels, termination, isolation, maps and secure-channel credentials are equipment-specific |

Primary references: [Flipper hardware](https://docs.flipper.net/zero/development/hardware/tech-specs), [TI CC1101](https://www.ti.com/product/CC1101), [HackRF One](https://hackrf.readthedocs.io/en/stable/hackrf_one.html), and the immutable upstream documents in the research register. Ranges describe components, not permitted transmission or proven APEX coverage.

## Stages and exit evidence

H0: phone plus one S3 board, known-good data cable and powered USB hub if required. Exit: native device enumerated, permission denied/granted paths exercised, AXP identity/ping verified against flashed firmware, 100 attach/detach cycles with no resource leak, and board/phone firmware revisions retained.

H1: add IR and one owned environmental radio fixture. Exit: scope/logic-analyser timing captures, decoder fixtures, measured receive behaviour, malformed/noisy-input tests, module power and pin map, and reproducible operation on two builds. An IR control demonstration needs observed appliance behaviour, not merely an LED transmission acknowledgement.

H2: attach a specialist RFID device. Exit: version negotiation, tag-family identification, trace import and a documented authorised credential flow for the chosen reader/tag pair. Do not claim credential duplication or security equivalence from an identifier match.

H3: SDR and mesh sidecars. Exit: bounded recordings, calibrated sample/frequency metadata, sustained-throughput/drop tests, clean shutdown and replayable offline analysis. No assumption that low sample resolution or a wide tuning range replaces the correct front-end filter.

H4: isolated vehicle/industrial/access benches. Exit: isolation checks, termination/topology record, known register/signal maps, read-only baseline, device-specific commands reviewed independently, and physical-state verification for any later actuation.

H5: custom carrier PCB only after H0–H4 evidence justifies component consolidation. Produce schematic, pin/resource map, power tree, RF layout constraints, DFM review and manufacturing test plan before fabrication. There are no fabricated schematics or claimed manufacturing-ready files in M0.

## Electrical and mechanical design rules

Keep digital control, RF front ends and field buses in distinct modules. Use documented 3.3 V logic domains with appropriate level conversion, ESD protection, current limiting and isolation where field equipment demands it. Reserve S3 USB pins for their native function. A bus/pin assignment is board-revision-specific; this initial firmware intentionally assigns no external RF pins.

Budget phone host current, MCU peak draw, radio peaks, hub overhead and storage loads from measurements and component datasheets. Do not back-feed phone VBUS from an accessory battery. A future powered dock needs a reviewed USB-C power-role design and controlled power domains. Keep emergency disconnect and field-bus isolation accessible.

RF modules need frequency-appropriate antennas, matching networks, filtering and known input limits. Receive experiments may still require attenuation/protection. Use shielded/cabled test arrangements when appropriate. Region selection alone is not regulatory certification; active RF modules need a reviewed regional profile and actual product compliance work before distribution.

## Procurement policy and unresolved choices

No price quotations are claimed. Obtain current supplier quotes once the handset, board revision and first fixtures are selected. Compare genuine supplier support, analogue quality, replaceable antennas, isolation and documented interfaces before unit cost. Start with one verified kit, not every candidate in the table.

Immediate hardware decisions: Android handset model; S3 board with accessible native USB; first IR appliance and owned radio sensor; available Proxmark/Chameleon/SDR equipment; access to a logic analyser and isolated CAN/RS-485 bench. Source work can continue while these remain open; physical capability claims cannot.
