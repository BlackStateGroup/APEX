# Independent build-helper infrastructure review

Reviewed implementation: `0aee280a4214d3ce72ae8e3733f9aa4f7870221e` (parent implementation `a3d5c37dfc698538fbbc2c661ee0c5903198a95c`), based on v37 `386c390ee8950d22e386247746cad28d19d2bd16`.

## Outcome and exact scope

No remaining blocking helper finding in the exercised trusted, exclusive POSIX workspace contract. This is only an infrastructure/helper review. The separate SDK initialization/configuration firmware-delta independent review remains **open**; it was not reassessed, retried, delegated or closed. No SDK is available or was invoked. No compiler/native build, SDK installation, prebuild, firmware execution, device/radio/flash/monitor, remote action, settings or credentials operation occurred.

Helper SHA-256: `74119e46c1be4d322608918ccb552de0b47d33a346d5b64be2194529eb9b0c06`.
Unchanged process utility SHA-256: `f64643d71788a1fe33da1340f5b59dd1c91a60654ed6b0847cdb9577ba513c96`.

## Independent checks

`tests/reviewed-idf-build-independent.test.mjs` calls the real helper with its default process runner, supplying explicitly authored local Node executables named git/python3 via fixture PATH. No SDK script is executed, and no SDK discovery occurs. Synthetic source files and outputs are explicitly not firmware or build evidence. Unknown fake command shapes fail closed. This exercises real orchestration, process launch, on-disk output and owner records rather than duplicating helper logic or injecting only command return values.

Covered separate default-off/explicit-on target/config paths; exact SDK/head and worktree mismatch; wrong/duplicate effective config; changed config after successful process; absent and empty required artifacts; symlink artifact refusal; changed source snapshot; partial failed build; old-output preservation and SDK aliases; environment/provenance override removal and no arbitrary secret capture; spawned PID/group ownership records; timeout, output cap and signal cancellation with verified process cleanup. Builder tests additionally cover rejected command grammar and injected cleanup failure. Existing process-group regression checks verify absence, uncertainty, deadline and disappearance semantics.

Final command:
`node --test tests/reviewed-idf-build-independent.test.mjs tests/reviewed-idf-build.test.mjs tests/native-process-group.test.ts`

Result: **15/15 test groups passed** (`final-expanded-tests.log`). Full existing-project `./node_modules/.bin/tsc --noEmit` passed (`final-expanded-tsc.log`). TypeScript does not typecheck this MJS helper or compile firmware. Existing dependencies were reused; no install or aggregate firmware-building test command ran.

Protected-path diff against v37 is empty for firmware, packages, src, modules, App.tsx, package.json/package-lock.json, .github, tools/native-build.mjs and tools/native-process-group.mjs. All original tracked firmware hashes are retained in `firmware-sha256.txt`; no production code, dependencies or CI triggers changed.

## Findings and retained initial evidence

Initial static feedback identified broad inherited environment, final config/header validation and provenance exact-worktree/submodule weaknesses, plus missing in-flight ownership records. Builder fixed these before its first implementation commit. They were not claimed as executed regression failures.

First independent executable run on a3d5c37 passed four groups (`first-independent-tests.log`). The expanded empty-artifact fixture then correctly failed its expectation: the helper incorrectly reported success for empty ELF/BIN/map files (`expanded-pre-guard-tests.log`). This is a helper defect, not a fixture error. The builder's subsequent 0aee280 nonempty-required-artifact guard fixes it; expanded final tests pass. No initial failed output was overwritten, and no fixture failures are hidden.

## Remaining gates and limits

- Actual authorized compilation of both modes against already provisioned IDF `fff9895c82d744c7237be8847347bdd1b07c6643` and NimBLE `139cada0ae932957fa06ba37d17e3c9c2c95c773` is **not run**.
- Source/SDK/submodule provenance checks are integrity evidence, not independent firmware approval, compiler authenticity or physical acceptance. Historical container digest binding remains unverified and helper reports false explicitly.
- Actual API/ABI/link diagnostics, selected/full effective config, notification preprocessing, maps and RAM/stack analysis remain real-build gates. Hardware/phone timing and safety remain separate authorized-device gates.
- Trusted local Git config/tool binaries/build scripts, exclusive workspace and ordinary POSIX descendants are assumed. Escaped descendants, hostile filesystem races, supervisor SIGKILL/power loss and malicious SDK scripts are outside helper containment; owner/command records preserve incomplete outcomes, not execution permission.
- Logs can include tool-emitted data; inspect before sharing. The helper records no arbitrary environment dump. Per-stream capture is bounded; artifact hashing is not a sandbox or disk-resource quota.
