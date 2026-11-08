# Licensing inventory

APEX original source remains private and all rights reserved pending the owner's licensing decision. Repository privacy does not remove third-party obligations. No upstream Flipper, Bruce, Proxmark, Chameleon, SDR or industrial-tool source is copied into this foundation. Expo and its dependencies are installed normally, with exact versions in package-lock.json. The ESP-IDF target references its SDK rather than vendoring it.

The following is an engineering intake inventory, not a blanket redistribution clearance. GitHub's detected licence is only a clue: PyModbus, HackRF, CAN utilities and BACnet demonstrate why component/file inspection matters. A process boundary is an architectural choice, not proof that copyleft obligations disappear.

| ID | Project | Observed terms | Current disposition |
| --- | --- | --- | --- |
| R01 | [flipperdevices/flipperzero-firmware](https://github.com/flipperdevices/flipperzero-firmware/commit/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a) | GPL-3.0 family; file-level review before reuse. | Research only |
| R02 | [GthiN89/FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on](https://github.com/GthiN89/FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on/commit/83cd7d56d06e8b0efb306c44bd23854131e3a767) | GPL-3.0 family; hardware and inherited assets need separate review. | Research only |
| R03 | [BruceDevices/firmware](https://github.com/BruceDevices/firmware/commit/a59213f3ec6cd302fa32c2042b2700c9c24d991a) | AGPL-3.0-or-later per THIRD_PARTY.md; inherited code and data require individual review. | Research only |
| R04 | [RfidResearchGroup/proxmark3](https://github.com/RfidResearchGroup/proxmark3/commit/754bbae3d946429a6354cd34a97a2dd29ce6f157) | GPL-3.0-or-later per README; dependency licences vary. | Research only |
| R05 | [RfidResearchGroup/ChameleonUltra](https://github.com/RfidResearchGroup/ChameleonUltra/commit/4c5bc2cb6b023d23f7bbc383c9b2b5e39f95419e) | GPL-3.0 family; review selected firmware/software files. | Research only |
| R06 | [greatscottgadgets/hackrf](https://github.com/greatscottgadgets/hackrf/commit/468c5d93b66032c892c95bbf9ff15ff1b803e84f) | Mixed: root GPL-2.0; inspected libhackrf source has BSD-3-Clause terms. | Research only |
| R07 | [meshtastic/firmware](https://github.com/meshtastic/firmware/commit/f9c26505edb40c31038f5bcd71127fa408a6e929) | GPL-3.0 family; client/protobuf packages need independent inventory. | Research only |
| R08 | [jgromes/RadioLib](https://github.com/jgromes/RadioLib/commit/3a664b64099e4bdbdb3e6f28a5ca6b833050b21e) | MIT. | Research only |
| R09 | [crankyoldgit/IRremoteESP8266](https://github.com/crankyoldgit/IRremoteESP8266/commit/1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f) | LGPL-2.1 family. | Research only |
| R10 | [hathach/tinyusb](https://github.com/hathach/tinyusb/commit/67570a60d4c87f8bd6da7e49643b667472d63786) | MIT; dependency subtrees need separate review. | Research only |
| R11 | [espressif/esp-idf](https://github.com/espressif/esp-idf/commit/d445e947156f276dfe0db5804e4edf6ae90fe6fb) | Apache-2.0 root; third-party components have separate licences. | Referenced target SDK |
| R12 | [zephyrproject-rtos/zephyr](https://github.com/zephyrproject-rtos/zephyr/commit/0534e997eacb94bae1df6c9a7dd4a9a6cbf1cecf) | Apache-2.0 root; modules vary. | Research only |
| R13 | [mik3y/usb-serial-for-android](https://github.com/mik3y/usb-serial-for-android/commit/4cb9e82cdcfa095eb2fe0b0bea9605f50bd8e2f2) | MIT. | Research only |
| R14 | [expo/expo](https://github.com/expo/expo/commit/dfb069d9cc5bcebc493fa6e94d3c61124e62b85a) | MIT root; transitive dependency inventory generated separately. | Framework dependency |
| R15 | [dotintent/react-native-ble-plx](https://github.com/dotintent/react-native-ble-plx/commit/92a496d60f81642d2f45cecfc44f47a62904a86d) | Apache-2.0. | Research only |
| R16 | [revtel/react-native-nfc-manager](https://github.com/revtel/react-native-nfc-manager/commit/c44f7110f791901823252610627dc5cbee7dddcd) | MIT. | Research only |
| R17 | [merbanan/rtl_433](https://github.com/merbanan/rtl_433/commit/f35183aaf1d2d905d422fd70bcae4eb7349d6186) | GPL-2.0 family; inspect individual files. | Research only |
| R18 | [gnuradio/gnuradio](https://github.com/gnuradio/gnuradio/commit/ec1bf153c9222eca81f59d4e063e73d525a51a1a) | GPL-3.0 family; block licences vary. | Research only |
| R19 | [pothosware/SoapySDR](https://github.com/pothosware/SoapySDR/commit/cf0c0eb5279aa202d5b3a48aee423294b10244eb) | BSL-1.0. | Research only |
| R20 | [nfc-tools/libnfc](https://github.com/nfc-tools/libnfc/commit/3fa0751ad58fb0053d3de2e61bbbd4066259104c) | LGPL-3.0 family. | Research only |
| R21 | [linux-can/can-utils](https://github.com/linux-can/can-utils/commit/834ceef1f1eabec67625389172eebf1050d2f42b) | Mixed file-level BSD-3-Clause and GPL-2.0-only; Linux syscall exception also present. | Research only |
| R22 | [hardbyte/python-can](https://github.com/hardbyte/python-can/commit/b4f82abede25ff83376be793a2935c41f81c3869) | LGPL-3.0 family. | Research only |
| R23 | [pymodbus-dev/pymodbus](https://github.com/pymodbus-dev/pymodbus/commit/e0460de3f4646f82f232486ea528602d7f676c36) | BSD-3-Clause terms in LICENSE, despite GitHub NOASSERTION. | Research only |
| R24 | [bacnet-stack/bacnet-stack](https://github.com/bacnet-stack/bacnet-stack/commit/62e4340bf044a4fdeb3d860dcda2c6e079e2f5ba) | Mixed: GPL-2.0-or-later WITH GCC-exception-2.0, MIT and other files; inspect each selected file. | Research only |
| R25 | [osdp-dev/libosdp](https://github.com/osdp-dev/libosdp/commit/3654c63685d9f47c298127dafd832a4f363a2f10) | Apache-2.0. | Research only |
| R26 | [sigmf/SigMF](https://github.com/sigmf/SigMF/commit/60121977f5f8d1145553251a3b3d0dbe2819aa14) | CC-BY-SA-4.0 for the specification; implementations vary. | Research only |
| R27 | [jopohl/urh](https://github.com/jopohl/urh/commit/1403d92987cc3d01d41aff64250955ce455dabd2) | GPL-3.0 family. | Research only |
| R28 | [libusb/libusb](https://github.com/libusb/libusb/commit/987c1170d0018ba82557823a98ae443e8335e11b) | LGPL-2.1-or-later per README. | Research only |

Before adopting code, record exact release/commit, selected files, author notices, direct/transitive dependencies, modifications, build scripts, source provision and relinking requirements where applicable. Audit firmware, host libraries, hardware CAD, documentation, trademarks, datasets and credential material separately. Do not import keystores or assume a firmware licence covers manufacturer secrets.

Distribution gates: produce an SBOM from the lockfile and selected SDK components; retain notices in shipped artefacts; prepare corresponding source where required; review app-store and static-linking implications before distributing copyleft-derived firmware or applications. The included npm inventory is a lockfile report, not a completed source-licence audit.

