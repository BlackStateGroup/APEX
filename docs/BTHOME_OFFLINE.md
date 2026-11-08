# Offline BTHome v2 service-data interpretation

This local continuation adds a small public BLE telemetry decoder, not a receiver,
control mechanism, decryption feature, identity check or sensor-truth attestation.
This decoder itself changes no scanning, pairing, hardware reception, remote
export, package dependencies, source-import registry or upstream backup identities.
The companion [offline evidence extension](BLE_EVIDENCE.md) adds a journal kind
without changing the database schema.
The existing synthetic/imported observation envelope remains mandatory. iOS fields
remain normalized fields; no fictitious raw advertisement or MAC is constructed.

## Scope and result contract

Service UUID FCD2 dispatches to the new decoder. The payload argument excludes
that UUID. Existing Eddystone-TLM behavior is unchanged. A full supported stream
has `status: format-match`, `parseStatus: complete`. The new reading retains the
entire normalized payload plus every parsed object's wire bytes, byte offset,
object ID, per-ID occurrence, signed integer, divisor and numeric value.
`rawInteger / scaleDivisor` represents the exact rational value; `value` is its
JavaScript number approximation. Negative numbers use two's-complement decoding.
No undocumented unavailable sentinel, physical-range clamp or calibration claim
is invented. The selected numeric types have no unavailable sentinel defined in
the consulted specification; minimum signed values and maximum unsigned values
are therefore numbers, including implausible battery/humidity percentages.

Supported IDs (hex; width in bytes; signedness; divisor):

| ID | Meaning | Width | Signed | Divisor |
| --- | --- | --- | --- | --- |
| 00 | packet ID | 1 | no | 1 |
| 01 | battery % | 1 | no | 1 |
| 02 | temperature °C | 2 | yes | 100 |
| 03 | humidity % | 2 | no | 100 |
| 04 | pressure hPa | 3 | no | 100 |
| 05 | illuminance lx | 3 | no | 100 |
| 0C | voltage V | 2 | no | 1000 |
| 12 | CO2 ppm | 2 | no | 1 |
| 2E | humidity % | 1 | no | 1 |
| 45 | temperature °C | 2 | yes | 10 |
| 57 | temperature °C | 1 | yes | 1 |
| 5B | signed count | 4 | yes | 1 |
| 5C | signed power W | 4 | yes | 100 |

### Additional scalar subset (offline continuation)

The table above records the original 13 IDs. The independently implemented
extension adds 24 IDs below, for 37 total. It reuses only the already-retained
v3.25.0 constants and MIT license, without fetching or executing upstream code.
These cover useful environmental readings, meters and simple motion measurements;
this remains a deliberately selected subset rather than a complete protocol parser.

| ID | Meaning/unit | Width | Signed | Divisor |
| --- | --- | --- | --- | --- |
| 06 | mass kg | 2 | no | 100 |
| 07 | mass lb | 2 | no | 100 |
| 08 | dew point °C | 2 | yes | 100 |
| 09 | count (unitless) | 1 | no | 1 |
| 0A | energy kWh | 3 | no | 1000 |
| 0B | power W | 3 | no | 100 |
| 0D | PM2.5 µg/m³ | 2 | no | 1 |
| 0E | PM10 µg/m³ | 2 | no | 1 |
| 14 | moisture % | 2 | no | 100 |
| 2F | moisture % | 1 | no | 1 |
| 3D | count (unitless) | 2 | no | 1 |
| 3E | count (unitless) | 4 | no | 1 |
| 3F | rotation ° | 2 | yes | 10 |
| 40 | distance mm | 2 | no | 1 |
| 41 | distance m | 2 | no | 10 |
| 42 | duration s | 3 | no | 1000 |
| 43 | current A | 2 | no | 1000 |
| 44 | speed m/s | 2 | no | 100 |
| 46 | UV index (unitless) | 1 | no | 10 |
| 47 | volume L | 2 | no | 10 |
| 48 | volume mL | 2 | no | 1 |
| 49 | volume flow rate m³/h | 2 | no | 1000 |
| 4D | energy kWh | 4 | no | 1000 |
| 5D | current A | 2 | yes | 1000 |

Units are explicit labels from the pinned constants' sensor-description names,
not inferred physical truth. Mass and distance variants retain their wire units;
no cross-unit conversion is performed. Unsigned 32-bit counts/energy remain
positive above 2³¹−1. Signed current remains distinct from unsigned current.
PM labels express the reported concentration type, not independently measured
particle size or air quality. UV index and counts have `unit: null`.

Binary states, events/buttons/commands/dimmers, variable text/raw, timestamps,
device metadata and encryption are still excluded. Other scalar IDs are also
unsupported by choice, including 13 (VOC), 4A–4C, 4E–4F, 51–52, 55–56,
58–5A and 5E–65. The 0.35 factor on 58 cannot be expressed as an integer divisor
under this exact raw-integer contract. Conductivity 56 does not name a concrete
unit in the retained constants. No missing units or semantics are invented.

Repeated IDs are retained in transmission order, never overwritten. Occurrence
is per wire object ID, not an inferred stable sensor identity across packets.
Unknown IDs stop parsing at the ID because their lengths are not known; the
prefix is available but the reading is `opaque / unsupported-object`, not a
complete match. Truncated objects and descending IDs stop with `invalid /
malformed`. No attempt is made to scan ahead for plausible values. Empty/header-
only input is invalid. At 128 objects, further bytes are preserved with `invalid /
limit-exceeded`. The existing 1650-byte payload and 16384-character envelope caps
remain in force. These are deliberate local resource limits, not protocol limits.
Offsets are from the device-info byte at offset zero. `unparsedHex` contains the
entire payload for opaque headers, otherwise the suffix beginning with the first
unconsumed object ID. Header + object raw bytes + tail reconstructs accepted
headers' original bytes exactly (hex case is normalized).

Only version 2 with reserved bits clear is interpreted. Trigger bit 2 is exposed.
Any encryption flag, unsupported version or reserved bit leaves the whole payload
opaque with no measurements. This conservative reserved-bit policy is local.
Encrypted BTHome needs a key and advertiser MAC; an iOS peripheral UUID is not
that MAC. No key input, nonce construction, MIC validation, replay protection or
decryption is implemented. Authentication and sensor truth remain explicitly
false, even on a complete match. The metadata-only hypothesis summary reports
separate complete TLM/BTHome counts, never values or raw data. Partial BTHome
matches are not counted as complete.

## Sources and fixture provenance

Checked 2026-11-07:

- Official protocol: https://bthome.io/format/ (unversioned page).
- Official encryption: https://bthome.io/encryption/ (unversioned page).
- Candidate Python library v3.25.0, release 2026-10-27, resolves to
  `590f02ba9b55306857c48c2d7f60014fde67f171`:
  https://github.com/Bluetooth-Devices/bthome-ble/commit/590f02ba9b55306857c48c2d7f60014fde67f171
- Exact `const.py` numeric layout cross-check:
  https://github.com/Bluetooth-Devices/bthome-ble/blob/590f02ba9b55306857c48c2d7f60014fde67f171/src/bthome_ble/const.py
- MIT, copyright 2022 Ernst Klamer. License and exact inspected constants file
  are retained under `research/bthome-reference/`; neither is imported/executed.
  Git blob hashes are recorded in `research/bthome-source-pins.json`.
  The TypeScript parser is independently implemented; no upstream parser code
  or GPL code was copied, and the Python library was not installed.

`tests/fixtures/bthome-observation.json` transcribes the official format page's
advertising example exactly, normalized to lowercase hex. It is offline synthetic
input, not a physical recording: temperature 25°C and humidity 50.55%.
The per-ID examples in `tests/bthome.test.ts` transcribe the official sensor table;
only the packet-ID example is newly constructed. The encrypted example comes
from the official encryption page and must remain opaque. All extrema, malformed
streams, repeated objects and envelope tests are newly constructed test data.
The recorded-import test is explicitly a synthetic test of that envelope shape,
not a claim that hardware reception occurred. Source pages are unversioned and
may evolve; the fixture and expected bytes in this patch are the reproducible
record of what was tested, not proof of future specification compatibility.

## Run and verify

From a Node 24 checkout, without installing anything:

```sh
node --test tests/bthome.test.ts tests/ble-advertisements.test.ts tests/ble-hypothesis-contract.test.ts
node tools/demo-bthome.ts
```

Observed here: 36 passing tests (14 new, 22 unchanged), including all 256 header
bytes, 4,000 deterministic BTHome malformed cases and the existing 2,000 AD cases.
Focused strict TypeScript checking, including noUncheckedIndexedAccess, passes.
Exact decoder commands and output are in `verification/bthome-*`. The combined
continuation subsequently passes the complete host Node/C test command; see
`verification/core-suite-current.txt`. Full app/native builds and physical
reception have not run. No publication, upstream merge or hardware action occurred.

## Numeric extension verification

`tests/bthome-numeric.test.ts` has 24 manually constructed golden fields with
literal expected values and units, unsigned/signed extrema for every added ID,
every proper field prefix, ordered combined and mixed original/new streams,
repetition, descending IDs, unsupported stops, encrypted-header gating and the
128-object boundary with 32-bit data. It also verifies both retained source files
against their Git blob IDs and SHA-256 digests. Original tests retain their
unsupported-stop coverage using binary ID 0F in place of newly supported 06.
None of these synthetic streams asserts real-world reception or sensor truth.

See `verification/bthome-numeric/README.md` for actual current commands/results.
The source-use register is `research/bthome-numeric-source-use.json`; original
source pins, source snapshots, backup identities and dependencies are unchanged.
