# APEX: interpret useful phone-visible BLE data now

Research and implementation date: **2026-11-07 UTC**. Baseline: [APEX e51750e](https://github.com/BlackStateGroup/APEX/tree/e51750ec0b34b280399877d67e1036058874c373), branch `feat/rea-firmware-lab`, draft PR 5. This deliverable is local and reviewable; it changes no remote repository or device.

## Result

The experiment converts host-visible BLE advertising data into bounded structured observations and, for one documented public format, meaningful sensor telemetry. It works without any radio hardware because its inputs are explicit synthetic fixtures. It is a step toward interpreting real data, not a claim to have received arbitrary RF or controlled a device.

Three controlled experiments are executable now:

1. **Decode known telemetry on both platform input shapes.** Hand-constructed Android advertising bytes and separately constructed iOS normalized fields yield identical unencrypted Eddystone-TLM v0 values: 3000 millivolts, 25.5°C, advertisement count 1 and uptime 10 deciseconds. Negative-temperature, unavailable-value and maximum unsigned-counter tests also pass.
2. **Attack the parser with malformed input, without attacking a device.** Length errors, invalid UTF-8, odd hex, truncated fields, nonzero padding, missing UUIDs, duplicate fields and oversized inputs are handled explicitly. A deterministic 2,000-input sweep checks bounded parsing and lossless byte reconstruction from parsed elements plus retained tails/padding. This is a focused regression sweep, not an exhaustive fuzzer or security audit.
3. **Pass minimal observations into APEX's existing hypothesis boundary.** A deterministic local stub accepts the metadata-only summary through the unchanged `suggestProtocols` contract. Tests confirm the remote-export gate prevents invoking a remote provider without explicit selection and the validator rejects invented evidence IDs. No actual model, remote endpoint or provider integration was used.

The initial experiment passed **22 tests**, a Node demo, and strict TypeScript 7.0.2 checking with `noUncheckedIndexedAccess`. Later local increments add BTHome interpretation, evidence retention and the offline app workbench, and rerun the complete host Node/C suite; current results are in `verification/continuation.json`. Physical reception, native builds, full mobile typechecking, UI behavior and over-the-air interoperability remain untested.

## What data a phone actually supplies

| Input | Official capability | This experiment | Deliberate distinction |
|---|---|---|---|
| Android BLE | `ScanRecord.getBytes()` returns host-visible scan-record bytes. | Length/type/value decoder with original byte offsets and retained unknown data. | These bytes are not RF I/Q, an entire Bluetooth link-layer packet, a guaranteed individual over-the-air advertisement or arbitrary 2.4 GHz data. |
| Android capture metadata | `ScanResult` exposes RSSI and completeness. Its scan record combines advertising and scan response data. | Nullable RSSI and separate `complete`/`truncated`/`unknown` metadata. | Structurally parsed bytes can still come from a truncated capture. Metadata is a source assertion, not attestation. |
| iOS BLE | Core Bluetooth supplies an advertisement-data dictionary with names, service UUIDs/data, manufacturer data and optional TX power/connectability. | Explicit normalized fields with no fabricated raw advertising record. | Original field order, duplicate occurrences and omitted/filtered information cannot be reconstructed from a dictionary. |

Sources: [Android ScanRecord](https://developer.android.com/reference/android/bluetooth/le/ScanRecord), [Android ScanResult](https://developer.android.com/reference/android/bluetooth/le/ScanResult), [Apple advertisement-data keys](https://developer.apple.com/documentation/corebluetooth/advertisement-data-retrieval-keys), [Apple service-data key semantics](https://developer.apple.com/documentation/corebluetooth/cbadvertisementdataservicedatakey). These live API references were checked on 2026-11-07; no static publication date was supplied.

The iOS schema is intentionally a **subset**, not a complete serialization of every Core Bluetooth key: overflow UUIDs, solicited service UUIDs and platform future fields are not yet supported. Unknown input keys are rejected instead of silently dropped. A future adapter must version its schema to include additional fields.

## Decoder contract

New file: `packages/core/ble-advertisements.ts`.

- `parseBleAdvertisingHex` parses a contiguous host-visible AD stream. Length includes the type octet. All-zero suffixes are treated as padding; nonzero bytes after a zero length are retained and flagged. Unknown AD types and repeated structures stay in order with their original bytes. Known format failures retain the offending bytes and a diagnostic.
- Supported field layouts: Flags, complete/shortened UTF-8 names, signed TX power, complete/incomplete 16-/32-/128-bit service UUID lists, service data with all three UUID widths, and manufacturer data with a little-endian company identifier.
- `interpretBleServiceData` recognizes the FEAA service's published, **unencrypted TLM v0** layout. The next local increment also adds a bounded public BTHome v2 subset, documented in [BTHOME_OFFLINE.md](BTHOME_OFFLINE.md). A further offline addition recognizes strict UID and URL layouts, documented in [EDDYSTONE_IDENTITY_OFFLINE.md](EDDYSTONE_IDENTITY_OFFLINE.md). Unknown layouts, encrypted variants and future versions remain opaque. A TLM layout match is not a full Eddystone conformance test: for example, this function alone does not verify the accompanying complete UUID list or timing/interleaving rules.
- `importBleObservation` accepts a bounded JSON envelope and labels every result `offline-format-check`, with `physicalReceptionVerified: false` and `authenticatedIdentity: false`. It never trusts an imported claim of native verification. The two allowed provenance origins are `synthetic-fixture` and `recorded-import`. Captured-at timestamps are forbidden for synthetic fixtures and required for recorded imports.
- `summarizeBleObservation` consumes an imported result and emits the existing `signal-metadata` shape. It omits local name, addresses, payload bytes, sensor values and free-text provenance labels. It performs no network call. The caller supplies a SHA-256 of the exact input document; a digest provides an integrity reference, not authenticity.

Format sources: [Bluetooth GAP AD framing, Core 6.2 §11](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-62/out/en/host/generic-access-profile.html), [Bluetooth Core Supplement v14, Part A](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/CSS_v14/out/en/core-supplementary-features/data-types-specification.html), [Bluetooth assigned AD type numbers](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Assigned_Numbers/out/en/index-en.html). These are explicitly selected reference revisions, not a claim to implement the newest Bluetooth specification in full. Checked 2026-11-07.

Implementation resource limits are deliberately narrower than the entire protocol: 1,650 input bytes; 128 AD structures; 16,384 JSON characters; at most 32 normalized service UUIDs and service-data entries each; conservative aggregate normalized-data bounds. Hitting the structure limit returns `limit-exceeded`, not a claim that the source protocol is malformed. There is no RF-fragment reassembly, scan-response boundary inference, CRC verification, GATT reading, key recovery or decryption. Names and other received strings remain untrusted display data and must never be executed or treated as instructions.

## Fixture provenance and known ground truth

`tests/fixtures/ble-observations.json` contains three **hand-constructed** inputs, not recorded captures. No claim of an actual beacon, nearby device, measured RSSI or real observation time is made.

The first fixture is:

```text
02 01 06
03 03 aa fe
11 16 aa fe 20 00 0b b8 19 80 00 00 00 01 00 00 00 0a
```

The first two fields are Flags and the FEAA service UUID. The third contains the service UUID followed by TLM frame/version and big-endian telemetry. Signed 8.8 temperature encodes 25.5°C as `19 80`. The second fixture supplies that same service payload via normalized iOS-style fields. The third exercises repeated manufacturer structures and an unknown AD type. Its company number is arbitrary test data and must not be used to attribute a device to a manufacturer.

The public TLM specification is pinned to Google commit **a52406ee6053720f78fb0c63bfc38b38e6800824**, authored 2016-04-14 and retrieved 2026-11-07. [Unencrypted TLM layout](https://github.com/google/eddystone/blob/a52406ee6053720f78fb0c63bfc38b38e6800824/eddystone-tlm/tlm-plain.md) defines battery millivolts, fixed-point temperature, unsigned counters and unavailable sentinels. [Eddystone common elements](https://github.com/google/eddystone/blob/a52406ee6053720f78fb0c63bfc38b38e6800824/protocol-specification.md) defines the FEAA service and byte-order distinction. This is an archived public protocol used as a transparent test case, not a dependency on a functioning Google beacon service.

## How this fits the actual APEX baseline

The pinned [native BLE adapter](https://github.com/BlackStateGroup/APEX/blob/e51750ec0b34b280399877d67e1036058874c373/src/platform/bluetooth.native.ts) currently filters discovery to `AXP_SERVICE` and forwards only device ID, name and RSSI. Consequently, **adding this parser does not make live advertising bytes available**. A later read-only native observation adapter must explicitly deliver real source fields and provenance. Do not silently widen the accessory connection scanner or imply that raw advertisements already arrive.

The pinned [evidence store](https://github.com/BlackStateGroup/APEX/blob/e51750ec0b34b280399877d67e1036058874c373/packages/core/evidence.ts) did not accept `analysis.ble`. The second local continuation adds that reviewed kind with exact retained offline input, source agreement checks and unchanged database/digest semantics. See [BLE_EVIDENCE.md](BLE_EVIDENCE.md). The third local increment implements the explicit UI save/import flow and digest-gated reopening; browser/native acceptance remains open. Larger inputs are rejected rather than truncated. Imported or synthetic observations cannot be labeled `native-ios`/`native-android`.

The pinned [hypothesis contract](https://github.com/BlackStateGroup/APEX/blob/e51750ec0b34b280399877d67e1036058874c373/packages/core/hypotheses.ts) already accepts `signal-metadata` input but permits only `NEC`, `CAN` and `unknown` output labels. The new tests intentionally use `unknown` and verify that inventing `BLE` as an accepted enum fails. A later typed output-schema extension can add BLE descriptions. Neither this step nor a model's confidence grants device-operation authority. No particular model called “Astra” is configured or claimed here.

Integration status and next gates:

1. Review/apply the cumulative continuation patch to the pinned branch or an appropriate continuation. Complete host `npm test` checks pass; full app typecheck, exports and build/UI QA remain separate gates.
2. The offline BLE import/inspection view and explicit evidence save/reopen flow are implemented. They label synthetic/imported provenance and retain parser diagnostics and opaque fields. Browser scenarios are authored but unexecuted; no advertised URL is automatically opened.
3. Add the native read-only collection path as separately reviewed work. A pure field-conversion adapter alone does not make live data available. Preserve iOS normalized and Android host-byte representations and disclose any projected-field omissions.
4. Only then validate actual radio reception using a controlled source and record the precise handset, OS, build, permissions, timestamp and transmitted ground truth.

## Minimum next bench, without buying an SDR

For this BLE experiment, a receiving supported phone plus a **known, authorized BLE advertiser** is enough. The advertiser can be a second Android phone if its chipset exposes BLE advertising; check `getBluetoothLeAdvertiser()` and advertising support before depending on it. Otherwise use an existing programmable BLE development board/beacon. A general SDR is not required to validate host-visible BLE advertisement parsing. [Android BluetoothAdapter API](https://developer.android.com/reference/android/bluetooth/BluetoothAdapter).

Do not assume an ordinary iPhone app can transmit the exact TLM payload for this comparison: Apple's `CBPeripheralManager.startAdvertising` supports local-name and service-UUID keys rather than arbitrary service-data advertising. [Apple advertising API](https://developer.apple.com/documentation/corebluetooth/cbperipheralmanager/startadvertising(_:)).

Controlled procedure: advertise only the known public test service and fixed known payload from the owned source; observe without connecting; compare semantic telemetry and source bytes/fields; repeat with one changed temperature and an unavailable sentinel; verify permissions-denied, Bluetooth-off, stop-scan and app-background behavior. Do not require byte-for-byte equality of whole Android scan records or iOS dictionaries because host merging/filtering differs. The expected success claim is “this build interpreted this controlled device's BLE data,” not “phones can receive every frequency” or “the device is authenticated.”

## Separate current research opportunity

Apple now documents Bluetooth Channel Sounding in iOS 27 on N1-equipped iPhones, for paired and connected compatible accessories, with foreground restrictions and hardware requirements. This is a genuine additional ranging path worth capability-gated exploration, but it is unrelated to decoding synthetic advertisements and was **not implemented or tested here**. [Apple WWDC26: Find your accessory with Bluetooth Channel Sounding](https://developer.apple.com/videos/play/wwdc2026/369/), checked 2026-11-07. The wider phone-radio capability matrix is separate work.

## Unambiguous JSON source documents

BLE envelope and selected-source imports reject duplicate decoded JSON member names before materializing objects. This includes escaped aliases such as `schemaVersion` and `schema\u0056ersion`, even if values agree. Nested duplicate claims cannot be hidden by last-value-wins parsing. The grammar-aware bounded preflight retains the original document text; it does not canonicalize or rewrite source bytes. Native JSON.parse remains the final value/grammar authority.

Envelope imports retain their 16,384-character limit and allow at most four simultaneous object/array containers. Selected-source documents retain 4,096 characters and three containers. These depths match supported schemas. Stored journal-envelope parsing and existing digest canonicalization are unchanged. Original duplicate-version/platform/origin and hidden deep-value cases were reproduced before repair. Independent review additionally covered Unicode/escaped aliases, 100,000 mutated documents against JSON.parse and depths zero through64.
