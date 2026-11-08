# Offline Flipper response observations

This independently written local reader uses interface facts from the pinned research in `research/flipper-offline-review/REPORT.md` and `sources.json`: schema revision `1c84fa48919cbb71d1cc65236fc0ee36740e24c6`, firmware revision `9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a`. It does not copy upstream schemas/implementation or generate bindings. Schema redistribution rights remain unresolved. This is not licensing clearance, device compatibility, physical acceptance, capture validation or protocol-version negotiation.

## Scope and API

`inspectFlipperResponses(bytes, { provenance: 'synthetic' | 'imported' })` in `packages/core/flipper-offline.ts` accepts a Uint8Array containing unsigned-varint-length-delimited Main messages. AXP framing and BLE chunk boundaries are not supported. It interprets Main command ID (1), status (2), has_next (3), Empty (4), identity (33), version (40), and power (45). Identity/power contain key (1) and value (2); version contains uint32 major (1) and minor (2). Other fields are opaque, not recursively decoded.

Options must be a plain object with exactly one own data property, provenance. Accessor options are rejected without invoking their getter; reflection/proxy failures become `invalid-provenance`. The accepted provenance value is snapshotted once. Byte input uses intrinsic typed-array kind, length, offset and buffer getters, not overridable instance properties or iterators. Uint8Array subclasses and Node Buffer are accepted with intrinsic bounds; proxies, non-Uint8Array views, detached or resizable storage and SharedArrayBuffer-backed input are rejected as `invalid-input`. These checks do not sandbox hostile JavaScript or defend against replacement of global built-ins.

Returns a copied original byte array, ordered independent frames, absolute byte offsets (half-open end offsets), field/unknown-field metadata, explicit scalar presence and effective defaults, response content and diagnostics. Nested strings and version scalars also distinguish absent from explicitly empty/zero. `valueOffset` starts at a varint value or at the bytes after a length prefix. Unknown-field records reference the original byte array; no raw bytes are duplicated per field. Returned arrays/objects are caller-owned and mutable, but separate calls and the supplied bytes do not alias. Provenance is a caller assertion, never authenticated origin.

There is no identity-success flag, stream assembler, key dictionary, command-ID pool, transport, discovery, outbound serializer, request generation, write, decryption, unlock, authentication bypass or native adapter. Call separately for separate streams. Repeated keys and terminal sequences stay as separate frames. An explicit zero status is only an observed zero; an omitted status has effective zero but is not explicitly reported success. All nonzero statuses, including unknown numbers, are non-success observations. Decode-error status 2 warns that the ID may be unreliable.

Each true has_next remains unresolved independently of subsequent frames. A false has_next may occur on the last key/value pair itself: no extra empty terminal frame is required. Neither explicit false nor omission proves that an imported capture is complete or correlated to any request. The last frame's true flag additionally produces a cautious incomplete-at-EOF diagnostic. Version observations do not change the pinned decoder or establish negotiation.

## Errors and partial data

Complete malformed frames throw `FlipperInspectionError` with a stable `code`, absolute `offset`, and readable message. No partial report is returned on error. Errors include budgets, zero/overflowing tags, unsupported groups/wire types, truncated fields, invalid UTF-8, wrong known wire types and duplicate known fields. Duplicate known scalars are intentionally rejected rather than protobuf last-one-wins. Selected content together with any other candidate tag >=4 is rejected as ambiguous. Unknown-only content remains unsupported; multiple candidates receive an explicit ambiguity diagnostic. Unknown wire types 0/1/2/5 are bounded and retained without interpretation.

Canonical policy: every varint must use the shortest unsigned encoding, with at most five bytes for lengths/tags/known uint32 values and ten for unknown varints (uint64). Overflow is rejected even at EOF. Boolean values must be exactly 0 or 1. Negative enum representations are outside this narrow nonnegative uint32 status policy. These are inspector acceptance rules, not claims about every encoding accepted by upstream protobuf implementations.

An EOF inside an otherwise still-valid length prefix returns an `incomplete-length` tail. A valid bounded declared length extending beyond EOF returns an `incomplete-payload` tail including expected payload bytes. The tail offset and original bytes preserve the exact suffix; it is not parsed, repaired, resynchronized or scanned for later frames. An unterminated varint inside a complete frame is an error. Empty input yields no frames in the pure API; the CLI requires a nonempty file. There is no incremental streaming API: concatenate known chunks from the same input before inspecting; tests cover every split/reassembly boundary and each truncated prefix.

## Fixed local budgets

These are conservative application limits, not upstream or measured device limits:

- Input 65,536 bytes, frame payload 8,192 bytes, 256 frames.
- 256 fields per message and 4,096 interpreted field records across the whole input (envelopes plus selected children).
- 1,024 UTF-8 bytes per known key/value; strict UTF-8, preserving a literal BOM.
- Two interpreted levels only: envelope and selected child. Unknown lengths are opaque.

All budgets are checked before allocations from declared sizes. No caller override exists. The report stores original bytes once; at most 4,096 field records and their bounded reference lists are emitted. Fixed diagnostic text is limited by 256 frames (at most six per frame plus three report diagnostics). Known strings consume a bounded subset of input bytes. CLI JSON uses one explicit numeric original-byte array and offsets, with no per-field byte copies.

## CLI

`node tools/inspect-flipper-offline.ts local-file --provenance synthetic`

Use `imported` only to label locally imported bytes; it makes no capture authenticity claim. The adapter reuses the existing bounded regular-file reader: no symlink at final path, directory, FIFO, device, empty/oversized file, URL, stdin, unknown or duplicate arguments. It validates file identity, size and timestamps before/after a bounded descriptor read with no-follow/nonblocking flags. As with ordinary filesystem reads this cannot authenticate externally supplied file content or defeat every hostile filesystem race.

Successful structural processing (including a documented incomplete tail or nonzero response status) prints one JSON report to stdout. Structural/input failures print an error only to stderr and exit nonzero, with no partial stdout report. The CLI does not write files or access networks. Imported strings are JSON-escaped, not executed. No actual device/private captures are included: tests construct synthetic bytes manually.

## Memory-only application view

Analysis now exposes a separate [bounded response workbench](FLIPPER_OFFLINE_WORKBENCH.md).
It accepts exact pasted hex with an explicit caller provenance declaration. Its
immutable UI snapshot omits the mutable original byte array; the exact draft is
retained locally in memory. Four-frame and eight-field pages avoid dumping the
whole report. This does not add live Flipper transport or persistence.
