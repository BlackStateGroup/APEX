# Selected BLE PLX source evidence

`packages/core/ble-plx-source-evidence.ts` adds the separate `analysis.ble-source`
evidence kind and `BLE-PLX-selected-source-document` payload format. Existing
`analysis.ble` records continue to retain their offline projection only. They are
not retroactively upgraded into source snapshots. No database migration or old
canonicalization/digest change is required.

## Scope and format

The payload has exactly `schemaVersion: 1`, `format`, and `document`. The document
is an exact retained JSON string with exactly these fields:

- `schemaVersion: 1`
- `sdk: "react-native-ble-plx@3.5.1"`
- `platform: "android"` or `"ios"`
- `representation`: `android-ad-bytes` on Android, or
  `ios-normalized-fields-with-opaque-json-base64` on iOS
- `provenance`: existing strict declared origin, label and source timestamp
- `snapshot`: all 12 adapter-selected field names, with original source base64,
  identifier, UUID spelling/case, array order, nulls and empty values
- `unavailableFields`: selected fields absent or holding own `undefined`, each
  represented by a null placeholder in `snapshot`
- `undefinedFields`: subset of unavailable fields that originally held own
  `undefined`; the remaining unavailable fields were absent

The selected fields are `id`, `name`, `rssi`, `manufacturerData`, `rawScanRecord`,
`serviceData`, `serviceUUIDs`, `localName`, `txPowerLevel`,
`solicitedServiceUUIDs`, `isConnectable`, and `overflowServiceUUIDs`.

This is a **complete selected snapshot**, not a complete Device, complete RF
capture or claim of reception, authenticity, freshness or identity. Device
methods, managers, prototypes and arbitrary properties are not serialized or
called. Accessors on selected fields are rejected rather than invoked. Inherited
selected fields are treated as absent by the existing own-field adapter.

## Save and replay

- `prepareBlePlxSourceEvidenceInput(platform, device, provenance)` defensively
  selects and validates source values with the existing adapter and produces an
  `EvidenceStore.save` input.
- `prepareBlePlxSourceEvidenceDocument(document)` accepts an untrusted saved
  source string, validates it and retains that exact string, including whitespace.
- `readBlePlxSourceEvidencePayload(payload)` validates format/version, pinned SDK,
  platform/representation, complete snapshot keys, provenance, availability
  consistency and bounds. It reconstructs selected source input and reruns
  `prepareBlePlxObservation`. No stored decoded results or verification claims
  are accepted. Its return value is a fresh `BlePlxPreparation` with a source
  retention explanation; the exact document remains in the original payload.

Android absent/null raw bytes are retainable but replay returns
`status: "raw-scan-record-unavailable"`, `document: null`, and `observation: null`.
An empty raw base64 string is distinct. iOS `rawScanRecord` remains opaque base64
JSON; it is never passed to the Android AD parser. iOS normalized field semantics
and validation continue to come from the existing adapter.

Origin is always declared offline provenance. Synthetic inputs require null
capture time; recorded imports preserve their declared capture timestamp, which
is separate from the journal's save time. A recorded import is not native
verification. Envelope source must match origin (`offline-fixture` or
`offline-import`); native source labels and extra decoded/authenticated claims
are rejected. Valid edits to availability or source bytes are still edits: the
journal digest detects them, but is not a signature and does not prove the
original source was truthful.

## Bounds and compatibility

The entire source document must fit the existing **4096 UTF-16 character**
per-string metadata limit. This includes JSON structure, source metadata and
whitespace. A valid standalone adapter snapshot may be too large to journal.
Oversize documents are rejected completely; nothing is truncated, chunked or
silently converted to a projection. The existing 16000-character save-envelope
and 16384-character stored-envelope limits remain unchanged. These APIs do not
save anything themselves. No radio, phone, manager, provider or network call is
made.

SQLite reopen tests retain the exact document string and verify its content
digest. Existing pre-source evidence kinds continue using the same canonical
base serialization and SHA-256 calculation. The offline Analysis workbench exposes this source kind separately from legacy
projection envelopes. Use “Import phone selected-source document” or the synthetic
Android/iOS source demos, then interpret and explicitly save. The importer accepts
the document itself, not the evidence payload wrapper or an arbitrary Device object.
Preview, pending-save and saved states are separate. A valid source with unavailable
Android raw bytes can be saved without inventing an advertisement interpretation.
Evidence supports digest-checked reopen of both kinds, followed by current source
validation and interpretation. The selected source and its representation are shown;
a digest is not reception or identity attestation. No automatic save or provider export
is performed. Editing clears previous findings and asynchronous completions cannot
restore stale results. Original text, including whitespace, is retained on explicit save.

## Local checks

Run `node --test tests/ble-plx-source-evidence.test.ts tests/ble-evidence.test.ts tests/evidence.test.ts`.
These tests use built-in Node SQLite and crypto, with no native phone or added
package dependency. Coverage includes persisted whitespace, changed-source and
whitespace tampering, missing/undefined/null/empty distinctions, iOS opacity,
Android unavailable raw bytes, source/provenance mismatch, invalid claims,
pinned SDK/platform/version checks, unknown keys, size boundaries, accessor
rejection and legacy record compatibility.

## Workbench verification

`node --test tests/ble-workbench.test.ts tests/ble-plx-source-evidence.test.ts`
covers both source representations, exact whitespace, digest tampering, unavailable
Android bytes, provenance, invalid/oversize input, mode changes, duplicate save
suppression and stale asynchronous completion. The legacy envelope workflow remains
separate and covered. Browser scenarios are in `tests/ui.smoke.spec.mjs`; they are
not runtime acceptance evidence until executed in a browser-capable environment.
No native permission, radio, hardware, model or provider action is added.
