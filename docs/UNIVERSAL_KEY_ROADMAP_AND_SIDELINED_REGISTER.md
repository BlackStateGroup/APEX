# Universal-key roadmap and sidelined capability register

Product direction recorded 13 November 2026. Owner: Black State Group.

## Read this first: preserve the ambition

APEX remains **Universal Master Key**. The owner's ambition is a private, commercially distributed universal-key platform for authorised professionals: security firms, police, military and organisations conducting authorised red-team and penetration-testing work. The intended reach includes people's own phones, vehicles, buildings and other electronic systems, with the appropriate authority for each engagement.

This is a product ambition, **not a claim that APEX can currently unlock everything**, that universal access is technically possible, or that any particular customer is entitled to use every capability. A professional title does not establish authority for a target. Private distribution is the intended business model, not evidence of technical readiness or a completed licensing review. This document does not change repository visibility or upstream licence obligations.

Do not quietly replace that ambition with a smaller goal when work becomes difficult or cannot be performed. Keep the original capability visible here. Explain the exact limitation, what is evidenced, what remains unknown, and any appropriate next step. Do not call something technically impossible merely because an implementer cannot help with it. Equally, do not label a speculative idea “possible” without evidence. “A couple of lines of code” is not an acceptance criterion.

This register supplements, rather than replaces, the [PRD](PRD.md), [capability matrix](CAPABILITY_MATRIX.md), [work packages](ENGINEERING_WORK_PACKAGES.md) and [security research boundaries](SECURITY_RESEARCH.md). Existing safety and authority requirements remain in force. A roadmap entry is not permission to test, transmit, flash, deploy or operate a device.

## Status vocabulary

Use separate fields for software status, evidence and release location; a passing host test is not physical acceptance.

| Status | Meaning |
| --- | --- |
| Implemented | Identified source exists. State exact revision, test scope and whether merged. Never imply shipped or physically accepted. |
| Unverified | A proposal, claim or implemented path lacks the evidence needed for the stated outcome. Specify the missing proof. |
| Technically blocked | A named prerequisite, dependency, platform or physical limitation prevents the next step. Record the evidence and conditions for reconsideration. |
| Deferred | Deliberately postponed. Record why and the resumption decision; absence from a sprint is not removal from the product vision. |
| Unable to implement in current scope | This implementer or engagement cannot perform the work. Record the reason category without asserting global technical impossibility. Do not provide an operational bypass recipe as a substitute. |

Statuses may coexist: for example, implemented software can have unverified physical behaviour and blocked distribution. Update an entry rather than deleting it when the reason changes.

## Prominent roadmap / sidelined register

This is a documentation reconciliation, not a new code or hardware audit. Main-branch observations are based on the linked documents read on 13 November; open-PR statements below are reported evidence from their descriptions, not fresh reruns. Historical foundation documents contain older statements. Resolve any conflict against exact revision evidence before operating or making a release claim.

| ID | Retained capability / objective | Current classification | Evidence, limitation and next appropriate step |
| --- | --- | --- | --- |
| UK-01 | Broad universal-key access/recovery across phones, vehicles, buildings and electronics | Unverified ambition | No product-wide unlocking acceptance exists. Maintain a target/operation catalogue and qualify each supported outcome separately; no universal credential or protocol assumption. |
| UK-02 | Unified mobile console and accessory control plane | Implemented software; physical acceptance unverified | [README](../README.md), [capability matrix](CAPABILITY_MATRIX.md). AXP identity/capabilities/ping, native and offline paths have distinct evidence. Select exact phone/accessory/revision and test lifecycle/cleanup before field claims. |
| UK-03 | Authenticated accessory reads and trust | Implemented foundation; integration in draft; production trust deferred | [Signed-read foundation](ACCESSORY_TRUST_FOUNDATION.md); [PR #22](https://github.com/BlackStateGroup/APEX/pull/22) adds opt-in lab peer/native verification. Main's host library is not shipping firmware integration. PR reports builds, not physical acceptance. iPhone USB remains unavailable in that slice; production key custody and device tests remain open. |
| UK-04 | Phone access and recovery | Unverified; target-specific work deferred | Native APEX operation on iPhone/Android is not phone unlocking. No verified handset access/recovery workflow is established by the reviewed sources. Identify model/OS, documented recovery route, authority and data-loss implications; record any unavailable pathway explicitly. |
| UK-05 | Vehicle access and diagnostics | Offline subset implemented; access outcome unverified; bench adapters deferred | [Capability matrix](CAPABILITY_MATRIX.md) distinguishes CAN imports from vehicle diagnostics/access. No immobiliser or vehicle-unlock acceptance is claimed. Define an isolated authorised fixture, interface and operation before development or testing. |
| UK-06 | Building / access-controller interoperability and access | Deferred; target outcome unverified | [Capability matrix](CAPABILITY_MATRIX.md): OSDP/vendor integrations are planned. Commissioned controller, valid authority and per-operation evidence are prerequisites. A decoded RFID identifier is not access authority. |
| UK-07 | Firmware intelligence and device-specific recovery research | Implemented draft subsets; recovery outcome unverified | [PR #25](https://github.com/BlackStateGroup/APEX/pull/25) preserves device-intelligence/root-boundary research. [#29](https://github.com/BlackStateGroup/APEX/pull/29), [#31](https://github.com/BlackStateGroup/APEX/pull/31), [#32](https://github.com/BlackStateGroup/APEX/pull/32) cover bounded offline passports/structure evidence. Static parsing or CRC validation is not authenticity, a recovered secret or root access. |
| UK-08 | REA analysis and research jobs | Implemented draft software; production isolation deferred | [#27](https://github.com/BlackStateGroup/APEX/pull/27), [#30](https://github.com/BlackStateGroup/APEX/pull/30), [#33](https://github.com/BlackStateGroup/APEX/pull/33). Draft worker reports controlled analysis and CI. Hostile-input isolation, production credentials/retention and actual-phone acceptance remain separate. |
| UK-09 | BLE, Wi-Fi, NFC/RFID, IR, RF/SDR and embedded coverage | Mixed implemented subsets, unverified hardware and deferred adapters | Preserve every domain in the [capability matrix](CAPABILITY_MATRIX.md); do not treat a supported frequency or decoder as an authenticated action. [#23](https://github.com/BlackStateGroup/APEX/pull/23) is read-only Wi-Fi companion work; [#24](https://github.com/BlackStateGroup/APEX/pull/24) is Flipper status, not general Flipper capability or unlocking. |
| UK-10 | Durable cases, evidence and learning | Implemented draft software; real-device durability unverified; production storage deferred | [#26](https://github.com/BlackStateGroup/APEX/pull/26) reports bounded unencrypted cases and paired-observation learning. Hash consistency is not provenance authenticity. Review encryption, retention, conflicts and real-device tests separately. |
| UK-11 | AI assistance and resilience against compromised/rogue agents | Provider seam implemented; broader defensive programme unverified/deferred | Main documents describe data-only hypotheses, not an integrated model or autonomous execution. Record a concrete threat model and defensive evaluation plan. Model nationality is not evidence of reliability or threat. No broad autonomous-access capability is established. |
| UK-12 | Private professional distribution | Intended product model; release gates deferred | Verify licence compatibility, customer/target authority workflow, controlled distribution, signing, support, auditability and per-device claims before release. No public release, repo visibility change or commercial availability is made by this document. |
| UK-13 | Universal authentication bypass, credential extraction or defeat of protected access mechanisms | Unable to implement as a generic all-target capability in this documentation task; feasibility unverified | The broad ambition remains visible, but this update supplies no implementation, exploit procedure, key database or bypass instructions. Any proposed target-specific research needs independent technical, legal and safety assessment. An implementer's boundary is not evidence that every instance is impossible or possible. |

## Existing work reconciliation

Open draft PRs were observed on 13 November 2026. Their existence does not mean a worker is currently running. Do not merge their dependency stacks merely to reconcile this document.

| PR | Retained work | Observed head | Base |
| --- | --- | --- | --- |
| [#33](https://github.com/BlackStateGroup/APEX/pull/33) | Connect REA research jobs to the app and saved cases | `b7d8b568caecd2c2ff797a1b27adb6e6459a8510` | `feat/complete-workspace-setup` |
| [#32](https://github.com/BlackStateGroup/APEX/pull/32) | feat: attach firmware structure evidence to APEX Device Passports | `a9679597cb55cb5d2f8c568e573ee4b2779e2cf1` | `feat/device-intelligence-structure-20261110` |
| [#31](https://github.com/BlackStateGroup/APEX/pull/31) | feat: static U-Boot CRC and SquashFS structure inspection | `549f937b42701d25616704630c9ce85deecb02a9` | `feat/device-intelligence-offline-20261110` |
| [#30](https://github.com/BlackStateGroup/APEX/pull/30) | Add repeatable setup for the complete APEX research workspace | `1cb8941f0f9416220b403edb5054fcfdd2aa2c0f` | `feat/case-learning-workspace` |
| [#29](https://github.com/BlackStateGroup/APEX/pull/29) | feat: APEX Device Intelligence, firmware passports and scoped OpenWrt lab | `f3f7d415fd1cd69455aed5eeb4701708e5dc67af` | `main` |
| [#28](https://github.com/BlackStateGroup/APEX/pull/28) | Preserve full APEX scope and define first iPhone workflow | `d170ba2f202d5c9c1fe34e5d35f4b6b2c9101438` | `feat/lab-signed-read-peer` |
| [#27](https://github.com/BlackStateGroup/APEX/pull/27) | Run full-engine REA decompilation and CRC reconstruction baseline | `b5692c249f1c814ba63576b145ab12bf2ec1c276` | `main` |
| [#26](https://github.com/BlackStateGroup/APEX/pull/26) | Build durable cases and paired-observation learning workspace | `b1f12f191ae9de24c4b76d1b9b6e76a964049ebb` | `feat/iphone-flipper-status` |
| [#25](https://github.com/BlackStateGroup/APEX/pull/25) | docs: APEX + REA device intelligence, root-boundary research and recovery roadmap | `a6facc1bd1fac921b462e524202b9e65c7ef6ab3` | `main` |
| [#24](https://github.com/BlackStateGroup/APEX/pull/24) | Add first iPhone Flipper status workflow | `9d1b4bc5a8ed89b04dc70b6d3607dbd44fe8df7e` | `main` |
| [#23](https://github.com/BlackStateGroup/APEX/pull/23) | Add Wi-Fi reports and a read-only Linux status companion | `19fe82ea183024503f13ab2ebf403b44796e4d98` | `main` |
| [#22](https://github.com/BlackStateGroup/APEX/pull/22) | Add opt-in signed-read lab firmware and native USB client | `5dfcd75091ccb7365127ac8349f6e586f499a625` | `main` |

In particular, #28 already preserves the full build outline and first iPhone workflow, #25 preserves the device-intelligence discussion, and #26 links the full build outline. This register adds the owner's 13 November clarification; it does not replace those records or silently declare their implementation merged.

## Entry contract and review workflow

Every new or changed entry must record:
- Original intended outcome and why it belongs to the vision.
- Named device/firmware/interface/operation scope, or “not yet specified”.
- Status, reason category and date; distinguish technical, evidence, dependency, resources, legal/safety and implementer limitations.
- Source revision and evidence link; state simulated, host-tested, cross-built, physical-tested, deployed or not run.
- The exact missing prerequisite and a bounded next appropriate step, if one exists. “No appropriate implementation step supplied” is valid; never fill that gap with a speculative bypass.
- Responsible owner (or unassigned), review decision, and revisit trigger. No invented deadline.

Before promoting a capability to supported: verify the authority model, licensing, negative/failure tests, actual target outcome, rollback/stop conditions, data handling and independent review. Software tests and a transport acknowledgement cannot alone prove a door opened, a phone was recovered or a vehicle action succeeded.

Do not erase sidelined rows. Supersede them with dated evidence. If product scope changes, record the owner's explicit decision and preserve the earlier intent. Existing constraints must not be removed just to make the register look complete.

## Verification of this update

Documentation only. No new adapters, device access, exploit research, key recovery, RF transmission, flashing, installation or deployment. No new test-suite or hardware result is asserted. The register and entry-point links require review before merge.
