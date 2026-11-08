# Offline HCI advertising inspector (APEX subset v1)

This independent core implementation accepts explicitly supplied bytes. Its CLI reads operator-owned files; the separate [app workbench](HCI_WORKBENCH.md) accepts bounded contiguous hex. It does not enable logs, use ADB, scan, pair, connect, change settings, decrypt, replay, invoke native APIs, or publish anything. All development fixtures are independently authored synthetic bytes; no real Android/user logs were used. It is not a claim of Android/OEM compatibility, capture authenticity, physical RF sampling, complete traffic visibility, truthful device identity, or measured timing.

## Deliberately narrow input and output

Only the exact 16-byte btsnoop version 1 header with H4 datalink 1002 is accepted. Wrapper integers are big-endian. Each 24-byte record header is followed by exactly its included length, without padding. Included length must not exceed original length. Malformed/truncated container EOF fails atomically, without searching for another header. A complete container record whose included length is less than original length is capture-truncated: metadata only, never decoded.

Commands, ACL, SCO, ISO, vendor/key/other events and unknown packet types remain opaque. Metadata exposes lengths, offsets, index, raw flags, flag consistency status, cumulative drops, raw signed timestamp decimal string, and broad classification only, never packet bytes. H4 type takes precedence over flags. Flags are claims; consistent bits do not authenticate direction. Reserved bits or contradictory flags prevent selected legacy decoding. Zero drops does not establish absence of losses.

Extended advertising (LE subevent 0x0D) remains labeled uninspected in default metadata pages. The separate explicit extended metadata selector described below exposes header fields only; advertising-data bytes are never returned or passed into AD interpretation. No extended fragment reassembly is implemented. A final extended fragment marked complete does not establish a complete advertising payload. There is no support for unencapsulated datalink 1001, BCSP, H5, btsnooz, archives, bugreports or pcap.

Every metadata page and legacy selected-event JSON includes the same frozen disclosures; extended selections retain all general disclosures and replace only the unsupported-extended sentence with the narrower metadata-only boundary: operator-supplied host/controller bytes are not RF samples; capture completeness, authenticity, ownership and device identity are not guaranteed; SHA-256 digest equality establishes supplied byte equality only, not authenticated origin, truthful capture history, ownership, receiver identity, physical reception or device identity; timestamps are producer claims without wall-clock conversion; zero drops do not prove no losses; resolved identity addresses need not be over-air addresses; scan responses remain separate without pooling; extended advertising stays uninspected.

Explicit selection can decode one complete H4 event (0x04), LE Meta event (0x3E), legacy advertising subevent (0x02), with flags exactly 3. Exact HCI event length, count 1–25, repeated report structure bounds, event type 0–4, address type 0–3, advertising length 0–31 and exact total consumption are required. Each report has its own data and RSSI. RSSI accepts -127 through 20 dBm or 0x7F unavailable; unsupported semantics refuse the whole selection. No partial result is emitted on a late invalid report.

The selected result includes exact advertising hex, per-report AD parsing and service interpretation using existing BLE core behavior. Malformed AD elements, unknown fields and encrypted service data retain existing parser statuses. URLs remain inert untrusted text. Event type 4 is a separate scan response, never concatenated with advertisements by address. Address wire hex is retained; display reverses octets, not bits. Address types 2/3 represent resolved identity addresses and need not be the actual over-air address. HCI source labeling never claims BLE-PLX/Android scanRecord SDK provenance.

Timestamps are retained as raw signed 64-bit decimal strings. There is deliberately no wall-clock conversion, no assumption of monotonicity and no inferred timestamp producer. The inspected AOSP writer adds 0x00dcddb30f2f8000 to system_clock and writes zero drops, but that does not establish every Android/OEM export's behavior.

## APEX resource limits and integrity boundary

- Actual source bytes: 256 KiB, measured through intrinsic typed-array accessors. Larger real Android logs may be unsupported.
- Container records: 4096, including empty/opaque records.
- Metadata page: at most 64 rows, with explicit nextStart. No silently truncated listing.
- One selected legacy event: at most 25 reports, with 31 AD bytes each. One selected extended event: at most 10 reports, each with at most 229 omitted data bytes; the one-byte event parameter length further bounds their combined size.
- Serialized output: at most 1 MiB including final newline; refuse rather than truncate.
- Explicit context label: 1–256 characters, without ASCII control characters.

Before asynchronous hashing, bytes are copied from fixed, non-shared actual storage; own-data provenance/label context is captured and validated. Shared/resizable buffers and proxy views are refused. Original bytes live only in a module-private WeakMap. Prepared object, source metadata, records and results are frozen; forged or spread copies cannot be selected/listed. The hasher receives a separate copy and must return lowercase SHA-256 hex. Its digest correctness is trusted as an injected dependency; the CLI uses Node crypto SHA-256. Digest equality proves byte identity only, not authenticity. Neither original input nor opaque payloads appear in JSON/errors. Source and report offsets are absolute zero-based file offsets, record/report indices are zero-based.

## CLI

    node tools/inspect-hci.ts owned.snoop --provenance recorded-import --label 'operator import'
    node tools/inspect-hci.ts synthetic.snoop --provenance synthetic-fixture --label 'synthetic test' --record 0
    node tools/inspect-hci.ts owned.snoop --provenance recorded-import --label 'operator import' --start 64
    node tools/inspect-hci.ts synthetic.snoop --provenance synthetic-fixture --label 'extended synthetic test' --extended-record 0

Private record-list metadata is the default; --record selects legacy advertising/address bytes, while --extended-record selects extended header metadata and applicable addresses, never advertising bytes. Provenance is an explicit operator declaration, not verified acquisition evidence. All options are strict; --record, --extended-record and --start are mutually exclusive. There is no automatic filename-to-label copy and no automatic export/file writes. Stdout is written only after full container validation, hashing, optional whole-event validation and bounded serialization. CLI errors are generic to avoid exposing filesystem paths. Core errors use fixed reason text plus safe offsets.

The CLI reuses inspect-iq.ts's read-only bounded regular-file reader: final-component symlinks are rejected, ancestor symlinks are permitted. It checks file identity, size and modification metadata around the read, opens with O_NOFOLLOW/O_NONBLOCK, bounds actual reads, and does not claim ancestry isolation or perfect protection against malicious filesystem races. Node permission testing establishes filesystem-write denial only; it is not an OS/network sandbox claim.

## Primary fact references and provenance

Implementation and fixtures are original, not vendored upstream source or specification prose/tables. Research registers are unchanged.

- Teledyne/Frontline technical format reference: https://manuals.teledynelecroy.com/wireless-protocol-suite-manuals/v5.00/technical-information
- AOSP pin ea7ab70a711e642653dd5922b83aa04a53af9e0e logger: https://android.googlesource.com/platform/system/bt/+/ea7ab70a711e642653dd5922b83aa04a53af9e0e/gd/hal/snoop_logger.cc (blob f517c8e0e99087d239a4fb68eae869738707c042).
- AOSP HCI packet definitions at the same pin: https://android.googlesource.com/platform/system/bt/+/ea7ab70a711e642653dd5922b83aa04a53af9e0e/gd/hci/hci_packets.pdl (blob 7dd0b221e29aa07df7891f3b569826586a4273ea). Logger is Apache 2.0; NOTICE blob d645695673349e3947e8e5ae42332d0ac3164cd7. No source copied.
- Bluetooth Core 5.4 Vol 4 Part E §§5.2, 7.7.65.2, 7.7.65.13: https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host-controller-interface/host-controller-interface-functional-specification.html
- Bluetooth Core 5.4 Vol 3 Part C §3.2.1.3 display address order: https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host/generic-access-profile.html

## Focused verification

Run `node --test tests/hci-offline.test.ts tests/hci-extended-metadata.test.ts` and `node node_modules/typescript/bin/tsc --noEmit`. Synthetic tests exercise privacy, atomic failure, byte/context mutation and branding, limits, signed timestamps, offsets/digest, separate reports, legacy semantics, AD parser parity, and read-only CLI execution. No aggregate, browser, native, device, acquisition or real-capture validation is implied.


## Explicit extended metadata selection

`selectHciExtendedMetadata(prepared, index)` and `--extended-record N` require a complete H4 LE Extended Advertising Report with flags exactly 3. They use the same private prepared snapshot, context, digest, source budget, file reader and bounded serializer as legacy selection. This core adds no native integration, provider, acquisition, radio or settings path. The separate [app workbench](HCI_WORKBENCH.md#explicit-extended-headers) exposes explicit extended metadata selection.

Validation is atomic across the selected event: H4 bytes `04 3E P 0D C`, exact length `3 + P`, count 1–10, and `P = 2 + sum(24 + N)` with each N 0–229. No trailing bytes or partially published report list is allowed. Malformed framing rejects the entire selection at an absolute source offset. Interpretation is separate from structural validity; reserved values and contradictory legacy combinations remain annotated metadata rather than a claim of complete semantic validity. No exhaustive nonlegacy combination legality is asserted.

Every report retains its absolute span and scalar raw values/spans. Relative fields are event type (LE u16) 0, advertiser type 2, address 3–8, primary PHY 9, secondary PHY 10, SID 11, TX 12, RSSI 13, periodic interval (LE u16) 14, direct type 16, direct address 17–22, length 23, and omitted data starting at 24. Only the data offset/length and length-byte offset are exported, never its bytes, AD structures or service readings. Data status is a masked extraction of event type bits 5–6, with its source span, mask and shift retained.

- Event bits 0–4 describe connectable, scannable, directed, scan response and legacy; bits 7–15 are reserved. On scan responses the advertisement-property bits describe the original advertisement, not independent scan-response operation. Legacy event types are checked against 0x0013, 0x0015, 0x0012, 0x0010, 0x001B and 0x001A, with primary PHY 1 and secondary PHY 0. Contradictions get an explicit diagnostic.
- Data status 0 is terminal complete, which can be only the last fragment; 1 means more fragments pending, 2 terminal truncated, and 3 reserved. No status authorizes AD parsing. There is no pooling, concatenation or fragment reassembly, nor a claim of a whole advertisement.
- Advertiser types 0/1 are public/random, 2/3 resolved public/static-random identities, 0xFF anonymous, and all others reserved. Anonymous and reserved storage has spans only, no wire hex or synthesized display address. Applicable addresses use wire hex plus reversed-octet conventional display. They do not prove identity or physical reception.
- Direct fields are inapplicable when the directed flag is clear, regardless of arbitrary stored values; no address interpretation or failure is produced. When directed, types 0/1 mean public or non-resolvable-private/static; types 2/3 require scanner Own_Address_Type context and can describe TargetA or the corresponding scanner address, not definitively a target identity. Type 0xFE is an unresolved resolvable-private target; 0xFF and other values are reserved. Inapplicable/reserved address storage retains spans only.
- Primary PHY 1 is LE 1M; 2 is reserved. Secondary 0 means no secondary packets, 1 is LE 1M, and 2 LE 2M. In either field 3 is LE Coded with unspecified coding unless Advertising Coding Selection Host Support is set, in which case it is S=8. Value 4 is S=2 only with that feature, otherwise reserved. A selected record cannot establish this feature state, so both 3 and 4 explicitly retain conditional interpretations.
- SID 0–15 is known, 0xFF means no ADI, and others are reserved. TX/RSSI raw 0x7F is unavailable; signed -127 through 20 is known in dBm and all other encodings reserved. RSSI describes the last packet and TX the latest applicable TxPower-bearing packet, not authenticated measurements or physical RF samples.
- Periodic interval 0 means none, 1–5 is reserved, and 6–65535 uses 1.25 ms units. Maximum arithmetic is 81918.75 ms; the specification's inconsistent maximum-seconds prose is not used to alter raw arithmetic.

States distinguish known, unavailable, inapplicable, reserved, feature-context-unknown and contradictory. Raw scalar preservation does not turn unknown configuration into knowledge. All standalone provenance, hash-equality-only, producer-time, loss, resolved-address, no-RF, no-ownership and no-authentication warnings remain present. Default metadata and legacy selected JSON are unchanged.

Independent layout/semantic references are Bluetooth Core 5.4 Vol 4 Part E §§5.2, 5.4.4 and 7.7.65.13 at the functional-specification URL above, plus H4 framing at https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host-controller-interface/uart-transport-layer.html . The pinned AOSP packet layout at https://android.googlesource.com/platform/system/bt/+/ea7ab70a711e642653dd5922b83aa04a53af9e0e/gd/hci/hci_packets.pdl#5425 corroborates layout, not enum validity. No upstream implementation was copied and no licensing-clearance claim is made.

The extended synthetic suite checks exact scalar offsets, default and selected data privacy, all 256 wire values for address/PHY/SID/TX/RSSI fields, directed applicability, conditional coded PHY meanings, legacy contradictions, interval endpoints, all data statuses, count/data boundaries, late structural rejection and generic CLI failure without stdout. These are local synthetic checks, not interoperability or real-capture validation.

## Explicit selected legacy event document

`createHciLegacyEventDocument(prepared, index, hash)` is an opt-in pure creator. It authenticates the prepared handle and completes existing whole-event legacy validation before copying the exact original 16-byte file header and the selected original 24-byte record header plus included payload. It returns bounded JSON text, not a saved/exported file. There are no calls from default metadata, ordinary legacy selection, extended metadata or background paths. App preparation also requires its own explicit action. The CLI requires the separate explicit preparation option below. There is no general raw-record or arbitrary-range accessor. Unrelated commands, ACL, key/vendor and extended records are excluded. The selected event itself can contain multiple advertisers and arbitrary identifiers or sensitive content: exclusion of other records is not a guarantee of absence of sensitive data.

`readHciLegacyEventDocument(document, hash)` accepts text only, validates strict JSON and exact schema, privately reconstructs a single-record derivative, checks the injected SHA-256 result against the stored derivative digest and recomputes existing legacy reports. It returns frozen `{document, value, selection, verification, warnings}`. `document` is the exact imported JSON text, including whitespace and escapes, without canonical rewriting. `value` is the frozen parsed document. No decoded reports are stored in the document. A failed digest, wrapper, count, enum, RSSI or late report fails the whole operation. Malformed/unknown AD and encrypted service data retain the same existing interpreter statuses and bytes; URLs remain inert. Reports are not pooled or concatenated, and extended data is never exported/reassembled.

The schema has only these fields:

- `schemaVersion: 1`, `format: "APEX-HCI-selected-legacy-event"`, `sourceKind: "offline-hci-legacy-advertising-event"`, `representation: "btsnoop-v1-h4-single-record-derivative"`.
- `context: {provenance, label}` with existing declared provenance and 1–256 character control-free label rules. Labels cannot manufacture SDK/native acquisition provenance.
- `sourceReference: {sha256, byteCount, recordIndex, recordOffset}` describing the source used at creation.
- `derivative: {fileHeaderHex, recordHex, byteCount, sha256}` containing exact binary bytes as lowercase even hex.

JSON is at most 4096 UTF-16 code units and at most two simultaneously open containers. Duplicate decoded names (including escaped aliases), extra/missing keys and wrong primitive types are rejected before asynchronous work. Digests are lowercase 64-character hex. Header is exactly btsnoop v1/H4 1002. Record size is 39–282 bytes and derivative size 55–298 bytes; the HCI one-byte parameter length supplies the upper bound. Original reference byte count is at most 262144 and index at most 4095. Index zero iff offset 16, offset at least `16 + 24 * index`, selected span within source size, and suffix either zero or at least 24 bytes are plausibility checks only, not verification of those claims.

On reopen, `verification.derivative` identifies binary SHA-256 and legacy structure verification, under the trusted injected hash adapter. Hash input is a separate copy, protecting the private snapshot from a mutating adapter. Shape checking cannot establish adapter honesty. Derivative SHA-256 covers decoded binary header plus record, not JSON text, hex text or full original capture. `verification.originalSourceReference` is always `UNVERIFIED`; the original source hash, size, index and offset are references only, never authenticated by the derivative digest. `selection.source` retains the derivative digest and byte count, and all recomputed record/report/data offsets remain derivative coordinates. Original claims never replace these values.

Operator provenance is a declaration. Neither digest establishes acquisition, authentication, ownership, receiver identity, physical reception, device identity, completeness or truthful timing. The original file header/record timestamps and drop counts remain producer claims. No actual captures or device/radio/ADB/settings/provider/credential actions were used.

The synchronous structural parser and EvidenceStore parse/list path do not perform asynchronous derivative hashing. The additive analysis.hci-event evidence kind now requires the full asynchronous binary/legacy gate on save, verification and bundle paths, with a separately supplied byte hasher. Existing kinds and canonical digest contracts remain unchanged. See [HCI evidence capability](hci-event-evidence.md) and [explicit journal workflow](hci-journal-workflow.md). Envelope equality alone must never be described as derivative verification.

Focused additional verification: `node --test tests/hci-selected-document.test.ts tests/hci-offline.test.ts tests/hci-extended-metadata.test.ts` plus full `tsc --noEmit`. These are pure synthetic-byte tests, not aggregate/browser/native or real-capture validation.


## Read-only selected document CLI

Prepare a document only after reviewing the desired whole legacy event:

```sh
node tools/inspect-hci.ts capture.snoop --provenance synthetic-fixture --label "local synthetic fixture" --record 2
node tools/inspect-hci.ts capture.snoop --provenance synthetic-fixture --label "local synthetic fixture" --prepare-legacy-document 2
node tools/inspect-hci-selected.ts selected.json
```

The preparation command prints one compact document plus newline to stdout only. It does not write a file; any redirection or subsequent storage is an explicit operator action. `--prepare-legacy-document N` is mutually exclusive with `--start`, `--record`, and `--extended-record`, and cannot run by default or ordinary selection. Existing report outputs are unchanged. It validates the entire capture wrapper and the entire selected legacy event before emitting any output. An extended, opaque, truncated, contradictory-flags or malformed legacy record cannot be prepared.

The separate reopen tool accepts exactly one filename and no options. It uses the existing bounded regular-file reader (final symlinks refused; ancestor symlinks permitted), limiting reads to 12288 bytes before decoding. Fatal UTF-8 decoding rejects invalid encodings. A UTF-8 BOM is preserved and rejected by strict JSON validation rather than silently stripped. The core additionally enforces 4096 UTF-16 code units and exact schema. Both CLIs produce only generic errors on stderr and no report on stdout on input/validation failure. Output is fully assembled before its single stdout write; this is validation atomicity, not a guarantee against an OS/output-stream failure.

Reopen uses Node crypto SHA-256 over the reconstructed binary file header and record, and returns the core `{document, value, selection, verification, warnings}` result. The imported text is retained exactly in `document`; reports are recomputed, not trusted from JSON. `verification.derivative` is `verified-binary-sha256-and-legacy-structure`; original source hash, index, offset and size remain **UNVERIFIED** references, and provenance remains an **operator declaration**. The original capture is neither opened nor authenticated by this tool. All report coordinates and `selection.source` refer to the single-record derivative. Changing plausible source-reference claims does not change or invalidate the binary derivative hash.

This is not anonymization or source authenticity: a whole selected event can contain several advertisers, addresses and arbitrary vendor data. The preparer does not remove sensitive fields within that event. Inspect the content and existing disclosures before operator-controlled sharing. These CLI operations do not persist or contact a device/provider. Explicit app and journal workflows are described separately; neither CLI operation writes files.

Focused CLI verification: `node --test tests/hci-selected-cli.test.ts tests/hci-selected-document.test.ts tests/hci-selected-document-independent.test.ts tests/hci-offline.test.ts tests/hci-extended-metadata.test.ts`, plus `node node_modules/typescript/bin/tsc --noEmit`. Actual subprocess tests run with filesystem write permission denied and cover explicit opt-in, legacy-output compatibility, excluded-record markers, mode conflicts, malformed UTF-8/BOM, byte/text bounds, strict arguments, symlinks, digest mismatch, late framing/semantic failures and unverified original claims. These are local synthetic checks, not a full aggregate checkpoint, OS/network sandbox proof, physical-device or real-capture validation.
