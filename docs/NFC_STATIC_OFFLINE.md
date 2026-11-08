# Offline static NFC data-area viewer

This is a deliberately narrow **APEX product policy**, independently written from vendor-documented structural facts. It is not generic Type 2 support, certification, a current-spec conformance claim, or a licensing determination. It does not read tags, use native APIs, write files, navigate URIs, emulate, replay, inspect credentials/configuration, or change access settings. Tests use manually authored synthetic bytes only.

## Explicit input contract

Call `inspectNfcStatic(bytes, context, trustedSha256)` or use:

```
node tools/inspect-nfc-static.ts synthetic.bin --mode static-data-48 --provenance synthetic-fixture --label 'Own synthetic example'
```

All three options are mandatory and unique. Mode is exactly `static-data-48` (48 contiguous bytes declared to be the static data area) or `static-structure-64` (64 bytes declared to be the complete selected static structure). No auto-detection or physical completeness/chip identity inference follows from file length. Structure mode checks only CC bytes 12..15 against the exact set `E1 10 06 00` and `E1 10 06 0F`; it parses bytes 16..63. Bytes 0..11 are uninterpreted and undisplayed. Accepted CC values do not establish access state, locking, security or ownership. Data-only mode does not inspect a CC at all.

Context must have only own data properties `mode`, `provenance`, `label`. Provenance is `synthetic-fixture` or `recorded-import`, a caller claim. Labels are 1..128 UTF-16 code units without C0/DEL controls. Input must be an actual fixed, nonshared Uint8Array (including Buffer), not a proxy. An intrinsic snapshot is made before inspecting context or awaiting the trusted hash callback. The callback receives a separate copy. Its result must be lowercase 64-hex SHA-256; shape validation cannot prove adapter honesty. Hash covers the **entire supplied input**, including structure/trailing/opaque bytes, not only NDEF and not physical capture authenticity. Original bytes remain private; reports and nested values are frozen. No persistent store is used.

The CLI reuses the bounded regular-file reader in `inspect-iq.ts`: maximum 64 bytes, no empty files, no final-component symlinks, nonblocking read-only open, identity/size/time checks and bounded read. Ancestor directory symlinks are allowed. This is not an adversarial-filesystem immutability guarantee. No path or underlying exception is echoed on CLI failure, stdout remains empty on failure, and successful output is assembled before one stdout write. Serialized JSON has a conservative UTF-8 bound of 64 KiB. No raw source, UID/lock, proprietary, trailing, or unknown NDEF record bytes are output. Interpreted NDEF text/URI are inert untrusted data and can themselves contain arbitrary caller-supplied content.

## Supported TLV subset

The data region is exactly 48 bytes. NULL `00` and terminator `FE` each consume one byte. NDEF `03` and proprietary `FD` consume a tag, one short length byte (0..254), then exactly that many value bytes. Value starts at `p+2`, length must be at most `48-(p+2)`, and exclusive end is `p+2+length`. Extended marker `FF` is unsupported; no endian assumption is made. Lock control `01`, memory control `02`, and all other tags stop the scan as outside this subset. Truncated headers/values stop with structural diagnostics. There is no recovery search for a later `03`, and no dynamic reserved/lock-region mapping.

Terminator stops interpretation. Any following bytes are an uninterpreted trailing span, not assumed padding. Exhaustion without terminator is accepted only at a complete TLV boundary. The whole supported region is scanned before any NDEF decoding. A later unsupported or malformed element suppresses all NDEF handoff, even if earlier candidates were complete.

## Report semantics and offsets

`tlvStatus` is `supported`, `unsupported`, or `malformed` **for this profile only**. CC mismatch is unsupported. Diagnostics identify a tag, length byte or CC start; earlier element metadata may remain present but no partial NDEF result is emitted. `ndef.count` on a stopped scan counts candidates seen before the stop, not an assertion about the rest of the file.

`ndef.status` is:
- `not-attempted`: TLV/CC scan not supported; decoder is null.
- `missing`: accepted scan, no NDEF TLV.
- `ambiguous`: accepted scan, multiple NDEF TLVs; no automatic decoder selection. This does not declare the input invalid Type 2.
- `empty`: exactly one zero-length NDEF TLV; no contained serialized message, not a valid empty serialized NDEF message.
- `decoded`: exactly one nonempty NDEF value was passed **in its entirety** to existing `decodeNdefMessage`. Its separate status/issues remain authoritative, including malformed/unsupported outcomes. No chunk reconstruction occurs.

Every `StaticSpan` uses data-area-relative `offset` and exclusive `endOffset`, plus absolute `sourceOffset` and exclusive `sourceEndOffset`. This includes the dataArea itself, element, value and trailing spans. A diagnostic has data-area-relative `offset` (null for CC) and absolute `sourceOffset`. Within `ndef.decoder`, `offset`/`endOffset` retain the existing decoder's **NDEF-value-relative** meaning; `dataOffset`/`dataEndOffset` and `sourceOffset`/`sourceEndOffset` explicitly add the other coordinate systems. Issues have start offsets in all three systems. Issues can point to the end boundary. Decoder issues/status and inert interpreted values are preserved, but raw record/type/id/payload hex is deliberately omitted.

## Public vendor references and limits

- [Infineon application note](https://www.infineon.com/dgdl/Infineon-How-to-operate-my-d-move-devices-in-NFC-Forum-Type-2-Tag-infrastructures-ApplicationNotes-v04_00-EN.pdf?fileId=5546d4624ad04ef9014af3554908139f), actual document Z8F80907343-B, revision 5.1, 2026-03-23 despite the URL's v04_00 name. Section 1.2.1 printed page 6 describes four-byte blocks, internal bytes 0..9, static locks 10..11, CC 12..15 and data from 16. Section 1.2.2 printed page 7 documents TLV tags. Section 3.1 printed pages 15..17 gives CC examples and static blocks 04..0F. Static data can be 48 bytes even on a larger device; dynamic mappings are excluded here.
- [Nordic nRF5 SDK 13.0.0 Type 2 format](https://docs.nordicsemi.com/r/bundle/nrf5_sdk_v13.0.0/page/nfc_type2tag_format_dox.html) describes eight-byte CC capacity units, value-byte TLV lengths, NULL and proprietary semantics. Its 992-byte example is implementation-specific, not this profile.
- [NFC Forum current specification page](https://nfc-forum.org/build/specifications/type-2-tag-specification/) identifies version 1.3. Full current normative text was not obtained. Historical public specification availability is not an implementation license. No specification prose or implementation was copied, no licensing conclusion is made, and unverified extended-length/generic mapping behavior is excluded.

## Focused verification

`node --test tests/nfc-static-offline.test.ts` exercises all 256 first tags, all 256 length-byte values for both supported value tags, CC exact set, explicit modes, literal offsets, boundaries, opaque spans, late failures, malformed NDEF separation, whole-source hash identity, snapshots, hostile views/contexts, immutable output, strict CLI options and read-only Node permission mode. Only synthetic inputs are used. No aggregate, browser, native or physical-device acceptance is implied. Builder raw logs, including the initial test-only strict-TypeScript failure, are retained in `verification/nfc-static-builder/`.
