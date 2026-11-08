# Independent single-window I/Q controls review

Reviewed production source commits 3143255, 5df5f43, 073ce04 from the isolated builder checkout. Applied onto frozen baseline b1207e6 as 4025634, 46551fb, 789ac7a. No production code authored by reviewer. No core, schema, platform, dependency, permissions, native/device/radio/network/storage/provider or publication actions.

## Conclusion

No remaining correctness blocker identified. Explicit/default geometry is staged and invalidates old reports without IO. Explicit fit is checked against captured byte count before either read. Invalid input clears retained text and cannot reuse a prior valid setting. Actual source/options are captured before observer notifications, and one outstanding slot persists across settings, clear, replacement and exit/reentry until the old operation settles. Every new Inspect rereads and rehashes source bytes; no PreparedIq cache.

Report geometry is actual rather than hardcoded; all bins are retained up to 4096, rendered eight per page, with truthful relative-unit labels and no heap-bound claim. Default short sources retain statistics-only behavior; explicit short sources fail before IO. Clear/examples/exit reset controls. Existing zero example exact metadata/data SHA-256 preserved. Tone staging requires no TextEncoder, IO or hashes; its exact integer positive/negative quarter cycles give peak amplitude 0.5, neighbors 0.25 under periodic Hann and signed bins ±N/4 in single-half windows.

## Findings addressed

- Initial explicit-invalid → default transition hid the invalid input while disabling Inspect. Builder added always-visible invalid-settings explanation before source commit 3143255. Verified through actual TSX projection.
- Parent noted split windows need not mix both orientations when the sole crossing sample is at a zero Hann weight. Builder qualified wording to “may mix both orientations” in 073ce04. No arithmetic defect.
- 5df5f43 replaces the strict digit regex with explicit length and non-digit checks and adds terminal separator cases. This is clarity/coverage, not a reproduced bug: the original non-multiline regex rejected LF in the tested Node runtime and our original LF case already passed.

## Verification

Final production head reviewed: 789ac7a (production content corresponds to builder 073ce04).

- `node --test tests/iq*.test.ts tests/inspect-iq*.test.ts`: 118 passed, 0 failed; `focused-final-head.log.txt`.
- `./node_modules/.bin/tsc --noEmit`: exit 0; `typecheck-final-head.log.txt`.
- Prior focused 73/73 and expanded 118/118 runs retained, including before/following validation clarity change.
- New independent test file has 19 tests, including loop matrices. Direct windowed DFT computes every bin from independently quantized off-bin samples at nonzero start 123, without invoking the core FFT or analysis as oracle.
- Full-size first/last-fit/one-beyond, maximum 65536-sample source, strict ASCII/terminal/oversized input, complete immutable pagination, fresh reread after changed bytes, exact tone signs/neighbors, no-TextEncoder load, source/options observer reentry, and both success/rejection at metadata, data and all three SHA digest boundaries are covered.
- Updated actual TSX host mock test exercises mode/tone/size/start callbacks, passing oversized text intact to validation, rendered actual geometry and invalid-state disclosure. This is host projection/callback coverage, not browser/native acceptance.

## Preserved failed setup evidence

The first attempt `git fetch ../apex-iq-window-controls 3143255` failed because a short SHA is not an advertised ref. The chained test did not run. The following tsc command inadvertently ran against baseline b1207e6 with new tests, failing on expected missing control API types. `typecheck-first.log.txt` preserves those errors. Fetching the named branch and cherry-picking the verified commit resolved setup; all subsequent test/typecheck runs passed. No failed product assertion was observed.

No browser execution was attempted, respecting the earlier denial. No physical/device acceptance or native build is claimed. Aggregate full-suite/build status belongs to the parent/builder, not this focused independent review.
