# Active research programme

## 1. Required outcome

The owner asked to use REA and the preserved ecosystem to understand hardware, software, firmware, protocols and cryptographic implementations, then turn the findings into better APEX capability. The programme must produce evidence-backed discoveries and tested integrations. Tool installation, metadata import and an ever-growing list of parsers alone do not meet that requirement.

The 2 November admission is retained exactly in [the implementation conversation](conversations/implementation.md): “Installing the CLI and importing metadata did not fulfil that request.” Subsequent supervised objdump work is real progress, not completion of the wider programme.

## 2. Research record template

Each investigation should have a durable ID and contain:

- **Question:** one concrete behavior or compatibility uncertainty, with a falsifiable expected result.
- **Target:** device/board/firmware or binary, exact source/artifact hash, available documentation and permitted scope.
- **Source inputs:** upstream IDs/commits/files, licences and copied versus reference-only disposition.
- **Method:** tool/engine/compiler versions, configuration, timeout/resource bounds and reproducible steps.
- **Observations:** raw outputs/captures, host/OS/physical provenance, failed attempts and cleanup status.
- **Interpretation:** what the observations support, alternatives, confidence limits and counterexamples.
- **Validation:** independent source/fixture/bench comparison, held-out material and reviewer findings.
- **Product result:** adapter/decoder/diagnostic/workflow change, tests, support matrix and acceptance tier.
- **Next action:** exact remaining dependency, whether an owner decision is required and what would close the investigation.

A negative result is useful if it excludes a plausible design or establishes a limit. Avoid claiming successful reverse engineering from names, strings, guessed structure or AI explanation alone.

## 3. REA first full-engine milestone

The existing pinned REA 6.8.0 CLI has parsed a known APEX ELF and successfully supervised GNU objdump on this host. Ghidra decompilation, persistent worker operation and phone-to-worker jobs remain unaccepted. R31 reference commit and the npm release are separate source identities.

Complete the existing [worker contract](LOCAL_CHECKPOINT_REFERENCES.md#ref-5d5055d3a448), not an improvised unbounded shell workflow:

1. Select an authorized, appropriately provisioned analysis host and exact REA/engine/JDK versions. The existing design names Ghidra 12.1.4/JDK21; verify its recorded artifact and supported pairing rather than blindly choosing latest.
2. Run the bounded readiness/preflight checks, including the actual supervised launch and child-cleanup behavior. Do not treat direct executable success as evidence that REA supervision works.
3. Build a known APEX binary with recorded compiler/source/options and retain its digest. Static inspection should not execute the analysis target.
4. Analyze and decompile a function selected from observed output. For `apex_crc16`, compare initial value, polynomial, shift and loop behavior with the known source and independent vectors.
5. Retain input/output hashes, errors, engine logs, truncation/timeout state and process cleanup. A successful exit with missing or mismatched output is not success.
6. Independently review the interpretation. A decompiler's pseudocode is not recovered original source or a proof of behavior for every input.
7. Persist the artifacts, restart/reconnect the selected worker through its supported lifecycle and verify retained bytes. Only then claim persistence.
8. Expose a bounded job contract to the app, with explicit input selection and export, status, cancellation, error handling and results tied to the exact target. Manual report import is not the same as this integration.

This is the first full-engine milestone, not the end of research. It establishes a trustworthy method before investigating more complex permitted targets.

## 4. Initial research backlog

| ID | Question and controlled starting point | Deliverable | Acceptance evidence |
| --- | --- | --- | --- |
| RES-01 | Does the selected REA engine recover the known APEX CRC behavior? | Reproducible engine job and source comparison | Exact binary/engine hashes, decompilation, independent vectors, cleanup and retained artifacts |
| RES-02 | What is the exact Flipper read-only RPC handshake and flow control for the chosen firmware? | Protocol intake, generated-schema provenance and adapter fixtures | Exact protobuf pin, streamed completion/error/cancel cases, then named physical Flipper |
| RES-03 | Can current recorded Mayhem C8 data be consumed without changing signal meaning? | Original importer, real-recording fixture and native selected-file path | Numerical convention, odd/truncated/oversize rejection, original/derived hashes and actual phone import |
| RES-04 | Can an ESP-IDF/RadioLib receiver deliver bounded useful observations? | Default-off receive-only component for one radio/board | SDK build, board/wiring/frequency identity, known fixture captures, no implicit transmit path |
| RES-05 | Which selected instrument status fields are stable and trustworthy enough for the catalogue? | Chameleon/Flipper/Meshtastic status adapters prioritized by available device | Version-specific fixtures, schema bounds, untrusted identity labels and disconnect/reconnect acceptance |
| RES-06 | Which Pwnagotchi variant and supported management interface should APEX target? | Versioned source intake and status/owned-log importer design | Exact fork/version/licence, named device, no assumptions about automatic capture/password recovery |
| RES-07 | Can native Rust improve one bounded real phone analysis workload without regressions? | Dual-path experimental kernel/parser and benchmark report | Differential tests, iOS/Android build, real-device latency/memory/thermal/lifecycle results |
| RES-08 | Can a local Modbus/OSDP bench produce useful replayable diagnostics? | Simulator/bench fixtures and typed import/adapter | Isolated configuration, exact tools, timing/error cases, no live network/controller assumptions |
| RES-09 | Can evidence be restored and verified rather than only exported? | Versioned import/recovery design and tests | Corruption, duplicates, interrupted restore, migration and explicit retention/privacy behavior |
| RES-10 | Can AI hypotheses improve protocol analysis without inventing certainty? | Evaluation corpus and bounded hypothesis UI | Ground truth, false-positive accounting, held-out tests, source references and no execution authority |

## 5. Mining the 31 roots effectively

Read the smallest relevant interface and its dependencies first. Keep a source map from question → upstream file/commit → finding → APEX change → test. Prefer mature reusable permissive components when they meet the requirement, but never skip file-level licence review. Use copyleft sources as references or appropriately licensed components based on a deliberate distribution decision.

The corpus contains concrete opportunities beyond links: Expo document APIs, Mayhem recording format, Flipper RPC and BLE serial service, RadioLib ESP-IDF HAL, Android USB drivers, Meshtastic PhoneAPI, IR capture output, rtl_433 event JSON, PyModbus simulator and libosdp channel interfaces. [Source reuse details](SOURCE_PROVENANCE_AND_LICENSING.md) identify the integration points and what still blocks them.

Do not spend the whole programme preserving sources repeatedly while never using them. Preserve once, verify when materialized or changed, then pursue an explicit question and deliverable.

## 6. Cryptographic and recovery research boundaries

Record supported algorithms, enrollment, key storage interfaces and implementation behavior without claiming that knowledge of an algorithm grants a key. A source weakness hypothesis is not an exploit finding until reproduced in a properly scoped controlled setting. Reports should distinguish vulnerability, compatibility defect, misconfiguration, recovery procedure and unsupported operation. Any later live action needs a concrete target, permitted scope and an outcome-verification plan; the historical broad permission assertion does not replace those details.

This programme keeps specialist recovery in scope while refusing to manufacture universal guarantees. It records research obligations without embedding instructions to compromise unrelated systems.

## 7. Programme cadence and completion discipline

Each work package should end with useful findings, code or a precise blocker, not an empty status claim. Checkpoints preserve progress while work continues; they do not automatically fulfill the entire product request. When blocked on hardware or signing, continue independent source, format, tooling and test work without pretending the blocked acceptance passed. Keep a short next-action list derived from the current evidence and update the decision log when the plan changes.
