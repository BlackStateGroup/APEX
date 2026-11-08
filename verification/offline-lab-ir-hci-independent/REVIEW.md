# Independent synthetic lab IR/HCI expansion review

Reviewed production source: `6a14e799e9b40174bbeacf39849fcd33b650628e`.
Independent tests: `f293fe9d5a4845a1c8ae70019ade5546fbf34381`.
Review worktree: `apex-lab-ir-hci-review`, sibling of builder worktree.
No production edits or dependency installs. Existing approved node_modules symlink reused.

## Results

- Actual `node tools/demo-offline-lab.ts` passes under Node 24.22.1 with filesystem writes denied. Exactly one final stdout write, five fixed fixture reads, no stderr.
- Final focused run: 15/15 passed, including six independently authored review tests. Initial 14/14 run also preserved unchanged. No failed run occurred.
- Output: 8,806 bytes including newline, SHA-256 `dfe1ae0ab01718192b652df1592af25b4294e64b013716ed26bb4926228b7504`.
- Removing only `ir` and `hci` from parsed output and serializing with its original compact formatting/newline reproduces 5,796 bytes, SHA-256 `a3d5a315c053b80d7c7fa4a5c62aa2d67b2a6316dcef9087f3a8eabe2ec35b82`. Existing stages are unchanged.
- Typecheck passed. npm emitted its existing unknown http-proxy environment configuration warning. `git diff --check` passed.

## Independent checks and code inspection

IR fixture is original declared synthetic ASCII, 620 bytes, SHA-256 `ad4e575f80a6ea6a5fba8b1ae97dba33b76d799a378fae33e5f0710f91d1cfbe`. Review reconstructs the entire 67-duration sequence from literal wire octets 21/de/45/ba, LSB-first, rather than the decoder implementation. Declared fields remain distinct from conditional whole-array recognition. First-mark alternation is assumed; 38000 Hz/0.33 are declarations, not measurements; partial frame is unrecognized; repeats are not represented. No capture, authentication or identity claim.

HCI decoded container is 187 bytes, SHA-256 `74bf92435f18f046cda23b068a75212967994bd54eff48c9d6268ad561ccefd7`. Review independently checks container payload offsets 40/86/138, complete separate legacy records at 91/104, RSSI bytes 206/196, and extended scalar offsets 143/152/153/155/156 against actual bytes. Public legacy address bytes 06:05:04:03:02:01 display reversed and are not identity evidence. Extended length is at 166 and private data starts at 167. Status raw 0 is terminal complete, not a guarantee of a standalone complete advertising payload. PHY host feature context is unknown. Opaque command and extended private markers are omitted; extended selector does not return, parse or reassemble advertising data. Real core analyzers are imported and called; fixtures carry explicit manually authored synthetic declarations, with no capture/upstream bytes used in this change.

Signed timestamps are producer claims; zero drops is not proof of no loss. Hash scope is the full supplied container and establishes byte equality, not authenticity. HCI sourceKind is retained and never relabeled BLE-PLX. Fixed demonstration time is not execution/reception time.

Late IR/HCI digest mismatches, fixture assertion failures, final serialization exceptions and >12-KiB output all fail nonzero with empty stdout. No-argument contract rejects even --help, --, paths and empty extra argument before fixture reads. Preexisting focused tests trap common network APIs and check no writes; static inspection finds no transport/network/device/journal call in the CLI or new stages.

## Bounds and limits

Core IR/HCI snapshot inputs are capped at 262,144 bytes with record/timing/page bounds. CLI reads only fixed checked-in fixture paths and rejects all user arguments. Its readFileSync helper itself does not stat or cap file allocation before reading: core input bounds apply after reading/conversion. This is a trusted fixed-repository fixture workflow, not a bounded untrusted-file importer; do not extend these claims to arbitrary replacement files. HCI hex decoding assumes the checked-in fixture encoding; the hash pins decoded container bytes, not the surrounding hex text. IR exact source hash is checked.

Node filesystem permission execution and targeted common-network-entry traps are not OS-level network isolation. Shell log redirections are reviewer-owned evidence writes outside the child CLI. No aggregate, browser, device/native, capture/logging, ADB, credentials, settings, provider or publication was attempted. Browser execution was not retried. Synthetic host tests do not establish physical compatibility or reception.

## Raw evidence and commands

All commands used CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false.

- `focused-original.txt`: preserved initial 14-test run.
- `focused-final.txt`: `node --test --test-concurrency=2 tests/offline-lab*.test.ts`, 15/15.
- `cli.json`, `cli.stderr.txt`: actual `node --permission --allow-fs-read="$PWD" tools/demo-offline-lab.ts` stdout and stderr.
- `typecheck.txt`: `npm run typecheck`.

Only the independent test and this evidence commit should be cherry-picked for the review deliverable. Builder commit and already-integrated extended-HCI dependency remain separate.

## Subsequent fixture-format finding and final resolution

Parent identified that Buffer.from(text.trim(), 'hex') silently ignored suffix junk/odd nibbles. Confirmed on original source; this is fixed-repository-fixture integrity, not an external parser security defect. Builder supplied production fix `34f63efb91644c7a83cb428c0175078d4dede649`, cherry-picked locally as `83c8496` solely for validation. It validates paired ASCII hex and optional single LF with absolute end assertion before decoding, without trim. Parent should use builder's production commit, not this local cherry-pick.

Final source reviewed is builder `34f63efb91644c7a83cb428c0175078d4dede649` (same production tree in review). Final corrected focused run is **16/16 passed**, in `strict-hex-corrected-final.txt`. Output remains exactly 8,806 bytes with the same SHA-256, saved in `strict-hex-cli.json`; stderr remains empty. `strict-hex-typecheck.txt` passes. Final regression additionally rejects spaces, second LF, CRLF, odd nibble, junk and embedded LF+00. No production fixes were authored by reviewer.

All historical runs remain unchanged, including reviewer harness errors. `hex-format-original-failure.txt` first exposes accepted junk. The attempted escaping adjustment caused invalid preload JavaScript in `hex-format-lf-original-failure.txt` and `strict-hex-final.txt`; these are harness failures, not production failures. Final harness now constructs the entire suffix using JSON.stringify rather than hand escaping. That corrected regression was rerun against original production source 6a14e79 in sibling `apex-lab-ir-hci-review-prefix`; `strict-hex-corrected-before-fix.txt` shows actual CLI success (0) where rejection (1) is expected. The identical corrected regression passes against builder fix. `hex-format-reproduction.txt` preserves preliminary results, but the corrected before/after pair is authoritative.
