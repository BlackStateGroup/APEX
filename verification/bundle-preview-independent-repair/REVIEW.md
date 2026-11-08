# Independent repaired bundle preview review

Reviewed production stack through `1614bd5` (original `f6bd666`, repair `837298c`, independent regressions cherry-picked as `32b80f2`, sealed-owner repair `1614bd5`). Performed in isolated sibling worktree `apex-bundle-preview-audit` on `review/bundle-preview-repaired`, reusing approved dependencies with no installs. No production changes made.

## Result

26/26 focused tests PASS; TypeScript check PASS. Raw output retained beside this report. Original independent failure logs and builder's test-only length assertion failure remain unchanged in the stack.

The original three mutation regressions now pass. Runtime-private controller fields, frozen instance, shallow-frozen published state and recursively frozen newly validated reports prevent state replacement, own accessor shadowing, metadata/document/payload/array mutation. Added independent checks verify every nested report object is frozen and attempts to define owner accessors do not execute getters. No caller-supplied action-object or metadata-object API is exposed; event action values are primitive strings/numbers.

The long RFC timestamp accepted by existing core validation is preserved exactly in report records and recordDocuments, while the actual TSX displays a labeled first-120-code-unit excerpt and original length. Both original independent flood regression and builder's exact-retention static test pass. IDs, kinds, sources, digest strings and export timestamps retain existing validation bounds. Payload/URL text stays inert; payload is not projected into summary rows.

An oversized replacement retains the old draft but clears report/page/pending and blocks Inspect until an accepted edit or Clear. That fence survives tab deactivate/reactivate and invokes no hasher. Exactly-at-limit drafts still validate.

Controller generation and UI activation lease logic fence prior actions and results. Added tests exercise initial inactive state, modeled guarded retained callbacks across activation changes, and old inner-record digest completion after three tab round trips while a newer inspection has succeeded. Both late success and late failure leave the newest state unchanged. This is controller/model coverage, not mounted React scheduling coverage.

**Cancellation limit:** deactivation invalidates publication; it does not cancel an already-running digest/validation. Independent test observes the old successful four-record validation still making all five hash calls after release. Do not describe this as underlying work cancellation.

## Exact source scope

Reviewed App integration, controller, TSX owner/projection, both platform digest adapters, existing bundle/evidence validation, docs and changed tests. Source SHA-256 values are recorded in `source-sha256.txt`. Core bundle/evidence validation, App integration and platform digest adapters are unchanged between the original reviewed commit and repaired HEAD. No persistence, journal access, automatic import/restore/export, network/provider/device capabilities added by this preview. Existing core unit tests use local synthetic fixtures; no application export/build was run.

## Remaining acceptance gates

No new blocker found in this source/test scope. Browser execution, mounted React layout effects and event ordering, StrictMode transition behavior, interrupted/unmounted asynchronous refreshes, real TextInput whole-edit behavior, small-screen wrapping/scrolling/accessibility, and iOS/Android digest/native acceptance remain NOT RUN. Playwright authored/listed-only status from builder is not execution; this reviewer did not launch or repeat browser commands. Full aggregate/app export, devices, providers and remote operations were not run. Current success is focused local verification only.
