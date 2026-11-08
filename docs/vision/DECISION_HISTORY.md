# Decision history and unresolved choices

This log distinguishes the user's instruction, an assistant recommendation, recorded engineering decisions and implementation evidence. It does not rewrite old conversations to make the project appear more consistent than it was.

## Historical sequence

| Date | Event | Decision or correction | Evidence and present consequence |
| --- | --- | --- | --- |
| 1 Nov 2026 | DIY Flipper link and phone/REA question | Start a phone-centred Flipper-derived platform, using the original project as a research input | [Origin](conversations/origin.md); actual R02 root is now preserved |
| 1 Nov | Universal Master Key insistence | Keep the full ambition rather than substitute a generic safe/diagnostics-only identity | Explicit user wording retained; capability claims still require evidence |
| 1 Nov | Private APEX repo and full engineering brief | Broad domains, source research, comprehensive design, working foundations, branches/PRs and honest limits | [Full brief](conversations/implementation.md); not merely a request for a slide deck or plan |
| 1 Nov | Android-first implementation challenged | iPhone and Android are first-class; owner uses iPhone | Earlier Android-first-only interpretation superseded |
| 1 Nov | Missing source copies challenged | Acquire actual source bodies with licences/backups, not only links | Historical 30-root acquisition later grew to 31; current restoration has 63 absent nested roots |
| 1 Nov | Continued research/building requested | Source preservation must run alongside useful implementation | Repeated unexplained stops after checkpoints did not match the requested trajectory |
| 1 Nov | Specialist security and emergency recovery clarified | Product should support system-specific recovery when ordinary methods fail | Scope and intent preserved; no universal physical/cryptographic capability inferred |
| 1 Nov | Physical pairing and Pwnagotchi discussed | Instrument cooperation and Pwnagotchi-compatible app function are explicit requests | Live adapters still missing; exact Pwnagotchi variant unresolved |
| 2 Nov | REA CLI and report import checkpoint | Static ELF analysis was delivered; full decompilation was not | Later explicit admission that installation/import was insufficient |
| 2 Nov | Full REA work clarified | Establish working engine, investigate targets and implement findings | Persistent private-worker setup was proposed but not completed |
| 7 Nov | Command-centre Site requested | Expose capabilities, source preservation, hardware, PR/test status, backlog and next actions | Historical six-view private Site is a dated snapshot, not verified live GitHub sync |
| 7–8 Nov | Local continuation | Strengthen offline analysis, evidence, SDK/transport lifecycle and host C integration | Exact v42 snapshot has substantive tests, but no current phone/device acceptance |
| 8 Nov | Source corpus restored again | All 31 roots and 32 archive parts recovered at pinned identities | Portable receipt retains absent submodules and does not call all sources integrated |
| 8 Nov | Rust/C++ and quality-over-speed questions | Adopt recommended hybrid direction for evaluation: Rust shared engine, selected C/C++, native OS bridges, retain UI pending evidence | [Current exact quotes](conversations/current-direction.md); implementation and phone benchmarks not complete |
| 8 Nov | Full documentation and conversations requested | Put the complete vision, decisions, evidence and accessible conversation trail in the repository | This additive pack; remote delivery must be verified separately |

## Architecture decisions

### ADR-V01 · Preserve the full platform while verifying specific capabilities

**Status:** user requirement. **Choice:** keep Universal Master Key, specialist recovery and the broad domain roadmap. **Reason:** the owner explicitly rejected a softened replacement. **Consequence:** a catalogue entry must identify supported operations and evidence; no universal unlocking claim. **Alternative rejected:** silently narrow the permanent product to diagnostics/offline parsing. **Revisit:** only by explicit owner direction or documented technical findings about a particular capability, not convenience.

### ADR-V02 · First-class iPhone and Android

**Status:** explicit user correction. **Choice:** shared product with genuine platform-native integration and platform-specific support disclosures. **Reason:** owner uses iPhone. **Consequence:** Android/WebUSB success cannot satisfy iPhone acceptance. **Alternative superseded:** Android first with iOS treated as optional. **Revisit:** no change without explicit owner direction.

### ADR-V03 · Compose instruments instead of pretending one phone has every interface

**Status:** architectural recommendation consistent with explicit pairing request. **Choice:** phone command centre plus modular APEX hardware, existing specialist tools and a host/worker. **Reason:** physical interfaces, power, timing and sample bandwidth differ. **Consequence:** per-instrument protocol/adapters, explicit detection and resource ownership. **Not yet decided:** final custom PCB, enclosure, supported board list or accessory purchases.

### ADR-V04 · Separate control, capture and analysis

**Status:** implemented foundation plus continuing design. **Choice:** small AXP control plane; bounded native/file data plane; deterministic analysis separate from device commands. **Reason:** 512-byte control payload and BLE cannot represent high-rate SDR streams. **Consequence:** retain the C control core and explicit data identity; vendor devices keep their own wire protocols. **Revisit:** extend/version operations only with fixtures and acceptance, not arbitrary tunnelling through ping.

### ADR-V05 · Adopt a measured native hybrid engine

**Status:** recommended direction authorized to begin; details proposed. **Choice:** shared Rust engine, selected mature C/C++ reuse, Swift/Kotlin platform integration, existing UI initially. **Reason:** quality, reliability and performance rather than minimal coding time. **Consequence:** parity harnesses, FFI review, native builds and real phone benchmarks before replacing working paths. **Alternatives:** all-JS minimizes migration but may leave IO/performance limits; all-C++ expands unsafe-memory surface; wholesale native-UI rewrite adds cost without current evidence. **Revisit:** workload benchmarks, tooling constraints, licensing and maintenance findings.

### ADR-V06 · Preserve research sources without treating them as integrated code

**Status:** explicit source-copy requirement; enforced engineering distinction. **Choice:** pinned reference corpus and archives with separate installed-release and selected-code records. **Reason:** continuity, reproducibility and licensing. **Consequence:** 31 roots preserved does not mean 31 live adapters. **Revisit:** individual component adoption records, not blanket relicensing.

### ADR-V07 · REA must yield verified research and product work

**Status:** explicit clarified requirement. **Choice:** functional engine and reproducible target investigations feeding implementations. **Reason:** earlier CLI/import milestone was incomplete. **Consequence:** retain a full-engine acceptance gate and follow-on research backlog. **Alternative rejected:** declare REA delivered solely because a report can be imported.

### ADR-V08 · Treat evidence claims as typed and revision-specific

**Status:** existing foundation and mandatory reporting convention. **Choice:** distinguish user declarations, synthetic inputs, OS-normalized observations, hardware measurements, hypotheses and outcomes. **Reason:** digest, device name and acknowledgment cannot prove authenticity or physical success. **Consequence:** retain failures and exact inputs; no promotion across evidence tiers without new tests.

### ADR-V09 · Preserve history and add corrections

**Status:** explicit latest instruction. **Choice:** archive accessible conversations with exact provenance; append decisions/status rather than silently revising old evidence. **Reason:** owner wants to audit the work if context is lost. **Consequence:** unavailable messages, unnamed repos and disputed historical claims stay visible. **Alternative rejected:** a polished summary that deletes earlier requirements or mistakes.

### ADR-V10 · Keep incomplete implementation isolated from main

**Status:** explicit user instruction. **Choice:** reviewed feature branches/draft PRs and exact-commit verification. **Reason:** avoid mixing unfinished work into authoritative release state. **Consequence:** local code/docs are not “pushed” until the authorized remote contains the expected commit. Merging, deployment and flashing are separate actions.

## Corrections future contributors must retain

1. Android-first proposals do not override the user's iPhone correction.
2. Reference-library creation was originally missing, then repaired. Present restoration is a real source recovery but not recursive dependency closure.
3. Eight origin assistant bodies remain unavailable; three search excerpts are not full transcripts.
4. Early DIY NFC capability wording conflicts with the pinned technical note; use the latter for engineering claims.
5. The 2 November REA result did not fulfill the deeper programme. Supervised objdump later improved the state but did not prove Ghidra/persistence.
6. Historical CI and browser reports belong to their historical revision. Current offline JS exports are not native builds; browser case listing is not execution.
7. Installed PLX licence text and metadata disagree. Historical “reference only” BLE/NFC labels are outdated for runtime packages.
8. iOS scan native exports are void. Local listener retirement is useful, but a resolved JS wrapper is not native completion or RF cessation.
9. The narrow v42 readiness cleanup correction does not close the separate initial-state-query issue. Future accepted work must record its exact new checkpoint.
10. A new Rust engine is a direction, not an existing delivered feature. This documentation change makes no runtime performance claim.

## Open decisions register

| ID | Decision needed | Why it matters | Current handling |
| --- | --- | --- | --- |
| OPEN-01 | Target iPhone/Android models and minimum OS versions | Signing, public APIs, performance and test matrix | Do not invent devices; choose before physical acceptance |
| OPEN-02 | First actual Flipper/DIY/accessory variant and firmware | Wire protocol and capabilities vary | Version/identity/status first; no blind compatibility claim |
| OPEN-03 | Pwnagotchi repository/fork/version and management link | No exact source is in the recovered corpus | Keep unresolved; do not substitute a guessed fork |
| OPEN-04 | Missing three source suggestions | Original scope cannot be fully reconciled from unnamed descriptions | Preserve the text and missing status |
| OPEN-05 | Rust toolchain, bindings, first workload and performance budgets | Avoid permanent architecture choices from speculation | Benchmark/ADR work package |
| OPEN-06 | C/C++ component selection and release licensing | App/firmware/store distribution obligations | File-level review and SBOM before incorporation |
| OPEN-07 | REA worker host, provisioning and persistence | Full engine needs a real accepted environment | Follow worker contract, no provisioned-service claim |
| OPEN-08 | Accessory authentication and secure evidence storage | Current CRC/metadata is not identity or tamper-proof storage | Separate design/implementation/acceptance gate |
| OPEN-09 | Final hardware boards, antennas, wiring and power | Physical scope and regulatory limits | Development fixtures before custom PCB |
| OPEN-10 | Remote publication branch/permissions and current GitHub state | Local baseline has no configured remote | Verify destination/authority, preserve other work and report blocked delivery |
