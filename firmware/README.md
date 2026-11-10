# Accessory firmware

The separate [signed-read laboratory target](esp32s3-signed-lab/README.md) adds
opt-in USB-only Ed25519 replies with offline lab key provisioning. It is disabled
by default and does not change any existing firmware target. Compilation and
host-process tests do not authorise flashing or establish physical acceptance.

`core/` is original portable C with fixed-size buffers and three system operations. `host/` runs that same core as a real process. `esp32s3/` supplies USB Serial/JTAG I/O with ESP-IDF v6.1. There are no radio, tag, CAN or industrial drivers in this firmware yet.

From the repository root:

```sh
npm run firmware:build
npm run demo
python3 tools/build_firmware.py --sanitize
```

With ESP-IDF v6.1 and its ESP32-S3 toolchain installed:

```sh
cd firmware/esp32s3
idf.py set-target esp32s3
idf.py build
```

Use the board's native USB port, not an unrelated USB-UART bridge. SDK logs stay on UART. Boot ROM output may still be present before the application starts; AXP framing can discard noise. This target has not been flashed or electrically validated in the foundation environment. Hardware IDs are development labels, not unique authenticated identities.

See docs/HARDWARE_STRATEGY.md before attaching external peripherals. Do not use `idf.py monitor` on the same port while the APEX application owns it. Flashing, recovery and actual Android USB interoperability remain explicit acceptance gates.
