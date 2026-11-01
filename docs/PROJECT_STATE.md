# APEX project continuity

Owner priority: Universal Master Key vision; modular electronic interoperability; iPhone and Android are both first-class. The owner uses iPhone. Work should produce functioning, tested foundations alongside research. Preserve original source provenance and licences. Never represent a protocol recogniser, simulated response or reported device identity as proof of authenticated access. Use owned or authorised equipment and controlled benches.

## Review stack

| Pull request | Branch | Purpose |
| --- | --- | --- |
| #1 | feat/research-blueprint | PRD, architecture, capability matrix, hardware, licensing, research register and work packages |
| #2 | feat/platform-foundation | Expo, AXP protocol/session, portable C, Android USB, ESP32-S3 USB, offline analysis and AI provider validation contract |
| #3 | feat/upstream-source-library | 30 pinned source checkouts, submodule registrations, independently preserved archive backups and restoration tools; iPhone scope correction |
| #4 | feat/iphone-and-accessory-workbench | iPhone/Android NFC and AXP BLE, ESP32-S3 BLE peer, persistent evidence and searchable source atlas |

These are stacked branches and remain unmerged. Main is not the implementation branch. A fresh clone should check out the desired feature branch before running the app or restoring sources.

## Source continuity

`research/source-imports.json` records all 30 exact root commits, paths, archive hashes and backup identities. `research/SOURCE_COPIES.md` links their preserved archives. `tools/copy_upstreams.py` materialises root checkouts; `tools/restore_source_archives.py` restores archived checkouts after digest verification. Original snapshots include Git metadata but exclude uninitialised nested dependencies. `research/nested-dependencies.json` separately records the newly fetched recursive dependencies and the broken DIY Flipper declaration. Nested source expansion does not alter original archive contents or parent pins.

The complete earlier chat is not available in this workspace. The 28 named initial projects plus Mayhem Mobile and Mayhem firmware have been recovered. Three earlier suggestions have descriptions but no recovered repository identity, explicitly listed in the manifest. Do not claim that unnamed repositories have been recovered.

`research/SOURCE_MINING.md` records examined interfaces and the first actual integrations. NFC manager and BLE PLX are pinned npm dependencies; their release versions are distinct from the research checkout commits. The rest of the corpus remains reference-only until separately implemented and tested.

## Next engineering gates

1. Resolve native build errors in PR #4 before changing its readiness. Preserve exact tested source revisions in verification evidence.
2. Run a signed development build on an owned iPhone: permission denial, cancelled reader sheet, foreground/background transitions, metadata from an authorised NDEF tag.
3. Flash the ESP32-S3 to owned bench hardware; verify identity/capability/ping over BLE on iPhone and Android, then concurrent independent USB/BLE sessions, disconnects and MTU limits.
4. Add peer authentication before any privileged accessory operation. The current BLE service is explicitly unauthenticated and read-only apart from ping.
5. Implement vendor adapters, RF/SDR/IR and isolated CAN/industrial observation one at a time with captured fixtures and hardware evidence. No vendor source-tree import establishes adapter compatibility.
6. Add evidence export/recovery, encryption/key management and signed capture provenance separately. Current records are bounded local metadata/analysis summaries with digests.
7. Connect an AI provider only through the existing data-only hypothesis contract and explicit data-export selection; no provider is currently connected.

No signing credentials, physical test equipment or automatic merge authority have been supplied. Never mark those gates passed from source review, bundle export or a simulator.
