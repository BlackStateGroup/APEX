# APEX device-intelligence work packages and verification contract

**Status:** proposed backlog, 10 November 2026. This is a plan, not evidence of implemented features. Parent architecture: [device intelligence and recovery blueprint](DEVICE_INTELLIGENCE_AND_RECOVERY_BLUEPRINT.md).

Existing APEX packages WP10 (registry), WP11 (vault), WP25 (Wi-Fi), WP26 (analysis), WP27 (hypotheses), WP28 (trust), and the [REA worker contract](REA_WORKER_CONTRACT.md) are dependencies. Do not reset their evidence or declare them done. Every new package must land in its own reviewable branch/PR, with static and offline work first, then separately authorised bench work. No automatic merges, flashes or deployments.

## Dependency plan

~~~mermaid
flowchart LR
  D01[DI-01 schema and scope] --> D02[DI-02 firmware ingest]
  D01 --> D03[DI-03 boundary graph]
  D02 --> D04[DI-04 REA bridge]
  D04 --> D05[DI-05 Passport]
  D03 --> D05
  D05 --> D06[DI-06 protocol genome]
  D06 --> D07[DI-07 twin and conformance]
  D07 --> D08[DI-08 read-only adapter]
  D01 --> D09[DI-09 scoped sidecar]
  D08 --> D10[DI-10 owned router bench]
  D09 --> D10
  D05 --> D11[DI-11 firmware comparison]
  D02 --> D12[DI-12 credential exposure audit]
  D10 --> D13[DI-13 recovery atlas]
  D08 --> D14[DI-14 signed adapter policy]
  D14 --> D15[DI-15 mobile UX]
  D10 --> D15
  D11 --> D16[DI-16 release evidence]
  D12 --> D16
  D13 --> D16
  D15 --> D16
~~~

## Ordered, independently reviewable packages

| ID | Deliverable | Dependencies | Acceptance evidence | Current status |
| --- | --- | --- | --- | --- |
| DI-01 | DevicePassport v0 schema and machine-readable fixture scope/authority contract; operation risk labels | WP10, SECURITY_RESEARCH | JSON schema, fixtures for allowed/denied/expired scope; role downgrade tests | Planned |
| DI-02 | Safe static ingestion of permitted firmware: SHA-256, MIME/magic, size and extractor boundaries | DI-01, WP11 | Reproducible bytes and metadata, malformed archive/symlink/decompression tests, no execution | Planned |
| DI-03 | Security boundary ontology separating Wi-Fi, TLS, app auth, OS privilege and boot trust | DI-01 | Tests confirm success at one layer cannot imply another; unknown states retained | Planned |
| DI-04 | REA-to-passport safe importer, with pinned provider provenance and analysis claim types | DI-02, current REA | Real host-only REA fixture roundtrip, unsupported engine error labelled, prompt injection inert | Planned |
| DI-05 | Device Passport renderer and compare API with traceable claims and negative observations | DI-03,DI-04 | Same input reproducibly yields same report; no generated claim without source reference | Planned |
| DI-06 | Typed protocol grammar and finite state machine DSL for bounded management APIs | DI-05, WP26 | Fuzzed parser, deterministic fixtures, reject unknown ops, no arbitrary execution strings | Planned |
| DI-07 | OpenWrt-labelled synthetic digital twin fixture and adapter conformance matrix | DI-06 | Multiple failed auth/role/version cases; fixtures cannot be mistaken for physical evidence | Planned |
| DI-08 | Disabled-by-default, read-only management adapter for documented authorised API | DI-07,WP25 | Info/health/version responses; explicit credentials; deny write, invalid TLS, version mismatch | Planned |
| DI-09 | Restricted local sidecar for REA and approved lab devices | DI-01, WP28 | Authenticated loopback, job queue, memory/time/file bounds, no unrestricted shell, audit record | Planned |
| DI-10 | Physical owned OpenWrt development router validation | DI-08,DI-09 | Exact board/firmware, safe network isolation, operator approval, repeatable authenticated reads | Blocked: actual router, revision and test authority to be recorded |
| DI-11 | Version-based firmware diff and public advisory correlation | DI-05 | Known version-pair report with exact patch/impact caveats and false-positive review | Planned |
| DI-12 | Credential-exposure static audit with secret-safe reports | DI-02,DI-03 | Synthetic hard-coded-secret fixtures detected; no secrets printed/stored; affected claim reviewed | Planned |
| DI-13 | Recovery Atlas with documented paths, backup/damage risk and actual owned-router runbook | DI-10, WP11 | Test safely recovers known misconfiguration, independently checks resulting state and data | Blocked on named bench and rollback procedure |
| DI-14 | Proof-carrying adapter manifest tied to signed grant, version and physical evidence | DI-08, WP28 | Stale/revoked/tampered grants, trust mismatch and downgraded transport fail closed | Planned |
| DI-15 | iOS/Android view: passports, trust boundaries, read-only control, recovery warnings | DI-10,DI-14 | Native acceptance on both platforms, accessibility/permission/reconnect and background tests | Blocked on phone builds and test devices |
| DI-16 | Independent review, redaction, reproducible evidence bundle and release gate | DI-11,DI-12,DI-13,DI-15 | Reproducible manifest, no embedded credentials, operator review, no false root/unlock claim | Planned |

## Definition of ready (every package)

- Stable link to selected PRD capability, APEX version, exact source baseline and approved targets.
- Explicit fixture ID and authority record; if no physical equipment, declare synthetic/host-only.
- Proposed risk label: offline read, authorised network read, privileged maintenance, state-changing recovery, or prohibited outside-scope operation.
- Expected inputs/outputs, data handling/redaction, possible irreversible effects, timeout/cancellation, rollback and safe stop.
- Licence and provenance review for each dependency. No copying upstream code from research library without appropriate licensing review.
- Typed and deterministic acceptance tests; negative cases for malformed input and uncertainty; independent reviewer identified.

## Standard PR checklist

- [ ] Scope manifest / explicit synthetic label is present; no real-world unauthorised target.
- [ ] Source, target and build versions are pinned with hashes and acquisition provenance.
- [ ] Result remains data, never commands or dynamic execution from AI-generated content.
- [ ] Every proposed operation maps to a strict allowlist; absent permission defaults to deny.
- [ ] Any credential present in internal tests uses synthetic fixtures and remains outside committed artifacts.
- [ ] Parser defends against path traversal, malformed lengths, resource exhaustion and unexpected encodings.
- [ ] Connection lifecycle covers timeout, cancel, revoke, detach, stale responses and cleanup uncertainty.
- [ ] Trust claims distinguish signature, checksum, key possession, device identity and owner authority.
- [ ] No capability is promoted beyond emulator/host/physical evidence actually collected.
- [ ] Manual review before merge, flash, deployment or destructive recovery.
- [ ] Evidence includes exact command/test logs and explicit unrun checks.

## Test and quality strategy

### A. Deterministic tests
- Corpus: valid and malformed archive formats, stripped binaries, wrong-endian headers, unsigned fixtures, unknown device revision, duplicate/contradictory version metadata.
- Parser property tests: finite input/CPU/memory and consistent error classes; malformed cross-archive references and symlink traps rejected.
- Protocol fuzzing: incomplete replies, incorrect MIME/content-type, response reordering, stale auth tokens, conflicting capability manifests, failure to clean up.
- Role/permission tests: read-only role cannot mutate, valid network connection cannot impersonate admin, authenticated administrator still cannot claim OS root without a separate proof.
- Evidence tests: digest mismatch, duplicate source identity, timestamp uncertainty, false authority claims, provenance rewrite, redaction failure and poisoned model outputs.

### B. Integration tests
- Emulator: exact recorded firmware/version plus mocked interfaces; cross-version negative tests. Document emulator fidelity limits.
- Sidecar: loopback-only, authenticated, isolated execution, bounded job queue and failure to free/revoke grants.
- Existing AXP: preserve backwards compatibility and *do not* treat the draft signed-read foundation as shipped firmware support.
- Credential report: static findings are redacted in logs, user-visible UI, exports, screenshots and PR annotations.
- Integration tests establish behaviour of code; they do not establish actual hardware, regulatory or security product acceptance.

### C. Owned hardware bench
- Document hardware revision, supply/cable, voltage/ESD limits, network isolation and firmware recovery method; record the identity of the exact test unit.
- Record each read operation, real return value, timestamp, request boundary, failure/denial and cleanup evidence. Never invent p95 latency from an emulator.
- Start with nondestructive, authenticated management and connectivity testing.
- Recovery requires documented approvals, configuration backup/restore and reversible planned failure.
- For firmware flash or boot manipulation, perform separate hazard review before the operation; this proposal grants no permission to flash.

### D. Independent checks
- Replay a randomly selected set of device passport claims from the original artefacts.
- Fault-inject at session boundary: teardown during pending work, revoked approval during verification, disconnected device, injected reply from wrong fixture.
- Manually compare vendor release/advisory affected revisions with actual test units, recording region-specific differences.
- Validate iPhone and Android independently; any API feature not actually available remains disabled.

## Six acceptance demonstrations

**Demo 1: Firmware Passport without hardware.** Input permitted image + manifest -> bounded parsed facts, SHA-256, clear unknowns, unsupported root status. Repeat twice with identical results.

**Demo 2: Boundary confusion rejection.** Synthetic connection successfully joins network and performs TLS, while admin and OS-root actions remain denied by independent fixtures; UI explains why.

**Demo 3: Generated adapter cannot self-authorise.** REA identifies hypothetical read-only endpoint, produces typed adapter proposal; operator review grants only approved read. Attempts to perform write or change grant fail.

**Demo 4: Safe secret exposure report.** In a synthetic deliberately vulnerable firmware image, detector finds a hard-coded-secret class and suggests mitigation without revealing any credential value or working login path.

**Demo 5: Firmware change ledger.** Compare two owned published images, associate patch/advisory evidence by exact board/region, and label ambiguity where a change cannot be attributed.

**Demo 6: Owned physical recovery.** Misconfigure a lab router using the owner's own credentials, apply vendor/OpenWrt supported recoverability with approval, prove network and configuration state restored; preserve all outcomes and failures.

## Agent delegation plan

Use distinct owners/branches with explicit integration order, not six agents blindly editing the same files:

| Agent track | Scope | Handoff artifact |
| --- | --- | --- |
| Evidence & schema | DI-01–DI-03; security contract review | JSON schemas, fixture corpus, negative assertions |
| Firmware/REA | DI-02,DI-04,DI-11,DI-12 | Reproducible offline reports, hashes, provenance and redacted findings |
| Protocol & twin | DI-06–DI-08 | Typed interface specification, non-operating test adapter, conformance cases |
| Sidecar and trust | DI-09,DI-14 | Scope enforcement, secure transport requirements, revocation/failure tests |
| Physical lab | DI-10,DI-13 | Bench checklist, acceptance log, signed operator decisions; **no activity until authorised** |
| UI and QA | DI-05,DI-15,DI-16 | Evidence dashboard, native acceptance results, independent verification matrix |

Agents may research and prepare fixtures in parallel. Integration requires completed downstream interfaces and manual approval. Do not claim any agents were assigned by this planning PR.

## Roadmap and measurable outcomes

**Milestone A, offline evidence:** DI-01–DI-05 and DI-12; 100% supported factual claims refer to hashed source bytes; zero secret-value exposure in synthetic tests; zero firmware execution in ingestion process.

**Milestone B, safe adapter inference:** DI-06–DI-09; 100% mutation attempts rejected by read-only adapter; deterministic conformance corpus passes; unknown version defaults unsupported; zero fallback from authenticated mode to legacy.

**Milestone C, owned router confidence:** DI-10 and DI-13; at least one known hardware/firmware revision accepted physically; recovery proof independently repeated; all destructive paths explicitly warned and approved.

**Milestone D, evidence-driven platform:** DI-11,DI-14–DI-16; two versions checked, both mobile platforms independently tested, reproducible evidence bundle and reviewed release claims.

All performance goals must be measured on named environments, not estimated from source. Where a toolchain is unavailable, retain a blocked gate rather than silently skipping it.

## Risk register

| Risk | Detection | Mitigation / stop rule |
| --- | --- | --- |
| Secret leakage | Redaction tests, review logs/exports | Stop publication, revoke/rotate lab credentials, purge sensitive artefacts through approved process |
| Lab network escape | Recorded topology, route/isolation tests | Stop all active jobs and disconnect the bench |
| Firmware image malicious parser input | Fuzz, extraction resource caps | Reject file; analyse only in restricted worker |
| Wrong device/board revision | Passport identity mismatch | Refuse active operations |
| AI misclassifies root | Independent OS/role assertion | Downgrade to hypothesis; never grant operation |
| Recovery causes data loss | Explicit destructive-effects display and preflight | Deny until backup, operator approval and restore plan verified |
| Sidecar or signed-read downgrade | Revocation/legacy-fallback tests | Fail closed, terminate affected session |
| Unreleased native adapter masquerades as working | Platform acceptance record | Mark source-only / host-only |
| Licence/provenance uncertainty | Upstream manifest and dependency audit | Quarantine pending legal review |
| Vulnerability disclosure mishandled | Restricted finding workflow | Retain privately, notify affected vendor via coordinated disclosure |

## PR completion condition

This document is accepted when reviewers agree on scope, ordering, acceptance tests and owners. It makes no feature-level claim. The planning PR may be merged only after review. Implementations need separate PRs and fresh tests on their actual commit heads.
