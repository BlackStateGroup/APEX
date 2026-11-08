# Independent I/Q time-frequency app review

Reviewed builder source: `e10c722e8279545bc279c5887ad1de92b8b47102` from `apex-iq-time-frequency-app`, based on `c252c02dce5d371b01532ce82cc1847e36f56233`. Isolated review clone replayed the three builder commits at local `61566776d3340e93601866839c27e3ac0cdd29f4`; `git diff e10c722 -- src packages/core` was empty. No production changes were made by this reviewer.

Source SHA-256:
- `src/iq-workbench.ts`: bb0f04303f8b4c77ac8f3d67e3cd2ead34b3447eee3916a548032e955c760055
- `src/IqWorkbench.tsx`: 61aa7299094da258c495cf6f57762d7af727153cda23b62b96cfa5fa9fa2b514
- `packages/core/iq-analysis.ts`: 28321d3ceace4c4ea7a8ebea1dfb584399d4a55bb0cbcc900d7b6dc1c1191625
- `packages/core/iq-offline.ts`: f39e70db503befc36d509fe1e37b8fb8041139fb18acd0433f755734c8ac9db8

## Findings and executed checks

No production defect found. Node v24.22.1; reused existing node_modules, no installs.

- 89 new independent tests: 86 controller, two actual TSX host event tests, one native digest-source and analysis-call mock test.
- `node --test tests/iq*.test.ts tests/inspect-iq*.test.ts`: 207 passed, zero failures, skips or cancellations. Includes existing core, app, command-line and single-window regressions. Builder's forthcoming TF test additions are not part of this count.
- `node node_modules/typescript/bin/tsc --noEmit`: passed (empty final-tsc.log).
- All executed tests passed on first run. No production or test-oracle failures occurred; initial and final logs retained.

Checks include every FFT size with maximal cell budget and final exact fit; one-over cell/frame/source refusal without either raw read; strict malformed hop/count input without truncation or reuse; complete frame and bin pagination; frame selection independent of overview page and reset of bin page; frozen bounded public output; independent direct negative-exponent Hann DFT of every bin across nonzero-start off-bin overlap/contiguous/gapped windows; actual nominal times and signed/declared axes; exact quarter-cycle sign transitions; nonzero input at Hann's zero-weight sample; raw dB below display floor; exact full source hashes; fresh repeated inspections rather than cached preparation.

An 80-case matrix defers each metadata read, data read, and three digest boundaries with both success and failure after mode, hop, count, size, start, Clear, replacement and exit/reentry changes. Each asserts no following stale work/publication and one-slot ownership until settlement. Additional observer tests cover recursive Inspect, throwing listeners and edits at validation/read notifications. Actual TSX host events cover controls, malformed edits, full overview/bin navigation, explicit frame navigation, stale callbacks and background/reentry. Synthetic Expo digest source confirms exact full-byte SHA-256/SHA-512 calls and that TF invokes only the multi-window analyzer, while subsequent explicit mode invokes only the single analyzer. Mutating the captured mutable core result after publication leaves later selected frames, axes and geometry unchanged, proving private copying rather than retaining core aliases.

## Remaining gates

Host mocks and static rendering do not establish real browser layout, picker operation, mobile lifecycle behavior, Expo digest runtime behavior or device acceptance. Browser execution was not attempted. No user files/storage, device/radio actions, native builds, network/provider/settings/credential/publication actions occurred. No dependencies, lockfiles, schema, core or platform implementation files changed. Full repository aggregate execution remains the parent's prepared-runner gate; this review intentionally ran the complete focused I/Q core/app/CLI slice only.
