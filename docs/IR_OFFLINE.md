# Offline ordinary Flipper `.ir` inspection

`node tools/inspect-ir-offline.ts tests/fixtures/ir/manual-nec.ir --provenance synthetic-fixture`

For a local recording exported from a remote you own, use `--provenance recorded-import`. This is a caller claim, not proof of origin. The CLI only reads a bounded local regular file and emits one JSON report after every check succeeds. It never writes files, connects to hardware, transmits, replays, generates control commands, opens a URL or invokes names as commands. This adds no phone IR capability. The separate memory-only Analysis-tab inspector is documented in [IR_WORKBENCH.md](IR_WORKBENCH.md). There is no IR native bridge, device or provider integration.

## Intentionally narrow accepted language

This is an independently written subset inspector, not a general Flipper loader or a compatibility guarantee. The entire file is rejected on any unsupported/malformed field. No partial report or cross-record recovery is returned.

- Actual input bytes must be ASCII printable characters plus LF and CRLF; bare CR, tabs, NUL, BOM, invalid UTF-8 and non-ASCII are rejected. Empty lines and whole lines starting with `#` are ignored. Indented comments and whitespace-only lines are not accepted. `#` inside a value is inert data, not an inline comment.
- Exact header fields in order: `Filetype: IR signals file`, `Version: 1`. IR library files and `.irtest` are out of scope. The filename extension is not trusted or required.
- Each record begins with `name: `, then `type: `. A comment is not a required record delimiter. Consecutive records need no comment or blank separator. Duplicate names are separate, one-based ordinals, never merged.
- Every field requires the exact `: ` separator. No extra keys, duplicate keys, alternative order, omitted fields or trailing fields are accepted. Name values are 1–128 printable ASCII characters, including spaces. Names and source labels are inert strings.
- Parsed record order: `name`, `type: parsed`, `protocol: NEC`, `address`, `command`. Only standard NEC is supported. Each address/command value must be exactly four hex bytes separated by one space, with upper three bytes `00`. The first byte is interpreted as the 8-bit value. Original field text is retained. NECext, NEC42, NEC42ext, Pioneer and all other protocols are rejected atomically; no aliases or invented values.
- Parsed fields declare integers, not an airframe. The inspector does not construct pulses, validate an actually received frame, or infer inverse bytes from parsed records.
- Raw record order: `name`, `type: raw`, `frequency`, `duty_cycle`, `data`. Frequency is decimal uint32, 10,000–1,000,000 Hz inclusive. Duty is a finite decimal in (0,1], without signs, exponent notation or partial parsing; `.5` is accepted, `0.` is not. The exact decimal upper bound is checked before conversion to a JavaScript binary64 number, so values just above 1 cannot round into acceptance. Positive decimals that underflow to zero are rejected. Other positive values in range, including subnormals, are accepted with normal binary64 rounding; the exact original spelling remains in `dutyCycleDecimal` and `originalSource`, while `dutyCycleProjection: binary64-rounded` labels `dutyCycle` as an approximate numeric projection rather than the exact declared decimal. Arbitrarily many leading zeros are accepted within the line/file budgets. Duration tokens are decimal uint32, 1–4,294,967,295 microseconds, separated by exactly one space. Signs, decimals and exponent notation are rejected; leading zeros are accepted up to the ten-digit token limit. Zero durations are rejected as an APEX restriction.
- Raw files can be valid without recognized waveforms. Recognition delegates the *entire unchanged duration array* to the existing standard NEC decoder: exactly 67 positive durations, each at most 20,000 microseconds, ±25% timing windows and complementary address/command bytes. The decoder is unchanged. No cropping gaps, merging frames/repeats, repairing data or filling missing pulses. Repeat-only, extended-address and multiframe arrays remain `not-recognized`. Recognition does not establish carrier compatibility or physical signal reception.
- Ordinary `.ir` has no serialized repeat field. Every record reports `repeats: not-represented`, never false or a fabricated count. Stateful NEC repeat reconstruction is not performed.

## Bounds and integrity

Hard limits: 256 KiB actual input bytes; 16 KiB per line excluding CRLF/LF; 128 records; 128 name/source-label ASCII characters; 1–1024 timings per raw record; 8192 total raw timings. Empty remotes are rejected. CLI JSON output including trailing LF is capped at 1 MiB and buffered until validation and hashing finish. The shared regular-file reader rejects a symlink at the final file component and nonregular inputs, opens read-only with no-follow semantics, and bounds actual reads, including growth. Symlinked ancestor directories are accepted; this is not whole-path ancestry isolation. URL-like paths and flags in the path position are rejected. The reader compares inode/device, size and nanosecond modification/change timestamps before/after reading and rejects detected changes. This is still not an authenticated snapshot: the digest describes the bytes actually read.

The pure core has no filesystem, network, device or Node imports. It uses Web Crypto SHA-256 by default. An optional trusted local `IrStringHasher` can hash the exact immutable ASCII source string as UTF-8, without normalization; ASCII makes these the same bytes. The adapter never receives the private mutable snapshot. Its returned value must be a lowercase 64-character hex string. This shape check is not independent cryptographic verification of an adapter. The workbench reuses existing platform-local Web Crypto / Expo Crypto hashing; no global crypto patch is made and actual native execution is not verified. It snapshots actual typed-array slots before reading caller context and before any await; caller-overridden byteLength/iterators are ignored, shared/resizable/detached backing storage is rejected. Caller context is copied from own data descriptors; getters and extra fields are rejected. Input and context mutation while hashing cannot change the report. The copied bytes stay private. Exact source bytes are retained losslessly in an immutable ASCII `originalSource` string (including original CRLF/LF/comments), with actual byte count and SHA-256. Report objects/arrays and nested recognized values are frozen. Context provenance and basename label are not verified facts; paths, names and content must remain inert in downstream renderers.

Line ranges are one-based inclusive, from the record's name field through its last data/command field. Intervening comments/blank lines are included by position; following comments are not assigned to a record. Physical capture, authenticity and device compatibility flags are always false. A SHA-256 digest establishes byte identity only, not authenticity, ownership, safe transmission or compatibility.

## Interface references and licensing boundary

Research pin: [`9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a`](https://github.com/flipperdevices/flipperzero-firmware/tree/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a).

Read-only interface facts came from these paths at that pin:

- `documentation/file_formats/InfraredFileFormats.md`: ordinary header, raw/parsed fields. Its protocol list is not exhaustive.
- `lib/flipper_format/flipper_format.h`: key/value text and whole-line comments; LF writer/CR-capable reader. APEX intentionally narrows line endings and spacing.
- `applications/main/infrared/infrared_remote.c`: ordinary remote header/version checks.
- `lib/infrared/signal/infrared_signal.c` (blob `436de4e29c8cc035b5912fe78120d0f4203447d0`) and `.h` (blob `93f1f88feafd1303ea7d07b87aea6a0766a6854a`): raw/parsed fields and durations between transitions in microseconds.
- `lib/infrared/worker/infrared_worker.h` (blob `2edb19227f9c5c534467de49a75577d82edae524`) and `targets/furi_hal_include/furi_hal_infrared.h` (blob `36eaf122d5e83a6fccf559bf450ad9ba0757a7f7`): raw frequency/duty/count validity predicate. The pinned raw reader checks count but does not itself invoke that complete predicate. This document does not claim every upstream loader applies all checks. No zero prohibition or smaller duration cap was established there.
- `lib/infrared/encoder_decoder/nec/infrared_protocol_nec.c` and `infrared_decoder_nec.c`: distinct standard/extended NEC widths, complement checks and stateful repeats.
- `lib/infrared/encoder_decoder/infrared.h` (blob `cc652c88c8c686e64075f68790e292260989a781`): additional protocol enum entries, including Pioneer.

Pinned serialization writes uint32 memory bytes on the little-endian target; the format documentation alone does not define portable endianness. APEX's upper-three-zero standard NEC subset explicitly uses the first byte and does not claim a portable interpretation for all protocols.

Upstream root license is GPLv3. This code and tiny synthetic fixtures were authored independently from interface facts; no upstream implementation, fixture or schema was copied. Attribution is not a legal derivative-work clearance. Protected research registry files and pinned source blobs are untouched.

## Verification

`node --test tests/ir-offline.test.ts` and `npm run typecheck` use existing dependencies only. Tests cover intrinsic input/context snapshots and asynchronous mutation; exact bytes/hash/CRLF; adjacent duplicate names; strict syntax and unsupported files; byte/line/name/record/timing budgets; invalid UTF-8/non-ASCII; uint32/zero/finite-duty rules; inert injection-like names; whole standard NEC versus repeat-only, extended and multiframe nonrecognition; and actual CLI execution under Node's permission model without filesystem-write permission. Tests author temporary inputs outside the restricted child; the CLI child only reads them. No physical-device validation is claimed.


## Raw timing and carrier disclosures

Raw records explicitly report `timingConvention: assumed-first-mark-alternating` and `carrierMetadata: declared-not-measured`. No standalone initial-level field is serialized. The pinned implementation treats the first duration as a mark, followed by alternating spaces/marks. Third-party files can violate that convention; APEX does not detect arbitrary starting polarity or shift, invert or repair timings. Recognition is conditional on that convention.

Frequency and duty cycle are declared file settings, not measurements of an incoming carrier. In particular, the pinned app assigns common 38,000 Hz and 0.33 duty defaults to unrecognized received raw signals after obtaining timings/count. Neither these values nor a recognized timing pattern establish measured carrier parameters.

Exact pinned sources:

- [Raw capture first-mark convention, worker implementation](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/lib/infrared/worker/infrared_worker.c), blob `cc9361ccf15be468d44cef49bc7de34c0e44603d`: skips an initial space and states raw starts with a mark.
- [Signal implementation](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/lib/infrared/signal/infrared_signal.c), blob `436de4e29c8cc035b5912fe78120d0f4203447d0`: uses `start_from_mark=true`. This is a read-only interface reference, not an APEX transmission path.
- [Application receive callback](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/applications/main/infrared/infrared_app.c), `infrared_signal_received_callback`: assigns default carrier/duty metadata for unrecognized raw reception.

Verification correction: Node's `--permission` invocation here verifies filesystem-write denial, not network isolation. No network-denial claim is made. The inspector and its imported read-only adapter path contain no network calls; that is a static code observation, not an operating-system network sandbox test. The initial test title/log incorrectly said “writes/network denied”; original logs and commit history are preserved, and the final title/docs correct that claim.
