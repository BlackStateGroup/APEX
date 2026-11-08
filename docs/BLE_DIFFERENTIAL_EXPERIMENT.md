# Offline controlled BLE byte comparison

This dependency-free analyzer compares selected **FCD2 or FEAA service payload bytes** in bounded, explicitly grouped owned/lab trials. It does not infer field layouts. An operator can hold a device and setup constant, change one known sensor condition, collect repeated samples in each condition, then inspect byte changes. The program cannot verify that experimental control occurred.

## Synthetic demonstration

From the repository root with Node 24:

```sh
node tools/analyze-ble-differential.ts tests/fixtures/ble-differential.json
node --test tests/ble-differential.test.ts
```

The checked-in fixture has eight synthetic selected-source documents: two repeats in each of two groups for each of Android and iOS. The deliberately chosen FCD2 bytes change only payload offset 2 (`d0` to `34`); the BTHome example encodes 20.00 versus 18.44 Celsius. These are fabricated test bytes, not captured measurements. Every source timestamp is null. The two platforms stay in separate comparison strata. Existing BTHome/Eddystone decoders may be used separately to interpret known public formats; this analyzer never fits a mapping to the condition text.

## Strict input contract

A UTF-8 JSON file, without duplicate keys, contains exactly:

- `schemaVersion`: integer `1`.
- `scope`: literal `owned-lab`. This is an operator declaration, not an authorization or ownership verification.
- `serviceUuid`: literal uppercase `FCD2` or `FEAA`.
- `groups`: 2–8 objects, each exactly `{ "id": "baseline", "condition": "Operator-declared condition" }`.
- `sources`: 1–8 objects, each exactly `{ "id": "android", "platform": "android", "snapshotId": "android", "origin": "synthetic-fixture" }`. Platform is `android` or `ios`; origin is `synthetic-fixture` or `recorded-import`. `snapshotId` must equal the source snapshot ID exactly, including case or null. It is not authenticated device identity.
- `trials`: 2–32 objects, each exactly `{ "id": "trial-1", "groupId": "baseline", "sourceId": "android", "receiptId": "source-receipt-reference", "document": "...exact selected-source JSON text..." }`.

IDs, conditions and receipt references are nonblank printable ASCII strings of 1–128 characters. IDs are unique within their respective lists. Trial IDs and receipt references must each be unique across trials. Receipt references are opaque user-supplied references to collection/import records, not verified journal receipts or proof of independent observations. The analyzer retains them unchanged but does not fetch or attest them. Repeat copies can still be fabricated with different references; counts are not a claim of independent samples.

Every source must have at least one trial in every group. Each trial must refer to an existing group and source. Platform, snapshot ID and provenance origin must match the declared source. Group membership and condition are necessarily user supplied; their truth is not inferred from a name, identifier or payload. Different source IDs are never pooled, even when their byte contents agree.

Each document is the existing `BLE-PLX-selected-source-document` **document string**, not an evidence-journal envelope or invented decoded record. It is revalidated with `readBlePlxSourceEvidencePayload`. Preserve its whitespace, SDK, platform, representation, provenance, selected snapshot and missing/undefined field lists. See [source evidence contract](BLE_PLX_SOURCE_EVIDENCE.md) and [platform bridge](BLE_PLX_OBSERVATION_BRIDGE.md). This module does not modify the evidence journal or its schema.

The complete dataset is limited to 196,608 UTF-16 code units and four simultaneously open JSON containers. Embedded selected-source strings are independently checked at 4,096 code units and depth three. The CLI accepts only regular files, including symlinks whose targets are regular files. It checks the path before opening, then checks the opened descriptor and file identity before reading. On platforms with `O_NONBLOCK`, opening uses it to avoid blocking on a FIFO substituted during the check/open race. Directories, FIFOs and other special files are rejected. Regular-file contents are not an atomic snapshot; do not edit an input while it is read. The CLI reads at most four times the dataset character limit plus one byte before rejecting oversize input and decodes UTF-8 strictly. Existing aggregate BLE payload limits also apply. Unknown fields, malformed source JSON, duplicate decoded JSON keys (including escaped aliases), unmatched/duplicate references and oversize datasets fail before any report is emitted.

## Selection and output semantics

Android selects from parsed raw AD bytes only. Missing raw bytes, malformed/truncated AD, zero matches and duplicate matching service data are rejected, even if the normalized dictionary looks usable. iOS selects from normalized service data only. Its rawScanRecord stays opaque, retained inside the exact document. Canonical UUID collisions are rejected by the source reader. Exactly one matching payload is required; there is no first-match fallback.

The report retains each source document, receipt reference, declared group/source, platform, representation, snapshot ID, provenance, selected payload and Android AD element offset (null on iOS). Provenance timestamps are only the existing source's unverified claims. No current time, native receipt time, identity, capture completeness or RF reception is invented.

Each source has a matrix with zero-based **service payload** offsets, excluding UUID and AD headers:

- `values`: two-digit lowercase hex byte values in input trial order for that source/group, or null if the byte is absent.
- `counts`: exact frequencies, in first-observed value order. Null is counted separately from `00`.
- `runCount`: contiguous runs of equal values in that source/group's input order, not chronological runs or packet arrival rates.
- `changed`: more than one distinct value across all trials for this source at this position. This includes within-group variation and presence/absence changes, not just differences between group conditions.
- `stableWithinEachGroup`: every group's values agree internally. It can be true even for an entirely unchanged offset. Jointly inspect this flag and `changed`, without treating either as evidence of causality.
- `changedOffsets`: positions where `changed` is true. Lengths and ordered trial IDs are also included.

Payloads of unequal length are compared positionally; there is **no sequence alignment**. Insertions, deletions, different FEAA frame types, packet counters, timestamps, checksums, environmental noise and ciphertext can all change bytes unrelated to the chosen condition. No numeric field hypotheses, statistical ranking, sensor calibration or causal labels are generated. A single sample per group is allowed as a byte comparison, but cannot establish reproducibility. Additional controlled repeats and independent held-out trials are required before any external field-mapping hypothesis is credible.

Any FCD2 payload with its encryption flag set is explicitly tagged `opaque-encrypted-bthome`, regardless of version bits. Ciphertext bytes can be compared descriptively, but no plaintext fields, keys, identity or commands are inferred. Other payloads receive only `byte-comparison-only`, not a promise that their layout is valid or plaintext.

The output includes exact source data and may contain private identifiers and untrusted labels. Keep it local and treat it as inert data. This tool performs no scanning, network access, decryption, pairing, device commands, persistence, UI mutation or automatic action.

## Source basis

This increment adds no protocol constants beyond selecting existing FCD2/FEAA decoders' service identifiers and the existing BTHome encryption bit. Exact upstream source pins and public-format references remain in [BTHome offline research](BTHOME_OFFLINE.md), [BLE offline experiment](BLE_OFFLINE_EXPERIMENT.md), `research/bthome-source-pins.json` and `research/ble-source-pins.json`. All newly added fixture data is synthetic and locally generated.

## Local Analysis card

The **Offline BLE trial comparison** card exposes this same strict analyzer in the app. Paste the complete dataset into **BLE trial dataset**, or explicitly **Load synthetic BLE trials**, then **Analyze BLE trials**. Loading a fixture does not analyze it; edited fixture provenance remains whatever the exact source documents declare. The bundled fixture is the same synthetic dataset used by the CLI tests.

The draft and complete report live only in component memory. They survive navigation to another app tab because the card remains mounted, but do not survive reload or app restart. There is no save/export button, journal write, native capture bridge, scanning or network operation. Every edit clears results, including a repeated identical edit. Inputs above 196,608 UTF-16 code units are rejected whole with a message: the previous exact draft stays and results clear. No TextInput truncation silently transforms an oversize paste into accepted input.

Results list declared groups and conditions, then one selected source's trial references, payload lengths, representation, AD offsets and opacity labels. Platform, origin, snapshot IDs and receipt references remain explicitly declared rather than authenticated. Source selection never pools platforms or sources. Offset navigation displays up to 16 positions per page, marks changed positions, gives the total changed count, and displays one selected offset's group values, exact frequencies and listed-order runs. Selecting another source resets offset navigation. Empty payloads produce an explicit empty view. The complete core report remains in memory; neither the full byte matrix nor all embedded source documents are rendered. The exact dataset remains in the editable draft.

All labels and values are inert text. There is no link, markup, fetch or data-derived command. Byte changes (including null-versus-zero) are not causal findings, time ordering, control verification, device identity or sensor field mappings. Ciphertext remains opaque.

Host coverage is in `tests/ble-trial-workbench.test.ts`: explicit analysis, exact retention, edit invalidation, whole-input rejection, schema failures, source separation, bounded paging, absent bytes, ciphertext and invalid navigation. Two scenarios in `tests/ui.smoke.spec.mjs` define tab/reload/repeated-click and small-screen pagination flows. These scenario definitions are not evidence of browser execution; see `verification/ble-trial-ui/README.md` for checks actually run.
