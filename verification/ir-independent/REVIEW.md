# Independent ordinary IR workbench review

Reviewed feature b744b2d282987cf90ec52f0ce88d006f273117e7 on corrected core badead17, then builder disclosure correction 369bbe27b5b9a0f7202fa0fc576e7a9ba301557c (local cherry-pick 2ff0c24). No production changes were authored by this reviewer. Only the independent test/evidence commit should be applied on top of the builder commits.

## Finding and correction

The initial UI claimed “Exact source SHA-256” without distinguishing the JavaScript draft from pre-paste file/clipboard bytes. Independent actual-TSX static projection failed against b744b2d (4/5 pass; baseline-focused.txt), and the finding was sent to the parent before production correction. Builder correction explicitly bounds identity to accepted draft bytes, explains pre-handler normalization uncertainty, and preserves CLI file-read semantics. Final disclosure test passes. The initial test demanded the disclaimer even before inspection; final test requires the accepted-draft bound initially and original-file/normalization/hash disclosure alongside the inspected digest. Original test source is retained. The synchronous-hash-error test was strengthened from an async rejection to a true synchronous throw before the final run.

## Independent coverage

Five added tests cover an independent Node crypto SHA-256 oracle versus default Web Crypto and the existing web adapter for exact 262144-byte input, offset subarrays, CRLF, comments, and lexical spellings; recursive runtime freezing of all report nodes; 8192 total timings accepted and 8193 rejected atomically; a decimal below one rounded to binary64 one while preserving its token; appended/prepended/multiple frames not cropped into recognition; ASCII-control draft acceptance but strict rejection before hash; synchronous hash failure recovery; actual TSX disclosure; final page of 128 records; original mixed-case field spelling; and inert escaped markup. Static scaffold loads actual transpiled TSX with narrow primitive mocks, not a copied view implementation.

## Source audit

- Core diff from badead17 is limited to the trusted immutable ASCII string hash seam and returned digest validation. No parser grammar or NEC decoder rule changed. The adapter is called after parsing and receives no mutable source byte array. A 64-lowercase-hex shape cannot prove an arbitrary adapter is honest; only trusted local adapters are appropriate.
- Controller private slots and frozen observations/report trees prevent alias mutation behind the digest. Immutable snapshots preserve old observations. Explicit edit/declaration/example/clear transitions invalidate reports. Whole rejected edits keep the old draft but block inspection. Tests exercise late successes/errors, newer work, tab fences, and old activation leases. Already-started hashes may finish; no cancellation claim.
- App imports and mounts the workbench with Analysis activity only. Owner layout effects control leases and cleanup; their correctness is source-reviewed, not proved by server rendering. Existing controller tests exercise the underlying lifecycle directly.
- View differentiates declared NEC fields from conditional whole-array raw recognition, declared carrier/default metadata from measurement, decimal token from binary64 projection, and absent repeat metadata from false. Four records per page, 64-character JSON-quoted excerpts, and numeric summaries bound report rendering. The full accepted draft remains in its bounded-height editor.
- New import path is IrWorkbench -> controller/core/analysis plus local bundle-digest, React/RN. Core analysis has no imports. Web digest uses Web Crypto; native adapter imports Expo Crypto only. No new evidence-store/device/provider/persistence/export/transmit/replay path or URL action was found. This is static source inspection, not OS network isolation.

## Execution and limits

Node v24.22.1. Reused ../apex-ui-validation-20261107/node_modules without installs. No AGENTS.md files were found in the checkout or its immediate workspace ancestry scan. Read IR_WORKBENCH.md, IR_OFFLINE.md and package scripts.

Final command: node --test tests/ir-offline.test.ts tests/ir-workbench.test.ts tests/ir-static-render.test.ts tests/ir-independent-review.test.ts tests/ir-independent-static.test.ts. Result: 26/26 pass. npm run typecheck passes. Playwright --list passes and lists 32 authored scenarios; none executed. Raw logs, exit statuses, core diff and source SHA-256 are adjacent. Typecheck emits the existing npm http-proxy warning.

No aggregate test, app export, firmware build, browser launch, mounted React effects/events, native hashing/runtime, device, provider or network action. Static render does not establish native/browser layout, text-widget normalization, accessibility interaction or event lifecycle behavior. The focused core suite includes actual local CLI tests; this is not the parent's independent CLI evidence and no duplicate parent evidence commits are included. The inspected source scope, not untested platform execution, is approved by this review with no remaining finding in that scope.
