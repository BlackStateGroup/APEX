# Offline IRremoteESP8266 receiver excerpt import

The existing Analysis → IR workbench now includes a separate **Offline IRremoteESP8266 receiver import** panel. This is a working original TypeScript parser, controller and UI for pasted timing excerpts, not a receiver driver, embedded upstream library, transmission feature or hardware qualification.

## Use it

1. Capture with your separately configured IRremoteESP8266 receiver and inspect its full serial output for overflow warnings. APEX does not configure or connect that receiver.
2. Copy the `uint16_t rawData[N] = {...};` source-code excerpt printed by IRrecvDumpV2. The generated `uint32_t address`, `uint32_t command`, and `uint64_t data` declarations may follow it. You can paste multiple such excerpts. Do not paste the full serial log, sketch, `Raw Timing[...]` output or AC `state` array.
3. Paste into the receiver panel, explicitly declare synthetic or imported provenance, and choose **Inspect receiver excerpt**. Loading the original synthetic example does not inspect automatically.
4. Review timing counts/ranges, exact accepted-draft digest, unknown carrier, unverified capture completeness, generated scalar claims and conditional whole-array standard NEC recognition. Records are paginated four at a time. Unsupported waveforms can remain valid timing arrays without being recognized as NEC.

For example, this independently authored excerpt is accepted. It is synthetic, not recorded upstream data or hardware evidence:

```cpp
uint16_t rawData[3] = {9000, 2250, 563}; // Synthetic timing example
```

It intentionally does not claim a complete NEC frame. A three-duration repeat-like shape is not promoted to a decoded command.

## Exact subset and resource limits

- ASCII text, including horizontal tabs and LF or CRLF. Bare CR, non-ASCII and other controls are rejected. Exact accepted text, including comments, whitespace and scalar token spellings, is retained and hashed locally.
- At most 262144 accepted draft bytes, 16384 characters per line, 32 captures, 1024 timing values per capture and 8192 timing values overall.
- `rawData` count must match exactly. Decimal durations are 1–65535 microseconds, without signs, fractions, exponents, hexadecimal or leading-zero/octal ambiguity. Count tokens also cannot have leading zeros. Arrays may wrap across lines; `//` comments are inert. No expressions, block comments, macros, trailing commas or arbitrary C/C++ are evaluated or accepted.
- Optional scalar fields have the exact generated integer type and bounded hexadecimal token width. Duplicates are rejected. Tokens remain unverified claims and are not substituted for recognition, compared with it or used for device identity.
- The upstream formatter may split durations exceeding uint16 into sequences containing zero separators. This bounded subset rejects zeros atomically instead of merging them or silently changing time conventions. Unsupported AC state arrays and serial log lines are rejected, not ignored.
- Parsing errors never produce partial records. ASCII/size edits rejected by the controller retain the previous draft but block inspection until an accepted replacement, a synthetic example, or Clear. All successful reports are immutable.

## Evidence limits

The receiver output represents a demodulated envelope, not a sampled carrier. This source-code format supplies **neither carrier frequency nor duty cycle**. Both remain null/unknown; APEX does not invent 38 kHz or convert the report to ordinary `.ir` settings. It does not infer the receiving hardware, firmware version, physical capture, repeats, completeness, ownership or device compatibility.

IRrecvDumpV2 prints an overflow warning separately from the source-code excerpt. Even a well-formed excerpt can omit that warning. Every capture explicitly reports completeness as unverified. Reviewing a full original capture log is separate work; removing surrounding text does not prove the capture complete.

The reference pin identifies the format source consulted, not the firmware which produced the paste. Caller provenance declarations are claims. SHA-256 identifies the exact accepted ASCII draft after clipboard/text-widget processing, not an original file before paste; earlier line-ending transformations are unverified. Comments and URLs remain inert source text. Recognition invokes the existing bounded standard NEC decoder on the entire unchanged timing array using the source-format first-mark alternating convention. No leading-gap removal, suffix trimming, scaling, zero merging or repairs are performed.

Draft and declaration remain in memory across inspector/tab changes, but results are cleared. Generation and activation fences prevent stale hashing completions or queued callbacks from restoring results after edits, rejection, declaration, Clear, example or tab changes. Reloading loses the draft. The panel does not persist, save, share, export, replay, transmit, access devices or call providers.

## Source and licence boundary

Format reference: [crankyoldgit/IRremoteESP8266](https://github.com/crankyoldgit/IRremoteESP8266/tree/1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f), pinned at `1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f`.

- [src/IRutils.cpp](https://github.com/crankyoldgit/IRremoteESP8266/blob/1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f/src/IRutils.cpp): source-code array syntax, microsecond output, omitted leading raw buffer gap and split-duration zero separators. Source header credits David Conran, 2017–2021.
- [IRrecvDumpV2.ino](https://github.com/crankyoldgit/IRremoteESP8266/blob/1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f/examples/IRrecvDumpV2/IRrecvDumpV2.ino): emits the overflow warning, human-readable report and source-code excerpt separately.
- [Upstream LICENSE.txt](https://github.com/crankyoldgit/IRremoteESP8266/blob/1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f/LICENSE.txt): GNU Lesser General Public License version 2.1 text. Existing upstream copies and their notices remain separate from this integration.

No upstream source, tests, device protocol database, firmware binary, library or dependency is copied or linked by this change. The parser, controller, UI additions, documentation and test inputs are original APEX work. Synthetic test timing arrays use APEX's existing original NEC fixture and independent literal examples. Consult upstream file-specific notices before any future code reuse; this format adapter is not blanket permission to copy the upstream implementation.

## Validation scope

Node tests cover bounds, malformed/crafted text, exact ASCII/CRLF hashing, immutable context snapshot, unsupported split durations, unknown carrier, conditional recognition, forged scalar claims, lifecycle races and bounded display. Static React DOM rendering uses mocked React Native primitives. These are software tests, not browser interaction, phone acceptance, receiver calibration, device interoperability or measured physical capture. No screenshots or hardware claims are made.
