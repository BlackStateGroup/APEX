# Case and paired-observation workspace

Implemented on `feat/case-learning-workspace`, [draft PR #26](https://github.com/BlackStateGroup/APEX/pull/26), stacked on #24. The full programme remains in [CURRENT_BUILD_STATUS.md](CURRENT_BUILD_STATUS.md) and the [preserved build outline](vision/BUILD_OUTLINE_20261110.md).

## What works in software

- Default APEX **Cases** tab; the Flipper build has **Save status to a case** and **Open saved cases**.
- SQLite on native builds and IndexedDB on web. Atomic revision checks prevent concurrent stale updates and deletes. Writes must complete before success is returned.
- Retained original UTF-8 text, content digests, source/analysis/profile/report types, backward-only source lineage and duplicate detection.
- Verify/open/export, restore into empty storage, refusal to overwrite a differing existing revision, explicit deletion and preservation of damaged records.
- Attach verified records from the existing evidence journal without changing or moving that journal.
- Bounded paired BLE/ranging JSON import/replay: missingness, monotonically increasing per-session timestamps, clock offset/uncertainty/validity, fixed pairing bound and session partition checks.
- A small two-feature, two-class research model. Discovery determines acceptance regions; calibration/holdout validate without retuning. Missing observations, ambiguous regions, false positive unknowns, absent sham/control examples or inadequate sessions block profile creation.
- Saved profiles link to exact source and validation artifacts. Reuse recomputes the original profile before applying it to unseen declared sessions, and refuses source/phone/reference mismatches.
- Offline replay/learning CLI uses the same engine, hashes exact input bytes and rejects oversized/non-regular/invalid UTF-8 files.
- Selected native text-file input, local export text and the existing native share gate. Native file reads remain bounded and keep ownership until handles close.

## Limits

100 cases per app sandbox/browser, 64 artifacts per case, 65,536 characters per source, 1,048,576 characters per case, and 128 rows per paired dataset. Native file input caps UTF-8 bytes at the relevant document limit. The older native share gate may require smaller cases; nothing is silently truncated.

Case v1 is a new store beside the existing evidence journal. It does not migrate or delete old evidence. Unsupported future schema versions are rejected. Damaged cases are excluded from verified listings and remain in storage; manual repair is not automated.

This is not encrypted case storage or production trust. Digests detect inconsistent bytes, not coordinated forgery, device authenticity or ownership. Imported timestamps, labels, clock calibration and independent sessions are declarations. Synthetic profile acceptance is never real-phone accuracy. The fixed classifier does not decode RF waveforms or identify transmitters. Repeated exposure to a holdout can overfit future experiments; use fresh independent sessions.

## Verification

- [Foundation host CI](https://github.com/BlackStateGroup/APEX/actions/runs/42856713186/job/129971854330) at `b981df47f9e4153d4a44d688ac0f4e173a3af78b`: **2,576 host tests and 42 browser scenarios passed**, including phone-width case learning, export/restore, tamper rejection and two-tab conflict preservation.
- Two additional offline CLI tests pass locally; the follow-up revision preserves a UTF-8 BOM in imported original text.
- Final focused storage/replay/learning run: **20 passed**, including three tests executing the actual native adapter SQL against real host SQLite. These are not iPhone/Android SQLite acceptance.
- TypeScript and the locked 542-entry dependency inventory passed.
- iOS, Android and web JavaScript/Hermes exports passed.
- Local Chromium was attempted and failed before rendering because the workspace rejects its Unix-domain socket. The browser scenarios then passed in GitHub CI.
- [Browser evidence artifact](https://github.com/BlackStateGroup/APEX/actions/runs/42856713186/artifacts/13783052351); retained [phone-width export screenshot](../review-evidence/case-workspace/export-phone.png). Native compilation is tracked separately from physical acceptance.

No hardware was contacted, installed or flashed. No main-branch merge occurred.

## Offline paired replay

```sh
node tools/inspect-paired-observations.ts replay /path/to/dataset.json
node tools/inspect-paired-observations.ts learn /path/to/dataset.json
```

The CLI accepts a local regular UTF-8 file up to 65,536 bytes. It performs no network calls, collection or device control. A valid replay can still contain abstentions; a valid learning result can still refuse profile publication.
