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
- Selected native text-file input, local export text and the existing native share gate. Native file reads remain bounded and keep ownership until handles close.

## Limits

100 cases per app sandbox/browser, 64 artifacts per case, 65,536 characters per source, 1,048,576 characters per case, and 128 rows per paired dataset. Native file input caps UTF-8 bytes at the relevant document limit. The older native share gate may require smaller cases; nothing is silently truncated.

Case v1 is a new store beside the existing evidence journal. It does not migrate or delete old evidence. Unsupported future schema versions are rejected. Damaged cases are excluded from verified listings and remain in storage; manual repair is not automated.

This is not encrypted case storage or production trust. Digests detect inconsistent bytes, not coordinated forgery, device authenticity or ownership. Imported timestamps, labels, clock calibration and independent sessions are declarations. Synthetic profile acceptance is never real-phone accuracy. The fixed classifier does not decode RF waveforms or identify transmitters. Repeated exposure to a holdout can overfit future experiments; use fresh independent sessions.

## Verification

- Full local host run: **2,573 passed** before addition of the three native adapter cases.
- Final focused storage/replay/learning run: **20 passed**, including three tests executing the actual native adapter SQL against real host SQLite. These are not iPhone/Android SQLite acceptance.
- TypeScript and the locked 542-entry dependency inventory passed.
- iOS, Android and web JavaScript/Hermes exports passed.
- Local Chromium was attempted and failed before rendering because the workspace rejects its Unix-domain socket. Dedicated phone-width and two-tab browser scenarios are included in foundation CI.
- CI, screenshots and native compilation results are recorded separately once available.

No hardware was contacted, installed or flashed. No main-branch merge occurred.
