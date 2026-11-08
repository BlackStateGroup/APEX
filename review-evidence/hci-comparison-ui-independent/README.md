# Independent HCI comparison inspector review

Reviewed builder source `1035b1d34685816a8ba8ab30c47e26e43e81b2be`, cherry-picked as `3554303` onto approved comparator baseline `300b91b`. Separate reviewer worktree and tests; no implementation files changed by reviewer. Exact final source hashes are retained in `source-sha256.txt`.

## Findings and resolution

- Preliminary uncommitted source allowed `-0` as a selected/requested index although the core comparator rejects it. Reported to builder before stable handoff. Final source rejects negative zero, unsafe/noninteger/out-of-range values, and only resolves requested indices after whole-document verification. Independent regressions pass.
- Requested explicit experimental-control/statistical-significance limits and sensitive multi-advertiser whole-draft disclosure. Final source includes both.
- First independent execution failed only the reviewer's expected derivative data offset: 53 omitted the event report-count byte. Correct coordinate is 16-byte file header + 24-byte record header + 5-byte H4/event/subevent/count prefix + 9-byte report header = 54. Original output retained as `first-run.txt`; corrected independent assertion passes. No implementation failure is claimed for this oracle error.

## Results

- Baseline legacy checks before source integration: 32/32 passed (`baseline.txt`).
- Final new independent checks: 16/16 passed (`focused-final.txt`).
- Final affected tests: 251/251 passed, using `node --test tests/hci-*.test.ts tests/analysis-navigation.test.ts tests/analysis-inspector-independent.test.ts tests/nfc-static-memory-review.test.ts` (`affected-final.txt`).
- Full repository TypeScript: `node node_modules/typescript/bin/tsc --noEmit`, exit 0 (`typecheck-final.txt`).
- Browser discovery only: Playwright `test --list`, 39 tests (`browser-list-only.txt`). No browser execution.
- `git diff --check`: passed before review commit.

Coverage includes exact UTF-16 rejection/retention, explicit manual selection and full compare re-verification, independent side epochs, stale successes and failures at first/final comparison hash, later same-slot verification, deep frozen state, source-ID one-shot consumption, left/right isolation, invalid/off-page selection, four-report pages, maximum 31 positional rows and eight-row result pages, null versus byte 00, AD header coordinates, exact staged document/report/slot, repeated callbacks before navigation commits, pending save locking and truthful completion across navigation/source replacement. Actual TSX static React DOM rendering checks exact inert drafts, bounded headers, selected matrix, privacy outside original draft text, and inactive output. Source assertions preserve all eleven prior inspector IDs/routes and ensure no comparison staging in journal reopen.

## Limits

This is controller execution plus actual TSX static rendering with mocked React Native primitives and source-level routing review. It does not execute mounted React effects, browser navigation, native focus/layout/accessibility or device behavior. The parent owns full aggregate validation. No dependency install, network, browser runtime, native/device/provider/user-log access, actual persistence, clipboard/share/export, credentials, publication or push occurred. Save tests use an in-memory controlled stub only.
