# Independent CI repair review

Review performed in new no-hardlinks clone `/workspace/scratch/b96d3539d24d/apex-ci-review-independent`; never edited builder/main clones. No publication.

Initial candidate: ede747906469e328c15225db18c14d9ce62d2130, tree 5a1d5a077f6593de092976455ca261e4b5273246; Android commit 05b9d4e85355c5093685db9775b24d31cf36e80e. Baseline 91564c3e64de863398006b7d380a722a720d1418 tree 706b6c4c53f9c69370c07d6d5c91adb6c6f22fb7. Exactly five changed files, no src/package/lockfile edits.

## Review findings

No production defect found. Babel override precedes Expo preset transforms and wins for exactly selected normalized absolute filenames. Independent synthetic Metro transforms verify configured exact/normalized paths use WeakMap; TSX near-match, prefixed name, and same filename in another directory remain loose as intended. All existing eight frozen modules covered. Native platforms also receive spec transforms, preserving public freeze and private semantics.

One regression-coverage finding sent to builder: original future-controller guard only recognizes flat src/*.ts and literal Object.freeze(this). Nested/TSX/whitespace additions could evade it. Await corrected guard before final disposition.

## Independent execution

- Original permanent focused tests: 61 pass.
- New reviewer-written transform tests: 54 pass, six combinations web/Android/iOS and development/production. Eight-controller private-brand rejection for forged prototypes, clones and Proxy receivers; peer-instance isolation; no public state shadowing or prototype mutation. Bundle exact provenance, nested immutable reports, stale async rejection fenced by edit/clear/deactivation-reactivation/new inspect; prior snapshots remain immutable.
- Gradle adversarial tests: 24 malformed/duplicate forms rejected, including CR/CRLF separators, escaped keys, alternate separators, continuations and Unicode line separators; byte-preserving replacement and idempotence pass.
- Installed Expo template extracted independently. Wrapper SHA256 b3a875ddc1f044746e1b1a55f645584505f4a10438c1afea9f15e92a7c42ec13. JAR static class inspection confirms networkTimeout, configuration getter/setter and URLConnection connect/read timeout references. Actual generated property starts at 10000. No JAR execution/download.
- Typecheck and git diff --check pass.
- Full suite initial setup attempt: 2188 pass, 8 REA cases fail solely because isolated clone had not yet linked existing REA dependencies. Corrected by linking previously installed dependency tree; no install. Corrected-dependency full rerun passed 2196/2196, zero failures/skips/cancellations (includes 54 reviewer-written cases); log `/workspace/shared/apex-ci-independent-full-deps.log`.

## Limits

No browser or localhost execution attempted. No native SDK compilation, devices, radio, USB, NFC, flashing, credentials/settings/provider changes, remote writes, merge or deployment. ESP startup/configuration delta and C++/Rust experimental gates excluded. Node-executed Expo output validates transform semantics, not browser rendering/Hermes execution. Gradle timeout is per connect/read, not an overall deadline or guarantee of network/compilation success. Exact published candidate must receive fresh remote CI.

## Final re-review disposition

APPROVED for local aggregation at ae0930b5e9319ad6e17aa605eff736c76bafa096, tree 16969857861a257e66ec1a55725cfa5205b1bb98. Guard finding resolved by recursive Babel AST inventory of TS/TSX direct Object.freeze(this) calls, including whitespace/comments/bracket and optional-call notation; alias/data-flow limitation explicitly documented and reasonable for this guard. Nine additional independent guard probes pass. Final focused tests: 118/118 pass including Gradle's five (builder's 113 count excludes those five). Final typecheck passes. Runtime/config files, src, package and lock remain unchanged from original reviewed candidate. Imported 54-case fixture SHA256 3e9915c88b39ee689005a0473a0ed2139195b62efea4b915a5ea135e5e5d6f7a matches original byte-for-byte. Final review clone clean.

No remaining review blocker. Builder owns clean final aggregate; original reviewer full suite 2196/2196 preceded guard correction. Fresh remote CI remains required. No publication performed.

## Cache-key integration correction re-review

The builder's real aggregate exposed a missed integration defect in ae0930b5: Expo cache-key discovery loads Babel configuration without a filename, which string include patterns reject. Prior approval did not establish export compatibility; the raw failed aggregate is preserved at `/workspace/shared/apex-ci-repair-final-aggregate`.

Reviewed and APPROVED e6927b495a4265c2192382c3941ec92e7443789e, tree fb2b9805f566352ea9a3967cafbcd73dbb5e4b9d, for a fresh final aggregate. Two-file delta replaces exactly the same eight path patterns with normalized exact Set membership and a false result for absent filename, and adds real Metro cache-key regression. Independent 119/119 focused tests pass; typecheck and delta diff-check pass. Eight direct path/absent-filename probes pass, as do two separate cold Node processes computing identical nonempty real Metro cache keys. Reviewer inspected builder's successful offline web/Android/iOS export log; reviewer did not independently rerun export. No unrelated changes or remaining delta-review blocker. Builder's full final aggregate and subsequent authorized remote CI remain required. No publication performed.
