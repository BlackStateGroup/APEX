# Independent static NFC memory workbench review

Reviewed combined implementation source `8209323ebd04cc117267e3b9ea3b35b309679c9b`, including standalone `fc02cda7987bd32e618434fbc5d2bbb0a858c110` and current chooser integration. Independent sibling worktree: `/workspace/scratch/b96d3539d24d/apex-static-nfc-review`, branch `review/static-nfc-memory`. No production edits or installs. Reused approved `../apex-ui-validation-20261107/node_modules` dependency tree.

## Outcome

No production defect found within the reviewed source/host scope. Eight independently authored tests pass, alongside relevant existing tests, for **56 passed, 0 failed**. Final TypeScript check passes. Playwright **list-only** discovers **36 authored cases**; it does not execute those cases.

## Independent coverage

- Exhaustive text lengths 0 through 130 against both explicit modes, omitted mode/provenance, whitespace/fullwidth/nonhex/oversized whole-edit rejection, retained draft and rejection fence across mode/provenance/leave, accepted empty replacement.
- Older deferred success and failure after a newer inspection has already published; both preserve the new result. Existing regressions additionally cover every invalidating operation and repeated pending inspect.
- Malformed hash shapes, exact decoded-byte digest versus hex text, adapter-copy mutation isolation, recursively frozen state/report, structure full-source digest distinct from the data slice.
- Whole TLV scan refusal before NDEF handoff, unsupported CC, missing/empty/ambiguous/decoder-malformed distinctions, structure/data offsets, opaque proprietary/unknown/trailing marker omission, mismatched mode refusal.
- Last TLV page, stale observations, invalid page numbers, retained draft and inert old activation leases.
- Actual repository TSX transpiled with local TypeScript and rendered by React DOM server under narrow RN primitive mocks: unsupported structure diagnostics, raw input deliberately visible but omitted from metadata, quoted escaped hostile Text without anchors/actions, real six-record 4+2 pagination, separate synthetic nine-issue four-row page.
- Exact ten chooser IDs/order, Recording default, Phone NDEF route separation, one static mounted source position with only its active selection, no inspect/load/save in chooser handler, expectedPlatform retained in PhoneNdefWorkbench, authored static UI case present.
- Manual source review of App stable mounts and integration diff: prior nine entries preserved; static entry appended; existing browser cases retained and expanded, one static case added. Controller generation/lease fences and view snapshot guards inspected; old reports clear on leave while draft/mode/provenance/rejected fence remain.

## Evidence and reproduction

All commands used `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false`.

- `standalone-tests.log`: initial five independent controller cases on standalone source, 5/5.
- `focused-first.log`: 56/56 before review-only type annotation correction.
- `typecheck.log`: preserved initial failed typecheck. New independent test's earlier `assert.equal(report, null)` narrowed a later report access to `never`; this was a review-test TypeScript issue, not production behavior.
- `typecheck-final.log`: passes after explicit state annotation in that assertion. No production changes.
- `focused-final.log`: final 56/56 using `node --test tests/nfc-static-memory*review.test.ts tests/nfc-static-workbench.test.ts tests/nfc-static-render.test.ts tests/nfc-static-offline.test.ts tests/nfc-static-independent.test.ts tests/analysis-navigation.test.ts tests/analysis-inspector-independent.test.ts`.
- `ui-list.log`: `node node_modules/@playwright/test/cli.js test --list`, 36 cases listed only.

## Limits

No full aggregate suite requested or run. Browser launch was previously denied and was not retried or worked around. No live mounted React interaction/effects, native execution/hash adapter, phone/tag operation, keyboard/scroll/layout/accessibility acceptance, physical capture or compatibility proof. Static primitive mocks do not establish these. No persistence, export, save, sharing, file picker, network provider or device action added or exercised. Full pasted hex is intentionally visible in input; only report metadata/results omit raw protected/opaque byte contents. Hash identity covers exact supplied decoded bytes, not capture authenticity or original pre-paste bytes.

## Final example correction recheck

Parent requested a usability enhancement, not a discovered defect: preserve empty 48-byte example and make the 64-byte example demonstrate complete inert Text `APEX`. Re-reviewed exact builder source `8938995308ff4951483919ae366c8f822433c7fd` (applied in this review branch as `c94b118`). Independent ninth case verifies explicit load has no report or pending work, exactly 64 supplied decoded bytes, synthetic provenance and structure mode, full-source hash distinct from the 48-byte slice, supported TLV and parsed single UTF-8/en Text `APEX`, and source/data offsets 18/2. Actual TSX existing updated static render case checks inert Text; source review confirms explicit empty/Text example labels and no automatic inspection. Final combined focused result: **59 passed, 0 failed**, final typecheck passes, **36 UI cases listed only**. Evidence: `example-final-focused.log`, `example-final-typecheck.log`, `example-final-ui-list.log`. No browser/native/mounted React or aggregate claim added.
