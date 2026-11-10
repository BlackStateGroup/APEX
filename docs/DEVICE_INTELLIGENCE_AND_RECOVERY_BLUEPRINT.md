# APEX + REA: Device Intelligence, Privilege-Boundary and Recovery Programme

**Status:** Proposed engineering design, 10 November 2026. **Approval:** draft plan only; no live target interaction, credential extraction, exploit execution, flashing, deployment or merge authorised by this document.

## 0. Executive decision

Build APEX into a **universal device intelligence and authorised recovery platform**, not a magical universal-root tool. REA should turn permitted firmware and hardware observations into reproducible device models; APEX should turn *verified* models into bounded, signed, policy-checked adapters for iPhone, Android and a specialist desktop/bench sidecar. The outcome is a constantly improving catalogue of exactly what can be discovered, connected to, administered, diagnosed and recovered on each firmware/hardware revision.

The product's distinguishing feature is **proof-carrying compatibility**: every capability is attached to a device/firmware revision, an authentication prerequisite, a scope of authority, a reproducible test, and the observation that justified it. No inference, language-model output, decoded protocol, Wi-Fi association, USB grant or recovered filename alone confers root privileges.

This proposal extends, rather than replaces, the existing [PRD](PRD.md), [architecture](ARCHITECTURE.md), [capability matrix](CAPABILITY_MATRIX.md), [security policy](SECURITY_RESEARCH.md), [REA workbench](REA_RESEARCH.md), [work packages](ENGINEERING_WORK_PACKAGES.md) and [experimental signed-read foundation](ACCESSORY_TRUST_FOUNDATION.md).

## 1. The questions this programme must actually answer

1. Can analysing a device's firmware, buses, protocols and interfaces yield a correct independent client? **Often yes**, with exact firmware-specific evidence.
2. Can that client reach privileged management or a root shell? **Only when an approved management/recovery path grants it, or a security defect is demonstrated in an isolated authorised lab.** There is no protocol-level rule implying root.
3. Does a wireless/security handshake block direct communication? **Different handshakes protect different boundaries.** Wi-Fi association, WPA2/WPA3 network authentication, TLS, application login, operating-system privilege checks, boot-chain verification and hardware key custody are separate.
4. Can firmware contain a hidden or shared administrator credential? **Some affected products do.** Others use per-device secrets, key-only login, salted/verifier-based credential storage, disabled root accounts or inaccessible hardware-backed keys; root is not invariably a password.
5. Does the Pegasus analogy support the strategy? **It supports studying chains of implementation weaknesses and privilege boundaries**, not a claim that merely speaking a protocol sidesteps authentication. APEX will study publicly documented incidents conceptually and use synthetic vulnerable lab fixtures for controlled reproductions, never indiscriminate compromise.
6. What makes APEX meaningfully new? Move beyond a device scanner to a **firmware-to-device digital twin, security-boundary graph, recovery atlas, bounded adapter generator and evidence-driven verification engine**.

## 2. Threat and authority model

### 2.1 Independent boundaries

For each researched device, distinguish:
- **Reachability:** transport present, valid addressing, radio association or cable attach.
- **Framing:** parsable packet/protocol and acceptable syntax.
- **Transport trust:** TLS peer/authentication, device cryptographic identity, pairing and replay controls.
- **Application authorisation:** authenticated session, role, service permissions and rate limiting.
- **OS privilege:** user/group/namespace, Linux capabilities, SELinux/AppArmor and root entitlement.
- **Boot and hardware trust:** signed firmware, secure boot, debug locks, recovery-mode restrictions and protected key storage.
- **Physical safety:** voltage, bus contention, radio licence, actuators and downstream equipment.

A successful lower-layer conversation is not evidence that an upper-layer boundary was crossed. Record each independently, including negative results and unknowns.

### 2.2 Legitimate paths to privileged control

- **Official:** existing administrator credentials or owner-authorised API/SSH/shell.
- **Maintenance:** supported vendor diagnostics, documented development interfaces and service modes.
- **Recovery:** owner-invoked reset, rescue partition, alternate boot environment or signed restore image; show data-loss and warranty consequences before use.
- **Firmware-owned:** a separately authorised boot of compatible, correctly signed/open firmware on hardware whose policy permits it.
- **Vulnerability research:** known or newly suspected weaknesses triaged and reproduced **only on isolated owned lab fixtures**; no production exploitation workflow, persistent access or bypass release feature.

A protocol observation cannot be used as a shortcut around ownership verification. No default passwords, secret dumps, reusable bypass recipes or working exploit chains enter public APEX artefacts.

### 2.3 Operator and agent permissions

All operations require a machine-readable scope manifest: fixture ID and ownership/authorisation reference, allowed interfaces, permitted verbs, start/expiry, excluded networks, effect classes, target state, safe-stop, data rules and operator. By default only local offline analysis and read-only observations are allowed. Changes to networking, credentials, firmware, boot or privileged configuration need explicit per-target operator approval plus a tested rollback plan. High-risk operations must not be triggered by generated text.

Enforce these rules in code at the adapter dispatcher/sidecar boundary. A prompt or PR description is not an authorisation service.

## 3. Target system architecture

~~~mermaid
flowchart LR
    A[Operator: iPhone / Android / web] --> P[APEX scope & capability policy]
    B[Local firmware / authorised bench evidence] --> I[Immutable ingestion & provenance]
    I --> R[REA and deterministic analysers]
    R --> M[Device Passport + security-boundary graph]
    M --> H[Hypotheses / version-diff / adapter proposal]
    H --> T[Emulated + physical conformance lab]
    T --> G[Evidence-backed signed adapter manifest]
    G --> P
    P --> X[Bounded adapter execution]
    X --> D[Known device via native transport]
    X --> S[Restricted desktop/bench sidecar]
    T --> L[Recovery Atlas and verified runbooks]
    L --> P
~~~

Component contract:
- **Ingestion service:** accepts opt-in local firmware images, source archives, serial logs, board metadata, exported management schemas, packet captures with scope documentation and manually entered hardware observations. Normalise and hash exact source bytes. Separate *source claims* from verified device observations.
- **REA desktop worker:** pinned tooling for safe static inspection, architecture/format detection, symbols, strings, resources, package metadata, protocol hints and Ghidra/other engine output where actually configured. Never execute arbitrary imported firmware in the host OS.
- **Device Passport:** manufacturer/model/board/revision/SoC/bootloader/OS/firmware/provenance/transport/services + evidence state + unknowns. Device-reported identity is untrusted until corroborated.
- **Security Boundary Graph:** nodes for each independently defended interface, permission, secret class, cryptographic root of trust and verified service role. Edges describe prerequisite conditions, not exploit instructions.
- **Protocol Genome:** versioned declarative grammars, state machines, optional auth flows, error classes, timeouts and compatibility constraints. Parsers and adapter generation derive from one typed specification and deterministic fixtures.
- **Adapter compiler:** produces only a proposed, disabled read-only driver skeleton plus tests and metadata. Approval and verified access grants are separate. No LLM-generated raw code or commands are automatically executed.
- **Digital Twin Lab:** emulate and model selected firmware/management endpoints where permitted, with explicit fidelity/limitations. Synthetic fixtures never imply real hardware acceptance.
- **Recovery Atlas:** vendor-approved recovery graph keyed by exact hardware and firmware, with prechecks, damage/data-loss warnings, operator action, observed state and restore verification.
- **Proof ledger:** cryptographically hashed inputs and outputs, repeatable test case IDs, reviewer and approval identity, coverage gaps, signatures where available and independent re-verification.
- **APEX mobile client:** device research/explanation, read-only supported sessions and operator-controlled runbooks; defer heavy analysis, raw USB debug and real RF captures to an appropriately equipped sidecar or accessory.

## 4. Research tracks

### R1. Router model and firmware anatomy
Build an inventory for an OpenWrt-compatible owned development router, an emulated OpenWrt environment and one commercially supported router obtained for the bench. Record chip revisions, flash partitions, bootloader, OS version, management services, patch status, debug access state, OEM distribution limits, documented recovery paths and *negative* tests. Import firmware through bounded static parsers with ZIP/tar path traversal, decompression-bomb, symlink and parser-crash defences.

### R2. Layered protocol and trust map
Test on approved fixtures how Wi-Fi/LAN connectivity, TLS, management API authentication, administrative roles, process permissions, boot integrity and accessory crypto differ. Build table-driven tests proving e.g. accepted transport + unauthorised application call = **denied**, valid user login + root-only call = **denied**, expired scope = **denied**. Never label a successful HTTP response as root.

### R3. Embedded credential exposure *audit*
Identify insecure secret-storage patterns, default/fixed credential indicators, debug account presence, exposed configuration and privileged service metadata through safe static analysis. Report **presence, class, affected version and remediation**. Do not publish credential strings, hashes suitable for password recovery, private keys or login-attempt automation. Require independent manual review before claiming a security issue.

### R4. Management adapter interoperability
Start with supported OpenWrt administration and owner-authorised vendor APIs. Define operations such as information, capabilities, health, backup metadata, firmware revision and ping. Enforce typed allowlists, valid credentials, rate limits, fail-closed timeouts, audit logs and explicit user consent for changes. Keep router adapters separate from accessory AXP/1; vendor routers do **not** speak AXP merely because APEX speaks AXP.

### R5. Physical service and recovery
Map UART/JTAG/SWD/USB/boot pins at the documentation/board-inspection level. Capture signal voltage and bus direction with protective interfaces and named hardware; do not probe unknown voltage live. Inspect official recovery facilities before considering invasive analysis. Model reset/firmware restore as potentially destructive and verify backups/compatibility, firmware signatures, successful boot and network settings afterwards.

### R6. Privilege boundary and vulnerability lab
Use **synthetic intentionally vulnerable firmware** and permitted published case studies to classify authentication bypass, code-execution, sandbox escape and privilege escalation. Separate entry point, prerequisite, reachable process, role, effect, patch/mitigation and proof. No zero-click delivery, broad scanning, router compromise automation, stealth/persistence or credential harvesting. Coordinate disclosure of newly observed issues and retain sensitive evidence in a separate restricted location.

### R7. Trustworthy accessory and sidecar boundary
Do not undermine the existing host-side [signed-read experiment](ACCESSORY_TRUST_FOUNDATION.md): it is not enabled in production firmware, does not confer mutual authentication and must not silently fall back to legacy read paths. Later deliver key custody, explicit pairing UX, pinned firmware identity, secure storage and signed read-only commands; separately design and approve any future state-changing protocol.

### R8. Cross-device evidence intelligence
Link firmware versions and configuration differences, independently observed protocols, public advisory statements and lab results into a searchable evidence graph. Enforce negative claims: “No confirmed path for revision X” is a meaningful result. Maintain version-specific patch status; never generalise a single model's vulnerability to every router.

## 5. Outside-the-box product directions (hypotheses, not features)

| Concept | Unusual leverage | First honest proof |
| --- | --- | --- |
| **Device Passport** | Portable bill of materials, security and repair identity for each board | One owned router with verified hashes, interfaces and uncertainty flags |
| **Privilege Boundary Graph** | Shows why connectivity is not authority and which approved recovery paths exist | Denial tests across Wi-Fi, management API, OS and boot boundaries |
| **Protocol Genome** | From REA evidence to typed, fuzz-tested client stubs rather than one-off scripts | Generate a non-operating OpenWrt read-only adapter and pass deterministic fixtures |
| **Digital Twin Factory** | Replay router behaviour before touching hardware | Emulator labelled synthetic, compared to physical non-destructive measurements |
| **Recovery Atlas** | Decision graph prioritising data-preserving paths over resets | Restore one misconfigured owned development router with full before/after receipts |
| **Proof-carrying Adapter Store** | Refuses to enable operations without a signed grant, firmware match and tests | Tampered manifest, stale version and revoked grant all rejected |
| **Firmware Change Radar** | Compare vendor images and open-source builds for changed exposure and repairability | Two known-version firmware reports with independently checked semantic diffs |
| **Repairability Scorecard** | Quantify owner-recoverable vs vendor-locked paths without security overclaim | Documented per-device reproducible criteria, not arbitrary score |
| **Field Recovery Kit** | Phone-first diagnosis backed by signed USB/BLE accessory and offline knowledge | Air-gapped bench demonstration with power-safe adapter and bounded read |
| **Privacy-preserving fleet atlas** | Organisations learn from incident patterns without sharing private configs | Redacted, salted and version-tagged local summary with consent controls |
| **Competing-hypotheses engine** | REA proposes multiple interpretations and actively seeks disconfirming tests | Held-out fixtures expose false positives; benchmark calibrated abstention |
| **Firmware-to-documentation compiler** | Generate interface maps, maintenance guidance and test suites from verified evidence | Expert can independently reproduce every generated factual claim |

No features above are accepted until individually implemented and tested.

## 6. Mobile and accessory constraints

- **iPhone:** supported OS-level BLE/NFC/network APIs only; no assumption of monitor mode, generic USB host access, arbitrary radio firmware control, shell root privileges or vendor debug support. A signed accessory or authorised remote sidecar may provide missing physical interfaces.
- **Android:** separately qualify USB permission, USB serial class support, native BLE/NFC, foreground/background restrictions and handset variations. Android USB permission is *transport* permission, not target administrator authority.
- **Desktop/bench sidecar:** restricted service for heavyweight REA, emulators, signed firmware inspection, physical UART/JTAG tools and large binary captures. Local authentication, least privilege, no arbitrary shell forwarding, resource limits and logging are mandatory.
- **Accessory:** preserve AXP framing and current read-only model until authenticated transport and on-device firmware support are validated. Do not misrepresent CRC as authentication.

## 7. Evidence and capability semantics

Every device operation record MUST contain:
- DevicePassport ID, exact hardware/firmware/bootloader version or explicit unknown, transport and adapter revision.
- Fixture scope/authority ID (stored securely outside publishable reports), source acquisition mode and date, content hash and retention policy.
- Required credentials/role, access boundary, scope of operation (read/modify/flash/physical), safety hazards and expected state changes.
- Separate statuses for **idea / analysed-source / emulated / host-fixture / owned-physical / independently-reproduced / blocked / contradicted**. These are evidence categories, not a single upward-only numeric score.
- Negative tests, unsupported paths, provenance links, reviewer and reproduction commands.
- Precise assertion type: *“management API read succeeded as authorised admin”* is not *“root access established”*.

A model-generated hypothesis cannot raise verification level. A checksum establishes byte identity, not authenticity; a signed accessory message establishes key possession, not silicon or manufacturer provenance; an emulated router is not a physical router.

## 8. Delivery sequence

### Gate 0: Plan and traceability (this PR)
Review architecture, authority model, lab inventory, acceptance contracts and risk gates. No runtime feature code delivered here.

### Gate 1: Offline router passport (first implementation PR)
Ingest a **permitted OpenWrt image** and extract bounded format/package/service facts. Produce hashed evidence and a machine-readable passport plus invalid-input tests. No router connection.

### Gate 2: Management digital twin and typed read-only adapter
Implement a synthetic OpenWrt management fixture and tested adapter interface; run denied/expired/role-mismatch conformance. The genuine device is still unverified.

### Gate 3: Owned router hardware and recovery bench
Attach actual named hardware, establish opt-in read-only authenticated administration, exercise safe misconfiguration/recovery under documented owner authority, confirm data integrity and record evidence. No generic root feature.

### Gate 4: Firmware comparison and controlled security audit
Compare vendor-supported firmware versions; triage public advisories, identify insecure storage patterns without exposing secrets, demonstrate mitigations using isolated simulations. Add review/notification workflow.

### Gate 5: Proof-carrying adapter and iPhone/Android UX
Verify signed adapter policy, version checks, trust and explicit permission flows, sidecar isolation, offline operation and native/device acceptance. Only at this stage consider field release.

## 9. Exit criteria

This programme is successful for the first router family when:
1. One complete passport can be independently reconstructed from the exact approved firmware bytes.
2. A protocol adapter works on deterministic emulator fixtures, refuses unauthorised and malformed requests, and cannot enlarge its own grants.
3. At least one **owned** hardware revision passes read-only administration tests, with operator, date, firmware and measured results documented.
4. A recovery run returns a deliberately misconfigured test device to a verified state, or explicitly records why the procedure is unsupported.
5. At least two firmware revisions produce independently checked change reports, with accurate uncertainty and no raw secrets.
6. Threat-model tests reject stale grants, replay, mismatched identity, malicious input, revoked approvals and missing clean-up.
7. Native iPhone and Android acceptance is measured separately, with unsupported operations visibly disabled.
8. No claim of universal unlocking, generic root or invisible security-handshake bypass appears in UI or marketing.

## 10. Failure modes to design against

- Broken firmware extraction, crafted archive paths, huge decompression ratios, parser code execution.
- Version or identity spoofing; vendor hardware revision mismatch; emulator-to-hardware overclaim.
- Model hallucination, prompt injection from analysed files, approval laundering from generated artefacts.
- Secret leakage in logs, PRs, examples or screenshots; accidentally retained wireless data.
- Sidecar privilege abuse; port exposure; arbitrary command injection or unbounded file writes.
- Cleanup races and unplug/reconnect uncertainty; stale cross-session capability grants.
- Bootloader access causing irreversible erase, damage, warranty/regulatory issues or bricked device.
- Broad “router” support claims from one narrow test fixture.
- Licensing/provenance errors when mining research/upstream-sources.

## 11. Dependencies and ownership

Leverage existing APEX WP10 device registry, WP11 evidence vault, WP25 Wi-Fi application integrations, WP26 analysis, WP27 hypothesis seam and WP28 trust. New DI/RR work packages are specified in [DEVICE_INTELLIGENCE_WORK_PACKAGES](DEVICE_INTELLIGENCE_WORK_PACKAGES.md). Retain the existing pinned REA toolchain and source-copy catalogue; new upstream imports must be versioned, licence-reviewed and evidence-backed. Parallel agents should own non-overlapping packages and propose separate PRs for independent review, not merge into main without approval.

### Decision requests before implementation
- Choose a purchased/owned OpenWrt-compatible router model and exact hardware revision plus spare recovery device.
- Establish which authorised commercial router sample and firmware builds can be legally acquired.
- Decide which operator/team controls high-risk consent, key storage and restricted vulnerability evidence.
- Choose Linux/macOS lab worker and permitted tools; do not assume REA Ghidra already works.
- Agree data retention/redaction policy and what an end-user may export from APEX.

## 12. Grounded external research and limitations (checked 10 Nov 2026)

- [TP-Link vendor advisory CVE-2026-12001](https://www.tp-link.com/us/support/faq/5210/): specified affected models/firmware, firmware-embedded credential material, **physical-attack** vector. Does **not** mean universal remote root access.
- [CERT.PL/NVD CVE-2025-7072](https://nvd.nist.gov/vuln/detail/CVE-2025-7072): specific KAON router models historically had shared cleartext credentials enabling remote privileged commands; patched versions are listed. A historical affected model is not evidence of current exploitable production equipment.
- [OpenWrt recovery guide](https://openwrt.org/docs/guide-user/troubleshooting/failsafe_and_factory_reset): supported failsafe/reset/recovery vary by firmware and hardware and can have data-loss costs.
- [OpenWrt serial console guide](https://openwrt.org/docs/techref/hardware/port.serial): service access may be physically available; a serial header does not prove a root shell exists.
- [Google Project Zero FORCEDENTRY research](https://googleprojectzero.blogspot.com/2022/03/): historical exploit-chain analysis shows separate initial execution and sandbox escape stages; not a transferable router bypass.
- [UK NCSC router advisory](https://www.ncsc.gov.uk/information/uk-internet-edge-router-devices-advisory): router management and credential exposure have serious consequences; strong, unique credentials and restricted management access are recommended.

Case studies are for classification, detection and remediation; avoid importing secret values, weaponised demonstrations or attack infrastructure. The historical examples should be rechecked at implementation time.

## 13. Related documents

- [Conversation record and traceability](DEVICE_INTELLIGENCE_CONVERSATION_20261110.md)
- [Independent engineering packages](DEVICE_INTELLIGENCE_WORK_PACKAGES.md)
- Existing [security research](SECURITY_RESEARCH.md), [REA research](REA_RESEARCH.md), [trust foundation](ACCESSORY_TRUST_FOUNDATION.md), [capability matrix](CAPABILITY_MATRIX.md), [verification](VERIFICATION.md).
