# Builder validation: isolated Mayhem C8 prototype

Source candidate: `87e2e4557b18cc444fe13d4446298317d821fd97`.
Base: `fa8e934363bfb39554f104d25ac6a19c502ebb83`.
Runtime: Node 24.22.1. No active APEX checkout changes were made.

## Checks

- New converter/CLI plus all `iq-*.test.ts`: **370/370 passed** (`focused-tests.log`).
- Typecheck: passed (`typecheck.log`).
- Lockfile inventory: passed, 541 entries (`inventory.log`).
- Initial full project run: 1,838/1,846 passed, eight unrelated REA tests failed because the isolated clone lacked the already-installed REA runtime (`full-tests.log`). This failed run is preserved, not overwritten or relabelled.
- Full rerun using the same installed `rea-agents` **6.8.0** runtime as main APEX: **1,846/1,846 passed**, no skips (`full-tests-rea-runtime.log`). No package installation occurred. `rea-runtime.json` records the identical tool lockfile, release integrity and selected installed runtime hashes. No recovered upstream source was executed.
- Exact prototype file hashes and unchanged base integration files: `source-hashes.json`.
- Independent review approved source `87e2e45` with no blocker. Original review commit `91ba77d3009765e089c72900c07fe9453b3208e4` was included here as `da43bc7`; its report and exact source ties are in `review-evidence/mayhem-c8-independent/REVIEW.md`. It added 15 tests, including all 65,536 I/Q pairs, 16,384 parser mutations, filesystem races and actual write-denied CLI execution. Review focused count: 390/390, with typecheck and inventory passing.
- Final whole-project run **including the independent tests**: **1,861/1,861 passed**, zero failures/skips (`final-combined-tests.log`). Final typecheck and inventory also passed (`final-typecheck.log`, `final-inventory.log`, `final-exit-status.txt`). Production source remained unchanged from `87e2e45`.

These counts cover this isolated baseline only. They do not certify a later combined APEX revision; integration requires its own full run.

## Synthetic CLI demonstration

`synthetic/quarter-rate-tone.c8` was manually generated as four complex samples `[64,0], [0,64], [-64,0], [0,-64]`, repeated 256 times. `synthetic/quarter-rate-tone.txt` declares sample rate 1024 Hz and center frequency 433,920,000 Hz using the explicit signed-int8 format. This is not a real capture or upstream recording.

The report produced by the actual CLI is `synthetic/report.json`:

- 2,048 original bytes become 4,096 derived bytes and 1,024 complex samples.
- Exact normalized complex RMS is 0.5 and both DC means are zero.
- Existing FFT analysis finds signed bin +256, +256 Hz offset, about 0.5 amplitude.
- Original/derived hashes are distinct and included; acquisition, producer and authenticity verification remain false.

The CLI correctly marks these explicitly selected external files as `external-file`; it does not infer that it generated or authenticated them from their names. Output was explicitly redirected by this validation command, not automatically saved by the CLI.

## Limits

No UI wiring, journal/persistence integration, native document selection, browser/mobile execution, real Mayhem capture, physical device, radio, network provider or hardware compatibility was tested. Inputs are individually stable reads, not an atomic producer snapshot. Larger/fractional/unsigned/swapped layouts reject rather than being guessed. Future UI integration must retain original provenance and show the conversion-specific warnings, especially original int8 rail/clipping semantics.
