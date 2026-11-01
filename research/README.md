# Evidence register

`upstreams.json` records primary repositories, exact commit and document blob identifiers, observed licences, integration decisions and limitations. Source-inspected means documentation/source review only. No entry is promoted to APEX hardware verification by an upstream's claims.

Additional platform references reviewed on 1 November 2026:

- [Android USB host](https://developer.android.com/develop/connectivity/usb/host): device enumeration, OS permission and interface/endpoint ownership.
- [Android NFC](https://developer.android.com/develop/connectivity/nfc/nfc): tag technologies and NDEF handling.
- [Android Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions): runtime and legacy permission differences.
- [Android Wi-Fi scanning](https://developer.android.com/develop/connectivity/wifi/wifi-scan): result age, failure states and throttling.
- [Expo native modules](https://docs.expo.dev/modules/get-started/) and [module API](https://docs.expo.dev/modules/module-api/): development builds and Kotlin module integration.
- [Flipper hardware](https://docs.flipper.net/zero/development/hardware/tech-specs): distinct MCU and RF front ends.
- [CC1101 manufacturer specifications](https://www.ti.com/product/CC1101): supported tuning bands/modulations.
- [HackRF One specifications](https://hackrf.readthedocs.io/en/stable/hackrf_one.html): frequency, sample rate, sample resolution and half-duplex operation.
- [Meshtastic client API](https://meshtastic.org/docs/development/device/client-api/): existing protobuf/transport protocol, not AXP.
- [Linux SocketCAN](https://docs.kernel.org/networking/can.html): CAN bus and host interface concepts.
- [ESP-IDF v6.1 USB Serial/JTAG driver](https://github.com/espressif/esp-idf/blob/v6.1/components/esp_driver_usb_serial_jtag/include/driver/usb_serial_jtag.h): target API checked against the selected release.

Research is broad enough to select a foundation, not a completed audit or compile/test of all 28 projects. Revalidate maintenance, releases, advisories and selected-file licences when adopting a component.
