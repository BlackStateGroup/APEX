# Delivery roadmap and engineering work packages

The original vision stays broad while delivery uses testable slices. This roadmap prioritizes completing end-to-end capability rather than accumulating more disconnected inspectors. It makes no invented completion date, equipment purchase or deployment commitment.

## Workstream A: continuity and current reliability

### WP-V01 · Preserve and integrate the full project record

**Output:** this vision pack, conversation archive, requirements, decisions, full source inventory and portable receipts. **Dependencies:** accessible historical messages and existing source manifests. **Acceptance:** exact quote checks, source pin/hash consistency, local link validation, no unrelated/private operational material, docs-only diff, repository integration and verified publication status. **Current:** authored locally; remote delivery separately tracked.

### WP-V02 · Finish pending native ownership evidence

**Output:** a reviewed solution or precisely retained limit for the initial SDK state query and other open lifecycle gates. **Dependencies:** exact installed SDK contract and existing regression suite. **Acceptance:** original failures retained, no unhandled rejections or stale publication, clear raw-operation ownership and no false release certification; independent review; exact aggregate checkpoint. **Current:** v42 readiness cleanup fixed; separate state-query gap open in this snapshot. Do not overwrite newer engineering work with this dated status.

## Workstream B: real mobile usefulness

### WP-V03 · Add native selected-file I/Q import

**Output:** SDK-compatible document selection and bounded byte reader behind the current `IqFile` interface for iPhone/Android. **Dependencies:** selected Expo packages/toolchain, platform file permissions and native builds. **Acceptance:** selection cancellation, re-selection, declared/actual oversize, malformed sidecar, changed bytes, stale async completion, background/exit behavior, original hashes, explicit Inspect; actual signed iPhone and Android import. **Why first:** converts existing analysis from examples/web files into a useful phone workflow without pretending a radio is present.

### WP-V04 · Connect C8 conversion to the product workflow

**Output:** explicit Mayhem recording/sidecar import, original/derived lineage and a clear result view. **Dependencies:** existing original converter plus WP-V03. **Acceptance:** exact int8×256 convention, source/data bounds, odd/truncated and conflicting metadata rejection, original bytes retained, no silent truncation or automatic RF; a real permitted recording and phone test. **Current:** core/CLI prototype only; selecting two files is not proof of an atomic producer pair.

### WP-V05 · Accept the existing app on actual phones

**Output:** current native builds, signed iPhone install and Android installation with completed acceptance receipts. **Dependencies:** approved provisioned hosts/signing, named phones/tags/accessories. **Acceptance:** existing [phone plan](LOCAL_CHECKPOINT_REFERENCES.md#ref-7d502ab3cb85), permission denial, cancellation, background/resume, stale callbacks, USB detach, repeated connections, selected-source evidence and save/reopen behavior. Record OS/app/SDK/device versions and raw observations. **Not satisfied by:** JavaScript export, host VM facade or simulator compilation alone.

## Workstream C: native hybrid engine

### WP-V06 · Establish native-engine baseline and decision

**Output:** measured baseline workloads, chosen toolchain/bindings, architecture ADR and licence inventory. **Dependencies:** actual phone build path and supported device matrix. **Acceptance:** same hashed inputs and analysis definition across reference/native paths; measured latency, peak memory, thermal/energy, UI responsiveness, binary/startup cost. **Current:** authorized direction, no measurements claimed.

### WP-V07 · Deliver one Rust engine slice

**Output:** a small original shared Rust parser/kernel behind an experimental adapter, retaining current reference implementation and rollback. **Dependencies:** WP-V06 and independent fixture set. **Acceptance:** golden vectors, malformed/boundary inputs, randomized differential tests, FFI lifetime/error/panic audit, native builds, actual phone lifecycle/benchmark tests and independent review. **Success:** a justified migration decision, including “retain current implementation” if evidence supports it. Do not rewrite every subsystem to make the project look native.

### WP-V08 · Adopt selected C/C++ components

**Output:** narrowly wrapped mature library/driver where it beats rebuilding. **Dependencies:** concrete workload/device and file-level licensing. **Acceptance:** selected release/source hashes, notices/SBOM, exception/allocator/callback ownership, fuzz/sanitizer evidence where supported, platform builds and real device/performance results. **Candidate examples:** permissive radio/USB/libhackrf components after their specific review, not indiscriminate firmware copying.

## Workstream D: real instrument integration

### WP-V09 · Implement Flipper read-only connector

**Output:** version/identity/power/ping adapter for a named physical Flipper/firmware, not AXP with renamed labels. **Dependencies:** exact protobuf submodule and licence, transport/flow-control source review, owned device. **Acceptance:** golden wire fixtures, streamed response completion, cancellation, partial/corrupt frames, timeout/reconnect and actual iPhone/Android device session. A reported identity remains untrusted until a separate authentication design establishes more.

### WP-V10 · Build and accept the APEX accessory derivative

**Output:** reproducible derivative SDK build and controlled board receipt. **Dependencies:** close relevant source-review gaps; provisioned exact SDK; selected board/wiring/power. **Acceptance:** default-off behavior, explicit startup, no unintended NVS erase, resource admission, MTU/queue/error handling, USB/BLE sessions, disconnect/reconnect and measured board resource use. Preserve original historical target unchanged. Build-only work does not authorize flashing or radio operation.

### WP-V11 · Add one receive-only radio module

**Output:** default-off RadioLib/ESP-IDF receiver with bounded observations for one radio/board. **Dependencies:** WP-V10, driver licence, selected frequency/antenna and controlled transmitter fixture. **Acceptance:** compile/API/timing configuration, wiring, known-capture comparison, errors/overflow/stop semantics, no generic transmitter API and no automatic example transmission. Add explicit protocol operations rather than tunnelling through ping.

### WP-V12 · Resolve and implement Pwnagotchi intake

**Output:** exact repository/fork/version, source receipt, management contract and status/owned-log import. **Dependencies:** owner's intended device and supported interface. **Acceptance:** authentic version-specific fixtures, connection security, bounded capture/log import, provenance, cancellation and actual device acceptance. Later recovery/strength jobs need their own scoped design and outcome labels. No assumed password recovery percentage or automatic collection.

### WP-V13 · Expand instrument families deliberately

**Output:** one adapter at a time for Chameleon, Meshtastic, IR receiver, selected Android serial device and SDR host. **Dependencies:** concrete equipment and schemas/driver closure. **Acceptance:** supported version matrix, independent captures, lifecycle/error tests, licences and physical evidence. Do not purchase or implement every alternative mentioned in conversation merely because it appeared in the source survey.

## Workstream E: active research and recovery

### WP-V14 · Complete REA full-engine milestone

**Output:** known APEX binary decompiled through the selected REA engine, source comparison and independently reviewed result. **Dependencies:** approved working analysis host/engine/JDK and exact artifact. **Acceptance:** [worker contract](LOCAL_CHECKPOINT_REFERENCES.md#ref-5d5055d3a448), bounded supervised launch, retained outputs, no target execution, hash identity and cleanup; then persistence test. **Current:** supervised objdump is verified; full engine/persistence not complete.

### WP-V15 · Connect phone and research worker

**Output:** authenticated versioned job API with explicit input selection, status/cancel and exact result import. **Dependencies:** WP-V14, security/retention design and selected host. **Acceptance:** wrong hash/version, timeout, worker restart, disconnected phone, cancelled job, duplicate/stale result and no arbitrary shell execution; named end-to-end job from both phones. Keep remote data transfer explicit.

### WP-V16 · Deliver a verified recovery catalogue entry

**Output:** one complete system-specific specialist recovery case using permitted supported methods. **Dependencies:** named target, actual hardware/credentials/interfaces and scoped procedure. **Acceptance:** diagnosed failure, exact preconditions, reproducible method, independent physical outcome and remaining limits. This demonstrates the recovery product, not a promise of universal access.

### WP-V17 · Add controlled vehicle/industrial benches

**Output:** local CAN/Modbus/BACnet/OSDP fixtures and selected typed diagnostics. **Dependencies:** isolated simulator/bench, maps, timing, keys and electrical interfaces as applicable. **Acceptance:** source/fixture/version identity, malformed/error cases and observed bench outcomes before any deployment. Vehicle actuation, live industrial writes and access-control changes are not inferred from a decoder.

## Workstream F: evidence, intelligence and productization

### WP-V18 · Make evidence durable and recoverable

**Output:** versioned import/restore, migration and retention design beyond selected-bundle preview. **Dependencies:** threat model, schema and secure-storage/key policy. **Acceptance:** original/derived lineage, interrupted restore, corrupt digest, duplicate IDs, backward compatibility, storage limits and explicit deletion/export behavior. Encryption/signing/trusted time require their own implemented key/identity model.

### WP-V19 · Evaluate AI-assisted research

**Output:** bounded evidence-linked hypotheses and measured usefulness against a labelled corpus. **Dependencies:** chosen provider/local model and permitted data. **Acceptance:** ground truth, held-out tests, false-positive/unknown handling, cited source records, abort/timeout and no executable response fields or direct instrument authority. No provider is currently connected.

### WP-V20 · Make the command centre current and release-ready

**Output:** repository-derived status with source freshness, source/adapters/capabilities, branch/check evidence and next actions. **Dependencies:** reliable records and authorized read paths. **Acceptance:** no false live-sync claim, correct exact-commit checks, accessible links and browser verification; then mobile/firmware/worker licence, security and distribution gates. Commercial tiers and custom PCB production remain separate owner choices.

## Critical path and parallel work

Native file access, native-engine design and source/protocol investigations can proceed in parallel. Physical phone acceptance, named accessory availability and the REA engine host gate the corresponding end-to-end results. Work blocked on hardware should produce useful bounded code/fixtures/design elsewhere, not fabricated acceptance. Major migration follows evidence, not an arbitrary language deadline.

Each accepted work package must link its requirement, decision, source pin, changed commit, test result, independent review and next gate. Keep failed experiments. End a slice with a specific usable result or blocker and continue the remaining scope; do not present one slice as the finished platform.

## Phased milestones, owners and current status

The following six workstreams match the plan communicated to the owner. Owners are engineering roles to assign, not invented named people or claims that a staffed team exists.

| Phase / workstream | Accountable role | Current status | Dependencies | Exit gate |
| --- | --- | --- | --- | --- |
| 0. Preserve work | Repository/evidence maintainer | Docs and restored-source receipts prepared; remote continuation still pending | Exact histories, source pins and authorized repo access | Published reviewed record, no lost sources/quotes, exact delivery receipt |
| 1. Dependable phone | Mobile/platform engineer | Existing UI and host lifecycle groundwork; physical acceptance open | Signing/build host, named phones, native file path | Real iPhone and Android end-to-end import/observe/save/cancel tests |
| 2. Shared native engine | Rust/FFI engineer with mobile reviewer | Recommended and authorized; no implemented Rust slice claimed | Baseline workload, toolchain, WP-V05/V06 | Parity, independent review, real-phone benchmarks and reversible adoption |
| 3. Real equipment | Adapter/embedded engineer | Source research and AXP groundwork; live vendor connectors missing | Named devices, exact schemas/drivers, firmware build | One meaningful supported physical function per instrument, then broader functions; status is only level 1 |
| 4. Research/recovery lab | Reverse-engineering lead and independent reviewer | ELF/objdump verified; full engine and case outcome open | Accepted REA host, target scope and fixtures | Reproducible investigation becomes tested capability and verified case outcome |
| 5. Productization/hardware acceptance | Release/QA lead with security/licensing review | Not release-ready | Prior functional slices, secure storage/authentication and notices | Repeated device reliability, supported catalogue, provenance/SBOM and distribution approval |

Phases overlap where dependencies allow. No phase silently removes a domain from the full product vision. See [functional feature rollout](FULL_CAPABILITY_ROLLOUT.md): live reads, useful controls, case workflows and instrument cooperation remain the goal beyond initial version/status adapters.
