# Offline selected HCI report byte comparison

This additive core and read-only Node tool compare two explicitly selected legacy
reports from existing selected-event documents. The separate memory-only
[Analysis comparison inspector](HCI_COMPARISON_WORKBENCH.md) integrates this core
without comparison persistence, networking or device actions. Neither path adds
acquisition, logging or scanning. Older HCI selectors/serializers, BLE differential
and field-hypothesis APIs are unchanged.

```
node tools/compare-hci-reports.ts left.json right.json --left-report 1 --right-report 0
```

Both indices are required, zero-based integers 0..24. Neither defaults nor automatic
pairing are supported. The entire derivative event on **each** side must verify,
including all unselected reports, before either selected index is resolved against
the actual report count. Structural schema checks for both documents and both
index checks precede hashing. Binary verification is sequential, at most two
SHA-256 calls, with isolated hash arguments. The hash adapter is trusted.

The core `compareHciLegacyReportBytes(leftDocument, leftReportIndex,
rightDocument, rightReportIndex, hash)` accepts primitive strings and numbers,
not mutable input objects. Each exact document is limited to 4096 UTF-16 code units.
Negative zero is refused. The CLI bounds each regular file to 12288 bytes, rejects
terminal symlinks, uses fatal UTF-8 decoding and preserves BOM for strict rejection.
Ancestor symlinks retain the existing reader's behavior. Input bytes are checked
for changes around reading, not claimed safe against every hostile same-user race.
The complete result is serialized before one stdout write; errors have generic
stderr without source/path echoes or partial comparison JSON. No files are written.

## Exact coordinate contract

`dataByteOffset` starts at zero in the **entire selected advertising-data field**:
AD length/type headers, UUIDs, values, padding and uninterpreted tails are included.
This is **not** a UUID-excluded PLX service-payload offset. A row's
`leftDerivativeOffset` / `rightDerivativeOffset` is the byte offset from the start
of the decoded single-record btsnoop derivative: 16-byte file header, 24-byte
record header, then H4 event. It is not a JSON character, hex character, original
capture offset, physical RF coordinate or decoded service-value coordinate.

Example: report 0 begins at derivative byte 45 and its data begins at 54. If
report 0 has one data byte, report 1 begins at 56 and its data begins at 65.
Each report takes `10 + dataLength` bytes. Rows are positional, never aligned.
For `02 01 06` versus `03 02 01 06`, all three overlapping positions differ and
the last position is right-only; no insertion is inferred. Missing bytes are
`null` with `null` derivative offsets, distinct from the present byte `00`.

Results are deeply frozen, schema version 1, with analysis discriminator
`offline-hci-selected-report-byte-comparison`. Up to 31 rows carry lowercase
hex pairs and equal/different/left-only/right-only relations. `differingOffsets`
includes every non-equal position; `dataBytesEqual` concerns only the selected
advertising bytes. Empty fields and identical documents are valid, but are not
independent observations. The serializer bounds UTF-8 output including newline
to 65536 bytes; it is intended for the result returned by this core, not an
untrusted arbitrary object.

## Evidence boundaries

Selected metadata preserves exact declared context, derivative digest/size and
verification status, original source references marked **UNVERIFIED**, report
index/count and derivative offsets, event type/kind, address type and wire/display
forms, data length and RSSI. AD parse status and counts are separate from byte
equality. Malformed AD content is retained as opaque comparison bytes; malformed
HCI report framing or unsupported HCI report semantics rejects the whole comparison.

`metadataEquality` compares only supplied event type/kind/address type/wire
address fields. Different addresses/types and scan responses can be compared
mathematically; this does not pair devices or authenticate sender identity. No
address pooling, concatenation, statistical significance, field fitting, sensor
truth, decryption, command capability, ownership or control is established.
Original references, provenance and timestamps are unverified. Digest validation
establishes supplied byte integrity under the trusted adapter, not truthful
capture history, actual reception or independent observations. Unknown/encrypted
AD stays opaque even when bytes differ.

The output does not echo input documents, whole records, unselected payloads,
nested service values or generic raw access. Context labels and selected address
metadata are intentionally retained and may themselves contain identifying data;
this is selected-report minimization, not anonymization.

## Local validation

`node --test tests/hci-report-comparison*.test.ts` uses manually authored synthetic
binary fixtures with literal offset/matrix oracles and actual CLI subprocesses.
CLI children run with Node filesystem writes prohibited. Existing HCI and BLE
focused regressions and `tsc --noEmit` are recorded in
`review-evidence/hci-report-comparison/`. No full aggregate, native build, browser,
real user capture, device or provider validation is claimed.
