# Source mining and first integrations

APEX targets iPhone and Android. The copied source trees are a research corpus, not a promise of universal access. Every integration needs a separate compatibility and licence decision. Source checkout pins and archives remain in `source-imports.json`; dependencies below use exact npm release versions, which may differ from the reference checkout commit.

| Source | Examined interfaces | Applied work | Status and limits |
| --- | --- | --- | --- |
| R16 react-native-nfc-manager | `index.d.ts`, `src/NfcManager.js`, config plugin and native event API | npm 4.2.0, MIT; foreground reader backend on both platforms, bounded metadata normalisation, cancellation lifecycle | Integrated dependency; native hardware unverified. Does not retain NDEF payloads. iPhone requires NFC-capable physical device, signed app and entitlement. |
| R15 react-native-ble-plx | `src/BleManager.js`, `src/Device.js`, characteristic/subscription API and config plugin | npm 3.5.1, Apache-2.0; service-filtered discovery, permissions, notifications and acknowledged writes | Integrated dependency; custom AXP peer only. Physical radio interoperability unverified. |
| R11 ESP-IDF | `examples/bluetooth/nimble/bleprph/main/main.c`, `gatt_svr.c`, NimBLE host headers | Original bounded AXP GATT peripheral using public APIs; one connection, four pending responses, MTU fragmentation, readiness marker | Compilation tracked in CI. No Flipper, Proxmark or Mayhem command compatibility yet. |
| R29 Mayhem Mobile | Mobile host/accessory architecture | Mobile-side research reference in searchable source atlas | Reference only; no application code imported. |
| R30 Mayhem firmware and R06 HackRF | Host/firmware separation and nested source layout | Dependency fetch and immutable source inventory | Reference only; SDR streaming not implemented. |
| R01 Flipper, R03 Bruce, R04 Proxmark3, R05 ChameleonUltra | Board/module boundaries and protocol families | Existing capability matrix and work packages | Reference only; no claim that their features run in APEX. |

Other research projects remain reference-only. APEX does not change their licences. Direct runtime packages and all transitive locked dependencies are recorded in `npm-dependencies.json`. Expo SQLite and Crypto provide native local storage and SHA-256; no database encryption or signature scheme is claimed.

## Mining sequence

1. Establish byte transport correctness across USB and BLE, then verify on owned hardware.
2. Implement accessory adapters independently of the mobile UI, starting with read-only identity/status APIs and recorded fixtures.
3. Add IR and radio receive/analysis through appropriate external hardware; independently verify timing, frequency and regional restrictions.
4. Add CAN/industrial observation adapters on isolated bench networks. Keep physical transmissions behind an explicit operator action.
5. Add AI-assisted interpretation with evidence references and explicit data-export selection. Model output remains an unverified hypothesis.

The unrecorded repository names from the earlier chat remain unresolved in `source-imports.json`; they must not be silently invented.

## R31: REA, 2 November 2026

The isolated rea-agents 6.8.0 CLI was used for actual static ELF-note analysis of APEX host firmware. APEX now imports those reports and persists bounded summaries. GNU sections/symbols/selected CRC disassembly were separately captured and hashed. REA-supervised tools failed process-ownership preflight in this runtime; Ghidra/IDA/Hopper are not configured. See docs/REA_RESEARCH.md and research/evidence/rea-lab for successful and failed evidence. This is a desktop research dependency, excluded from mobile bundling.
