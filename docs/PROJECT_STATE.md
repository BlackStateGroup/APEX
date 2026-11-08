# APEX project continuity

Owner priority: Universal Master Key vision; modular electronic interoperability; iPhone and Android are both first-class. The owner uses iPhone. Work should produce functioning, tested foundations alongside research. Preserve original source provenance and licences. Never represent a protocol recogniser, simulated response or reported device identity as proof of authenticated access. Use owned or authorised equipment and controlled benches.

## Current local snapshot

The active continuation is recorded in [APEX_CONTINUATION.md](../APEX_CONTINUATION.md)
and [verification/continuation.json](../verification/continuation.json). Its exact
locked dependencies are now installed in an isolated validation copy and reused
with lifecycle scripts disabled. Semantic TypeScript, host checks and offline
web/iOS/Android JavaScript exports pass at the recorded checkpoint. Browser
execution is still blocked by this host's browser startup/localhost limitations;
native builds and physical acceptance of the continuation are unrun.

The dated increment descriptions below are historical, including their earlier
dependency/typecheck blockers. They are not the current validation status. No
local continuation changes have been pushed, merged, deployed or flashed.

## Review stack

| Pull request | Branch | Purpose |
| --- | --- | --- |
| #1 | feat/research-blueprint | PRD, architecture, capability matrix, hardware, licensing, research register and work packages |
| #2 | feat/platform-foundation | Expo, AXP protocol/session, portable C, Android USB, ESP32-S3 USB, offline analysis and AI provider validation contract |
| #3 | feat/upstream-source-library | 30 pinned source checkouts, submodule registrations, independently preserved archive backups and restoration tools; iPhone scope correction |
| #4 | feat/iphone-and-accessory-workbench | iPhone/Android NFC and AXP BLE, ESP32-S3 BLE peer, persistent evidence and searchable source atlas |
| #5 | feat/rea-firmware-lab | REA static firmware inspection, offline report import and initial Flipper RPC intake |

These are stacked branches and remain unmerged. Main is not the implementation branch. A fresh clone should check out the desired feature branch before running the app or restoring sources.

## Source continuity

`research/source-imports.json` records all 30 exact root commits, paths, archive hashes and backup identities. `research/SOURCE_COPIES.md` links their preserved archives. `tools/copy_upstreams.py` materialises root checkouts; `tools/restore_source_archives.py` restores archived checkouts after digest verification. Original snapshots include Git metadata but exclude uninitialised nested dependencies. `research/nested-dependencies.json` separately records the newly fetched recursive dependencies and the broken DIY Flipper declaration. Nested source expansion does not alter original archive contents or parent pins.

The complete earlier chat is not available in this workspace. The 28 named initial projects plus Mayhem Mobile and Mayhem firmware have been recovered. Three earlier suggestions have descriptions but no recovered repository identity, explicitly listed in the manifest. Do not claim that unnamed repositories have been recovered.

`research/SOURCE_MINING.md` records examined interfaces and the first actual integrations. NFC manager and BLE PLX are pinned npm dependencies; their release versions are distinct from the research checkout commits. The rest of the corpus remains reference-only until separately implemented and tested.

## REA workbench, 2 November 2026

Branch `feat/rea-firmware-lab` adds the pinned desktop REA CLI, static ELF-note report import, GNU inspection supplements and evidence persistence. R31 source and its archive are retained. There are now 31 source projects and 32 preserved archive files; the original 30 pins/backups are unchanged. Workspace maintenance removed old local clones; materialise references on demand. Deep analysis engines and supervised REA process launches remain unverified here; see REA_RESEARCH.md for observed failures and the successful built-in parser.

## Next engineering gates

1. Preserve the passing build baseline before expanding features. The latest PR #5 head `e51750ec0b34b280399877d67e1036058874c373` passed [CI run 41470498298](https://github.com/BlackStateGroup/APEX/actions/runs/41470498298). This does not establish physical acceptance. Record new checks against each exact changed revision.
2. Run a signed development build on an owned iPhone: permission denial, cancelled reader sheet, foreground/background transitions, metadata from an authorised NDEF tag.
3. Flash the ESP32-S3 to owned bench hardware; verify identity/capability/ping over BLE on iPhone and Android, then concurrent independent USB/BLE sessions, disconnects and MTU limits.
4. Add peer authentication before any privileged accessory operation. The current BLE service is explicitly unauthenticated and read-only apart from ping.
5. Implement vendor adapters, RF/SDR/IR and isolated CAN/industrial observation one at a time with captured fixtures and hardware evidence. No vendor source-tree import establishes adapter compatibility.
6. Verified selected-record bundle export and isolated preview are available offline (see `docs/EVIDENCE_BUNDLES.md`). This is not a complete-journal backup and does not enable restore. Recovery/import, encryption/key management and signed capture provenance remain separate unfinished gates. Current records are bounded local metadata/analysis summaries with digests.
7. Connect an AI provider only through the existing data-only hypothesis contract and explicit data-export selection; no provider is currently connected.

No signing credentials, physical test equipment or automatic merge authority have been supplied. Never mark those gates passed from source review, bundle export or a simulator.

## Local continuation, 7 November 2026

The local continuation starts from the exact PR #5 head above. It is not pushed,
merged or deployed. Source-preservation tests reproduce the old empty-submodule
placeholder failure, dirty-copy false acceptance and external-Git-pointer false
acceptance. The repair restores safely into empty placeholders, refuses modified
copies and builds independently verifiable Git archives. The original 31 source
pins and 32 persistent backup identities remain unchanged. Fixture-based tests do
not claim that every original archive has been downloaded and restored again.

The actual pinned REA 6.8.0 supervisor now launches GNU objdump successfully on
this host, including disassembly of APEX's own `apex_crc16`. The previous process
ownership failure did not recur; no guard was bypassed. Full JDK/Ghidra setup,
decompilation and worker persistence remain unverified. See
`docs/REA_WORKER_CONTRACT.md` and `research/evidence/rea-2026-11-07/`.

The second local increment adds unencrypted BTHome v2 sensor interpretation and
bounded exact offline-document retention in the existing evidence journal.
Original host Node/C tests are now materialized and rerun alongside the new
tests. The third increment connects offline BLE import, interpretation and
explicit save in the Analysis tab, with digest-checked reinterpretation in
Evidence. Workflow and storage-adapter host tests pass. Native scanning is
unchanged; browser/phone execution and full app typechecking remain blocked by
missing app dependencies, rather than claimed from syntax checks. Full sanitizer
execution remains blocked by LeakSanitizer's reported ptrace limitation on this
host; the ordinary C checks pass. Current verification is recorded in
`verification/continuation.json` and `APEX_CONTINUATION.md`.

The fourth increment adds a dependency-free BLE PLX field-conversion preparation
API. Pinned source confirms Android rawScanRecord bytes differ from iOS serialized
JSON. Selected snapshots and offline projections remain distinct; no native scan
was enabled. The original app lockfile/configuration is now materialized, and its
541-entry dependency inventory verifies unchanged. Dependency installation and
actual UI execution remain unperformed; the minimal next gate is documented in
`docs/LOCAL_APP_VALIDATION_PLAN.md`.
