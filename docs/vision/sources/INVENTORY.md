# Full pinned-source inventory

Recovery review: 8 November 2026. All 31 root snapshots restored in a separate research corpus, not newly copied into the app or this docs commit. Archive parts, exact Git pins, licence-file hashes and all 63 absent Git links are in [recovery-inventory.json](recovery-inventory.json). Original acquisition records remain in [source-imports.json](../../../research/source-imports.json).

| ID | Repository / immutable commit | Recorded licence assessment | Tracked entries | Missing root Git links |

| --- | --- | --- | ---: | ---: |
| R01 | [flipperdevices/flipperzero-firmware](https://github.com/flipperdevices/flipperzero-firmware/commit/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a) | GPL-3.0 family; file-level review before reuse. | 4,336 | 12 |
| R02 | [GthiN89/FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on](https://github.com/GthiN89/FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on/commit/83cd7d56d06e8b0efb306c44bd23854131e3a767) | GPL-3.0 family; hardware and inherited assets need separate review. | 8,440 | 15 |
| R03 | [BruceDevices/firmware](https://github.com/BruceDevices/firmware/commit/a59213f3ec6cd302fa32c2042b2700c9c24d991a) | AGPL-3.0-or-later per THIRD_PARTY.md; inherited code and data require individual review. | 1,256 | 0 |
| R04 | [RfidResearchGroup/proxmark3](https://github.com/RfidResearchGroup/proxmark3/commit/754bbae3d946429a6354cd34a97a2dd29ce6f157) | GPL-3.0-or-later per README; dependency licences vary. | 2,827 | 0 |
| R05 | [RfidResearchGroup/ChameleonUltra](https://github.com/RfidResearchGroup/ChameleonUltra/commit/4c5bc2cb6b023d23f7bbc383c9b2b5e39f95419e) | GPL-3.0 family; review selected firmware/software files. | 1,810 | 0 |
| R06 | [greatscottgadgets/hackrf](https://github.com/greatscottgadgets/hackrf/commit/468c5d93b66032c892c95bbf9ff15ff1b803e84f) | Mixed: root GPL-2.0; inspected libhackrf source has BSD-3-Clause terms. | 559 | 2 |
| R07 | [meshtastic/firmware](https://github.com/meshtastic/firmware/commit/f9c26505edb40c31038f5bcd71127fa408a6e929) | GPL-3.0 family; client/protobuf packages need independent inventory. | 2,292 | 2 |
| R08 | [jgromes/RadioLib](https://github.com/jgromes/RadioLib/commit/3a664b64099e4bdbdb3e6f28a5ca6b833050b21e) | MIT. | 417 | 0 |
| R09 | [crankyoldgit/IRremoteESP8266](https://github.com/crankyoldgit/IRremoteESP8266/commit/1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f) | LGPL-2.1 family. | 1,877 | 0 |
| R10 | [hathach/tinyusb](https://github.com/hathach/tinyusb/commit/67570a60d4c87f8bd6da7e49643b667472d63786) | MIT; dependency subtrees need separate review. | 2,783 | 0 |
| R11 | [espressif/esp-idf](https://github.com/espressif/esp-idf/commit/d445e947156f276dfe0db5804e4edf6ae90fe6fb) | Apache-2.0 root; third-party components have separate licences. | 22,260 | 24 |
| R12 | [zephyrproject-rtos/zephyr](https://github.com/zephyrproject-rtos/zephyr/commit/0534e997eacb94bae1df6c9a7dd4a9a6cbf1cecf) | Apache-2.0 root; modules vary. | 69,384 | 0 |
| R13 | [mik3y/usb-serial-for-android](https://github.com/mik3y/usb-serial-for-android/commit/4cb9e82cdcfa095eb2fe0b0bea9605f50bd8e2f2) | MIT. | 97 | 0 |
| R14 | [expo/expo](https://github.com/expo/expo/commit/dfb069d9cc5bcebc493fa6e94d3c61124e62b85a) | MIT root; transitive dependency inventory generated separately. | 23,240 | 1 |
| R15 | [dotintent/react-native-ble-plx](https://github.com/dotintent/react-native-ble-plx/commit/92a496d60f81642d2f45cecfc44f47a62904a86d) | Apache-2.0. | 420 | 0 |
| R16 | [revtel/react-native-nfc-manager](https://github.com/revtel/react-native-nfc-manager/commit/c44f7110f791901823252610627dc5cbee7dddcd) | MIT. | 209 | 0 |
| R17 | [merbanan/rtl_433](https://github.com/merbanan/rtl_433/commit/f35183aaf1d2d905d422fd70bcae4eb7349d6186) | GPL-2.0 family; inspect individual files. | 602 | 0 |
| R18 | [gnuradio/gnuradio](https://github.com/gnuradio/gnuradio/commit/ec1bf153c9222eca81f59d4e063e73d525a51a1a) | GPL-3.0 family; block licences vary. | 5,776 | 0 |
| R19 | [pothosware/SoapySDR](https://github.com/pothosware/SoapySDR/commit/cf0c0eb5279aa202d5b3a48aee423294b10244eb) | BSL-1.0. | 167 | 0 |
| R20 | [nfc-tools/libnfc](https://github.com/nfc-tools/libnfc/commit/3fa0751ad58fb0053d3de2e61bbbd4066259104c) | LGPL-3.0 family. | 199 | 0 |
| R21 | [linux-can/can-utils](https://github.com/linux-can/can-utils/commit/834ceef1f1eabec67625389172eebf1050d2f42b) | Mixed file-level BSD-3-Clause and GPL-2.0-only; Linux syscall exception also present. | 132 | 0 |
| R22 | [hardbyte/python-can](https://github.com/hardbyte/python-can/commit/b4f82abede25ff83376be793a2935c41f81c3869) | LGPL-3.0 family. | 267 | 0 |
| R23 | [pymodbus-dev/pymodbus](https://github.com/pymodbus-dev/pymodbus/commit/e0460de3f4646f82f232486ea528602d7f676c36) | BSD-3-Clause terms in LICENSE, despite GitHub NOASSERTION. | 208 | 0 |
| R24 | [bacnet-stack/bacnet-stack](https://github.com/bacnet-stack/bacnet-stack/commit/62e4340bf044a4fdeb3d860dcda2c6e079e2f5ba) | Mixed: GPL-2.0-or-later WITH GCC-exception-2.0, MIT and other files; inspect each selected file. | 1,863 | 0 |
| R25 | [osdp-dev/libosdp](https://github.com/osdp-dev/libosdp/commit/3654c63685d9f47c298127dafd832a4f363a2f10) | Apache-2.0. | 342 | 1 |
| R26 | [sigmf/SigMF](https://github.com/sigmf/SigMF/commit/60121977f5f8d1145553251a3b3d0dbe2819aa14) | CC-BY-SA-4.0 for the specification; implementations vary. | 24 | 0 |
| R27 | [jopohl/urh](https://github.com/jopohl/urh/commit/1403d92987cc3d01d41aff64250955ce455dabd2) | GPL-3.0 family. | 575 | 0 |
| R28 | [libusb/libusb](https://github.com/libusb/libusb/commit/987c1170d0018ba82557823a98ae443e8335e11b) | LGPL-2.1-or-later per README. | 185 | 0 |
| R29 | [RocketGod-git/mayhem-mobile](https://github.com/RocketGod-git/mayhem-mobile/commit/a18fca46f58519fc81e19304fc13bbf3da2aa69f) | GPL-3.0 | 611 | 0 |
| R30 | [portapack-mayhem/mayhem-firmware](https://github.com/portapack-mayhem/mayhem-firmware/commit/97c349701723b7f8334b71867439a436a5ab8d02) | GPL-3.0 | 4,253 | 1 |
| R31 | [morluto/rea](https://github.com/morluto/rea/commit/144843ccc26bd372d61b8c6a27b37a01a5b0fb61) | MIT | 7,081 | 5 |

## Per-project record

The licence assessments below are recorded research assessments, not legal clearance or a complete file-by-file audit. Installed package versions may differ from these Git reference pins. R15 has a later package-level licence discrepancy; see [licensing](../SOURCE_PROVENANCE_AND_LICENSING.md).
### R01 · flipperdevices/flipperzero-firmware
- Immutable commit: `9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a`.
- Intended restored path: `research/upstream-sources/R01-flipperdevices--flipperzero-firmware`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 4,336; absent nested Git links: 12; source execution during recovery: no.
- Original research finding: Multi-function handheld reference: Furi/FBT, STM32WB55, dedicated CC1101 and ST25R3916 front ends.
- Original integration decision: Study device/RPC boundaries; integrate a separately installed upstream device later. No firmware is copied.
- Limitation: Reading or identifying a credential is distinct from authenticating it.
- Archive part: `APEX-R01-flipperdevices--flipperzero-firmware-9981d9d4aa5e.tar.gz`; 41,544,338 bytes; SHA-256 `b925caae4da07e85e61dce9ff3c2cac3cd972c4b32b95a20d1ee6c14cb73295c`.
- Absent nested entries: `assets/protobuf` @ `1c84fa48919cbb71d1cc65236fc0ee36740e24c6`, `documentation/doxygen/doxygen-awesome-css` @ `df88fe4fdd97714fadfd3ef17de0b4401f804052`, `lib/FreeRTOS-Kernel` @ `def7d2df2b0506d3d249334974f51e427c17a41c`, `lib/heatshrink` @ `7398ccc91652a33483245200cfa1a83b073bc206`, `lib/libusb_stm32` @ `6ca2857519f996244f7b324dd227fdf0a075fffb`, `lib/mbedtls` @ `107ea89daaefb9867ea9121002fbbdf926780e98`, `lib/microtar` @ `1e921369b2c92bb219fcef84a37d4d2347794c0f`, `lib/mlib` @ `62c8ac3e5d4a7a4f8757328e7a80286fde2686b6`, `lib/nanopb` @ `6cfe48d6f1593f8fa5c0f90437f5e6522587745e`, `lib/stm32wb_cmsis` @ `d1b860584dfe24d40d455ae624ed14600dfa93c9`, `lib/stm32wb_copro` @ `133182d5583e998bb263cd947105be4df9c29cb3`, `lib/stm32wb_hal` @ `cfd0dd258cb031c95b2b2d6d04c19f9f625fe3e8`.
### R02 · GthiN89/FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on
- Immutable commit: `83cd7d56d06e8b0efb306c44bd23854131e3a767`.
- Intended restored path: `research/upstream-sources/R02-GthiN89--FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 8,440; absent nested Git links: 15; source execution during recovery: no.
- Original research finding: STM32WB55CGU6 modular hardware adaptation of the Flipper ecosystem.
- Original integration decision: Use as a hardware trade-off study, not the baseline firmware.
- Limitation: Pinned technical notes report no RFID/NFC in the published build and partial external peripheral support.
- Archive part: `APEX-R02-GthiN89--FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on-83cd7d56d06e.tar.gz`; 140,705,528 bytes; SHA-256 `be5e4fdc3b485e0fcb4bff444936a040acfd35485871e0b0985da044e121e763`.
- Absent nested entries: `applications/external` @ `d28fd3ddaa1a6dbf84851a75e602d448c38f61e5`, `applications/external_Back` @ `d28fd3ddaa1a6dbf84851a75e602d448c38f61e5`, `assets/protobuf` @ `ea4f185f5eaa265955c520eae2832887ee6aa5e4`, `documentation/doxygen/doxygen-awesome-css` @ `df88fe4fdd97714fadfd3ef17de0b4401f804052`, `lib/FreeRTOS-Kernel` @ `def7d2df2b0506d3d249334974f51e427c17a41c`, `lib/heatshrink` @ `7398ccc91652a33483245200cfa1a83b073bc206`, `lib/libusb_stm32` @ `6ca2857519f996244f7b324dd227fdf0a075fffb`, `lib/mbedtls` @ `107ea89daaefb9867ea9121002fbbdf926780e98`, `lib/microtar` @ `1e921369b2c92bb219fcef84a37d4d2347794c0f`, `lib/mlib` @ `62c8ac3e5d4a7a4f8757328e7a80286fde2686b6`, `lib/nanopb` @ `6cfe48d6f1593f8fa5c0f90437f5e6522587745e`, `lib/stm32wb_cmsis` @ `d1b860584dfe24d40d455ae624ed14600dfa93c9`, `lib/stm32wb_copro` @ `133182d5583e998bb263cd947105be4df9c29cb3`, `lib/stm32wb_hal` @ `cfd0dd258cb031c95b2b2d6d04c19f9f625fe3e8`, `lib/uzlib` @ `6d60d651a4499a64f2e5b21b4cc08d98cb84b5c1`.
### R03 · BruceDevices/firmware
- Immutable commit: `a59213f3ec6cd302fa32c2042b2700c9c24d991a`.
- Intended restored path: `research/upstream-sources/R03-BruceDevices--firmware`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 1,256; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: ESP32 ecosystem with board-specific peripheral support and modular UI.
- Original integration decision: Study board manifests and module separation; keep upstream firmware external.
- Limitation: Third-party attribution identifies additional copyleft and proprietary-material concerns; no code or keystores imported.
- Archive part: `APEX-R03-BruceDevices--firmware-a59213f3ec6c.tar.gz`; 101,600,591 bytes; SHA-256 `3bd0872cbba2eed7857c543a1a2f356df29cb3f67ee3c333df0ff5d53c276d1b`.
### R04 · RfidResearchGroup/proxmark3
- Immutable commit: `754bbae3d946429a6354cd34a97a2dd29ce6f157`.
- Intended restored path: `research/upstream-sources/R04-RfidResearchGroup--proxmark3`.
- Recorded licence evidence: `LICENSE.txt`.
- Root entries: 2,827; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Specialist LF/HF RFID platform with a substantial native client and firmware.
- Original integration decision: Later desktop sidecar for bounded identification and trace import.
- Limitation: Requires its own RF front end and matched host/firmware versions.
- Archive part: `APEX-R04-RfidResearchGroup--proxmark3-754bbae3d946.tar.gz`; 86,985,635 bytes; SHA-256 `5553d14a6052ddfd94f2ada00bc45310143d5c397138654612cf0415f97425c6`.
### R05 · RfidResearchGroup/ChameleonUltra
- Immutable commit: `4c5bc2cb6b023d23f7bbc383c9b2b5e39f95419e`.
- Intended restored path: `research/upstream-sources/R05-RfidResearchGroup--ChameleonUltra`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 1,810; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: nRF52840-based RFID research accessory with firmware and multiple companion clients.
- Original integration decision: Later documented device adapter after command/protocol and hardware validation.
- Limitation: Supported tag families, device revision and authorisation constrain any operation.
- Archive part: `APEX-R05-RfidResearchGroup--ChameleonUltra-4c5bc2cb6b02.tar.gz`; 34,248,752 bytes; SHA-256 `e8ca238e48f9c5871d64bea94f455e20a8f475474d1be498c7da75e5dee769e3`.
### R06 · greatscottgadgets/hackrf
- Immutable commit: `468c5d93b66032c892c95bbf9ff15ff1b803e84f`.
- Intended restored path: `research/upstream-sources/R06-greatscottgadgets--hackrf`.
- Recorded licence evidence: `COPYING`.
- Root entries: 559; absent nested Git links: 2; source execution during recovery: no.
- Original research finding: USB SDR hardware and host software for RF development.
- Original integration decision: Later receive/capture sidecar with explicit sample metadata.
- Limitation: HackRF One is half duplex; wide frequency coverage does not supply a protocol decoder.
- Archive part: `APEX-R06-greatscottgadgets--hackrf-468c5d93b660.tar.gz`; 34,255,511 bytes; SHA-256 `0dac2d2090bcb631b91b8956b21302f9b0590385614f2f463aa13d6919381ecd`.
- Absent nested entries: `firmware/libopencm3` @ `a0bb997968bf57c87f2aa4e389a63219580bb5c3`, `hardware/gsg-kicad-lib` @ `41173d673f9dec5f73c0cb88ea69e9b167b001b3`.
### R07 · meshtastic/firmware
- Immutable commit: `f9c26505edb40c31038f5bcd71127fa408a6e929`.
- Intended restored path: `research/upstream-sources/R07-meshtastic--firmware`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 2,292; absent nested Git links: 2; source execution during recovery: no.
- Original research finding: LoRa mesh firmware with text, location and telemetry functions.
- Original integration decision: Later adapter to its existing PhoneAPI, preserving protobuf and upstream transport conventions.
- Limitation: LoRa mesh is a separate radio system, not a CC1101 firmware mode.
- Archive part: `APEX-R07-meshtastic--firmware-f9c26505edb4.tar.gz`; 13,805,316 bytes; SHA-256 `2c259a86f51c4b04771763d76c64ca717c3a9b3f277131d86b885bfb96f37ceb`.
- Absent nested entries: `meshtestic` @ `dcac7e5673005f4d8a2b1f0f6e06877b689d7519`, `protobufs` @ `8d0ed0c135f91ad1d6f9c60bc341277d64946bce`.
### R08 · jgromes/RadioLib
- Immutable commit: `3a664b64099e4bdbdb3e6f28a5ca6b833050b21e`.
- Intended restored path: `research/upstream-sources/R08-jgromes--RadioLib`.
- Recorded licence evidence: `license.txt`.
- Root entries: 417; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Portable embedded radio driver abstraction supporting multiple radio families.
- Original integration decision: Preferred candidate for a future CC1101/SX126x module behind the APEX HAL.
- Limitation: A driver only works with compatible attached hardware, matching networks and antennas.
- Archive part: `APEX-R08-jgromes--RadioLib-3a664b64099e.tar.gz`; 11,251,601 bytes; SHA-256 `b7f55bf6a17507f78cd38633497690052d4f77e5f956cb6b5c31c1da3ef00c86`.
### R09 · crankyoldgit/IRremoteESP8266
- Immutable commit: `1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f`.
- Intended restored path: `research/upstream-sources/R09-crankyoldgit--IRremoteESP8266`.
- Recorded licence evidence: `LICENSE.txt`.
- Root entries: 1,877; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: ESP8266/ESP32 infrared send/receive library with a broad protocol list.
- Original integration decision: Candidate external IR module; current offline decoder is original code.
- Limitation: Arduino-oriented dependency requires a porting and distribution decision for ESP-IDF.
- Archive part: `APEX-R09-crankyoldgit--IRremoteESP8266-1e2f0f3ef0a9.tar.gz`; 11,700,716 bytes; SHA-256 `b6794c2dbdaa876d09679ba115fbab036a8e77e15436bec798ea91ee780a5fe7`.
### R10 · hathach/tinyusb
- Immutable commit: `67570a60d4c87f8bd6da7e49643b667472d63786`.
- Intended restored path: `research/upstream-sources/R10-hathach--tinyusb`.
- Recorded licence evidence: `LICENSE`; `LICENSES`.
- Root entries: 2,783; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Cross-platform embedded USB host/device stack.
- Original integration decision: Candidate for future configurable USB OTG devices and composite interfaces.
- Limitation: The initial S3 target uses the fixed USB Serial/JTAG peripheral, not this stack.
- Archive part: `APEX-R10-hathach--tinyusb-67570a60d4c8.tar.gz`; 9,665,436 bytes; SHA-256 `8fea152a5e75aac17582640570859d324fa6ab05997ae4ae77ffd346f7b268ec`.
### R11 · espressif/esp-idf
- Immutable commit: `d445e947156f276dfe0db5804e4edf6ae90fe6fb`.
- Intended restored path: `research/upstream-sources/R11-espressif--esp-idf`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 22,260; absent nested Git links: 24; source execution during recovery: no.
- Original research finding: Espressif framework, driver APIs and build tooling.
- Original integration decision: Selected framework for the initial ESP32-S3 target; build tag pinned separately.
- Limitation: Research snapshots track master; hardware build uses v6.1 and remains unflashed.
- Archive part: `APEX-R11-espressif--esp-idf-d445e947156f.tar.gz`; 161,033,649 bytes; SHA-256 `cfc4e598510b2c2d3759a152f26ffd8c09603767a8468083a2ac8e02438e6217`.
- Absent nested entries: `components/bootloader/subproject/components/micro-ecc/micro-ecc` @ `24c60e243580c7868f4334a1ba3123481fe1aa48`, `components/bt/controller/lib_esp32` @ `e4281c149690558467f75137d64bd5334076e7e1`, `components/bt/controller/lib_esp32c2/esp32c2-bt-lib` @ `f36e7642c87d790cd43e6545479de2a93015582c`, `components/bt/controller/lib_esp32c3_family` @ `0a08c4b32f3666003080b662a1a61794da24ff0f`, `components/bt/controller/lib_esp32c5/esp32c5-bt-lib` @ `3556b7b894e93826cf1d83ea1a4962862315cd45`, `components/bt/controller/lib_esp32c6/esp32c6-bt-lib` @ `55334862047fc94a8a40715069390092d21ab000`, `components/bt/controller/lib_esp32h2/esp32h2-bt-lib` @ `7d65dcaeceb6700d6db473988939acd689282082`, `components/bt/controller/lib_esp32h4/esp32h4-bt-lib` @ `c0c43b29a6381ac5a4877ae830ea87e893862435`, `components/bt/controller/lib_esp32s31/esp32s31-bt-lib` @ `7a85006f35f6839ae7ea5adee16e68a757759196`, `components/bt/esp_ble_audio/lib/lib` @ `2480ba6a30beba46a7b18fc1fd061e81dae03b2a`, `components/bt/esp_ble_mesh/lib/lib` @ `8b693178d76ec2578abf46aec53c2fb895b63df7`, `components/bt/host/nimble/nimble` @ `fa3fd0e196e4cec72285cf6a1caedf921f1b057e`, `components/cmock/CMock` @ `eeecc49ce8af123cf8ad40efdb9673e37b56230f`, `components/esp_coex/lib` @ `fa152b3b6b2e3c5e3a57e55fcf4b005a4e28cef9`, `components/esp_phy/lib` @ `20f1db053a0e6cb9f1c09d255c43bf42483041d0`, `components/esp_wifi/lib` @ `d26b374259d0ead25b7f07c9f0e51cde40db8d55`, `components/heap/tlsf` @ `2867f6883a12920b1969ff9624c0ab0e4185c2ce`, `components/lwip/lwip` @ `fc73c67e5c37c27a319725a0aee974c087dbf1a6`, `components/mbedtls/mbedtls` @ `f5c91881be98b4da0bf57c217bf45b668fb84f9f`, `components/openthread/lib` @ `b7bc06ab3cb69d8058192f9177c01468880f4698`, `components/openthread/openthread` @ `43cc05a9bcf780bd758bad53d897e2d88cf8cb75`, `components/protobuf-c/protobuf-c` @ `abc67a11c6db271bedbb9f58be85d6f4e2ea8389`, `components/spiffs/spiffs` @ `ad902cadceb39d0825a97e25ecb5867641f606ba`, `components/unity/unity` @ `bf560290f6020737eafaa8b5cbd2177c3956c03f`.
### R12 · zephyrproject-rtos/zephyr
- Immutable commit: `0534e997eacb94bae1df6c9a7dd4a9a6cbf1cecf`.
- Intended restored path: `research/upstream-sources/R12-zephyrproject-rtos--zephyr`.
- Recorded licence evidence: `LICENSE`; `LICENSES`; `README.license`.
- Root entries: 69,384; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: RTOS with portable drivers and multiple MCU architectures.
- Original integration decision: Evaluate for a later nRF52840 accessory; avoid a second initial RTOS.
- Limitation: Board support does not prove timing or RF performance for APEX.
- Archive part: `APEX-R12-zephyrproject-rtos--zephyr-0534e997eacb.tar.gz`; 292,676,281 bytes; SHA-256 `63a82211c27b2f161061fd98d9720212d865b433c292c22fd6a903c7010a33e0`.
### R13 · mik3y/usb-serial-for-android
- Immutable commit: `4cb9e82cdcfa095eb2fe0b0bea9605f50bd8e2f2`.
- Intended restored path: `research/upstream-sources/R13-mik3y--usb-serial-for-android`.
- Recorded licence evidence: `LICENSE.txt`.
- Root entries: 97; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Android user-space serial drivers supporting several USB bridge families.
- Original integration decision: Candidate expansion beyond the initial CDC-ACM-only native transport.
- Limitation: Not bundled now; initial native code does not claim CP210x, FTDI or CH34x support.
- Archive part: `APEX-R13-mik3y--usb-serial-for-android-4cb9e82cdcfa.tar.gz`; 442,894 bytes; SHA-256 `b2e1c607df20c3bd1a1bcbed5082f75e201a33559e877976b26f987800b683c2`.
### R14 · expo/expo
- Immutable commit: `dfb069d9cc5bcebc493fa6e94d3c61124e62b85a`.
- Intended restored path: `research/upstream-sources/R14-expo--expo`.
- Recorded licence evidence: `LICENSE`; `THIRD-PARTY-LICENSES`.
- Root entries: 23,240; absent nested Git links: 1; source execution during recovery: no.
- Original research finding: React Native tooling, native modules and universal application support.
- Original integration decision: Selected mobile framework, pinned through package-lock.json.
- Limitation: Expo Go cannot contain the custom APEX native module; use a development build.
- Archive part: `APEX-R14-expo--expo-dfb069d9cc5b.tar.gz`; 347,303,930 bytes; SHA-256 `d01c31d3476795f4a619c65c7ce4f6f5749a123371f7a77751d1f6c2cfd44306`.
- Absent nested entries: `react-native-lab/react-native` @ `f7cd036f7b21dfac8a958931360866f0580bf741`.
### R15 · dotintent/react-native-ble-plx
- Immutable commit: `92a496d60f81642d2f45cecfc44f47a62904a86d`.
- Intended restored path: `research/upstream-sources/R15-dotintent--react-native-ble-plx`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 420; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: React Native BLE central/GATT library with notifications and MTU support.
- Original integration decision: Candidate BLE transport after lifecycle and reconnect acceptance tests.
- Limitation: Does not provide Bluetooth Classic or arbitrary radio sniffing; not bundled now.
- Archive part: `APEX-R15-dotintent--react-native-ble-plx-92a496d60f81.tar.gz`; 5,505,414 bytes; SHA-256 `530152eaed07719886a034cb6231f6ca9de30d9223b0715dde458d4cf5f27473`.
### R16 · revtel/react-native-nfc-manager
- Immutable commit: `c44f7110f791901823252610627dc5cbee7dddcd`.
- Intended restored path: `research/upstream-sources/R16-revtel--react-native-nfc-manager`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 209; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: React Native NFC manager with Expo development-build support.
- Original integration decision: Candidate for broader NDEF and iOS support; initial Android metadata reader is original.
- Limitation: Requires NFC hardware and a native build; support varies by tag and handset.
- Archive part: `APEX-R16-revtel--react-native-nfc-manager-c44f7110f791.tar.gz`; 1,735,875 bytes; SHA-256 `668afe44ffa4fbbb862a306326a13c084fb1a499ad20daffc77ebb157dff17b6`.
### R17 · merbanan/rtl_433
- Immutable commit: `f35183aaf1d2d905d422fd70bcae4eb7349d6186`.
- Intended restored path: `research/upstream-sources/R17-merbanan--rtl_433`.
- Recorded licence evidence: `COPYING`.
- Root entries: 602; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Receiver and decoder for supported low-rate radio telemetry protocols.
- Original integration decision: Later process adapter for owned sensor capture and JSON output import.
- Limitation: Supported decoders are finite; the project name does not mean only one frequency.
- Archive part: `APEX-R17-merbanan--rtl_433-f35183aaf1d2.tar.gz`; 3,500,496 bytes; SHA-256 `3b291f10c818f4a0e34d37e8217654710304a01c216a275e1935d4a6c47502b3`.
### R18 · gnuradio/gnuradio
- Immutable commit: `ec1bf153c9222eca81f59d4e063e73d525a51a1a`.
- Intended restored path: `research/upstream-sources/R18-gnuradio--gnuradio`.
- Recorded licence evidence: `COPYING`.
- Root entries: 5,776; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Signal-processing runtime and development toolkit.
- Original integration decision: Desktop processing sidecar and reproducible offline flowgraphs.
- Limitation: Do not route high-rate IQ samples through the React Native JavaScript bridge.
- Archive part: `APEX-R18-gnuradio--gnuradio-ec1bf153c922.tar.gz`; 13,257,136 bytes; SHA-256 `23250a9339dbc9bc5b50ea863db37b57c2e5bf359981cc44ce0c7f5c4727bda1`.
### R19 · pothosware/SoapySDR
- Immutable commit: `cf0c0eb5279aa202d5b3a48aee423294b10244eb`.
- Intended restored path: `research/upstream-sources/R19-pothosware--SoapySDR`.
- Recorded licence evidence: `LICENSE_1_0.txt`.
- Root entries: 167; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Vendor-neutral SDR host abstraction.
- Original integration decision: Candidate sidecar hardware abstraction.
- Limitation: Hardware driver plug-ins retain their own licences and compatibility constraints.
- Archive part: `APEX-R19-pothosware--SoapySDR-cf0c0eb5279a.tar.gz`; 582,001 bytes; SHA-256 `4403ebc81aaa0e21ac2982f2e6b2ab979dcfc22ddc8bd7ad085a0b4aad0d6a7a`.
### R20 · nfc-tools/libnfc
- Immutable commit: `3fa0751ad58fb0053d3de2e61bbbd4066259104c`.
- Intended restored path: `research/upstream-sources/R20-nfc-tools--libnfc`.
- Recorded licence evidence: `COPYING`.
- Root entries: 199; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Userspace NFC reader library with multiple device backends.
- Original integration decision: Evaluate external reader sidecar and file interchange.
- Limitation: Not an Android NFC-controller replacement; dependency/backend compatibility varies.
- Archive part: `APEX-R20-nfc-tools--libnfc-3fa0751ad58f.tar.gz`; 736,826 bytes; SHA-256 `f823584e51bbed5609d7faa6647767b190c398182dfee5e9947ab430f278a9cc`.
### R21 · linux-can/can-utils
- Immutable commit: `834ceef1f1eabec67625389172eebf1050d2f42b`.
- Intended restored path: `research/upstream-sources/R21-linux-can--can-utils`.
- Recorded licence evidence: `LICENSES`.
- Root entries: 132; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Linux SocketCAN tools and log formats.
- Original integration decision: Reference for bounded offline classic CAN log import; later isolated bench adapter.
- Limitation: Access to CAN frames does not establish ECU signal meaning, security access or vehicle control.
- Archive part: `APEX-R21-linux-can--can-utils-834ceef1f1ea.tar.gz`; 696,164 bytes; SHA-256 `4fe4b83c7eb584a371d498a70d2738568547e1e205609e52982a3f67cc1bfaac`.
### R22 · hardbyte/python-can
- Immutable commit: `b4f82abede25ff83376be793a2935c41f81c3869`.
- Intended restored path: `research/upstream-sources/R22-hardbyte--python-can`.
- Recorded licence evidence: `LICENSE.txt`.
- Root entries: 267; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Common Python interfaces and virtual backends for CAN devices.
- Original integration decision: Future virtual-bus fixtures and optional desktop sidecar.
- Limitation: No vehicle writes, diagnostics unlock or immobiliser functionality is integrated.
- Archive part: `APEX-R22-hardbyte--python-can-b4f82abede25.tar.gz`; 2,613,372 bytes; SHA-256 `7f228887ab856287aa0b55069f6b5cc2db0bd09220e91928889470a8b9ea59f7`.
### R23 · pymodbus-dev/pymodbus
- Immutable commit: `e0460de3f4646f82f232486ea528602d7f676c36`.
- Intended restored path: `research/upstream-sources/R23-pymodbus-dev--pymodbus`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 208; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Python Modbus client/server/simulator implementation.
- Original integration decision: Candidate local PLC simulator and bounded register-read adapter.
- Limitation: Device register maps remain vendor-specific; no industrial network discovery implemented.
- Archive part: `APEX-R23-pymodbus-dev--pymodbus-e0460de3f464.tar.gz`; 5,381,996 bytes; SHA-256 `c72e719b9710ad7c5d3c788180afced2df351fb10de8958c78b4561128b05298`.
### R24 · bacnet-stack/bacnet-stack
- Immutable commit: `62e4340bf044a4fdeb3d860dcda2c6e079e2f5ba`.
- Intended restored path: `research/upstream-sources/R24-bacnet-stack--bacnet-stack`.
- Recorded licence evidence: `license`.
- Root entries: 1,863; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Embedded and host BACnet stack with multiple data links.
- Original integration decision: Later local simulator and property-read interoperability tests.
- Limitation: An open protocol does not imply open building-controller access.
- Archive part: `APEX-R24-bacnet-stack--bacnet-stack-62e4340bf044.tar.gz`; 22,325,994 bytes; SHA-256 `1669f2edf45ccf4e43f2cb228a83ed51823b1ca5462fb6bd45d8a90374a78457`.
### R25 · osdp-dev/libosdp
- Immutable commit: `3654c63685d9f47c298127dafd832a4f363a2f10`.
- Intended restored path: `research/upstream-sources/R25-osdp-dev--libosdp`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 342; absent nested Git links: 1; source execution during recovery: no.
- Original research finding: C OSDP control-panel/peripheral library with secure-channel support.
- Original integration decision: Candidate owned reader/controller bench fixture over isolated RS-485.
- Limitation: Secure-channel commissioning and device-specific keys remain necessary.
- Archive part: `APEX-R25-osdp-dev--libosdp-3654c63685d9.tar.gz`; 1,599,961 bytes; SHA-256 `4a093ebb4f6567cfc796cd80e2796852eee90b10dcd2b562be0d7aa16e9d47c6`.
- Absent nested entries: `utils` @ `538ba7b87170f1313f63ab6be90a8e3716deb085`.
### R26 · sigmf/SigMF
- Immutable commit: `60121977f5f8d1145553251a3b3d0dbe2819aa14`.
- Intended restored path: `research/upstream-sources/R26-sigmf--SigMF`.
- Recorded licence evidence: `LICENSE.md`.
- Root entries: 24; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Recording metadata specification for portable signal datasets.
- Original integration decision: Use metadata concepts for future IQ capture provenance; no specification text copied.
- Limitation: A recording schema is not a licence for the recorded content.
- Archive part: `APEX-R26-sigmf--SigMF-60121977f5f8.tar.gz`; 2,945,050 bytes; SHA-256 `06f48d7b4a75d0896aa3889dcaee92370def696ee6b80c9d1e28bb2c18c8fc19`.
### R27 · jopohl/urh
- Immutable commit: `1403d92987cc3d01d41aff64250955ce455dabd2`.
- Intended restored path: `research/upstream-sources/R27-jopohl--urh`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 575; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Desktop wireless protocol investigation and demodulation toolkit.
- Original integration decision: External analysis/export interoperability reference.
- Limitation: Inference produces hypotheses; it cannot certify authentication success or invent secret keys.
- Archive part: `APEX-R27-jopohl--urh-1403d92987cc.tar.gz`; 27,086,660 bytes; SHA-256 `f8bdb9f2b8e9ce0ccd814658e7630a4fd48756ae1d7da41eaf304ef9d92b2628`.
### R28 · libusb/libusb
- Immutable commit: `987c1170d0018ba82557823a98ae443e8335e11b`.
- Intended restored path: `research/upstream-sources/R28-libusb--libusb`.
- Recorded licence evidence: `COPYING`.
- Root entries: 185; absent nested Git links: 0; source execution during recovery: no.
- Original research finding: Portable userspace USB library.
- Original integration decision: Future SDR/native sidecar USB dependency.
- Limitation: Android file-descriptor handling and permissions still need explicit integration.
- Archive part: `APEX-R28-libusb--libusb-987c1170d001.tar.gz`; 1,171,677 bytes; SHA-256 `66899a8efa282f6ed88a43f6a4458eef41ded00f1dd2275b4d2806885ec91880`.
### R29 · RocketGod-git/mayhem-mobile
- Immutable commit: `a18fca46f58519fc81e19304fc13bbf3da2aa69f`.
- Intended restored path: `research/upstream-sources/R29-RocketGod-git--mayhem-mobile`.
- Recorded licence evidence: `LICENSE`.
- Root entries: 611; absent nested Git links: 0; source execution during recovery: no.
- Current purpose: Mayhem Mobile format and Android/WebUSB architecture research; original APEX C8 importer exists separately, not copied GPL implementation.
- Archive part: `APEX-R29-RocketGod-git--mayhem-mobile-a18fca46f585.tar.gz`; 26,044,750 bytes; SHA-256 `156030a36a46d055abe9bdcf2520942c1466d448413c4f02cca06a342eb387c2`.
### R30 · portapack-mayhem/mayhem-firmware
- Immutable commit: `97c349701723b7f8334b71867439a436a5ab8d02`.
- Intended restored path: `research/upstream-sources/R30-portapack-mayhem--mayhem-firmware`.
- Recorded licence evidence: `LICENSE`; `LICENSE.GPL-2.0-or-later`.
- Root entries: 4,253; absent nested Git links: 1; source execution during recovery: no.
- Current purpose: PortaPack/Mayhem firmware and saved recording reference; no deployed APEX integration.
- Archive part: `APEX-R30-portapack-mayhem--mayhem-firmware-97c349701723.tar.gz.part1`; 268,435,456 bytes; SHA-256 `399e01ecaeb31ede3ebaa3b35e286905fc583ee5e4ff1519d661e61311fd3ac8`.
- Archive part: `APEX-R30-portapack-mayhem--mayhem-firmware-97c349701723.tar.gz.part2`; 266,491,933 bytes; SHA-256 `e500169337917bc9355306af460fc434d47efc8d7c0c4ce2c25246ad07bea075`.
- Absent nested entries: `hackrf` @ `b80cddb56bbfd01c9a951dc5000826b53f463767`.
### R31 · morluto/rea
- Immutable commit: `144843ccc26bd372d61b8c6a27b37a01a5b0fb61`.
- Intended restored path: `research/upstream-sources/R31-morluto--rea`.
- Recorded licence evidence: `LICENSE`; `THIRD_PARTY_NOTICES.md`.
- Root entries: 7,081; absent nested Git links: 5; source execution during recovery: no.
- Current purpose: REA analysis-tool reference; pinned CLI and supervised objdump evidence exist, full Ghidra programme and worker integration remain unfinished.
- Archive part: `APEX-R31-morluto--rea-144843ccc26b.tar.gz`; 49,631,058 bytes; SHA-256 `186e92a08125bd796c1aa71d9c1e9cd63712aaf4830dded7dae4e4866ba80274`.
- Absent nested entries: `third_party/binwalk` @ `4fdab3d464d97b68e0af9088df3f9e2e1545b21c`, `third_party/ghidra-nativeaot` @ `effeb734fc570c32650f88b159608979dc7b423e`, `third_party/jadx-headless-mcp` @ `5844800a486d2248fa949b74c9896285f5b54de2`, `third_party/unblob` @ `1fcc7a0a584a70a96c31f5a276c20944d199a089`, `third_party/wakaru` @ `8219bf5016a063d7fb215101a8c45d5959ec733f`.
