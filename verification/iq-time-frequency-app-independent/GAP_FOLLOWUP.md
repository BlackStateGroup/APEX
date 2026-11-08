# Gap wording follow-up review

Reviewed builder follow-up `4520872b99b20d5b5cabc638f679bc5bff740ca8`, including preceding builder tests/docs `ab34649dfbdc393f8cce1434298e6e45516ed41f`. Imported these into the isolated review clone after independent test commit `845a47246f8ff75969926c2f235ada4411eb8b07`. No production edits by reviewer. Earlier review and logs remain unchanged.

The UI now correctly describes source sample positions not covered by the selected FFT windows, rather than implying those positions were unsampled. The production diff is only this wording. Existing geometry and numerical implementation are unchanged. Actual TSX projection test asserts the new phrase and rejects the old phrase.

`git diff 4520872 -- src packages/core` is empty in review clone. Updated `src/IqWorkbench.tsx` SHA-256: `703b77812512f2692ebed4a6022e583ea7a3407ce7d43d1ae3161cf58eedfddb`. Controller and core hashes remain as in REVIEW.md.

Validation against this exact source plus both builder and independent tests:
- `node --test tests/iq*.test.ts tests/inspect-iq*.test.ts`: 217 passed; zero failures, skips or cancellations. See gap-followup-focused.log.
- `node node_modules/typescript/bin/tsc --noEmit`: passed; gap-followup-tsc.log is empty.

No additional finding. No failed follow-up execution. Browser/native/device acceptance and prepared aggregate regression remain separate gates. No browser, device, network or publication actions were performed.
