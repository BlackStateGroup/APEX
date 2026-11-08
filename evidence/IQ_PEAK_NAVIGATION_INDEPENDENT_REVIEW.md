# I/Q peak navigation independent review

Reviewed builder source commits `1f4a7d039da5b01234d26020df4bfe780381f4a3` and `e9051676220268038e4b88a34edfdcfa265a6cf8` in a separate worktree based on `d8496fe`. Final production source is identical to builder e905167. Existing approved node_modules was reused without installation.

The first source contained a duplicate peak button in the time-frequency branch that dereferenced a null single report. Both existing actual-TSX checks and the new independent check reproduced the crash. Logs are preserved in iq-peak-review-initial-failure.txt and iq-peak-independent-initial.txt. Builder e905167 removed the duplicate; tests were not weakened.

Independent additions exercise 50 actual FFT cases across 256/512/1024/2048/4096 and Nyquist, negative, DC, positive, last bin, adjacent page boundaries. Check all non-page/bin state fields retain identity, frozen rows/pages, no read/hash increase, stale state no-op, and exact tied-maximum choice. Actual TSX host mocks verify one accessible action in each mode, selected-frame peak, disabled zero peak, stale callbacks after clear, settings, source replacement, background and exit. Source assertions guard the exact state/lease action and existing-page path. Builder tests additionally wrap real kernels to count no recomputation.

Final validation: `node --test tests/iq*.test.ts tests/inspect-iq*.test.ts`: 225 passed, 0 failed, 0 skipped. `npm run typecheck`: passed. Complete outputs retained alongside this review. Earlier focused run: 219/219 before the final source-contract test and CLI cases were added.

Limits: synthetic host/TSX mocks only, not browser/device/native runtime acceptance. No user file/storage operations, radio/device activity, network/provider work, dependency installation, publication, schema/core/platform changes, or main-worktree modifications. Broad aggregate not run here by design.
