# Verified selected-record bundles (v1)

This offline utility exports **explicitly selected stored record strings**, and verifies
an isolated in-memory preview. It does not read the journal, prove that selection is
complete, back up a complete journal, or enable restore/import. It never persists,
merges, repairs or assigns new IDs. The separate memory-only
[pasted Evidence preview](evidence-bundle-preview.md) integrates this core without
journal import/restore or export actions. Neither path adds device, native platform,
network, link opening or provider actions.

Bundles are **unencrypted**. Treat their exact source documents and metadata as
private. SHA-256 digests detect content changes but are not signatures,
authentication, proof of acquisition, proof of identity, or trusted chronology.
Someone able to replace records and recompute digests can produce a valid bundle.
`exportedAt` is supplied export-clock metadata, not a capture timestamp.

## Core contract

`createEvidenceBundle(recordStrings, exportedAt, sha256)` accepts 1–100 exact stored
JSON strings, a canonical ISO UTC timestamp (for example
`2026-11-08T01:02:03.000Z`), and a trusted SHA-256 implementation returning lowercase
hex. All strings and envelope inputs are snapshotted and structurally checked before
the first await. Existing v1 record schemas, source rules, payload bounds and content
digest bytes are unchanged. All hashes must succeed before any result is returned.
There is no caller-supplied `verified` flag.

The outer JSON has exactly these fields, in this canonical digest order:
`schemaVersion: 1`, `format: "apex.selected-evidence"`, `exportedAt`, `recordCount`,
`records` (strings), followed by `sha256`. The whole-bundle digest is SHA-256 of UTF-8
`JSON.stringify` of the first five fields in that order. The `sha256` member itself
is excluded. This authenticates nothing, but detects un-rehashed changes including
record order and exact stored-string formatting. Outer whitespace/key order are not
hashed: readers reconstruct the canonical envelope. Strings inside records, including
retained BLE/NDEF source text, are preserved exactly, never reserialized as input.
Each inner record's existing content digest separately hashes its canonical v1
content, not its original outer record whitespace.

`readEvidenceBundle(document, sha256)` rejects duplicate decoded JSON keys, unknown
envelope fields, duplicate IDs, invalid source rules, count mismatches and failed
outer or inner hashes. It returns fresh parsed records and exact record strings only
after full verification. Preview mutation cannot modify input or another preview.
Legacy payloads keep their existing schema semantics; arbitrary metadata payload
keys remain allowed where the old schema allows them.

Conservative limits: 100 records; 16,384 UTF-16 code units per stored record;
2,097,152 UTF-16 code units for the entire serialized bundle (including escaped
strings and digest). Empty selections fail. Existing stricter payload bounds also
apply. The count cap is a selection cap, not a claim of complete journal coverage.

## Local CLI

```
node tools/evidence-bundle.ts create selected-record-strings.json 2026-11-08T01:02:03.000Z
node tools/evidence-bundle.ts preview bundle.json
```

The create input must be a JSON array of exact stored-record strings, not objects.
Output is written to stdout only after all verification succeeds. Preview prints
both parsed records and exact strings; it is private data too. Errors go to stderr
with nonzero status and no partial stdout. The CLI creates no files and does not
modify input. Shell redirection, if independently chosen by the operator, is outside
this utility. There are no restore, repair, upload or automatic-selection commands.

Inputs must be local regular files, not stdin, URLs, symlinks, directories or devices.
The CLI checks identity on the open descriptor, caps reads at 8 MiB before fatal
UTF-8 decoding, checks size/mtime/ctime across the read, and then applies core limits.
A file growing during reads cannot bypass the byte cap. Ordinary filesystem metadata
checks cannot establish a hostile file's history; digest verification applies to the
bounded bytes actually read. No path or URL inside a record is followed.

## Verification

Synthetic tests create records using EvidenceStore's real SHA-256 callback and memory
backend, then verify exact source text, old digest parity, order, isolation, failures,
limits, source confusion and CLI refusals. Existing SQLite evidence tests still cover
persistence separately. This utility provides no encryption/key management or signed
capture provenance, and it does not close the restore/recovery gate.

## Selected HCI derivatives

The additive analysis.hci-event kind retains exact selected-event document text.
Bundle create/read require the optional byte-hasher argument whenever this kind
is present, in addition to the unchanged canonical string digest. Missing capability
fails closed. Every derivative passes full binary SHA-256 and complete legacy
framing validation before a successful bundle result, even if an outer record or
bundle digest was recomputed over bad inner bytes. Other kinds and serialized
contracts are unchanged. The CLI supplies Node binary hashing; app preview supplies
the existing byte adapter and remains metadata-only with four rows per page.
Original capture references stay UNVERIFIED, provenance operator-declared, and
listing/structural parsing alone does not establish either digest. No restoration,
automatic save, authenticated origin or complete-journal backup is added.
