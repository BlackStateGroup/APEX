# APEX phone-radio feasibility

Research date: 7 November 2026. This is a documentation-backed feasibility assessment, not a physical-device test. Exact phone models, OS versions, entitlements, accessories and test targets have not been verified.

## Main finding

There is meaningful scope for a phone-first APEX. Modern phones can discover and interpret supported Bluetooth advertisements, exchange GATT data with permitted peripherals, read supported NFC tags, and use network and ranging APIs. These are already radio interactions, not simulations.

However, application access to decoded protocol data is different from access to raw RF samples. The documented public SDKs reviewed do not establish a stock-iPhone or stock-Android route to arbitrary sub-GHz reception, arbitrary I/Q capture, arbitrary modulation, or universal credential emulation. This is a finding about supported access, not a claim that every chipset research avenue is impossible.

Software can expose functionality that firmware previously hid on specific compatible hardware. It cannot be assumed to add a missing analog receive path, antenna bandwidth, modulation support or authentication secret. Detecting a transmission, decoding its format and having authority to operate its device are separate milestones.

## Verified capability matrix

| Area | iPhone application path | Android application path | What APEX may honestly claim |
| --- | --- | --- | --- |
| Bluetooth LE | Core Bluetooth discovery, exposed advertisement fields, RSSI and GATT interaction. Public API output is not a complete over-the-air capture. | BLE scanning exposes ScanRecord bytes, service/manufacturer data and scan metadata; GATT permits supported interaction. | Native advertisement inspection and authorized peripheral diagnostics, with platform-specific capture provenance. |
| NFC | Core NFC reader sessions for supported tag technologies and NDEF. Exact device, entitlement and tag support must be checked. | TagTechnology APIs including NfcA/B/F/V, IsoDep and NDEF; some technologies depend on chipset. | Read and interpret supported, authorized tags at NFC range, not all RFID frequencies. |
| NFC emulation | Separate restricted entitlement/program paths exist; Core NFC reading is not blanket card emulation. | HCE supports a defined reader/card protocol workflow; it is not equivalent to cloning every tag or its secrets. | Lab application protocol emulation only where supported and authorized. |
| Wi-Fi | No general-purpose scanning API. Special-purpose networking, accessory setup and Wi-Fi Aware are available. | WifiManager returns visible access-point scan results, subject to permissions and throttling. | Network metadata/authorized network diagnostics; do not label scan metadata as raw frames or spectrum. |
| UWB and modern ranging | Nearby Interaction exposes supported peer distance/direction. Newer Channel Sounding APIs require compatible OS, hardware and accessories. | UWB and Ranging APIs expose capabilities and peer ranging, including several technologies on recent Android versions. | Cooperative ranging, not arbitrary nearby-device demodulation. |
| Sub-GHz, LF RFID and arbitrary RF | No supported general receive/transmit API identified in reviewed public SDKs. | No supported general receive/transmit API identified in reviewed public SDKs. | Accessory or narrowly hardware-specific research capability, never assumed native support. |
| External receiver | BLE or network bridge is practical. MFi External Accessory and approved device-class paths have additional constraints. | USB host offers explicit device access with user permission and compatible hardware/driver support; BLE/network bridges also work. | Phone as controller, decoder and evidence viewer, with radio acquisition attributed to the accessory. |

Sources: [Android ScanRecord](https://developer.android.com/reference/android/bluetooth/le/ScanRecord), [Apple Core Bluetooth](https://developer.apple.com/documentation/corebluetooth), [Apple Core NFC sessions](https://developer.apple.com/documentation/CoreNFC/NFCTagReaderSession), [Android advanced NFC](https://developer.android.com/develop/connectivity/nfc/advanced-nfc), [Android HCE](https://developer.android.com/develop/connectivity/nfc/hce), [Apple NFC & SE Platform](https://developer.apple.com/support/nfc-se-platform/).

## Constraints that affect a real implementation

- Android's ScanRecord.getBytes returns advertising scan-record bytes, not general raw RF. Android 12+ Bluetooth permissions must be handled. The neverForLocation declaration can filter some beacons, so an empty result is not proof that no transmitter exists. [ScanRecord](https://developer.android.com/reference/android/bluetooth/le/ScanRecord), [Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions).
- iOS background BLE scanning behaves differently from foreground scanning; duplicate discoveries may be coalesced and scan intervals increased. Do not promise continuous or complete capture. [Apple background BLE guide](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html).
- Apple's current Wi-Fi overview explicitly excludes a general scan API. Hotspot-helper entitlement is for hotspot integration, not a general workaround. iOS 26 introduced Wi-Fi Aware for compatible paired peers/accessories. [TN3111](https://developer.apple.com/documentation/technotes/tn3111-ios-wifi-api-overview), [Wi-Fi Aware peer connections](https://developer.apple.com/documentation/WiFiAware/Connecting-paired-devices).
- Android Wi-Fi results may be cached. Current documentation describes four foreground scans per two minutes and one background scan per thirty minutes across background apps. Capture age, scan success and permission state belong in the data model. [Android Wi-Fi scanning](https://developer.android.com/develop/connectivity/wifi/wifi-scan).
- NFC operates at 13.56 MHz. A phone NFC API should not be presented as a reader for 125 kHz credentials or arbitrary UHF RFID. [NFC Forum technical overview](https://nfc-forum.org/learn/nfc-technology/).
- Apple's WWDC26 documentation adds iOS 27 Bluetooth Channel Sounding on N1-equipped iPhones. It requires a paired, connected compatible accessory; the presentation specifies Bluetooth 6.3 with inline PCT, phase-based modes 0/2 and T_FCS of at least 100 microseconds. Sessions are foreground-only; measurement rates can fall with competing radio activity. Direction uses camera assistance. Treat this as a capability-gated option, not a baseline promise. [Apple Channel Sounding](https://developer.apple.com/videos/play/wwdc2026/369/).
- Android's Ranging module begins at Android 16/API 36 and includes UWB, Bluetooth Channel Sounding, Wi-Fi NAN RTT and Bluetooth RSSI. Current docs add Android 17/API 37 Wi-Fi Proximity Detection and UWB DL-TDoA. Discover actual runtime capability before offering any mode. These are not arbitrary RF capture APIs. [Android Ranging](https://developer.android.com/develop/connectivity/ranging), [Apple Nearby Interaction](https://developer.apple.com/documentation/NearbyInteraction).

## Inventive routes worth testing

1. **Phone-only discovery and interpretation first.** Build a native BLE collector and NFC reader, with Android Wi-Fi metadata where permitted. Feed captured bytes into an offline decoder. Preserve unknown fields rather than having AI invent meanings. A browser dashboard can remain the analysis interface, but it does not grant native-radio capabilities by itself.

2. **Controlled differential experiments.** On an owned test sensor, deliberately change one known value while recording advertisements. Compare payloads and timestamps against ground truth. This can establish a field interpretation without needing an SDR. Separate a statistical correlation from a verified protocol mapping; repeat over held-out values.

3. **A receive-only bridge before custom hardware.** If an existing authorized lab receiver or gateway is available, send its observations to the phone over LAN or BLE. Use BLE for commands and compact decoded events; use a measured network transport for high-rate captures. This makes the phone the practical instrument interface without pretending its own antenna received the signal. No new purchase is assumed.

4. **Android USB-host capture path.** A supported external receiver can communicate through Android's USB host API after user permission. Actual compatibility still depends on phone USB support, accessory power, driver/library support and sustained data rates. An OTG connector alone does not prove compatibility. [Android USB host](https://developer.android.com/develop/connectivity/usb/host).

5. **iPhone network-connected or BLE accessory.** Prefer a documented transport rather than assuming a USB-C socket exposes arbitrary USB endpoints. External Accessory is an MFi-specific path; DriverKit's documented availability includes macOS and M-series iPadOS, not a general iPhone driver path. [External Accessory](https://developer.apple.com/documentation/externalaccessory/), [DriverKit](https://developer.apple.com/documentation/driverkit).

6. **Model-specific firmware research as a separate lab track.** Nexmon CSI demonstrates real additional access on explicitly supported Broadcom chips, including Nexus 5/6P and some Raspberry Pi/router hardware. It extracts channel-state information from supported Wi-Fi frames. That is concrete evidence that some software restrictions can be overcome on compatible owned hardware, but not evidence of universal smartphone RF access, sub-GHz reception or stock iPhone support. No rooting or firmware changes were performed. [Nexmon CSI primary repository](https://github.com/seemoo-lab/nexmon_csi).

7. **If sub-GHz is the chosen target, specify the receiver honestly.** For example, a CC1101-based bridge covers particular bands and modulation families rather than all radio. TI documents 300–348, 387–464 and 779–928 MHz ranges with a configurable modem. This illustrates a narrowly matched receive accessory, not a universal SDR. [TI CC1101](https://www.ti.com/product/CC1101).

## First experiment and acceptance criteria

Begin with synthetic BLE advertising fixtures and then repeat the identical pipeline against an owned BLE sensor. Record platform, API, phone model/OS, permission state, timestamp, RSSI, source bytes or exposed fields, and whether data is synthetic, imported or live. Android scan bytes and iOS normalized advertisement dictionaries must remain different input types.

Minimum tests: valid fields; unknown AD types; malformed lengths; truncated data; absent names; duplicate or repeated fields; byte-order examples; missing signal metrics; and stale/cached observations. Preserve original bytes and parsing errors. Do not convert a manufacturer ID, local name or RSSI into authenticated identity.

Success means a reproducible capture-to-decode result with known ground truth. A parser passing fixtures does not prove physical capture works, and a successful capture does not prove control of a device. Require exact hardware evidence before upgrading an experimental capability to supported.
