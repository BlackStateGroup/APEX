# Independent offline IR review

Reviewed production commit `3618e5b457a1b2ddaef11eb88febac7b4285c4ac` in a separate worktree. No production files changed. No upstream implementation or fixtures copied. All generated pulse sequences are synthetic inspection inputs, never sent to hardware. The reviewer read `docs/IR_OFFLINE.md`, both new core/CLI files, their tests, the existing `decodeNec` implementation and shared `readBoundedRegularFile` implementation. No AGENTS.md applies in the worktree. Existing approved node_modules was linked; no installation, aggregate test, export, network, provider or device action performed.

## Finding preserved before repair

Duty decimal `1.00000000000000001` exceeds 1 mathematically but is accepted with reported `dutyCycle: 1`; conversion to binary64 occurs before range checking. Other rounding examples include `1.0000000000000001` and `0001.` followed by 100 zeroes and `1`. The committed regression intentionally fails on this reviewed baseline. Exact original source is preserved, so this is a validation/report interpretation defect rather than loss of source bytes. Builder must repair production separately.

## Verification and limits

- `node --test tests/ir-offline.test.ts`: original seven tests passed before independent tests were authored.
- `node --test tests/ir-offline-independent.test.ts`: seven passed, one failed (decimal finding). Raw output: `independent-baseline.log`.
- `npm run typecheck`: passed. Raw output: `typecheck-baseline.log`.
- Independent oracles enumerate all 256 parsed first bytes and 256 complementary raw byte pairs, every forbidden ASCII byte, every individual NEC timing position with a valid-file/unrecognized duration, integer tolerance edges, mixed LF/CRLF physical line ranges and whole-frame/repeat/multiframe nonrecognition.
- Host probes cover overridden typed-array properties, exact nonzero-offset view slicing, context-side mutation after byte capture, extra/symbol/inherited context fields, immutable records and exact SHA-256/source equality.
- Actual CLI tests use Node's filesystem permission model without write grants, prove a write fails in an equivalently restricted child, and verify complete JSON success versus empty stdout for late/argument/byte-limit failures. This does not establish OS network isolation. No network action is made by these tests.
- CLI output remains below the declared cap for tested inputs. Output-limit branch exhaustion and concurrent filesystem mutation races were not independently injected here; existing shared reader uses bounded reads and before/after inode, size and timestamp comparisons. These are change detection, not authenticated snapshots.
- Source pin in docs is `9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a`. This reviewer did not independently fetch upstream blobs. First-mark firmware interpretation and declared frequency/duty semantics remain sourced to the parent's separately reported read-only source review, not independent findings of this suite. Recognition tests demonstrate only the existing local decoder contract, not physical reception or firmware compatibility.

## Independent repair verification

Builder follow-up `badead17f3ab9b31f90e9cec0ae65ec82bdaa238` was cherry-picked unchanged onto the review worktree as `5da270e` after the baseline failure/evidence commit. Its lexical significant-integer/fraction checks reject exact decimal values above 1 before binary64 conversion; underflow policy and exact decimal retention are explicit. Raw records now label timing convention and carrier metadata assumptions. `node --test tests/ir-offline.test.ts tests/ir-offline-independent.test.ts` passed all 15 tests, including the previously failing independent decimal regression. `npm run typecheck` passed. Raw logs are `independent-repaired.log` and `typecheck-repaired.log`. No new blocking finding remains in this bounded review; limitations listed above still apply.

## Final CLI branches and symlink scope

Follow-up independent suite `tests/ir-offline-cli-independent.test.ts` passes 4/4; typecheck passes. New raw logs: `cli-final-branches.log` and `typecheck-cli-final-branches.log`. Prior logs are untouched. Trusted local data-URL preloads inject a SHA-256 rejection, a final report serialization exception, and a serialization result exactly 1 MiB long (therefore over budget once the trailing LF is included). Each runs the actual CLI with filesystem writes denied and proves the denial inside that same child. Stage markers confirm the intended branch executes; all three exit 1 with exactly empty stdout and the expected generic rejection on stderr. Injection only tests error handling, not naturally occurring oversized valid reports, hostile intrinsic replacement resistance or OS network isolation.

The shared reader and CLI both accept a regular file reached through a symlinked ancestor directory. They reject a symlink at the final pathname component. `lstat` and `O_NOFOLLOW` here do not provide whole-path ancestry isolation. A dedicated direct-reader and actual-CLI regression verifies both outcomes. The shared reader and production core were not changed. Parent is qualifying user-facing docs accordingly.
