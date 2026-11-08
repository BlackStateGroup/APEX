# Isolated Mayhem C8 import prototype

This is original APEX software for offline data conversion, not copied Mayhem implementation. It is not linked to App/UI, persistence, an accessory, a capture process, or any radio. No GPL source or dependency is incorporated.

## Explicit supported profile

`mayhem-c8-text-v1` accepts two caller-selected byte arrays:

1. `.c8` content: interleaved signed two's-complement 8-bit I, then Q, with at least one complete complex sample. Minimum 2 bytes, maximum 131,072 bytes. Odd lengths reject. Files larger than the bound reject; no truncation or automatic window selection occurs.
2. Plain ASCII sidecar, maximum 4,096 bytes, with exactly three fields, once each, in any order:
   - `sample_rate=<canonical integer Hz>`: 1 through 1,000,000,000.
   - `center_frequency=<canonical integer Hz>`: 0 through 1,000,000,000,000.
   - `format=c8 (signed int8 I,Q)` exactly.

LF and uniform CRLF are supported, with zero or one final newline. Mixed line endings, blank lines, unknown/duplicate keys, BOM, non-ASCII, control characters, surrounding whitespace, exponent notation, fractions, leading zeros, signed numbers and other encodings reject. This is an intentionally narrow profile, not every raw I/Q or Mayhem file. A filename or sidecar declaration cannot establish the actual producing application or physical acquisition.

## Conversion and provenance

Each signed int8 value is multiplied by 256 and encoded as little-endian signed int16, with original I/Q order preserved. This maintains the normalized amplitude convention used by the existing analyzer: `int8 / 128` equals `convertedInt16 / 32768`. In particular, -128 becomes -32768 and +127 becomes +32512. This does not add bit resolution or calibrated physical units. The existing analyzer's int16 positive-rail count does not represent original int8 clipping; the result warns explicitly.

`packages/core/mayhem-c8-import.ts` exports `importMayhemC8` and a typed `MayhemC8Import` result. Original data and sidecar are copied before the first await, hashed separately with SHA-256, and retrievable through fresh-copy getters. Source rate/frequency remain unverified supplier claims. The derived metadata/data have separate hashes supplied by the unchanged `prepareIq` path. Getter-returned arrays and hasher input copies do not alias retained bytes. Context is explicitly supplied and is validated/snapshotted by the existing profile before hashing.

The derived object is a genuine `PreparedIq` for the **unchanged** `apex-ci16-le-v1` profile: SigMF 1.2.6, `ci16_le`, one zero-start capture, no annotations. Existing metadata and data limits stay unchanged. Derived metadata identifies the APEX converter, not Mayhem as an authenticated producer. No capture timestamp is invented. Acquisition, authenticity and producer verification remain false. A trusted local hash adapter is required; checking hash syntax cannot validate a dishonest adapter.

The result wrapper is the provenance record. Future integration must retain this wrapper and the original bytes when saving evidence, not save only `recording` and imply the converted bytes were the original capture. No new evidence-storage schema or automatic save is implemented here.

## Local read-only demonstration

`node tools/inspect-mayhem-c8.ts explicit-data-file explicit-sidecar-file`

The CLI requires both paths explicitly and uses the existing bounded regular-file reader from `tools/inspect-iq.ts`. It rejects symlinks, nonregular files, size limits and detected read races. The two inputs are read individually, not as an atomic producer snapshot; their external pairing/provenance is a user claim. It reports conversion provenance, hashes, existing analyzer output and warnings to stdout. No files are created and no conversion is saved automatically. It performs no globbing, directory discovery, networking, hardware access or transmission. CLI input provenance is `external-file`, even for manually generated fixture files, because it did not generate or authenticate them.

## Proposed integration seam

- Keep the converter independent from the native document picker and all AXP/BLE work.
- Add a separately selected import mode later. The current `src/iq-workbench.ts` accepts staged `IqFile` data and an explicit Inspect action; integration needs to carry the new original/derived provenance wrapper, not only generated SigMF bytes.
- Do not broaden `prepareIq` or silently reinterpret unsigned 8-bit, swapped Q/I, float samples, unknown files or existing SigMF imports.
- Test cancellation/reselection/unmount with the eventual UI. Native file selection, native runtime execution and physical capture acceptance are not covered by this core/Node prototype.
- An explicit bounded-window workflow can be designed later for large recordings; this prototype rejects them.

## Independently inspected format evidence

The format fact is recorded in `web/src/dsp/capture.ts` at Mayhem Mobile commit `a18fca46f58519fc81e19304fc13bbf3da2aa69f`:

https://github.com/RocketGod-git/mayhem-mobile/blob/a18fca46f58519fc81e19304fc13bbf3da2aa69f/web/src/dsp/capture.ts

That source writes signed-int8 `.c8` with the three textual fields named above. It is GPL-3.0 and is retained separately in the recovered research corpus. Its implementation, recorder lifecycle, UI, DSP, comments and tests were not copied into this prototype. The conversion and parser here are new APEX code based on the explicit format facts. Licensing assessment of future code incorporation remains separate.

## Validation

Run `node --test tests/mayhem-c8-*.test.ts` and `npm run typecheck`. Focused tests cover every possible int8 value, normalized-amplitude preservation, exact endian/IQ order, original/derived hashes, all field orders/line endings, minimum/maximum input, unchanged analyzer acceptance, mutation/aliasing, malformed format/ranges, unsafe typed-array backing stores, context getters, all four hash failure positions, and real CLI process/file boundaries. Existing I/Q regression tests and the full project suite are separate checks recorded in the verification report.

All test samples are manually constructed synthetic fixtures. There is no real Mayhem recording, browser/native test, physical radio evidence or device interoperability claim.
