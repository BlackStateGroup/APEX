# Source copy and backup catalogue

31 source projects are registered under `research/upstream-sources/`. Source snapshots were verified against pinned Git commits. Local copies can be materialised on demand after workspace maintenance. Their restorable backups include source files and Git metadata. Original licence files remain in each checkout.

The original 30 snapshots cover 157,411 tracked entries and 1,937,330,939 archived bytes. R31 adds 7,081 tracked entries and 49,631,058 archived bytes. They are shallow root-repository checkouts. The original archive snapshots omit the 58 root nested submodule entries listed in source-imports.json. Subsequent local recursive fetching is recorded separately in [nested-dependencies.json](nested-dependencies.json), including the broken DIY Flipper declaration. Original archive hashes and backup contents are unchanged. R31 adds five uninitialised provider-source submodules, explicitly listed with pins in the manifest; they are not included in its root snapshot archive.

| ID | Repository | Pinned commit | Source backup |
| --- | --- | --- | --- |
| R01 | flipperdevices/flipperzero-firmware | `9981d9d4aa5e` | [Archive](https://chatgpt.com/library?file_id=libfile_de4c701893bc8191929213d852cdf920&account_id=personal) |
| R02 | GthiN89/FuckingCheapFlipperZero-DIY-Flipper-zero-The-real-on | `83cd7d56d06e` | [Archive](https://chatgpt.com/library?file_id=libfile_947b76d113f08191abb8de6de7852779&account_id=personal) |
| R03 | BruceDevices/firmware | `a59213f3ec6c` | [Archive](https://chatgpt.com/library?file_id=libfile_8d4a703ed2308191ae2497b8e0e141e9&account_id=personal) |
| R04 | RfidResearchGroup/proxmark3 | `754bbae3d946` | [Archive](https://chatgpt.com/library?file_id=libfile_def31ed15354819187ecc3eb14bf9c92&account_id=personal) |
| R05 | RfidResearchGroup/ChameleonUltra | `4c5bc2cb6b02` | [Archive](https://chatgpt.com/library?file_id=libfile_946a459f14308191b910ef18d272239d&account_id=personal) |
| R06 | greatscottgadgets/hackrf | `468c5d93b660` | [Archive](https://chatgpt.com/library?file_id=libfile_bcc57a1db9f08191b139a39c1994dda5&account_id=personal) |
| R07 | meshtastic/firmware | `f9c26505edb4` | [Archive](https://chatgpt.com/library?file_id=libfile_448c30c8ee9c819194962253dd7a1675&account_id=personal) |
| R08 | jgromes/RadioLib | `3a664b64099e` | [Archive](https://chatgpt.com/library?file_id=libfile_4d6aaa6946548191800e0c6a2d3c2dcb&account_id=personal) |
| R09 | crankyoldgit/IRremoteESP8266 | `1e2f0f3ef0a9` | [Archive](https://chatgpt.com/library?file_id=libfile_7264a334fdc8819193e98f4d3cbf8409&account_id=personal) |
| R10 | hathach/tinyusb | `67570a60d4c8` | [Archive](https://chatgpt.com/library?file_id=libfile_4bd339f4f1488191b76401f6e800219f&account_id=personal) |
| R11 | espressif/esp-idf | `d445e947156f` | [Archive](https://chatgpt.com/library?file_id=libfile_58d17e72e6508191bae6669027503301&account_id=personal) |
| R12 | zephyrproject-rtos/zephyr | `0534e997eacb` | [Archive](https://chatgpt.com/library?file_id=libfile_5bbb084820408191aee632dfcec3246c&account_id=personal) |
| R13 | mik3y/usb-serial-for-android | `4cb9e82cdcfa` | [Archive](https://chatgpt.com/library?file_id=libfile_a8dd9202f29881919e24de319d8e541d&account_id=personal) |
| R14 | expo/expo | `dfb069d9cc5b` | [Archive](https://chatgpt.com/library?file_id=libfile_6d93139e41dc8191b9035dc7e5ba905b&account_id=personal) |
| R15 | dotintent/react-native-ble-plx | `92a496d60f81` | [Archive](https://chatgpt.com/library?file_id=libfile_9d1fe09691ac8191a5d4e4501a73e1f1&account_id=personal) |
| R16 | revtel/react-native-nfc-manager | `c44f7110f791` | [Archive](https://chatgpt.com/library?file_id=libfile_bff2fd05ec848191b799744b673be7da&account_id=personal) |
| R17 | merbanan/rtl_433 | `f35183aaf1d2` | [Archive](https://chatgpt.com/library?file_id=libfile_121941abb1a88191985c24194a110a71&account_id=personal) |
| R18 | gnuradio/gnuradio | `ec1bf153c922` | [Archive](https://chatgpt.com/library?file_id=libfile_4fe8f85613a08191805e102ab7747659&account_id=personal) |
| R19 | pothosware/SoapySDR | `cf0c0eb5279a` | [Archive](https://chatgpt.com/library?file_id=libfile_7ca0f6a41e0c8191b60504d9001526f9&account_id=personal) |
| R20 | nfc-tools/libnfc | `3fa0751ad58f` | [Archive](https://chatgpt.com/library?file_id=libfile_384803416bac8191a8be5994f8fde7d3&account_id=personal) |
| R21 | linux-can/can-utils | `834ceef1f1ea` | [Archive](https://chatgpt.com/library?file_id=libfile_bae1111560dc8191a3864b7be20387f1&account_id=personal) |
| R22 | hardbyte/python-can | `b4f82abede25` | [Archive](https://chatgpt.com/library?file_id=libfile_b1c3ad41b1348191a1dc6e4a8d0ed67e&account_id=personal) |
| R23 | pymodbus-dev/pymodbus | `e0460de3f464` | [Archive](https://chatgpt.com/library?file_id=libfile_b1348ab7602c81918429ab0528400859&account_id=personal) |
| R24 | bacnet-stack/bacnet-stack | `62e4340bf044` | [Archive](https://chatgpt.com/library?file_id=libfile_3c142df9308c8191982291d4a0501957&account_id=personal) |
| R25 | osdp-dev/libosdp | `3654c63685d9` | [Archive](https://chatgpt.com/library?file_id=libfile_902e5d942bd081919324d71be79a6d3a&account_id=personal) |
| R26 | sigmf/SigMF | `60121977f5f8` | [Archive](https://chatgpt.com/library?file_id=libfile_47cd36c7ba00819187b596e94fc9ee08&account_id=personal) |
| R27 | jopohl/urh | `1403d92987cc` | [Archive](https://chatgpt.com/library?file_id=libfile_5f2dc9f8207881919c1cbee0226ff363&account_id=personal) |
| R28 | libusb/libusb | `987c1170d001` | [Archive](https://chatgpt.com/library?file_id=libfile_b69552d2078481919a6cb02b8e11f7b5&account_id=personal) |
| R29 | RocketGod-git/mayhem-mobile | `a18fca46f585` | [Archive](https://chatgpt.com/library?file_id=libfile_78d961b0604c81918038b2aa77521acc&account_id=personal) |
| R30 | portapack-mayhem/mayhem-firmware | `97c349701723` | [Part 1](https://chatgpt.com/library?file_id=libfile_36f3d08472ac819193a47fba6be3458c&account_id=personal), [Part 2](https://chatgpt.com/library?file_id=libfile_04a6456132f88191869f6f97caa8446e&account_id=personal) |
| R31 | morluto/rea | `144843ccc26b` | [Archive](https://chatgpt.com/library?file_id=libfile_0ff8f1f68fe8819192b0fd4c86b4bde8&account_id=personal) |

Mayhem firmware has two archive parts. Reassemble in recorded order and verify the full archive SHA-256 before extraction. Use tools/restore_source_archives.py with the downloaded backup files.

## Still unresolved from the other conversation

These names/URLs were not recovered and have not been invented: unnamed Android SDR visualisation repository; unnamed vehicle/industrial communication repository; unnamed accessory firmware repository.

## Platform scope

iPhone and Android are both first-class targets. The current Android native module has build evidence. The unsigned iOS Simulator build has passed; physical iPhone testing and signing remain pending. See docs/PLATFORM_SCOPE.md.

## Verification

The original 30 snapshots were verified on 1 November; R31 was verified on 2 November. All 32 backup files have persistent identities recorded. Reference snapshots have not been built. Separately pinned NFC/BLE releases are integrated, and the pinned REA npm release has now been executed for static analysis of APEX-owned lab firmware. Source import does not imply interoperability or a hardware breakthrough.
