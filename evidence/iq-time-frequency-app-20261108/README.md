# Explicit I/Q time-frequency app mode: host-only builder checks

Source reviewed: e10c722e8279545bc279c5887ad1de92b8b47102 (base c252c02dce5d371b01532ce82cc1847e36f56233).

- `./node_modules/.bin/tsc --noEmit`: exit 0, complete repository TypeScript check.
- `node --test tests/iq-*.test.ts tests/inspect-iq*.test.ts`: 128 passed, 0 failed; raw output in focused.log. Includes 7 new controller cases with nested geometry/pagination and held-boundary matrices, plus 3 new actual-TSX host tests.
- Existing 55 iq-app tests also passed before adding new cases.
- The initial existing-suite source-shape assertion expected a non-null assertion-free call expression. An explicit unreachable guard preserves that expression and the validated behavior.
- The next old boundary assertion prohibited all multi-window analysis. Updated only that stale exclusion to permit the newly authorized time-frequency kernel while continuing to prohibit unrelated analysis entrypoints. No behavioral regression test was removed.
- Initial new-test clock strings were not canonical ISO UTC (first a descriptive string, then ISO without milliseconds); strict preparation correctly refused before hashing. Test fixture now uses 2026-11-08T12:00:00.000Z. Both failures are preserved.

Dependency symlink reuses apex-ui-validation-20261107/node_modules. No install, dependency/lock/core/schema/native/platform changes. Synthetic bytes and host mocks only; no browser execution, native build/runtime acceptance, device or user files, storage, radio, credentials, network/provider changes, or publication. No full aggregate Node test run was attempted by builder because parent owns the portable C-prepared aggregate runner.

Presentation follow-up: replaced “unsampled positions” with “sample positions not covered by the selected windows between frames when gapped.” These samples may exist in the supplied file. Added an exact projection assertion and rejection of the old phrase. Full tsc and 128 focused IQ tests pass again (wording-tsc.log and wording-focused.log); no numerical/core change.
