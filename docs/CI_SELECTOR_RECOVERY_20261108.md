# Browser warning selector recovery, 8 November 2026

## Scope and provenance

This is a newly reconstructed, narrow repair on published commit `c243f4f3fc12a99ff7a35c073c4c0868ecc83c70`, not a claim to have recovered the unavailable local repair commit `c3c855013b39ad1705eb56bc56d485f41edb8b00`.

The resumed workspace contained an older checkpoint and did not contain that repair or its original publication evidence. The reconstruction used exact repository files read at the published commit and the original GitHub Actions host log. Earlier local validation counts cannot be transferred to this reconstruction.

## Confirmed failure and repair

[CI run 42478683607](https://github.com/BlackStateGroup/APEX/actions/runs/42478683607) passed 39 of 40 browser cases. The remaining case failed because the locator `/No native phone validation has been performed/` matched two intentional warning paragraphs. Android, ESP32-S3 and unsigned iPhone Simulator builds passed on that older head.

The browser test now checks both full warning paragraphs using exact text locators. Neither paragraph is removed or shortened, and duplicate exact matches still fail. A standalone Node regression statically renders the actual repository TSX and checks that each complete warning occurs exactly once in its correct component.

Only the browser test, the standalone regression, and this receipt change. Production components, dependency manifests, workflows and the historically pinned `tests/observation-static-render.test.ts` remain unchanged.

## Local verification

- Existing actual-TSX static-render tests plus the new regression: 5 passed, zero failures/skips.
- Browser test syntax check passed.
- List-only Playwright discovery: all 40 browser cases found.
- Independent review accepted the fix. Five actual-TSX mutation controls were rejected: either warning missing, either paragraph duplicated, and warnings swapped. The review used disposable copies and left production source unchanged.
- Local checks use already-installed dependencies with offline settings.

This isolated recovery is not a complete local checkout. Full aggregate checks and actual browser execution must be established by fresh CI on the published repair, not inferred from these focused checks. No local browser was launched.

## Remaining boundaries

Native compilation is not physical-device acceptance, a signed release, or deployment. No device/radio operations, merge or deployment were performed by this repair. The complete original source tree and all Git links are preserved by a small overlay on the exact published tree.
