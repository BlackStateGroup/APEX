# Verified state, gaps and claim boundaries

**Frozen documentation snapshot:** 8 November 2026, local packaged v42, final metadata commit `63f530d1f6f8f943d4fd2c1016904f3259daf77a`. **Tested runtime:** `deb5f27a8a0781f518479c1e84aee26e316a29df`. This is a dated evidence summary, not a live status service. Later accepted changes require a new dated receipt.

## 1. Exact aggregate

The existing v42 record reports **2,050 Node + 22 archive + 5 preflight = 2,077 tests, zero skips**, with all nine aggregate stages and process groups passed. Full TypeScript, portable C, a 541-entry dependency inventory and offline JavaScript exports for web/iOS/Android passed. Forty browser cases were listed; **zero were executed** in that aggregate. The synthetic lab output was unchanged. These are existing recorded results; the documentation task did not rerun or enlarge the runtime aggregate.

Sources: [v42 raw result](LOCAL_CHECKPOINT_REFERENCES.md#ref-4ee13bf90cbb), [continuation metadata](LOCAL_CHECKPOINT_REFERENCES.md#ref-9c220082d2a5), [consolidated code handoff](LOCAL_CHECKPOINT_REFERENCES.md#ref-5258c803c66a). Focused suites mentioned in individual reports overlap the aggregate. Do not add them to claim a larger independent total.

## 2. What the code meaningfully does

| Area | Implemented evidence | Not established |
| --- | --- | --- |
| AXP protocol/session | Original bounded TS/C framing, CRC, IDs, identity/capability/ping and host interoperability | Authenticated peer identity, privileged operations, field reliability |
| Native session lifecycle | Explicit cancellation, stale-owner guards, pending raw-work ownership and cleanup fencing | OS/radio release from a generic Promise or abort |
| Installed SDK integration | Actual PLX 3.5.1 ESM and NFC 4.2.0 JS facade exercised through synthetic native bridges; AXP tests reach real C callbacks | Mounted React, actual native SDK scheduling, current phone acceptance |
| Controlled BLE observation | Explicit foreground bounded source collection, selected-source workflow, separate Android service-data opt-in | General passive receiver, arbitrary Wi-Fi/Sub-GHz, current RF/device compatibility |
| NDEF | Legacy metadata path plus explicit selected OS-normalized payload snapshot, inspect and optional local save | Original NDEF wire capture, authenticated identity, arbitrary card emulation/secret recovery |
| Offline workbench | Thirteen-inspector chooser; bounded IR/NEC/CAN/BLE/NDEF/static NFC/Flipper response/HCI/REA workflows | Real Flipper adapter or all-domain active hardware control |
| I/Q | Strict bounded ci16 profile, FFT/time-frequency, energy, lag/phase diagnostics and source hashes | RF calibration, modulation/transmitter identification or native arbitrary-file import |
| Mayhem C8 | Original bounded core/CLI converter, int8×256 convention, original/derived hashes | App picker, general persistence, live HackRF compatibility or real-recording acceptance |
| Evidence | Selected exact documents, digest-checked reopening, explicit saves where present, selected bundle export/preview | General full backup/restore, encrypted/tamper-proof evidence vault or trusted capture provenance |
| ESP32 source | Historical originals preserved; separate opt-in/default-off derivative with host regression evidence | Authentic current ESP-IDF/board acceptance, complete independent review of latest initialization delta |
| REA | Known-ELF parsing, bounded import and actual supervised objdump step | Full Ghidra decompilation, persistent worker, automatic phone-worker integration or broad target findings |
| Source corpus | 31 exact root checkouts and 32 archive parts recovered with clean pins/licence paths | 63 absent nested dependencies, all upstream builds, all source integrated |

## 3. Important current technical gaps

### Physical and native acceptance

Current signed iPhone installation, Android native build/run, ESP-IDF build, flashed board, USB/BLE/NFC/SDR/IR operations and hardware timing remain unaccepted for this continuation. Historical PR #4/#5 CI statements are retained as historical reports and do not substitute for the current changed revision. An iOS JavaScript export is not an iOS binary or a signed phone installation.

### SDK ownership and native completion

v42 fixes readiness subscription cleanup faults that could hang, escape a callback or publish success too early. It preserves original/falsy errors and blocks new ownership when SDK cleanup is unknown. The latch belongs to a module instance; Fast Refresh/reimport is not a trustworthy recovery mechanism. The separate initial-state-query rejection behavior remains an open v42 gap. Work outside this frozen branch is not counted as accepted here.

Installed iOS scan start/stop functions export void. Local callback retirement and Inspect can be useful, but JS settlement does not prove native completion. Android Promise settlement proves adapter-call return, not RF cessation. iOS destructive reset remains closed. See [scope correction](LOCAL_CHECKPOINT_REFERENCES.md#ref-340d0ac1fff9) and [readiness review](LOCAL_CHECKPOINT_REFERENCES.md#ref-ab136528068b).

### Firmware review and authentic SDK

The reviewed derivative's current BLE source SHA-256 is `57503eaabc1773bb46272d72bd3c9b04e85964d1666093e02bb672eaf569242c`; an earlier independent review applies to `4c4a7ac3829f87088c8c9bebbe361be752de200943401986c6cb69f20408dd7c`. The latest initialization/configuration delta has regression evidence only and its independent review remains incomplete. Build-helper synthetic tests are not an authentic SDK build and do not close that review gap. Historical originals can advertise and may erase NVS in a recovery path; preservation is not authorization to run them.

### Source and licensing

Pwnagotchi is absent from the source manifest; three unnamed suggestions remain unresolved; 63 nested Git links remain unmaterialized. Installed PLX licence text conflicts with metadata. None of these gaps should be hidden by the passing app test count.

### Product completeness

No real Flipper/Pwnagotchi/Meshtastic/Chameleon/industrial live adapter is established by this snapshot. A Rust engine, measured native migration, secure evidence recovery, authenticated privileged accessories and evaluated AI provider are not delivered features. The project is materially beyond a design-only placeholder, but materially short of the full product requested.

## 4. Publication state

The original repository is [BlackStateGroup/APEX](https://github.com/BlackStateGroup/APEX). A read-only connector check during this documentation pass confirmed it is private, unarchived, with default branch `main` and authenticated push/admin permissions. That verifies access, not that this new work has been published.

The local continuation baseline has no configured Git remote. This documentation was prepared in a separate isolated clone; no remote branch, PR, merge or deployment was changed by this pass. The exact documentation commit must be integrated/published through the coordinating task, and the remote commit verified before telling the owner it is in GitHub. This pack should not be mistaken for full upstream Git history or the 1.99 GB research corpus.

## 5. Acceptance ladder

1. Requirement recorded and linked.
2. Source/format examined with exact version and licence.
3. Original implementation or deliberate licensed reuse committed.
4. Unit, malformed-input and integration tests with exact inputs.
5. Independent review and retained failing counterexamples.
6. Current native/SDK builds on required targets.
7. Named phone/accessory/bench acceptance with observed outcomes.
8. Repeated reliability/performance/recovery testing.
9. Release provenance, notices, security and distribution checks.
10. Supported catalogue entry with clear conditions and limits.

Tests at one step do not automatically complete later steps. A capability may be useful before field acceptance if honestly labelled, but it cannot be marketed as accepted hardware behavior.
