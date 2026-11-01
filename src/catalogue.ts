export const catalogue = [
  { domain: 'AXP control plane', status: 'Host verified', detail: 'Identity, capability negotiation and binary ping' },
  { domain: 'Infrared / NEC', status: 'Offline decoder', detail: 'Standard 32-bit pulse fixture analysis' },
  { domain: 'Vehicle / CAN', status: 'Offline parser', detail: 'Classic candump data frames, no live bus connection' },
  { domain: 'iPhone + Android NFC/BLE', status: 'Native integration', detail: 'Foreground tag metadata and custom AXP BLE transport implemented; physical hardware tests pending' },
  { domain: 'Local evidence', status: 'Persistence tested', detail: 'SQLite/native and browser summaries with SHA-256 checks; no encryption or signatures claimed' },
  { domain: 'Android USB + NFC', status: 'Native build passed', detail: 'CDC transport and tag metadata; debug APK built, hardware validation pending' },
  { domain: 'ESP32-S3 accessory', status: 'Cross-built', detail: 'ESP-IDF v6.1 USB Serial/JTAG firmware; board test pending' },
  { domain: 'RFID / Sub-GHz / SDR', status: 'Planned', detail: 'Specialist front ends and separate device adapters' },
  { domain: 'BLE / Wi-Fi / LoRa', status: 'Planned', detail: 'Public OS APIs and supported accessory protocols' },
  { domain: 'Industrial / access', status: 'Planned', detail: 'Isolated Modbus, BACnet and OSDP fixtures' },
  { domain: 'AI protocol assistance', status: 'Planned', detail: 'Provenance-linked hypotheses; no model connected' },
] as const;
