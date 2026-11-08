# Memory-only BLE trial authoring

`packages/core/ble-trial-authoring.ts` provides `BleTrialAuthoring` for the explicit in-app workflow described below. The core itself does not call native providers, persist drafts, read a journal, access a network, or generate receipt provenance. The separate UI stages and edits sources only on explicit user actions.

## Intended UI contract

1. Obtain the user's explicit `owned-lab` scope declaration and selected `FCD2` or `FEAA` service before creating an author. These declarations are not verified ownership or permission evidence. A different scope/service requires a new author.
2. Add user-declared groups (`id`, `condition`) and source aliases (`id`, `platform`, `snapshotId`, `origin`). Preserve separate aliases even when their source declarations look identical. Never derive identity from snapshot IDs or merge Android and iOS sources.
3. Add trials with explicit `id`, `groupId`, `sourceId`, `receiptId`, and the exact selected-source `document` string. Receipt IDs are user references, not proof of journal membership, reception, identity, or experimental control. This helper never mints them.
4. Render `snapshot()` as an isolated draft copy. It may be incomplete and must not be presented as a validated analysis/export. Do not rebuild inner documents from snapshot fields: exact strings preserve whitespace, unavailable/undefined fields, explicit nulls, provenance and opaque platform material.
5. Use the matching `replaceGroup`, `replaceSource`, or `replaceTrial` to replace a complete entry under its existing ID. Add methods reject duplicates; replace methods reject unknown IDs. IDs cannot be renamed implicitly. `remove(kind, id)` rejects referenced groups/sources; remove referencing trials explicitly first. Failed actions leave all state unchanged. Display the failure without a success or partial-export indication.
6. Only an explicit user Build/Validate action should call `build()`. It returns a validated JSON `document` and freshly computed `report` together, or throws with neither. Do not auto-build on edits. Each build checks the current draft with `analyzeBleDifferential`; no stale report is retained. Output copies are isolated from the draft. Any later edit should invalidate a UI's previously displayed result.

Every insertion/replacement/removal uses the analyzer's shared strict document reader, not a divergent authoring schema. Edits relax only minimum row counts and complete source/group coverage; all present rows, references, selected-source schemas, platform/snapshot/origin matches and selected-service payload eligibility remain strict. Build requires at least two groups, one source, two trials and at least one trial per source/group pair. The reader's incomplete mode is not a validated export operation.

## Bounds and interpretation

- Maximum serialized draft/export: 196,608 JavaScript string characters, including outer JSON escaping. No truncation or chunking.
- Maximum 32 trials, 8 groups, 8 sources. A full 8-by-8 cross-product cannot fit within 32 trials and cannot build.
- Each exact selected-source document is bounded to 4,096 characters by the existing source reader. Labels are nonblank printable ASCII of 1–128 characters; source snapshot IDs retain the existing null/string contract.
- Trial IDs and receipt references are individually unique across the draft. Group/source IDs are unique within their respective collections.
- Malformed/ambiguous AD selections, missing Android raw evidence, invalid source documents and mismatched declarations are refused in full. iOS raw scan data remains opaque; normalized service data is used there.
- Unknown service payload bytes remain descriptive bytes, not inferred fields. Encrypted BTHome remains opaque, including unknown encrypted header versions. No decryption, commands, control or inferred measurement truth.
- Listed order is preserved, never sorted or interpreted as chronology. Group labels, timestamps and receipts remain declarations. Analyzer limitations accompany every built report.

`tests/ble-trial-authoring.test.ts` uses the named synthetic differential fixture and explicitly labeled synthetic sources. Tests cover incomplete drafts, count/escaped-size boundaries, exact roundtrip, missing/null/undefined fields, opaque/unknown payloads, malformed input, duplicate IDs/receipts, source mismatch, atomic refusal, mutation isolation and referenced removal. Existing analyzer tests continue exercising the same shared parser and strict export boundary.

## In-app authoring workflow

The Analysis tab now contains a memory-only concrete form above the existing freeform comparison. Type the `owned-lab` declaration and `FCD2`/`FEAA`, then explicitly start a new draft. Starting replaces the authoring draft, not comparison input. Add groups/conditions and separate source aliases with explicit platform, snapshot null/string mode, snapshot string and origin. Add and Replace are distinct; replacement never renames IDs. Source/trial lists show at most four rows per page; group count is bounded at eight.

In Offline BLE, import or load a selected-source document and Interpret. Only the current validated selected-source text can be staged; legacy envelopes, edits awaiting interpretation and pending saves cannot stage. Staging copies the exact text through App, invalidates a built export and adds no trial, scope declaration, alias or receipt. Enter explicit trial/group/source/receipt references, then Add staged trial. The core checks declarations and service eligibility atomically; it never pools identities or manufactures receipts.

Build and validate checks the complete committed draft. Use dataset is a separate single-use action replacing the freeform comparison draft without Analyze. Any form edit, draft mutation attempt or staging clears the built export immediately. Form and draft survive tab navigation, never reload. No provider, native, journal, network or persistence calls were added. Existing BLE save and freeform comparison remain independent.

Browser scenarios below are authored acceptance checks, **not executed browser evidence**:

1. Load synthetic Android source, Interpret, Stage. Confirm no automatic trial/ownership/analysis/save. Legacy demo, un-interpreted edits and pending save must disable staging. Repeated same-frame staging must hand off at most once per document revision.
2. Enter `owned-lab` and FCD2, start, add two groups, explicitly declare the displayed source metadata under an arbitrary alias. Add two uniquely named trials with distinct user receipt references using the staged exact source. Build, then Use. Confirm comparison draft changes but has no result until Analyze.
3. Build then edit any field or stage a new source. Use must be disabled immediately, including same-frame handlers. Double Use must transfer only once. Failed Add/Replace/Remove must retain every committed row and clear built output.
4. Attempt duplicate trial/receipt IDs, source mismatch, missing group coverage, invalid/oversize fields, and removal of a referenced source/group. Confirm clear errors without partial exports or cascading deletions.
5. Navigate away and back with form edits, a staged source, and committed trials. Confirm memory retained. Reload and confirm authoring state gone. Fill more than four sources/trials and page lists without loss or implied ordering. Android and iOS declarations remain separate.
