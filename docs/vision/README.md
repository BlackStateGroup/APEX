# APEX: full vision, decisions and audit trail

**Product:** APEX / Universal Master Key. **Owner:** Black State Group. **Direction:** a modular iPhone-and-Android electronic interoperability, specialist security, emergency access and recovery platform, backed by real instruments and an active reverse-engineering programme.

This pack records the full project, not just the current offline workbench. It preserves what the owner requested, what was proposed, what is implemented, what the evidence actually supports, what remains missing and how to continue without losing the original ambition.

**Snapshot:** 8 November 2026, documentation baseline `63f530d1f6f8f943d4fd2c1016904f3259daf77a` (local v42). The aggregate tested runtime is `deb5f27a8a0781f518479c1e84aee26e316a29df`. This pack is a docs-only addition; it does not implement a Rust engine or close phone/hardware acceptance. Later checkpoints must append a dated update rather than silently reinterpret this one.

## Read in this order

1. [Full product vision](PRODUCT_VISION.md): ambition, end-to-end workflows, product layers and capability domains.
2. [Functional feature rollout](FULL_CAPABILITY_ROLLOUT.md) and [requirements and traceability](REQUIREMENTS_TRACEABILITY.md): explicit requests, evidence, current state and completion gates.
3. [Native hybrid architecture](NATIVE_HYBRID_ARCHITECTURE.md): shared Rust engine, selected C/C++, Swift/Kotlin integration, UI continuity, ownership and measured migration.
4. [Research programme](RESEARCH_PROGRAMME.md): how source mining and REA must produce real findings and tested capabilities.
5. [Source provenance and licensing](SOURCE_PROVENANCE_AND_LICENSING.md) plus [all 31 source records](sources/INVENTORY.md).
6. [Decision history](DECISION_HISTORY.md): user corrections, earlier mistakes, proposed versus accepted choices and open decisions.
7. [Verified state and gaps](VERIFIED_STATUS.md): actual v42 evidence, host/native/device distinctions and remaining blockers.
8. [Delivery work packages](DELIVERY_ROADMAP.md): concrete outputs, dependencies and acceptance criteria.
9. [Conversation archive](conversations/README.md): recovered historical text, original message links, omission markers and latest instructions.
10. [Audit and maintenance](AUDIT_PROTOCOL.md): preserve evidence, continue work and verify this pack.

## Do not lose these points

- iPhone is first-class because the owner uses one. Android-only delivery is insufficient.
- Universal Master Key is the product ambition, not a promise that any phone or accessory defeats every lock or cryptographic system.
- Source acquisition means actual pinned source copies and restorable archives, not a page of links. Source acquisition alone is not integration.
- REA must actively investigate firmware, software, hardware and protocols, verify findings and feed working features. Installing the CLI and importing metadata was explicitly acknowledged as incomplete.
- Existing specialist devices should cooperate through APEX. Flipper and Pwnagotchi are explicit requests; they are not yet functioning live connectors in the inspected build.
- The latest architecture direction prioritizes the best outcome over minimum implementation time: evaluate a shared Rust engine with C/C++ reuse and native OS integration, without discarding working foundations blindly.
- A checkpoint is not the full product. Continue meaningful implementation and research while preserving review, tests and accurate limits.

## Evidence vocabulary

**User requirement** means an explicit request. **Assistant proposal** means a suggested design, not a user-selected commitment. **Authorized direction** means the owner asked to proceed, not that every proposed implementation detail is permanent. **Source-inspected** means code/docs were examined. **Host-verified** means the recorded host tests passed on named inputs. **Native-build verified**, **on-device verified**, **accessory verified**, and **field accepted** each require their own evidence. No tier automatically implies the next.

The historical root docs remain useful but contain old snapshots and superseded language. This pack is an additive reconciliation, not a silent rewrite of original records. For the detailed current code handoff use [ENGINEERING_HANDOFF_20261108](LOCAL_CHECKPOINT_REFERENCES.md#ref-5258c803c66a); for exact test evidence use [increment42-final](LOCAL_CHECKPOINT_REFERENCES.md#ref-4ee13bf90cbb).
