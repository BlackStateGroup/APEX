# APEX: full build and research outline

## Verified planning snapshot, 10 November 2026

This outline joins the original product brief, later architecture decisions, requested research and current implementation. It preserves APEX as one platform, with research feeding useful capabilities. APEX Learn is one component, not a replacement for the wider vision.

**Product goal:** an iPhone and Android command centre for supported electronic instruments, protocol analysis and specialist security/recovery work. It brings together phone observations, Flipper and other equipment, firmware research, deterministic analysis, evidence and AI-assisted learning. The “Universal Master Key” ambition means progressively broader verified device/operation coverage. No universal access, arbitrary RF reception or automatic credential capability has been demonstrated.

## 1. What is actually built

**Published and merged:** mobile/native foundations; NFC/BLE source integrations; Android USB permission and lifecycle repairs; selected I/Q and HCI file import; evidence journal/recovery/export work; IR timing imports; Android C++ I/Q analysis with exact JavaScript verification/fallback; bounded Mayhem C8 import; receive-only RadioLib accessory code; REA disassembly/control-flow/evidence tooling; synthetic APEX Learn; evidence graph; synthetic phone-sensing lab; host accessory-trust foundation.

**Latest unmerged batch:** draft [PR #22](https://github.com/BlackStateGroup/APEX/pull/22), opt-in signed-read laboratory ESP32-S3 firmware and native Android USB client. Both exact-head workflows and all nine jobs passed. It is not merged, installed or physically tested. The lab permits only information, capabilities and ping. Apple verification exists, but iPhone USB accessory transport does not.

**Software evidence:** the latest PR reports 2,561 host tests, 40 browser regressions, Android debug APK assembly, unsigned iPhone Simulator compilation, native crypto tests and firmware cross-compilation. Those are meaningful engineering results, not real-phone or accessory acceptance.

**Preserved local work not established in main:**

- Flipper protocol 0.25 read-only RPC, BLE byte-credit handling and an optional Android GATT bridge. Records show 60 focused tests plus three independent adversarial cases. It is not wired into the app or proven on a Flipper.
- Clock-calibrated alias reconstruction extension. Records show 39 tests and reproducible 5,000-trial synthetic evaluation. Its validation record says not pushed or deployed. It is not a phone receiver or physical result.

**Still absent:** an accepted real-device end-to-end case, production mobile distribution, a GitHub release, mobile Rust integration, native iOS I/Q acceleration, full REA decompilation/persistent service, a connected AI analysis provider, broad live instrument adapters and completed production trust/storage/licensing gates.

Some README and roadmap statements describe older snapshots and are now stale. Preserve history, but add a current status index rather than treating old “not implemented” text as current truth.

## 2. Product architecture

Keep the current React Native/Expo UI while improving native work where measurement justifies it.

1. **Mobile command centre:** cases, instruments, connection state, captures, analysis, findings, device profiles, evidence and reports.
2. **Shared analysis engine:** a measured Rust direction for bounded parsers, data models and selected numerical work. Retain the current reference implementations and rollback until parity and actual-phone evidence justify replacement.
3. **C/C++ components:** proven DSP/device libraries behind narrow audited interfaces. The current Android C++ FFT integration is real; it does not establish mobile Rust or a speed gain.
4. **Swift/Kotlin platform adapters:** permissions, file access, NFC/BLE/USB, backgrounding and secure storage. Platform differences remain visible.
5. **Instrument adapters:** separate vendor transports/protocols. AXP is APEX's protocol, not a substitute for Flipper RPC, Meshtastic protobuf or specialist reader APIs.
6. **Accessory firmware:** local timing, electrical interfaces, radio drivers, bounded resource use and clear stop/cleanup behavior.
7. **Research worker:** REA and heavyweight engines on an appropriate analysis host, through a bounded authenticated job interface.
8. **Evidence and knowledge:** original bytes, derived data, exact source/software identities, experiments, hypotheses, validated profiles and recovery.

High-rate SDR data belongs in native files/buffers or a measured host/network path, not JSON over BLE. Hashes prove byte identity/integrity, not device truth or ownership.

## 3. Complete research programme

### Original theories and visions to preserve

These are questions to investigate, not promises already proved. They are deliberately kept separate from later implementation proposals.

1. **A phone-centred Flipper and Universal Master Key.** The original idea was to study the DIY Flipper “REA style” and build an app version, then pursue the much larger security/recovery platform. The goal includes useful Flipper-like functions, not just a device dashboard.
2. **Exploit more of the hardware already inside phones.** Investigate whether existing iPhone/Android radios and firmware expose more interpretable information than ordinary apps use, rather than assuming missing conventional hardware ends the inquiry. This includes the user's request to reverse engineer the capacity to interpret radio frequencies through existing devices.
3. **Combine multiple frequencies, bands and incomplete listeners.** The user's specific hypothesis is that overlap or complementary observations across phone radios could reveal something each alone cannot hear. Test distinct measurement operators and cross-band information rather than relabeling decoded API outputs as raw waveforms.
4. **Investigate the effects of an otherwise inaccessible signal.** The assistant's “radio shadow map” proposal arose from that hypothesis: infer a change through packet loss, timing, RSSI or another observable device response. This named approach is a research candidate, not an established capability, source identifier or waveform decoder.
5. **Mixing, aliasing and reconstruction.** Investigate whether translated or differently sampled views can resolve ambiguity, what analog information they require and which clock, filtering and frequency-prior assumptions break the result. Clock-calibration work is a follow-on to this research, not a new user requirement invented after the fact.
6. **Small models that learn the meaning of signals.** The user explicitly proposed AI or a “mini model” that makes sense of observations and lets the app use what R&D discovers. Preserve both compact learned classifiers and larger AI-assisted reasoning, with reusable device/signal profiles and independent validation.
7. **REA plus observed behavior.** Study hardware, software, firmware and cryptographic implementations; compare structural analysis against real captures and controlled behavior. Turn findings into working features rather than stopping at decompiler installation.
8. **Combine the phone with the original physical instrument and other devices.** Integrate Flipper and specialist instruments into one workspace; investigate which plug-in modules provide capabilities missing from a handset. Extend useful functions progressively rather than treating identity/power reads as the final goal.
9. **Pwnagotchi and Wi-Fi assessment/recovery.** Preserve the specific pairing/integration request and the question about what captured traffic can establish in an authorized recovery/strength study. Do not silently drop this into a generic Wi-Fi label or equate capture with recovery of a password.
10. **Mine repositories for combinations and breakthroughs.** Preserve actual source copies, study reusable technology, connect findings across projects, build while researching, and pursue unconventional hypotheses with controlled negative tests. Keep a dedicated REA track and a distinct exploratory research track.
11. **Use stronger native architecture and AI where they improve the outcome.** Evaluate Rust/C++, real mobile performance and the requested Astra angle. Retain the user's preference for the best result over the shortest implementation time.
12. **Combine the visions into one product.** The user explicitly asked whether earlier visions had been dropped. APEX Learn, experimental sensing, source mining, physical tools, specialist recovery and the command centre must remain connected parts of APEX.

The direct 9 November language included “try the impossible and find a way,” combining phone listening “to hear that which is said not to be be possible given the hardware,” and a “mini model that makes sense of a signal.” Preserve that exploratory intent while requiring evidence before a result becomes a capability claim.

### A. Mine and use the full open-source corpus

Do more than retain links. For each research question, identify exact upstream files and dependencies, record the finding, implement the smallest useful integration, and link its tests and physical acceptance.

All 31 registered roots have preserved pinned-source records. Historical restoration verified 32 archive parts, approximately 1.99 GB, and 164,492 tracked entries. This does not imply recursive dependency closure or that every source is compiled into the app. The preserved restoration receipt records 63 unmaterialized nested Git entries.

Corpus:

- Instruments: Flipper Zero firmware; DIY Flipper; Bruce; Proxmark3; ChameleonUltra; HackRF; Meshtastic.
- Embedded and transport: RadioLib; IRremoteESP8266; TinyUSB; ESP-IDF; Zephyr; usb-serial-for-android; libusb.
- Mobile: Expo; react-native-ble-plx; react-native-nfc-manager.
- Radio and signal analysis: rtl_433; GNU Radio; SoapySDR; SigMF; Universal Radio Hacker.
- NFC/vehicle/industrial: libnfc; can-utils; python-can; PyModbus; BACnet Stack; libosdp.
- Mayhem and reverse engineering: Mayhem Mobile; PortaPack Mayhem firmware; REA.

Missing intake remains explicit: the requested Pwnagotchi fork/version is not in the 31 roots. Three earlier suggested repositories remain unnamed: Android SDR visualization, vehicle/industrial communication, and accessory firmware. Recover their identities if possible; do not silently substitute different projects.

Useful near-term mining targets: native file handling, Flipper framing/flow control, RadioLib ESP-IDF HAL, IR capture output, rtl_433 event imports, selected USB serial drivers, Chameleon status, Meshtastic PhoneAPI/schema, isolated Modbus/OSDP benches and SDR capture sidecars.

### B. Active REA, firmware and cryptographic-implementation research

The user's request was active investigation of how hardware, firmware, software and cryptographic implementations work, not merely installing REA or importing metadata.

**Verified:** REA 6.8.0 supervised GNU disassembly of APEX-owned ELF binaries. Four compiler variants and six public AXP functions yielded 24 inspected functions. The research identified optimized CRC copies missed by call-name-only inspection and retained a changed-polynomial negative control. Evidence verification ties retained instruction bytes and summaries to exact binaries.

**Next:** provision the chosen full engine/JDK; decompile known APEX firmware functions through REA; compare against source and independent vectors; retain failures, hashes and cleanup evidence; independently review; prove restart/persistence; then implement phone-to-worker submit/status/cancel/result flows.

Expand only after that reliable baseline into named, permitted device/firmware questions. Distinguish compatibility defects, vulnerabilities, misconfiguration, documented recovery and unsupported operations. Algorithm recognition does not produce a secret key or establish access.

### C. Phone radios and unconventional sensing

Retain the user's direct request to challenge assumptions and investigate combinations of existing phone bands/observations rather than declaring every unconventional route impossible.

Research tracks:

1. Audit actual model/OS/API access: BLE advertisements/GATT, NFC modes, Wi-Fi metadata, UWB and supported ranging.
2. Controlled differential observations: deliberately vary one known sensor value and compare payload/timing changes with independent ground truth.
3. Missing-observation sensing: compare packet/update loss, RSSI and a reference source, accounting for OS scheduling and callback coalescing.
4. Multi-view sensor fusion: combine BLE with independently measured compatible-peer ranging and possibly motion/orientation.
5. Indirect or out-of-band effects: test whether a controlled signal leaves a repeatable observable signature. Require interference, harmonics, intermodulation, motion and scheduler controls.
6. Mixing, aliasing and multirate reconstruction: investigate what different analog views can identify, with explicit input bandwidth/frequency bounds.
7. Clock calibration: independent clock estimates, uncertainty, drift validity and abstention when multiple frequency candidates survive.
8. Sparse multiband reconstruction: reproduce established models, then challenge clock error, multiple tones, saturation, unknown gain and absent-band controls.
9. Model-specific firmware/API research such as documented Nexmon CSI paths, kept separate from stock iPhone or universal Android support.
10. Receiver-assisted approaches when the required analog observations are absent, with the phone doing analysis and control.

**Current results:** synthetic studies demonstrate that multiple views can reduce ambiguity under stated assumptions. They also show serious confounds: callback loss can mimic RF loss; range bias can mimic attenuation; wrong clock calibration or frequency priors can yield confidently wrong estimates. The clock extension improves the declared model when independent calibration is supplied, but supplies no such calibration from a phone.

**Next meaningful deliverable:** bounded import/replay of real, permitted paired BLE/ranging observations with timestamp/provenance checks, missingness handling and abstention. Physical experiments need calibrated reference equipment, randomized sham/control trials and held-out phones/sessions. Do not report Monte Carlo percentages as real-phone accuracy.

### D. APEX Learn, small models and AI-assisted signal understanding

Build the requested feedback loop: observe → propose interpretation or experiment → test on independent data → retain a reusable profile with supporting evidence.

**Built:** a deterministic synthetic BLE candidate-elimination prototype. It narrowed 24 declared interpretations to one using a useful next reference query, then passed four held-out readings. It searches a known public BTHome layout, not arbitrary unknown/encrypted protocols. A separate tiny two-feature classifier exists in the synthetic sensing lab.

**Next:**

- Controlled real sensor datasets with independently labeled discovery/calibration/holdout splits.
- Broader candidate families and failure/unknown classes.
- Measured false positives, abstention, generalization across devices and nuisance conditions.
- Bounded model-generated hypotheses tied to actual observations.
- Explicit local-versus-cloud choice, data approval and selected provider/model.
- Deterministic checks remain separate from model confidence.
- Verified decoder/profile artifacts become reusable application capabilities.

The user's Astra interest belongs in model/tool evaluation. Using a development model is not the same as shipping a model integration. No live analysis provider is established by the current build.

### E. Evidence graph and compounding knowledge

Connect captures, source versions, firmware, device claims, experiments and interpretations without promoting correlation into identity or confidence.

The graph foundation is merged. Finish durable case storage, original/derived lineage, duplicate handling, migration, import/restore, interrupted recovery, retention and deletion. Evaluate secure storage/encryption and key management separately. A file hash or graph edge is not cryptographic authentication or proof that an observation happened physically.

### F. Native engine and performance research

Preserve the Rust/C++ hybrid direction and the preference for the best outcome rather than the quickest superficial rewrite.

**Built:** exact numerical host proof and Android C++ FFT activation with runtime self-tests, per-request JavaScript comparison, fallback and quarantine. Rust remains a host proof; iOS uses the reference path.

**Next:** real-phone baseline; a genuine mobile Rust ABI/build/link slice; native iOS integration where justified; FFI lifetime/cancellation audits; golden and randomized differential tests; actual ARM/Hermes behavior; binary/startup, latency, memory, energy and thermal measurements. Verification mode deliberately duplicates work and is not evidence of acceleration.

### G. Trust, supported recovery and emerging standards

Complete lab signed-read review and physical acceptance before production adoption. Define key custody, persistent trust, revocation and host policy deliberately. The current extension provides neither encryption, mutual authentication, attestation nor anti-relay.

Keep a version-specific specialist recovery catalogue: exact target, failure, hardware, credentials/preconditions, supported method, observed outcome and limitations. First prove one complete permitted case. Transport success is not proof of a physical result.

Aliro/Matter interoperability, spatial discovery and camera/datasheet assistance were promising assistant proposals. Evaluate them as optional emerging opportunities, not as already delivered features or replacements for explicit user requirements.

## 4. Functional instrument rollout

Each family progresses through four levels: connect/identify → real observations/import → useful supported functions → complete repeatable case. Status/battery alone is not the full product.

- **Flipper/DIY/Bruce:** finish shared-manager lease/UI integration, native builds and real-device RPC acceptance; then explicit useful capture/import and supported controls, per firmware.
- **NFC/HF/LF RFID:** accept current phone modes; integrate selected specialist readers for unsupported bands/modes; add supported writing/application workflows only with correct hardware and per-mode tests.
- **Infrared:** take current timing imports to a real receiver capture and supported appliance-control path with carrier/timing and physical outcome evidence.
- **Sub-GHz:** accept default-off receive-only RadioLib target with chosen board/radio/antenna; obtain known captures; add verified protocol operations separately.
- **SDR/Mayhem:** accept native C8/SigMF imports on actual phones and real recordings; then selected receive sidecar, rate/drop/cleanup tests and verified decoders.
- **BLE:** real foreground scanning, selected telemetry and device-specific controls; platform-specific provenance and robust cancellation.
- **Wi-Fi/Pwnagotchi:** resolve fork/device/API; implement secure status/owned-log import; scope subsequent supported assessment and recovery studies individually.
- **GPIO/UART/I²C/SPI/USB:** selected adapters, voltage/power/timing safety, exact drivers and cleanup. Android CDC support is not all USB support; iPhone transport requires a genuine supported path.
- **CAN/vehicle:** isolated CAN/OBD fixtures, known signal definitions and read-only diagnostics before reviewed service/recovery workflows.
- **Industrial/building/access control:** Modbus/BACnet/OSDP simulators and isolated configured benches, exact maps/keys and observable outcomes.
- **Mesh:** Meshtastic schema/PhoneAPI integration and correct LoRa equipment, then telemetry/messaging/configuration.
- **Workflow composition:** combine already verified operations with prerequisites, cancellation, audit and outcome checks. Avoid an unbounded generic command executor.

## 5. Hardware and acceptance programme

Start with an identified iPhone and Android, one suitable ESP32-S3 board, known cables/power and available instruments. Reuse existing equipment before custom hardware.

Stages: (1) phone/S3 connection and repeated attach/detach; (2) IR plus one owned sensor; (3) specialist RFID; (4) SDR/mesh; (5) isolated vehicle/industrial benches; (6) custom PCB only when evidence justifies consolidation.

Measure power, resource use, throughput, drop rates, latency and cleanup. Record phone/OS, board/radio/firmware, wiring, gain/frequency/sample clock and software hashes. Test denial, cancellation, backgrounding, detach, low battery, malformed data and repeated reconnects. No new purchase, flashing or live operation is implied by this plan.

## 6. Recommended delivery order

1. **Reconcile and preserve:** current requirement-to-source-to-code matrix; recover local Flipper/clock research; resolve missing source identities; refresh stale status claims.
2. **Make the existing app usable on phones:** approved signed iPhone/Android installation, actual import/observe/analyze/save/export/cancel acceptance.
3. **Complete one instrument path:** finish the Flipper bridge or the S3 signed-read lab with named equipment, review and physical evidence; retain both workstreams.
4. **Run research in parallel:** complete REA full-engine baseline; build controlled real-sensor APEX Learn dataset; develop paired-observation replay/clock research.
5. **Prove the flagship learning case:** real device observations, a testable hypothesis, independent unseen validation and reusable evidence-linked profile.
6. **Expand useful functions:** IR, narrowband receiving, SDR, NFC/reader, Pwnagotchi, mesh and isolated vehicle/industrial integrations according to available equipment.
7. **Production gate:** repeated device reliability, secure storage/trust, SBOM/notices, dependency-license resolution, signing/store/release packaging and required hardware compliance.

The older 20 work packages remain valuable identifiers. Update their status rather than discarding them: preservation and several file/engine/receiver/evidence tasks have progressed, while physical acceptance, full REA, vendor adapters, production storage and distribution remain open.

## 7. Definition of completion

A feature is complete only when its documented supported device/version/operation works end to end, has regression and relevant physical acceptance, retains trustworthy evidence and failure behavior, and is deliverable in the intended app/firmware build.

A research item ends with a reproducible finding, tested capability or precise falsification/blocker. Simulations, compiled binaries, source preservation, draft PRs and physical tests are distinct evidence levels. Keep failed results and unsupported cases.

Do not assign an overall completion percentage or a release date until equipment, signing, remaining scope and critical-path estimates are established.

## Sources

**Completeness boundary:** this outline includes every APEX research theory and named approach recovered in the reviewed repository histories and current room searches. It cannot honestly certify inaccessible or missing historical content. The old original 12-module widget is unavailable, three repository identities remain unresolved, and the exact Pwnagotchi variant is not established. These are explicit recovery items, not assumed replacements. Optional assistant proposals such as Aliro/Matter, camera/datasheet assistance and the “radio shadow map” are labeled as proposals rather than falsely attributed to the user.

- [Full product vision](https://github.com/BlackStateGroup/APEX/blob/main/docs/vision/PRODUCT_VISION.md)
- [Requirements and user-request traceability](https://github.com/BlackStateGroup/APEX/blob/main/docs/vision/REQUIREMENTS_TRACEABILITY.md)
- [Original implementation brief and iPhone correction](https://github.com/BlackStateGroup/APEX/blob/main/docs/vision/conversations/implementation.md)
- [Specialist recovery and Pwnagotchi requests](https://github.com/BlackStateGroup/APEX/blob/main/docs/vision/conversations/capabilities.md)
- [Hybrid architecture and full-spectrum direction](https://github.com/BlackStateGroup/APEX/blob/main/docs/vision/conversations/current-direction.md)
- [20-work-package delivery roadmap](https://github.com/BlackStateGroup/APEX/blob/main/docs/vision/DELIVERY_ROADMAP.md)
- [Functional instrument rollout](https://github.com/BlackStateGroup/APEX/blob/main/docs/vision/FULL_CAPABILITY_ROLLOUT.md)
- [Research programme](https://github.com/BlackStateGroup/APEX/blob/main/docs/vision/RESEARCH_PROGRAMME.md)
- [31-root source catalogue](https://github.com/BlackStateGroup/APEX/blob/main/research/SOURCE_COPIES.md)
- [Source provenance and licensing](https://github.com/BlackStateGroup/APEX/blob/main/docs/vision/SOURCE_PROVENANCE_AND_LICENSING.md)
- [REA control-flow work](https://github.com/BlackStateGroup/APEX/blob/main/docs/REA_CONTROL_FLOW_RESEARCH.md)
- [Phone API feasibility](https://github.com/BlackStateGroup/APEX/blob/main/docs/PHONE_RADIO_FEASIBILITY.md)
- [Synthetic phone-sensing programme](https://github.com/BlackStateGroup/APEX/blob/main/docs/research/PHONE_SENSING_LAB.md)
- [APEX Learn prototype](https://github.com/BlackStateGroup/APEX/blob/main/docs/APEX_LEARN_PROTOTYPE.md)
- [Android native I/Q activation](https://github.com/BlackStateGroup/APEX/blob/main/docs/NATIVE_IQ_ACTIVATION.md)
- [Hardware strategy](https://github.com/BlackStateGroup/APEX/blob/main/docs/HARDWARE_STRATEGY.md)
- [Latest signed-read lab status](https://github.com/BlackStateGroup/APEX/blob/5dfcd75091ccb7365127ac8349f6e586f499a625/docs/SIGNED_READ_LAB_REVIEW_STATUS.md)

Later phone-sensing and mini-model requirements were also checked against the actual 9 November room conversation. Local-only Flipper/clock findings were checked against their preserved source documents and verification records; this survey did not rerun their tests or publish them.