# Independent byte-budget and discovery correction review

Reviewed exact correction commit: `7514b836de9e25d40a68225f88e68015f2c12416`.
Helper SHA-256: `815604799b990de9f7ed2f525321a557d0f70397eafdf4f90b8f4d736dc638ba`.
Typed discovery wrapper SHA-256: `700dc636c00e83d6313c2d9a37882653f6ec51d0e4dc212803c25fa0069b014f`.

The earlier REPORT.md is scoped to its earlier implementation, not a claim these subsequently identified gaps were absent. Parent review found aggregate test discovery omitted the new MJS suites and log accounting mixed string code units with raw bytes.

## Reproductions and fixes

Independent authored subprocess fixtures reproduced both logging defects before the correction. A 9 MiB euro-character stream incorrectly reported success, retaining 9,437,715 encoded text bytes; split-byte `A€𐍈Z` became replacement characters. `utf8-before-fix.log` retains both failures. These are helper defects, not fixture failures.

The correction counts observed/retained raw bytes, retains at most 8 MiB per stream, stores canonical raw prefix as base64, and marks raw truncation independently of bounded diagnostic text truncation. It decodes across complete retained chunks instead of per chunk. Independent tests now verify exact raw prefix and counters for stdout and stderr overflow, intact byte-at-time multibyte characters, and malformed UTF-8 preservation with a separately bounded diagnostic text view. Raw cap does not mean JSON/base64 evidence serialization has zero encoding overhead.

`tests/reviewed-idf-build-suites.test.ts` directly imports both MJS suites and registers their original tests. The actual wrapper run includes both original suites and all added independent cases. The fixed checkpoint plan still contains nine stages, its node-test arguments select the wrapper, and npm test's existing `tests/*.test.ts` glob also selects it. No runner, npm script or CI trigger was changed.

## Final execution and evidence

- `node --test tests/reviewed-idf-build-suites.test.ts tests/native-process-group.test.ts`: **22/22 groups passed**, including the aggregate-discovery assertion (`final-utf8-discovery-tests.log`). These are authored Node process and filesystem fixtures only.
- `./node_modules/.bin/tsc --noEmit`: **passed** (`final-utf8-tsc.log`).
- `node tools/verify-offline-checkpoint.mjs --plan`: inspected only; resulting plan retained in `final-discovery-plan.json`. No aggregate execution occurred because its first stage compiles firmware.
- Helper and wrapper bytes are unchanged from exact builder7514b836. Independent review adds only test assertions and evidence.

The builder retained its initial short-write test-fixture failure (single fs.writeSync to a pipe may return a partial write), corrected it using queued complete output, and retained initial typecheck annotation failures. Independently, merging duplicate cherry-picked review history produced add/add conflict markers in the test file; an automatically subsequent typecheck reported those markers. `integration-conflict-tsc.log` is retained as an integration failure, not a helper defect. Resolving the merge preserved all independent assertions; final tests/typecheck ran after resolution and passed.

## Remaining gates

No remaining blocker for these two helper corrections within the documented trusted/exclusive POSIX workspace contract. No SDK installation/invocation, native build, prebuild, firmware execution, device/radio/flash, remote or settings action occurred. This correction review does not reassess or close the separate blocked SDK initialization/configuration firmware review. Authentic SDK compilation, firmware review, image-source binding and physical acceptance remain open.
