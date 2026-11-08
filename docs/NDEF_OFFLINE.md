# Offline NDEF message interpretation

The decoder is a dependency-free, read-only core experiment with an explicit local app workbench and optional journal persistence. It does **not** add NFC capture to the app. Existing `packages/core/nfc.ts` and native metadata readers remain unchanged and physically unvalidated. No NFC emulation, writes, authentication, credential recovery, device control or unlocking is implemented.

## Run

- `node --test tests/ndef-offline.test.ts`
- `node tools/demo-ndef-offline.ts`
- `npm run typecheck`

The synthetic examples decode to English `Hi` and inert URI text `https://example.com`. They are manually constructed wire bytes, not physical tag observations. The helper needs neither Node APIs nor browser encoding globals; the test/demo use Node only for loading fixtures. No packages were installed.

## Input and provenance contract

`importNdefObservation(document)` accepts a bounded JSON string with exactly these fields:

```json
{
  "schemaVersion": 1,
  "inputKind": "serialized-ndef-message",
  "provenance": {
    "origin": "synthetic-fixture",
    "label": "Manually constructed greeting, not a capture"
  },
  "messageHex": "d101055402656e4869"
}
```

The other origin is `recorded-import`. Both are **caller claims**, never verified provenance. The exact original JSON string is retained as `sourceDocument`, including whitespace and letter case. `decoded.inputHex` retains the exact input hex string; field/raw/tail hex is normalized lowercase. Duplicate JSON keys (including Unicode-escaped key aliases), unknown fields, incompatible versions, invalid provenance and native record dictionaries are rejected. Labels are required strings of 1–128 UTF-16 code units, not trusted instructions. No timestamps, hardware identifiers or capture facts are synthesized. The result always sets:

- `physicalReceptionVerified: false`
- `identityVerified: false`
- `authenticated: false`
- `originIsCallerClaim: true`

`decodeNdefMessage(messageHex)` is separately callable. Hex must be contiguous, even-length hexadecimal; no guessed encodings, whitespace removal, prefixes or base64 conversion occur. Import and decoding are pure computations, not journal persistence/export. This deliberately does not modify the existing evidence schema. Callers should retain the input document, not trust externally supplied decoded objects or verification flags.

## Byte boundary

Input starts at the NDEF message's first record header. It excludes tag memory mapping, Type 2 TLV headers/terminators, Type 4 NLEN, radio framing, CRCs and protocol commands. Those envelopes require a separately specified importer. A decoded native record dictionary commonly lacks original MB/ME/SR flags and chunk representation. Serializing such a dictionary would create **reconstructed** bytes, not recover the raw message or full RF frame. This importer does not accept or silently reconstruct dictionaries.

Each complete record preserves header flags, TNF, raw record bytes, type bytes, identifier bytes and payload bytes. `offset`, `typeOffset`, `idOffset`, `payloadOffset` and exclusive `endOffset` are zero-based **byte** offsets in the supplied message. Zero-length fields have coincident offsets. An identifier is not a tag identity or credential. Raw bytes survive even when the interpretation is opaque or invalid.

The parser checks unsigned big-endian short/long payload lengths, optional ID length, initial/subsequent MB, final ME, conflicting CF/ME, TNF_EMPTY empty fields, TNF_UNKNOWN/reserved empty type, and TNF_UNCHANGED outside a supported chunk chain. Long lengths use arithmetic rather than signed 32-bit bitwise conversion. Truncation is detected before slicing/allocating claimed payload sizes. Trailing bytes after ME are an error, even zero bytes.

Chunked messages are explicitly unsupported. The first chunk's header/body bounds and immediate constraints are checked, then the parser stops **before** treating its partial payload as a complete record. A missing first-chunk type (except TNF_UNKNOWN) is malformed. The entire first chunk and remaining message are retained in `unparsedHex`; later chunks are not validated. Therefore `unsupported` does not certify that a chunked message is valid. Previously completed records remain inspectable.

## Interpretation and limits

Only well-known, exact type `T` (0x54) and `U` (0x55), TNF 1, are interpreted. Other well-known types, Smart Poster/nested records, MIME, absolute URI, external and unknown/reserved records remain opaque. Type name grammars, language-tag registration, identifier URI syntax and payload semantics are not generally validated. Empty/missing types outside the stated TNF rules are retained opaque; `parsed` means supported structural parsing, **not complete NFC Forum conformance**.

Text uses the status byte's low six bits as the US-ASCII language length, rejects reserved bit 6 and interprets bit 7 as UTF-16 versus UTF-8. ASCII language bytes are preserved without guessing language validity. Unicode decoding rejects overlong sequences, invalid continuations, non-scalar values, unpaired surrogates and odd UTF-16 byte lengths. UTF-16 recognizes BE/LE BOMs and defaults to BE without a BOM; a leading UTF-16 BOM is consumed. UTF-8 preserves a BOM as U+FEFF. No replacement characters or normalization hide malformed bytes. The raw payload remains available.

URI codes 0x00–0x23 expand using the NFC URI prefix table. Reserved/unrecognized codes remain opaque. UTF-8 suffixes are strictly decoded. This is **prefix expansion**, not URI validity, safety or reachability validation. Empty suffixes and any schemes are retained; `actionable: false` is always set. No URL is opened or fetched. Do not turn these outputs into navigation, commands, HTML, app intents, credentials or model instructions. Control characters and malicious-looking text are untrusted display data.

Hard local limits, deliberately narrower than the wire format:

- 8,192 message bytes; invalid/oversized input throws before byte decoding. Rejected oversized input is **not** retained in a result.
- 20,000 UTF-16 code units per JSON document, before parsing.
- Two JSON container levels; nested record interpretation depth is **zero**.
- 64 completed records. A 65th is retained as an undecoded tail with `limit-exceeded`.
- A declared payload over 8,192 bytes reports `limit-exceeded`, without allocating its declared length.

Accepted byte input is fully retained in `inputHex`. Complete records plus `unparsedHex` reconstruct its normalized bytes. Structural errors stop parsing and retain the offending record onward. Invalid Text/URI payloads produce `invalid` values with retained raw payload and an `invalid-rtd` issue; subsequent well-framed records can still be inspected. `parsed`, `malformed`, `unsupported`, and `limit-exceeded` are decoder statuses, never reception/authenticity claims. A later structural/limit stop can take precedence over an earlier invalid RTD; all encountered issues remain present.

## Sources and verification basis

Checked 2026-11-07. No upstream implementation was copied; the numeric wire facts/prefix table informed the independent implementation.

1. [AOSP NdefRecord.java, pinned android-14.0.0_r1](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/android-14.0.0_r1/core/java/android/nfc/NdefRecord.java), Apache-2.0 source: header masks, TNF fields, URI_PREFIX_MAP, `parse`, and `validateTnf`. This pinned platform implementation cross-checks framing and constraints against NFC Forum NDEF 1.0. In contrast to AOSP, this experiment declines chunks, strictly rejects malformed Unicode and retains a structured partial result instead of throwing for wire-format errors. Reserved TNF 7 is retained opaque with empty type, matching AOSP's compatibility handling; it is not claimed to be an assigned record type.
2. [W3C Web NFC Community Group draft](https://w3c-cg.github.io/web-nfc/#the-ndef-record-and-fields), living draft read on the date above: record fields and Text status-byte layout. [Text parsing discussion](https://w3c-cg.github.io/web-nfc/#parsing-ndef-well-known-t-records) describes UTF-16 BOM handling and BE default. This is supporting primary API guidance, not a claim that the draft is a stable Recommendation or a replacement for purchased NFC Forum specifications.
3. [NFC Forum specifications](https://nfc-forum.org/build/specifications/) are the normative standards family identified by those sources. No claim is made that this project obtained or independently certified against the complete current licensed specification.

## Validation boundary

Focused host tests cover concrete fixture outputs, all 36 prefix codes, Unicode/status errors, ID offsets, short/long lengths, TNF/flag errors, truncation at every byte boundary of representative messages, unknown types, chunk refusal, record/message/document limits, duplicate provenance keys and 6,000 deterministic random byte inputs plus 1,000 framed random RTD payloads with reconstruction/determinism invariants. Random tests are not a security proof. No physical NFC device, native build, browser or RF reception was used. The later local integration is described below; device validation remains future work.

Original decoder checkpoint validation: Node 24.22.1; strict TypeScript 7.0.2 check passed; focused suite 13/13 passed. Aggregate `npm test` after the final test addition passed 164/164, including the firmware host build. Existing approved app and pinned REA dependency directories were reused via local, ignored symlinks; no installation or dependency changes. An initial aggregate run lacked the isolated worktree’s REA symlink (161/163), resolved by reusing the existing pinned dependency directory. No browser/native build/hardware tests were run.

## Local app workbench and evidence journal

Analysis now contains a separate **Offline NDEF messages** workbench. Import/paste or load a clearly synthetic Text/URI example, explicitly interpret, then optionally **Save NDEF evidence locally**. Loading/editing never persists data or opens URLs. Values are JSON-quoted React Native text (including URI output), not HTML, links, navigation, intents or model input. Findings include decoder status, caller-origin labels, record byte offsets, raw records, issues, undecoded tails and the complete observation/source. The existing native metadata reader remains metadata-only; a separate [one-tag phone path](NFC_MANAGER_NDEF.md#explicit-one-tag-phone-read-8-november-2026) captures normalized selected fields. Neither native path reconstructs original wire bytes, and physical acceptance remains unrun. This serialized-message workbench adds no physical capture or credential/card emulation.

The additive journal kind `analysis.ndef` uses `{ schemaVersion: 1, format: 'NDEF-offline-document', document }`. `document` is the exact original string, including whitespace/case, limited to **4096 UTF-16 code units**. The standalone decoder's 20000-character/8192-byte limits are unchanged. An input may be interpretable but too large to save; the UI preserves it and rejects saving the complete input rather than truncating it. Existing canonical JSON hashing, string/document caps, database schema and other evidence kinds are unchanged.

The journal validates the strict payload and envelope on save/read/replay, derives `offline-fixture` versus `offline-import` from the retained origin, and rejects native source claims, source conflicts, extra decoded results and verification claims. Malformed/unsupported/opaque message results are retainable as unverified source evidence; a parser status is not attestation. Evidence reopening snapshots the record, validates the document, verifies its digest and only then exposes freshly computed interpretation using the current decoder. A digest detects retained-content changes, not reception or identity.

Input edits immediately clear stale findings/save eligibility. Synchronous action locking prevents overlapping/double-tap saves, repeat interpretation does not resave the same completed document, and a late save completion cannot restore findings for edited input. A successful save is marked complete before refreshing the evidence list. Reopen requests suppress late responses after record changes/unmount. Switching tabs retains workbench input without triggering work.

Checks: `node --test tests/ndef*.test.ts` includes the pure decoder suite plus SQLite close/reopen, whitespace/case retention, malformed/opaque tails, inert URI data, source/claim rejection, tampering, cap boundaries, old digest compatibility, stale edits, repeated actions, failure/retry and asynchronous snapshot tests. `tests/ui.smoke.spec.mjs` adds browser preview/save/reopen, reload, inert-link absence, edit invalidation, complete oversized input and tab-switch scenarios. Browser execution remains separately unvalidated in this environment (Chromium startup socket EPERM); these scenarios are not a claimed browser pass.

Integration validation (2026-11-07): focused NDEF suite **31/31**, aggregate host suite **189/189** including firmware build, full strict semantic typecheck, and offline Expo iOS/Android/web exports passed. Playwright discovery listed **14 scenarios**, including two new NDEF scenarios; no browser was launched. Only the previously approved app and REA dependency directories were reused through ignored symlinks. No package/lockfile changes, native builds, actual NFC/radios, remote writes, uploads or model calls. Logs are in `verification/ndef-workbench/`.
