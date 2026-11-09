# Bounded C8 import in the I/Q workbench

The app can inspect the existing, deliberately narrow `mayhem-c8-text-v1`
profile using the same explicit stage/Inspect flow as SigMF. This is an offline
file import. It does not implement an SDR receiver, HackRF/PortaPack connection,
RF transmission, firmware compatibility verification, or physical-device acceptance.

## Use

1. Open the I/Q workbench and choose **Use Mayhem C8 input profile**.
2. On native builds select exactly two files: one lowercase `.c8` data file and
   one lowercase `.txt` sidecar. Return to the foreground, then press **Stage
   selected I/Q pair**. On web choose the sidecar and data separately.
3. Choose the existing default/explicit FFT, time-frequency or selected-window
   energy settings, then press **Inspect staged I/Q pair**.

Changing profiles, Clear, replacement, navigation or background invalidates old
analysis. The native picker can temporarily background the app; returning does
not auto-stage or inspect. A new explicit Stage action is required. Changing the
profile while the picker is open discards its eventual result. The actual picker
and inspection busy slots are held until outstanding work drains.

Synthetic examples select the SigMF profile and are still synthetic. Loading an
example never reads selected files or starts analysis.

## Exact supported profile

The sidecar is 1–4096 bytes of plain ASCII with exactly these three fields, in
any order, using consistently LF or CRLF line endings and an optional final
newline:

```text
sample_rate=1024
center_frequency=433920000
format=c8 (signed int8 I,Q)
```

Hz values are canonical decimal integers: sample rate 1–1,000,000,000 and center
frequency 0–1,000,000,000,000. Extra fields, duplicate fields, whitespace changes,
other encodings, undocumented formats and inferred defaults are refused. This
is an APEX profile, not a claim that every Mayhem sidecar meets it.

C8 data is signed int8 interleaved I,Q, 2–131072 bytes, even length. Every original
int8 value is multiplied by 256 into signed int16 little endian; I/Q order and
normalized amplitudes are preserved. The maximum is 65536 complex samples and
262144 derived data bytes. The sum of original file limits is 135168 bytes.
These are file limits, not total heap bounds: snapshots, derived bytes, hash
inputs and analysis arrays coexist. Window geometry uses two original C8 bytes
per complex sample and is validated before either selected file is read.

Native reads reuse the selected-URI read-only reader: known sizes required,
chunks at most 16384 bytes, one-byte EOF check, size recheck and close on success
or failure. No broad storage permission, persistent URI grant, extra requested
cache copy, network, upload or disk write is introduced. Document providers can
still download or stage the selected file. Separate reads do not prove that the
pair was an atomic capture or from the same source.

## Provenance and limitations

Reports include original C8/sidecar SHA-256 hashes and byte lengths, parser and
conversion identifiers, unverified supplier frequency/rate claims, and explicit
false acquisition/producer/authenticity verification flags. Existing report
metadata/data hashes identify the **derived SigMF representation**, and the UI
labels this distinction. No timestamp is inferred. Original buffers and native
URIs are not exposed through report state or retained as downloadable artifacts.
Reinspection rereads and rehashes the selected sources.

Converted int16 rail hits are not original int8 clipping counts. In particular,
+127 becomes +32512, not +32767. Frequency axes use unverified declared values;
results are not calibrated RF power, recognized protocols or device identities.

The existing optional Android analysis engine receives only the validated
derived ci16_le recording. Its qualification/fallback behavior is unchanged.
Conversion no longer requires a TextEncoder global; the existing strict SigMF
parser still requires a working fatal UTF-8 TextDecoder and refuses cleanly when
it is unavailable. This feature adds no native runtime compatibility claim.

## Verification

Automated tests use synthetic bytes and mocked OS/Expo providers. They exercise
all analysis modes, exact original/derived hashes, maximum size, malformed
sidecars and sizes, native chunk/EOF checks, original-vs-derived clipping copy,
profile changes during each digest, background during reads, stale picker
completion, actual TSX selector events and rendered provenance.

Physical Android/iOS acceptance and real Mayhem-generated sample validation are
still unrun. Host tests and Metro exports are not substitutes for those gates.
