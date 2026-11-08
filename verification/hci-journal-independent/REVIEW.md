# Independent selected HCI journal/UI review

Reviewed production source: `4aa06ed39d04cdc37c26c9f3a484292e06ffaae3`.
Core dependencies: `70a71ecc3e6a8cdc830ad35fcebcfece4d674a37`, `820005a951e3f4b9c46ecd8f822b624d4f14c51f`, `c2d7ef4da73f8ba532801577d5770c78958a38ec`.
Review worktree is separate from main and the implementation worktree. No production changes were made by this reviewer. `production-diff.txt` is empty against reviewed source. Source hashes include production and reviewer test files.

## Findings

An early uncommitted implementation reset `saving` and the save message in Clear, allowing a second dispatch after a new edit/verification while the first save remained pending. This was reported before the implementation checkpoint and fixed by its author. The review regression covers Clear, accepted edit, rejected edit, incoming source and exit/reactivation, both save success and failure, including re-verification before old save completion. No remaining defect was reproduced on the reviewed checkpoint.

The first independent test run had 7/8 groups passing: the review fixture used a noncanonical exportedAt timestamp (`...03Z` rather than `...03.000Z`). Production correctly rejected it. The fixture was corrected; the original failure remains in `review-initial.log`. The second independent run passed 8/8. An additional valid-outer-digest malformed-HCI bundle regression was then added.

## Executed checks

- Final focused run: **96/96 passed**. Command: `node --test tests/hci-journal-ui-independent.test.ts tests/hci-journal-native-mock-independent.test.ts tests/hci-journal-render-independent.test.ts tests/hci-journal-workflow.test.ts tests/hci-document*.test.ts tests/evidence-bundle*.test.ts tests/analysis-navigation.test.ts tests/analysis-inspector-independent.test.ts tests/web-evidence.test.ts tests/evidence.test.ts`.
- Full TypeScript project check: `./node_modules/.bin/tsc --noEmit` passed (empty final log).
- Browser discovery only: `playwright test --list`, 38 scenarios. No browser execution.
- Preliminary dependency/legacy focused baseline: 32/32 passed.

## Independent coverage

- Explicit successful current verification required before save. Old state callbacks, duplicate pending callbacks and already-saved same-document callbacks do not write again. Exact whitespace-bearing selected JSON survives into storage.
- Dispatched save keeps its original snapshot and pending lock through Clear, edits, rejected edits, source delivery and leaving. Late success/failure does not replace new draft, interpretation or page reports. Save errors and successful insert followed by refresh error are distinct.
- Saved-HCI reopening takes a frozen detached envelope before awaits. Original record mutation during outer and independent inner checks cannot change reopened bytes. Record replacement/exit prevents stale publications. Current report pages contain four then two complete summaries.
- A verifier returning `true` cannot bypass a stale binary digest or a matching-digest malformed legacy event. Missing byte capability, mismatched source declarations and native source claims refuse reopening.
- Generic bundle UI requires its byte hasher, preserves exact record strings/frozen payloads, fences delayed completion after edits, and rejects stale/malformed derivatives even under newly correct outer record and bundle hashes. Existing static tests cover four-row metadata-only preview and timestamp excerpts.
- Actual saved-HCI TSX was transpiled and React DOM server-rendered with narrow RN primitive mocks: default output conceals exact document and advertisers; successful explicit reopen shows read-only inert text, source caveats and four-report pages without edit/save/clear controls or links/scripts. Existing actual-TSX tests cover document save states and bundle HCI labels.
- Actual native adapter modules were imported under explicit Expo Crypto/SQLite host mocks. Binary digest is called as bytes, exact input persists, unavailable byte digest refuses saves/verifies without a text-hash fallback, and native source declarations are rejected. This is **not native runtime testing**.
- Existing source/route checks and storage substitute tests confirm unchanged legacy routes and journal behavior. App wiring was inspected: HCI rows take a separate metadata-only unverified branch, explicit reopen uses the store, and explicit document save refreshes the journal with separate refresh-failure notice.

## Limits

Synthetic Node/controller, narrow static TSX and local mock storage/adapter checks only. No mounted event/effect/React lifecycle acceptance, browser execution, native build, real SQLite, physical device/radio, user log/storage access, provider/credentials/settings access, network/install, publication, or full aggregate test run. Reused preexisting node_modules. This review supplements, not replaces, the separate full-core evidence review.
