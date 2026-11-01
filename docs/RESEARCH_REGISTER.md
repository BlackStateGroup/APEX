# Research register

Reviewed 1 November 2026. This is a source-inspection register, not hardware certification. Exact commits and document blob identifiers are recorded in [upstreams.json](../research/upstreams.json). All 28 projects were inspected through their primary repositories; no upstream security-tool binaries were executed. Research snapshots can move beyond stable releases, so integration must select and verify a release independently.

## R01: flipperdevices/flipperzero-firmware

[Immutable source](https://github.com/flipperdevices/flipperzero-firmware/commit/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a) | branch observed: `dev` | archived: false

Multi-function handheld reference: Furi/FBT, STM32WB55, dedicated CC1101 and ST25R3916 front ends. Study device/RPC boundaries; integrate a separately installed upstream device later. No firmware is copied.

Limit: Reading or identifying a credential is distinct from authenticating it.

Licence observation: GPL-3.0 family; file-level review before reuse.

Evidence: [LICENSE](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/LICENSE), [ReadMe.md](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/ReadMe.md). APEX hardware: not tested. Source copied: no.

## R02: GthiN89/FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on

[Immutable source](https://github.com/GthiN89/FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on/commit/83cd7d56d06e8b0efb306c44bd23854131e3a767) | branch observed: `dev` | archived: false

STM32WB55CGU6 modular hardware adaptation of the Flipper ecosystem. Use as a hardware trade-off study, not the baseline firmware.

Limit: Pinned technical notes report no RFID/NFC in the published build and partial external peripheral support.

Licence observation: GPL-3.0 family; hardware and inherited assets need separate review.

Evidence: [LICENSE](https://github.com/GthiN89/FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on/blob/83cd7d56d06e8b0efb306c44bd23854131e3a767/LICENSE), [ReadMe.md](https://github.com/GthiN89/FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on/blob/83cd7d56d06e8b0efb306c44bd23854131e3a767/ReadMe.md), [ReadmetechnicalReadme.md](https://github.com/GthiN89/FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on/blob/83cd7d56d06e8b0efb306c44bd23854131e3a767/ReadmetechnicalReadme.md). APEX hardware: not tested. Source copied: no.

## R03: BruceDevices/firmware

[Immutable source](https://github.com/BruceDevices/firmware/commit/a59213f3ec6cd302fa32c2042b2700c9c24d991a) | branch observed: `main` | archived: false

ESP32 ecosystem with board-specific peripheral support and modular UI. Study board manifests and module separation; keep upstream firmware external.

Limit: Third-party attribution identifies additional copyleft and proprietary-material concerns; no code or keystores imported.

Licence observation: AGPL-3.0-or-later per THIRD_PARTY.md; inherited code and data require individual review.

Evidence: [LICENSE](https://github.com/BruceDevices/firmware/blob/a59213f3ec6cd302fa32c2042b2700c9c24d991a/LICENSE), [README.md](https://github.com/BruceDevices/firmware/blob/a59213f3ec6cd302fa32c2042b2700c9c24d991a/README.md), [THIRD_PARTY.md](https://github.com/BruceDevices/firmware/blob/a59213f3ec6cd302fa32c2042b2700c9c24d991a/THIRD_PARTY.md). APEX hardware: not tested. Source copied: no.

## R04: RfidResearchGroup/proxmark3

[Immutable source](https://github.com/RfidResearchGroup/proxmark3/commit/754bbae3d946429a6354cd34a97a2dd29ce6f157) | branch observed: `master` | archived: false

Specialist LF/HF RFID platform with a substantial native client and firmware. Later desktop sidecar for bounded identification and trace import.

Limit: Requires its own RF front end and matched host/firmware versions.

Licence observation: GPL-3.0-or-later per README; dependency licences vary.

Evidence: [LICENSE.txt](https://github.com/RfidResearchGroup/proxmark3/blob/754bbae3d946429a6354cd34a97a2dd29ce6f157/LICENSE.txt), [README.md](https://github.com/RfidResearchGroup/proxmark3/blob/754bbae3d946429a6354cd34a97a2dd29ce6f157/README.md). APEX hardware: not tested. Source copied: no.

## R05: RfidResearchGroup/ChameleonUltra

[Immutable source](https://github.com/RfidResearchGroup/ChameleonUltra/commit/4c5bc2cb6b023d23f7bbc383c9b2b5e39f95419e) | branch observed: `main` | archived: false

nRF52840-based RFID research accessory with firmware and multiple companion clients. Later documented device adapter after command/protocol and hardware validation.

Limit: Supported tag families, device revision and authorisation constrain any operation.

Licence observation: GPL-3.0 family; review selected firmware/software files.

Evidence: [LICENSE](https://github.com/RfidResearchGroup/ChameleonUltra/blob/4c5bc2cb6b023d23f7bbc383c9b2b5e39f95419e/LICENSE), [README.md](https://github.com/RfidResearchGroup/ChameleonUltra/blob/4c5bc2cb6b023d23f7bbc383c9b2b5e39f95419e/README.md). APEX hardware: not tested. Source copied: no.

## R06: greatscottgadgets/hackrf

[Immutable source](https://github.com/greatscottgadgets/hackrf/commit/468c5d93b66032c892c95bbf9ff15ff1b803e84f) | branch observed: `main` | archived: false

USB SDR hardware and host software for RF development. Later receive/capture sidecar with explicit sample metadata.

Limit: HackRF One is half duplex; wide frequency coverage does not supply a protocol decoder.

Licence observation: Mixed: root GPL-2.0; inspected libhackrf source has BSD-3-Clause terms.

Evidence: [COPYING](https://github.com/greatscottgadgets/hackrf/blob/468c5d93b66032c892c95bbf9ff15ff1b803e84f/COPYING), [Readme.md](https://github.com/greatscottgadgets/hackrf/blob/468c5d93b66032c892c95bbf9ff15ff1b803e84f/Readme.md), [libhackrf source header](https://github.com/greatscottgadgets/hackrf/blob/468c5d93b66032c892c95bbf9ff15ff1b803e84f/host/libhackrf/src/hackrf.c) (lines 1 to 48). APEX hardware: not tested. Source copied: no.

## R07: meshtastic/firmware

[Immutable source](https://github.com/meshtastic/firmware/commit/f9c26505edb40c31038f5bcd71127fa408a6e929) | branch observed: `develop` | archived: false

LoRa mesh firmware with text, location and telemetry functions. Later adapter to its existing PhoneAPI, preserving protobuf and upstream transport conventions.

Limit: LoRa mesh is a separate radio system, not a CC1101 firmware mode.

Licence observation: GPL-3.0 family; client/protobuf packages need independent inventory.

Evidence: [LICENSE](https://github.com/meshtastic/firmware/blob/f9c26505edb40c31038f5bcd71127fa408a6e929/LICENSE), [README.md](https://github.com/meshtastic/firmware/blob/f9c26505edb40c31038f5bcd71127fa408a6e929/README.md). APEX hardware: not tested. Source copied: no.

## R08: jgromes/RadioLib

[Immutable source](https://github.com/jgromes/RadioLib/commit/3a664b64099e4bdbdb3e6f28a5ca6b833050b21e) | branch observed: `master` | archived: false

Portable embedded radio driver abstraction supporting multiple radio families. Preferred candidate for a future CC1101/SX126x module behind the APEX HAL.

Limit: A driver only works with compatible attached hardware, matching networks and antennas.

Licence observation: MIT.

Evidence: [README.md](https://github.com/jgromes/RadioLib/blob/3a664b64099e4bdbdb3e6f28a5ca6b833050b21e/README.md), [license.txt](https://github.com/jgromes/RadioLib/blob/3a664b64099e4bdbdb3e6f28a5ca6b833050b21e/license.txt). APEX hardware: not tested. Source copied: no.

## R09: crankyoldgit/IRremoteESP8266

[Immutable source](https://github.com/crankyoldgit/IRremoteESP8266/commit/1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f) | branch observed: `master` | archived: false

ESP8266/ESP32 infrared send/receive library with a broad protocol list. Candidate external IR module; current offline decoder is original code.

Limit: Arduino-oriented dependency requires a porting and distribution decision for ESP-IDF.

Licence observation: LGPL-2.1 family.

Evidence: [LICENSE.txt](https://github.com/crankyoldgit/IRremoteESP8266/blob/1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f/LICENSE.txt), [README.md](https://github.com/crankyoldgit/IRremoteESP8266/blob/1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f/README.md). APEX hardware: not tested. Source copied: no.

## R10: hathach/tinyusb

[Immutable source](https://github.com/hathach/tinyusb/commit/67570a60d4c87f8bd6da7e49643b667472d63786) | branch observed: `master` | archived: false

Cross-platform embedded USB host/device stack. Candidate for future configurable USB OTG devices and composite interfaces.

Limit: The initial S3 target uses the fixed USB Serial/JTAG peripheral, not this stack.

Licence observation: MIT; dependency subtrees need separate review.

Evidence: [LICENSE](https://github.com/hathach/tinyusb/blob/67570a60d4c87f8bd6da7e49643b667472d63786/LICENSE), [README.rst](https://github.com/hathach/tinyusb/blob/67570a60d4c87f8bd6da7e49643b667472d63786/README.rst). APEX hardware: not tested. Source copied: no.

## R11: espressif/esp-idf

[Immutable source](https://github.com/espressif/esp-idf/commit/d445e947156f276dfe0db5804e4edf6ae90fe6fb) | branch observed: `master` | archived: false

Espressif framework, driver APIs and build tooling. Selected framework for the initial ESP32-S3 target; build tag pinned separately.

Limit: Research snapshots track master; hardware build uses v6.1 and remains unflashed.

Licence observation: Apache-2.0 root; third-party components have separate licences.

Evidence: [LICENSE](https://github.com/espressif/esp-idf/blob/d445e947156f276dfe0db5804e4edf6ae90fe6fb/LICENSE), [README.md](https://github.com/espressif/esp-idf/blob/d445e947156f276dfe0db5804e4edf6ae90fe6fb/README.md). APEX hardware: not tested. Source copied: no.

## R12: zephyrproject-rtos/zephyr

[Immutable source](https://github.com/zephyrproject-rtos/zephyr/commit/0534e997eacb94bae1df6c9a7dd4a9a6cbf1cecf) | branch observed: `main` | archived: false

RTOS with portable drivers and multiple MCU architectures. Evaluate for a later nRF52840 accessory; avoid a second initial RTOS.

Limit: Board support does not prove timing or RF performance for APEX.

Licence observation: Apache-2.0 root; modules vary.

Evidence: [LICENSE](https://github.com/zephyrproject-rtos/zephyr/blob/0534e997eacb94bae1df6c9a7dd4a9a6cbf1cecf/LICENSE), [README.rst](https://github.com/zephyrproject-rtos/zephyr/blob/0534e997eacb94bae1df6c9a7dd4a9a6cbf1cecf/README.rst). APEX hardware: not tested. Source copied: no.

## R13: mik3y/usb-serial-for-android

[Immutable source](https://github.com/mik3y/usb-serial-for-android/commit/4cb9e82cdcfa095eb2fe0b0bea9605f50bd8e2f2) | branch observed: `master` | archived: false

Android user-space serial drivers supporting several USB bridge families. Candidate expansion beyond the initial CDC-ACM-only native transport.

Limit: Not bundled now; initial native code does not claim CP210x, FTDI or CH34x support.

Licence observation: MIT.

Evidence: [LICENSE.txt](https://github.com/mik3y/usb-serial-for-android/blob/4cb9e82cdcfa095eb2fe0b0bea9605f50bd8e2f2/LICENSE.txt), [README.md](https://github.com/mik3y/usb-serial-for-android/blob/4cb9e82cdcfa095eb2fe0b0bea9605f50bd8e2f2/README.md). APEX hardware: not tested. Source copied: no.

## R14: expo/expo

[Immutable source](https://github.com/expo/expo/commit/dfb069d9cc5bcebc493fa6e94d3c61124e62b85a) | branch observed: `main` | archived: false

React Native tooling, native modules and universal application support. Selected mobile framework, pinned through package-lock.json.

Limit: Expo Go cannot contain the custom APEX native module; use a development build.

Licence observation: MIT root; transitive dependency inventory generated separately.

Evidence: [LICENSE](https://github.com/expo/expo/blob/dfb069d9cc5bcebc493fa6e94d3c61124e62b85a/LICENSE), [README.md](https://github.com/expo/expo/blob/dfb069d9cc5bcebc493fa6e94d3c61124e62b85a/README.md). APEX hardware: not tested. Source copied: no.

## R15: dotintent/react-native-ble-plx

[Immutable source](https://github.com/dotintent/react-native-ble-plx/commit/92a496d60f81642d2f45cecfc44f47a62904a86d) | branch observed: `master` | archived: false

React Native BLE central/GATT library with notifications and MTU support. Candidate BLE transport after lifecycle and reconnect acceptance tests.

Limit: Does not provide Bluetooth Classic or arbitrary radio sniffing; not bundled now.

Licence observation: Apache-2.0.

Evidence: [LICENSE](https://github.com/dotintent/react-native-ble-plx/blob/92a496d60f81642d2f45cecfc44f47a62904a86d/LICENSE), [README.md](https://github.com/dotintent/react-native-ble-plx/blob/92a496d60f81642d2f45cecfc44f47a62904a86d/README.md). APEX hardware: not tested. Source copied: no.

## R16: revtel/react-native-nfc-manager

[Immutable source](https://github.com/revtel/react-native-nfc-manager/commit/c44f7110f791901823252610627dc5cbee7dddcd) | branch observed: `main` | archived: false

React Native NFC manager with Expo development-build support. Candidate for broader NDEF and iOS support; initial Android metadata reader is original.

Limit: Requires NFC hardware and a native build; support varies by tag and handset.

Licence observation: MIT.

Evidence: [LICENSE](https://github.com/revtel/react-native-nfc-manager/blob/c44f7110f791901823252610627dc5cbee7dddcd/LICENSE), [README.md](https://github.com/revtel/react-native-nfc-manager/blob/c44f7110f791901823252610627dc5cbee7dddcd/README.md). APEX hardware: not tested. Source copied: no.

## R17: merbanan/rtl_433

[Immutable source](https://github.com/merbanan/rtl_433/commit/f35183aaf1d2d905d422fd70bcae4eb7349d6186) | branch observed: `master` | archived: false

Receiver and decoder for supported low-rate radio telemetry protocols. Later process adapter for owned sensor capture and JSON output import.

Limit: Supported decoders are finite; the project name does not mean only one frequency.

Licence observation: GPL-2.0 family; inspect individual files.

Evidence: [COPYING](https://github.com/merbanan/rtl_433/blob/f35183aaf1d2d905d422fd70bcae4eb7349d6186/COPYING), [README.md](https://github.com/merbanan/rtl_433/blob/f35183aaf1d2d905d422fd70bcae4eb7349d6186/README.md). APEX hardware: not tested. Source copied: no.

## R18: gnuradio/gnuradio

[Immutable source](https://github.com/gnuradio/gnuradio/commit/ec1bf153c9222eca81f59d4e063e73d525a51a1a) | branch observed: `main` | archived: false

Signal-processing runtime and development toolkit. Desktop processing sidecar and reproducible offline flowgraphs.

Limit: Do not route high-rate IQ samples through the React Native JavaScript bridge.

Licence observation: GPL-3.0 family; block licences vary.

Evidence: [COPYING](https://github.com/gnuradio/gnuradio/blob/ec1bf153c9222eca81f59d4e063e73d525a51a1a/COPYING), [README.md](https://github.com/gnuradio/gnuradio/blob/ec1bf153c9222eca81f59d4e063e73d525a51a1a/README.md). APEX hardware: not tested. Source copied: no.

## R19: pothosware/SoapySDR

[Immutable source](https://github.com/pothosware/SoapySDR/commit/cf0c0eb5279aa202d5b3a48aee423294b10244eb) | branch observed: `master` | archived: false

Vendor-neutral SDR host abstraction. Candidate sidecar hardware abstraction.

Limit: Hardware driver plug-ins retain their own licences and compatibility constraints.

Licence observation: BSL-1.0.

Evidence: [README.md](https://github.com/pothosware/SoapySDR/blob/cf0c0eb5279aa202d5b3a48aee423294b10244eb/README.md), [LICENSE_1_0.txt](https://github.com/pothosware/SoapySDR/blob/cf0c0eb5279aa202d5b3a48aee423294b10244eb/LICENSE_1_0.txt). APEX hardware: not tested. Source copied: no.

## R20: nfc-tools/libnfc

[Immutable source](https://github.com/nfc-tools/libnfc/commit/3fa0751ad58fb0053d3de2e61bbbd4066259104c) | branch observed: `master` | archived: false

Userspace NFC reader library with multiple device backends. Evaluate external reader sidecar and file interchange.

Limit: Not an Android NFC-controller replacement; dependency/backend compatibility varies.

Licence observation: LGPL-3.0 family.

Evidence: [COPYING](https://github.com/nfc-tools/libnfc/blob/3fa0751ad58fb0053d3de2e61bbbd4066259104c/COPYING), [README.md](https://github.com/nfc-tools/libnfc/blob/3fa0751ad58fb0053d3de2e61bbbd4066259104c/README.md). APEX hardware: not tested. Source copied: no.

## R21: linux-can/can-utils

[Immutable source](https://github.com/linux-can/can-utils/commit/834ceef1f1eabec67625389172eebf1050d2f42b) | branch observed: `master` | archived: false

Linux SocketCAN tools and log formats. Reference for bounded offline classic CAN log import; later isolated bench adapter.

Limit: Access to CAN frames does not establish ECU signal meaning, security access or vehicle control.

Licence observation: Mixed file-level BSD-3-Clause and GPL-2.0-only; Linux syscall exception also present.

Evidence: [README.md](https://github.com/linux-can/can-utils/blob/834ceef1f1eabec67625389172eebf1050d2f42b/README.md), [LICENSES/GPL-2.0-only.txt](https://github.com/linux-can/can-utils/blob/834ceef1f1eabec67625389172eebf1050d2f42b/LICENSES/GPL-2.0-only.txt), [LICENSES/BSD-3-Clause](https://github.com/linux-can/can-utils/blob/834ceef1f1eabec67625389172eebf1050d2f42b/LICENSES/BSD-3-Clause). APEX hardware: not tested. Source copied: no.

## R22: hardbyte/python-can

[Immutable source](https://github.com/hardbyte/python-can/commit/b4f82abede25ff83376be793a2935c41f81c3869) | branch observed: `main` | archived: false

Common Python interfaces and virtual backends for CAN devices. Future virtual-bus fixtures and optional desktop sidecar.

Limit: No vehicle writes, diagnostics unlock or immobiliser functionality is integrated.

Licence observation: LGPL-3.0 family.

Evidence: [LICENSE.txt](https://github.com/hardbyte/python-can/blob/b4f82abede25ff83376be793a2935c41f81c3869/LICENSE.txt), [README.rst](https://github.com/hardbyte/python-can/blob/b4f82abede25ff83376be793a2935c41f81c3869/README.rst). APEX hardware: not tested. Source copied: no.

## R23: pymodbus-dev/pymodbus

[Immutable source](https://github.com/pymodbus-dev/pymodbus/commit/e0460de3f4646f82f232486ea528602d7f676c36) | branch observed: `dev` | archived: false

Python Modbus client/server/simulator implementation. Candidate local PLC simulator and bounded register-read adapter.

Limit: Device register maps remain vendor-specific; no industrial network discovery implemented.

Licence observation: BSD-3-Clause terms in LICENSE, despite GitHub NOASSERTION.

Evidence: [LICENSE](https://github.com/pymodbus-dev/pymodbus/blob/e0460de3f4646f82f232486ea528602d7f676c36/LICENSE), [README.rst](https://github.com/pymodbus-dev/pymodbus/blob/e0460de3f4646f82f232486ea528602d7f676c36/README.rst). APEX hardware: not tested. Source copied: no.

## R24: bacnet-stack/bacnet-stack

[Immutable source](https://github.com/bacnet-stack/bacnet-stack/commit/62e4340bf044a4fdeb3d860dcda2c6e079e2f5ba) | branch observed: `master` | archived: false

Embedded and host BACnet stack with multiple data links. Later local simulator and property-read interoperability tests.

Limit: An open protocol does not imply open building-controller access.

Licence observation: Mixed: GPL-2.0-or-later WITH GCC-exception-2.0, MIT and other files; inspect each selected file.

Evidence: [README.md](https://github.com/bacnet-stack/bacnet-stack/blob/62e4340bf044a4fdeb3d860dcda2c6e079e2f5ba/README.md), [license/readme.txt](https://github.com/bacnet-stack/bacnet-stack/blob/62e4340bf044a4fdeb3d860dcda2c6e079e2f5ba/license/readme.txt), [src/bacnet/bacdef.h](https://github.com/bacnet-stack/bacnet-stack/blob/62e4340bf044a4fdeb3d860dcda2c6e079e2f5ba/src/bacnet/bacdef.h). APEX hardware: not tested. Source copied: no.

## R25: osdp-dev/libosdp

[Immutable source](https://github.com/osdp-dev/libosdp/commit/3654c63685d9f47c298127dafd832a4f363a2f10) | branch observed: `master` | archived: false

C OSDP control-panel/peripheral library with secure-channel support. Candidate owned reader/controller bench fixture over isolated RS-485.

Limit: Secure-channel commissioning and device-specific keys remain necessary.

Licence observation: Apache-2.0.

Evidence: [LICENSE](https://github.com/osdp-dev/libosdp/blob/3654c63685d9f47c298127dafd832a4f363a2f10/LICENSE), [README.md](https://github.com/osdp-dev/libosdp/blob/3654c63685d9f47c298127dafd832a4f363a2f10/README.md). APEX hardware: not tested. Source copied: no.

## R26: sigmf/SigMF

[Immutable source](https://github.com/sigmf/SigMF/commit/60121977f5f8d1145553251a3b3d0dbe2819aa14) | branch observed: `main` | archived: false

Recording metadata specification for portable signal datasets. Use metadata concepts for future IQ capture provenance; no specification text copied.

Limit: A recording schema is not a licence for the recorded content.

Licence observation: CC-BY-SA-4.0 for the specification; implementations vary.

Evidence: [LICENSE.md](https://github.com/sigmf/SigMF/blob/60121977f5f8d1145553251a3b3d0dbe2819aa14/LICENSE.md), [README.md](https://github.com/sigmf/SigMF/blob/60121977f5f8d1145553251a3b3d0dbe2819aa14/README.md). APEX hardware: not tested. Source copied: no.

## R27: jopohl/urh

[Immutable source](https://github.com/jopohl/urh/commit/1403d92987cc3d01d41aff64250955ce455dabd2) | branch observed: `master` | archived: true

Desktop wireless protocol investigation and demodulation toolkit. External analysis/export interoperability reference.

Limit: Inference produces hypotheses; it cannot certify authentication success or invent secret keys.

Licence observation: GPL-3.0 family.

Evidence: [LICENSE](https://github.com/jopohl/urh/blob/1403d92987cc3d01d41aff64250955ce455dabd2/LICENSE), [README.md](https://github.com/jopohl/urh/blob/1403d92987cc3d01d41aff64250955ce455dabd2/README.md). APEX hardware: not tested. Source copied: no.

## R28: libusb/libusb

[Immutable source](https://github.com/libusb/libusb/commit/987c1170d0018ba82557823a98ae443e8335e11b) | branch observed: `master` | archived: false

Portable userspace USB library. Future SDR/native sidecar USB dependency.

Limit: Android file-descriptor handling and permissions still need explicit integration.

Licence observation: LGPL-2.1-or-later per README.

Evidence: [COPYING](https://github.com/libusb/libusb/blob/987c1170d0018ba82557823a98ae443e8335e11b/COPYING), [README](https://github.com/libusb/libusb/blob/987c1170d0018ba82557823a98ae443e8335e11b/README), [README.md](https://github.com/libusb/libusb/blob/987c1170d0018ba82557823a98ae443e8335e11b/README.md). APEX hardware: not tested. Source copied: no.

