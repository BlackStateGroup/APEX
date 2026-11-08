# Audit trail, repository delivery and continuation protocol

## 1. What this pack is

A user-facing repository record of APEX's vision, instructions, architectural direction, source acquisition, research programme, decisions, implementation evidence and gaps. It contains no production code change. It is not a replacement for the original source manifests, raw verification evidence or accessible original conversations.

The pack was prepared in an isolated checkout from `63f530d1f6f8f943d4fd2c1016904f3259daf77a`. Files outside `docs/vision/` are intentionally unchanged. Existing continuation metadata, historical manifests and licence/source-mining originals retain their prior bytes. The generated content is new documentation; historical quotations remain exact.

## 2. Evidence hierarchy

- Preserve explicit user instruction with original text, ID/URL/date where available.
- Record assistant recommendations as recommendations, including whether the user authorized proceeding.
- Preserve source/release identities and distinguish code inspection from execution.
- Tie every test result to exact source/artifact hashes, environment, command, input and observed result.
- Keep failed attempts and independent findings before documenting a correction.
- Distinguish software output, OS-normalized metadata, instrument claims and independent physical outcome.
- State missing/unrun stages beside successes. Never let a document title, positive exit code or test count imply an unperformed stage.

## 3. Change record template

For each substantive change, add:

1. Date, requirement IDs and affected decision.
2. Problem or research question, including a minimal reproduction where applicable.
3. Exact source versions, inputs and licences.
4. Proposed change and alternatives considered.
5. Changed files/commit and migration/rollback plan.
6. Test commands, results, raw evidence paths and cleanup status.
7. Independent review, findings and corrections.
8. Native/device/field acceptance status, including what was never run.
9. New claims the evidence supports and claims it does not support.
10. Publication destination/branch/commit/PR and outstanding next action.

An implementation note is not a substitute for tests. A passing test is not a substitute for a useful end-to-end feature. A field result on one revision is not a universal compatibility statement.

## 4. Conversation preservation

Add exact accessible text to the structured archive and a readable view. Preserve omission flags and segment boundaries. Do not fill gaps from recollection or present search snippets as full raw messages. Keep summaries separate from quotations. If a later correction changes meaning, append an erratum with its own source instead of rewriting the original.

Current archive scope and privacy rules are in [conversations/README.md](conversations/README.md). Original account-specific conversation URLs may not be accessible to other repository collaborators; do not claim shared access without checking. Do not publish private conversations publicly merely because the source-code repo can be shared.

## 5. Source/library preservation

The portable source receipt retains exact pins, archive hashes, licence evidence and absent nested dependencies. The source bodies remain in their preserved archives/recovered corpus; the docs commit does not embed them. Before reuse, materialize to a separate destination, verify pin/hash/cleanliness and record selected-file provenance. Keep original sources separate from app/firmware bundling and leave missing repositories explicitly unresolved.

## 6. Repository integration and publication

The source of authority is the owner's private `BlackStateGroup/APEX` repository. Read-only verification confirmed that destination and connector push access. The local continuation lacks a configured remote and has a reconstructed local history; do not force-push it over upstream history or assume its branch name means upstream main.

Integrate this docs-only commit through the coordinating work branch after its current source freeze. If publishing, read the current remote branch/head and preserve unrelated work. Use a feature branch and a draft PR where appropriate; do not merge incomplete work into main. Verify the exact remote commit and current checks after publication. Do not claim “in the repo” when only a local patch exists, and do not claim a public/shared link works for recipients without checking access.

This pass performed no push, PR creation, merge, deployment, account change, radio operation or device flash. Any later publication result belongs in a new delivery receipt.

## 7. Verification of this documentation pack

Run from the repository root:

```sh
python3 docs/vision/validate_pack.py
```

The validator checks local documentation links outside historical transcript bodies, JSON structure, exact expected counts, source manifest pins/archive receipts, quote digests, requirement references and file hashes in the content manifest. It reads only repository documents and performs no network, package installation, build, device or radio action.

The manifest excludes itself and the validation report to avoid circular hashing. JSON text hashes verify preservation against the recorded text, not authenticity of the original provider; the initial authoring pass additionally compared all recovered text to the supplied recovery records. Historical assistant links and unresolved citation/widget markers are preserved as historical content and are not falsely marked externally verified.

A docs-only validation pass does not rerun the 2,077-test app aggregate. The runtime checkpoint remains the exact existing record; this pack adds no runtime acceptance. See [validation report](VALIDATION.md).

## 8. Resume without losing the project

Read this pack's README, latest accepted engineering handoff, exact continuation receipt and current branch diff. Check the latest user direction and open decisions before reviving an older approach. Select the next work package by actual blocker and useful outcome. Keep iPhone, real instrument integration, active REA and the full recovery vision visible. Carry forward clear uncertainty, not stale assurances.
