# Selected HCI event evidence capability

This document describes the core/CLI/platform capability increment. The later
[explicit app journal workflow](hci-journal-workflow.md) uses this capability.
The `analysis.hci-event` payload has exactly three own data fields:
`schemaVersion: 1`, `format: "HCI-selected-legacy-event-document"`, and `document`.
The exact inner document text is retained, including whitespace. Synthetic-fixture
provenance maps to offline-fixture; recorded-import maps to offline-import. Native
sources and source mismatches are rejected. These are operator declarations, not
capture attestation, device identity, physical reception or ownership claims.

`parseHciLegacyEventDocument`, `readHciEventEvidencePayload`, preparation,
`parseEvidence`, and journal list perform structural checks only. They do not
verify the derivative binary hash or complete legacy event framing.

Save, journal verify, standalone document verify, bundle creation and bundle read
all require the full asynchronous `readHciLegacyEventDocument` gate on detached
input. Supply `EvidenceCrypto.sha256Bytes`, or the optional final byte-hasher
argument on standalone verify and bundle APIs. Without that capability HCI fails
closed. Existing kinds continue working with only the string hash adapter. The
browser and native journal adapters use their existing byte digest adapters; the
bundle CLI uses Node SHA-256 over bytes. Adapters receive disposable byte copies.
No persisted verification flag or decoded report is introduced.

Limits remain 4096 UTF-16 code units per retained inner string, 16000 per saved
base, 16384 per record, 100 selected records and 2 MiB code units per bundle.
Enclosing escaped text must fit those limits; nothing is truncated. Original
capture references remain unverified even after valid derivative verification.

## Local verification

106 focused tests pass, including six new capability groups and real local CLI
subprocesses. TypeScript passes. Four generic legacy-kind records, bundle and CLI
outputs compare byte-for-byte with baseline 60e38bf; existing specialized evidence
regressions also pass. Initial TypeScript narrowing and host ESM import failures
are retained alongside final logs in verification/hci-evidence-capability.
No network, browser run, native build, device, radio, credentials or real user
capture was used. Independent review and full aggregate are separate gates.
