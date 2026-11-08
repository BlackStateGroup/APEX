# I/Q peak page navigation: implementation evidence

Host-only synthetic controller and actual-TSX hook/primitive mocks. No real user data, browser execution, native build/runtime/device/radio/provider/network/storage action or acceptance claim. Main worktree was not modified. Dependency validation reused the already approved node_modules symlink; no install occurred.

Final tested source: `e9051676220268038e4b88a34edfdcfa265a6cf8`, following `1f4a7d039da5b01234d26020df4bfe780381f4a3`.

## Preserved failures and corrections

- `iq-peak-focused-first.log`: three failed new controller tests. This was a **test fixture error**: synthetic SigMF metadata omitted required `core:frequency`, so preparation correctly refused reports before hashing. Adding frequency zero corrected the fixture; this was not a production parsing defect.
- `iq-peak-focused-second.log` and `iq-peak-typecheck-first.log`: exposed an **initial production TSX defect** in the first source commit. A broad insertion accidentally added a duplicate peak button to the time-frequency branch using `single.spectrum` while `single` is null. Actual-TSX tests failed at render and TypeScript rejected the null access. The duplicate was removed, retaining the selected-frame peak control. The correction is in the final tested source above.
- `iq-peak-focused-third.log` and `iq-peak-typecheck-second.log`: intermediate corrected run, 18 tests passed and typecheck passed, before adding explicit kernel-call instrumentation and the expanded regression selection.

All logs are copied unchanged from the original run outputs, including failures and warnings.

## Final verification

`iq-peak-focused-final.log`: 31 tests passed, zero failed. Command:

```
node --test tests/iq-peak-navigation.test.ts tests/iq-app-render.test.ts tests/iq-app-render-independent.test.ts tests/iq-time-frequency-render-independent.test.ts tests/iq-app-window.test.ts tests/iq-app-time-frequency.test.ts
```

`iq-peak-typecheck-final.log`: `npm run typecheck` passed (`tsc --noEmit`). The npm unknown environment configuration warning is retained verbatim. `git diff --check` also passed without output.

Focused checks cover supported FFT sizes, first/last/zero signed peaks, null/absent peaks, selected-frame changes, retained report/overview identity, immutable old pages, stale state/lease callbacks, read/hash/kernel-call counts, and actual TSX control projection/events. This is not a broad aggregate suite result; the parent owns portable C prerequisite and aggregate validation. Independent review is separate from this implementation evidence.
