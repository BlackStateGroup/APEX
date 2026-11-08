# APEX continuation: phone-visible evidence and controlled observation

Forty-third local checkpoint, 8 November 2026, against `BlackStateGroup/APEX` commit
`e51750ec0b34b280399877d67e1036058874c373` (`feat/rea-firmware-lab`, draft PR #5).
This is local, unpushed work. No device was scanned, paired, written, flashed or
unlocked. No model provider, account or remote service was connected.

Read the [current dependency and NFC capture addendum](docs/CURRENT_DEPENDENCY_AND_CAPTURE_STATUS.md)
for installed package/license discrepancies and the distinction between legacy
metadata-only saves and explicit selected NDEF payload capture. Historical
licensing/source-mining originals remain unchanged.

## This checkpoint

- **The complete vision and conversation trail are preserved.** The
  [documentation pack](docs/vision/README.md) links 29 requirements, recovered
  historical discussions, explicit gaps, 31 pinned source roots, architecture,
  decisions and a phased native-hybrid roadmap. Its v42 source is a frozen
  historical reference, distinct from this combined v43 checkpoint.
- **Native compute was investigated, not assumed equivalent.** A
  [separate research summary](docs/NATIVE_EXPERIMENT_STATUS_20261108.md) records
  the uncompiled Rust candidate and compiled C++ experiment. Both C++ variants
  fail strict replacement gates, and Rust execution is blocked by missing Cargo.
  The current TypeScript engine remains unchanged. Host timings are diagnostic,
  not mobile speed claims.
- **Own the initial Bluetooth state query.** The installed SDK's implicit initial
  query could reject unhandled and hide its error until a readiness timeout.
  The adapter now uses supported explicit query ownership, handles the SDK error
  once, and retains outstanding work after responsive cancellation. New acquisition
  and destruction cannot cross a pending query; existing connection I/O and cleanup
  remain available. Readiness success waits for drainage, cancellation/deadline can
  still veto it, and later snapshot/error results cannot overwrite a prior state
  event or terminal outcome. Synchronous dispatch uncertainty stays separately
  fenced. See [implementation](verification/owned-state-query/REPORT.md) and
  [independent review](review-evidence/owned-query-independent/REPORT.md).
- **Exact SDK and application paths are covered.** Thirty-two new independent
  checks include actual installed PLX error identity, real deadline behavior,
  retained query ownership and two extracted App-handler→DeviceSession cases.
  The same harness reproduced 26 failures on the stable prior source. Review
  corrected overbroad gating of established I/O and cancellation/event ordering
  before integration. No installed SDK patch or global rejection suppression is used.

This remains local, host-verified work. A pending SDK Promise is not physical
release evidence. No readiness receipt expansion, iOS Reset enablement or native
acceptance is claimed. Module reload/Fast Refresh is not recovery from persistent
uncertainty. All historical failures, corrected fixture assumptions and exact
current input manifests remain explicit. The source below is the full combined
verification point, not a claim that future changes or external prototypes pass.

## Prior checkpoint: readiness cleanup, scan contracts and Mayhem import

- **Readiness cleanup now settles safely.** An injected SDK-listener removal
  failure previously left a connection promise pending, could escape an event
  callback, or allowed a synchronous alternate-contract callback to proceed with
  connection. Readiness now waits for registration and independently attempts
  cleanup, preserving original/falsy errors. Lost SDK subscription ownership
  blocks new acquisition and destructive reset, while an existing connection can
  still close. Normal readiness denial/timeout and local-only cleanup faults do
  not receive that terminal latch. Review also caught and fixed missing cleanup
  handles. See [implementation](verification/readiness-settlement/REPORT.md) and
  [independent review](review-evidence/readiness-independent/REPORT.md).
- **Existing Mayhem recordings have an original bounded converter.** Explicit
  signed-int8 I/Q and a strict three-field sidecar convert to the existing ci16_le
  profile, preserving normalized amplitude, original bytes and separate original/
  derived hashes. The core and read-only CLI are available; no app picker, saving,
  live RF or hardware compatibility is claimed. See [the prototype](docs/MAYHEM_C8_PROTOTYPE.md)
  and [independent review](review-evidence/mayhem-c8-independent/REVIEW.md).
- **Scan evidence matches the installed platform contract.** Actual PLX scan
  callbacks and lifecycle tests now include iOS's void native exports. JS listener
  retirement works, but JS Promise settlement is not iOS native acknowledgment.
  Android Promise completion means adapter-call return, not RF cessation. Earlier
  held-iOS-Promise cases are explicitly alternate-contract tests. Ordinary local
  collection and offline Inspect remain usable; visible wording now describes
  stop requests rather than native release. See [scope correction](docs/PLX_SCAN_SCOPE_CORRECTION.md)
  and [copy verification](docs/SCAN_COMPLETION_COPY_REVIEW.md).

All changes remain local and unpushed. Tests use synthetic RN/native boundaries,
not observed phone failures. SDK ownership latches belong to the module instance;
Fast Refresh/reimport is not safe recovery. The formerly separate SDK initial-state-query
rejection is corrected in v43, described above. Native builds, physical
acceptance, iOS destruction acknowledgment and the firmware-delta review remain
open. No installed dependency, protected historical original or native project changed.

## Prior checkpoint: unissued acquisition and App SDK integration

- **Recover from a connection attempt which never started.** A fresh one-use
  receipt releases only the exact locally unissued attempt: initial cancellation
  or canonical Android permission denial/cancellation before manager acquisition,
  following clean scanner preparation. Malformed results, readiness and issued
  or uncertain native effects remain held. Attempt, device ID and exact rejection
  are bound together; there are no error-string shortcuts or later rehabilitation.
  Independent review caught and corrected malformed permission-map certification
  and unhandled asynchronous proof rejections before integration. See the
  [contract](docs/proposals/ble-unissued-acquisition/IMPLEMENTATION.md) and
  [independent review](review-evidence/unissued-independent/REPORT.md).
- **App handlers reach installed SDK code and the C peer.** Twelve new App
  cancellation cases and six independent cases execute extracted App handlers,
  installed PLX JavaScript, native TypeScript, transport/session and existing C
  callbacks through held permission/setup/write/cleanup stages and stale owners.
  These are not mounted React, native ordering or physical-device tests.
- **A consolidated engineering handoff.** The [grouped guide](docs/ENGINEERING_HANDOFF_20261108.md)
  covers runnable workflows and remaining acceptance gates. The
  [dependency/capture addendum](docs/CURRENT_DEPENDENCY_AND_CAPTURE_STATUS.md)
  reconciles current behavior without editing historical originals. Installed
  PLX's Apache-2.0 LICENSE versus MIT metadata discrepancy remains unresolved.

All nine aggregate stages passed on the exact source recorded below. Focused
counts overlap this aggregate. Production changes in this increment are limited
to BleTransport and native Bluetooth preparation/receipt handling. Dependencies,
firmware, native projects, App and DeviceSession runtime remain unchanged.
Authentic SDK builds, browser/phone/device acceptance, iOS destruction
acknowledgment and the separate firmware-delta review remain open.

## Prior checkpoint: cancellation controls and SDK facades

- **Cancel a native connection while it is busy.** A global connection card now
  exposes an identity-bound cancel action across tabs for native simulator, USB
  and Bluetooth setup. It also covers waiting for a previous session to close.
  The original operation keeps its lock until outstanding work and cleanup settle;
  old or repeated presses cannot touch a replacement. Failed or uncertain release
  remains held for explicit later cleanup. Cancellation does not dismiss OS prompts
  or establish physical release. Independent review reproduced and fixed a
  finalization race before integration. See [the control contract](docs/APP_SESSION_CANCELLATION.md).
- **Actual installed NFC JavaScript is now exercised.** Tests run the unchanged
  pinned 4.2.0 facade through the exact adapter and session/capture controllers,
  with a fake native event/callback bridge. They verify platform-specific error
  conversion, unregister/closure handling and selected one-tag snapshots. Review
  fixed isolation between overlapping test fixtures. Native global-event ordering
  and real release remain unverified; no production NFC defect was established.
  See [the facade boundary](docs/NFC_JS_FACADE_HOST_REVIEW.md).
- **Actual installed Bluetooth JavaScript reaches the C peer.** Tests run the
  unchanged PLX 3.5.1 published ESM manager/device/characteristic code through the
  native adapter, session and existing C data callbacks. Actual C responses cross
  real SDK transaction, event, base64 and error logic. The SDK keeps a notification
  listener until its native monitor promise settles; tests exercise those late
  callbacks instead of assuming remove() completes cleanup. The RN/native bridge
  remains synthetic, and the ESM artifact is not Metro/Hermes acceptance. See
  [the exact scope](tests/plx-facade-host/README.md).

These changes deepen software integration, not physical reception or unlocking.
All source review and host-fixture limits remain explicit. Real browser/native/device
acceptance, iOS destruction acknowledgment, authentic SDK builds and the separate
blocked firmware-delta review remain open. No installed dependency, firmware,
native-project or CI source changed.

## Prior checkpoint: native acquisition corrections

- **Native client now exercised through actual C replies.** The exact native
  TypeScript adapter joins BleTransport and DeviceSession to the existing bounded
  C data-callback fixture. Simulated Android and iOS paths are kept distinct,
  including permission and MTU handling. Actual C identity, capabilities, CRC/IDs,
  512-byte ping and marker-shaped fragmentation cross the complete software chain.
  React Native, PLX, SDK scheduling and radio behavior remain explicit fakes.
- **Cancellation stops new setup work.** This integration reproduced a real source
  defect: a late Android permission grant could initiate a new connection after
  the session had closed. A reviewed optional acquisition signal now stops the
  next setup phase while retaining already-issued raw calls until settlement and
  cleanup. Immediate cancellation before dispatch issues no driver call. Generic
  dispatched rejection remains conservatively unknown; abort is not release proof.
  See the [correction and limits](docs/NATIVE_ACQUISITION_CANCELLATION.md).
- **Detached app handlers cannot acquire another session.** Actual App handler
  execution reproduced native acquisition after unmount while an earlier close
  was pending. Reviewed attachment, mount, operation and exact-session guards
  prevent that path and stale UI publication. Busy-state publication also precedes
  browser refresh so an older completion cannot clear a reentrant successor.
  See the [application correction](docs/APP_NATIVE_ACQUISITION_GUARDS.md).

Before-fix failures and independent checks are retained. These are source/host
integration results, not mounted React, native binary, browser or device acceptance.
Installed iOS destruction acknowledgment remains unresolved. The separate denied
SDK initialization/configuration delta review remains open and was not retried,
delegated or rerouted. No firmware, installed dependency, native project or CI
source changed in that prior increment.

## Prior checkpoint: bridge and build preparation

- **Actual browser-client to C protocol chain.** A bounded fake GATT bridge now
  joins the real WebAxpManager, BleTransport and DeviceSession to the existing C
  data callbacks and portable core. Actual C-generated READY, identity,
  capabilities and ping responses cross that chain, including a maximum payload
  and the earlier marker-shaped fragmentation edge. Six integration cases and
  sixteen independent infrastructure fault cases pass. SDK startup is never
  called by this bridge; browser, native and physical behavior remain unverified.
  See the [integration scope](docs/features/browser-c-roundtrip.md).
- **Reviewed future build orchestration.** A build-only helper selects the separate
  derivative target, isolates source/configuration and refuses an existing output.
  It checks exact SDK/submodule pins, effective off/on configuration, nonempty
  artifacts and bounded raw-byte logs with explicit process cleanup. Eighteen
  process/filesystem fixture cases pass. These synthetic fixtures are not SDK
  builds. The helper requires a future authorized, already-provisioned SDK; it
  does not install, flash, monitor or close the independent firmware review gate.
  See the [build contract](docs/REVIEWED_IDF_BUILD.md).
- **Owned-bench acceptance is specified, not executed.** The
  [browser/derivative plan](docs/BROWSER_DERIVATIVE_ACCEPTANCE.md) distinguishes
  prerequisite blocks, unrun cases, local release and physical evidence. Every
  case remains unrun. It supplies no device-operation permission.

No production firmware, core, application, installed dependency or CI source
changed in that prior increment. Focused counts overlap the aggregate and are not
additional tests. Fresh independent review of the existing SDK source delta,
authentic SDK builds, real browser acceptance and physical-device acceptance
remain open.

## Latest device integration

**Open review gate:** the final ESP32-S3 SDK initialization/configuration delta
has local regression evidence but no fresh independent approval. Earlier
independent review covers its prior exact source, not the final delta. See the
[delta report](review-evidence/esp32s3-callout-init/REPORT.md). No SDK build or
physical acceptance has been established.

- **Functional browser AXP path.** Eligible secure browsers can explicitly choose
  an authorized custom-service accessory, connect through actual READY negotiation,
  and use the shared Console for identity, capabilities and ping. Local ownership
  survives navigation/remount; cancellation fences before cleanup, uncertain
  operations block replacement, and retry is explicit. The real host binding is
  implemented but has not been executed against a browser or physical accessory.
  Standard Safari/iOS browsers remain unavailable. See the [application guide](docs/features/web-axp-application.md).
- **A demonstrated framing defect fixed.** After initial readiness, a valid data
  fragment equal to AXP_READY is now delivered rather than swallowed. Independent
  CRC-valid ping/session tests reproduce the old failure and verify the minimal
  fix, including pending subscription and closure edges.
- **Actual target source restored and exercised.** Six missing original ESP32-S3
  files are restored exactly. A host harness compiles the actual transport C with
  explicit fake SDK interfaces and real portable core. It reproduces response
  loss on overflow, stranded retries and repeated-subscription state loss in the
  historical target. Green characterization tests do not fix those faults or
  establish ESP-IDF/board compatibility. The target advertises and can erase
  default NVS during specific initialization recovery; it was not run or flashed.
- **A separate revised firmware target.** The preserved historical implementation
  remains untouched. An opt-in derivative atomically stages parser/output admission,
  rejects overload without silently losing replies, fences on failed transfer or
  scheduling, and treats repeated subscription idempotently. BLE startup defaults
  off and automatic NVS erase is removed. Actual-source host tests pass; independent
  fault/mutation review covered the prior source. The final SDK guard has regression
  coverage but fresh review is open.
  SDK configuration, compilation and physical behavior remain unverified. See the
  [target contract](firmware/esp32s3-reviewed/README.md).
- **Build blockers are explicit.** Android SDK/NDK/Gradle caches and ESP-IDF were
  not found in the inspected cloud environment; the Mac was offline. Java 21
  compiler modules exist despite the absent javac launcher. No toolchain was
  installed, no SDK terms accepted, and no native target was built. See the
  [dated audit](docs/DEVICE_BUILD_AUDIT_20261108.md).

## Implemented

- **Offline BLE and BTHome interpretation.** Bounded Android advertisement bytes
  and separate iOS normalized fields, Eddystone TLM/UID/inert URL and a supported BTHome v2
  numeric subset. Unknown, malformed and encrypted data remain explicitly
  uninterpreted. Raw source and provenance are retained.
- **Exact selected phone-source evidence.** BLE-PLX 3.5.1 selected fields preserve
  missing/undefined/null distinctions, Android scan bytes, and iOS opaque JSON
  base64. Source import, interpretation, explicit save and digest-verified replay
  are integrated in Analysis and Evidence. These are selected fields, not whole
  RF captures, authenticated identities or proof of physical reception.
- **Experimental foreground BLE collection.** A native-only Devices card selects
  an advertised FCD2 or FEAA UUID. Service-data-only BTHome broadcasts can be
  missed; this is not yet a general BTHome collector. Explicit collection is bounded to 10 seconds,
  25 callbacks and 65536 serialized characters. Stop, background and tab-leave
  handling attempt to release the shared scanner. Failed or timed-out SDK cleanup
  discards retained sources and blocks inspection/reuse until explicit successful
  Android recovery. A selected callback can be transferred
  to Analysis and explicitly interpreted/saved. No automatic save, pairing or
  device command is performed. Native behavior still needs device validation.
- **Offline NFC/NDEF workbench.** Strict NDEF framing, UTF-8/UTF-16 Text and all
  assigned URI prefixes, with opaque unknown/nested/chunked content and retained
  raw offsets/tails. URI text is inert. Exact document persistence and
  digest-verified reopening are integrated. The native NFC metadata reader has
  not been upgraded to raw-message capture.
- **Offline BLE experiment comparison.** Exact selected-source trials can be
  grouped explicitly and compared by payload offset, value counts and listed-order
  runs. Source/platform groups stay separate. Conditions and receipt references
  remain user declarations; no field mapping, decryption or control is inferred.
  A separate Analysis card now displays source-separated summaries, 16-offset
  pages and selected-byte counts. Its exact draft/report remain in memory only. A separate form now builds valid
  grouped datasets from explicitly staged selected-source documents, preserving
  exact inner strings, source aliases and user-declared receipt references.
  Stage, declare, add, Build and Use remain separate actions; no automatic saving
  or comparison is triggered.
- **Offline I/Q inspection.** A narrow SigMF 1.2.6 ci16_le profile preserves and
  hashes exact metadata/data bytes, checks optional SHA-512, reports digital
  amplitude/DC/rail hits (possible clipping), and computes a bounded periodic-Hann
  complex FFT. The core and Node tool now also have the explicit memory-only app inspector
  described below. This is not phone RF acquisition, calibrated power, modulation
  recognition or an app attachment store.
- **Normalized phone NDEF import and evidence.** A source-verified adapter preserves
  Android hex record IDs versus iOS byte-array IDs, with separate inert Text/URI
  projections. A separate offline Analysis card supports explicit import, interpretation,
  exact-document saving and digest-verified reopening. It does not reconstruct
  original wire framing. The existing metadata reader and its automatic metadata saves
  remain separate from the new explicit one-tag capture below.
- **Filter coverage is visible.** Validated BLE inputs and verified reopened
  evidence explain service-data presence separately from advertised UUID lists.
  A distinct synthetic announced-FCD2 fixture is retained without modifying the
  canonical service-data-only example. Actual delivery remains unverified.
- **Unambiguous source imports.** Duplicate JSON keys, escaped aliases and
  excessive nesting are rejected without rewriting exact source documents.
- **Safer analysis contracts.** Invalid provider attribution, non-data objects,
  mutated inputs and abort/timeout races have regression tests. No AI provider
  is connected; “Astra” has not been identified as an integration target.
- **REA and source preservation.** Real pinned REA 6.8.0 supervised GNU objdump
  against the owned APEX host binary, without executing that inspection target.
  A bounded private snapshot now supplies consistent bytes to each analyzer;
  cleanup succeeds before report publication, output is exclusively reserved, and
  error diagnostics/partial reports are preserved. Source equality is checked at
  endpoints, not claimed continuously or against hostile same-user mutation.
  Before/after and saved evidence SHA-256 agree. Source restore/archive safety
  fixes preserve dirty/untracked work, exact pins and existing backup records.

- **Declared numeric BLE candidates.** One operator-supplied byte layout can be
  checked against designated discovery/held-out readings using exact rational
  arithmetic. Only complete supported public BTHome/TLM formats qualify; no
  fitting, protocol discovery, calibration or physical sensor validation is claimed.
  The Analysis tab now exposes the checker with exact fractions, separate
  source/subset summaries and four-row pages. Drafts remain in memory only.
- **Additional BTHome scalar coverage.** Pinned public temperature, humidity,
  pressure, voltage, current and other supported numeric fields are interpreted
  without extending unknown/encrypted handling or claiming hardware validation.
- **Native-build source parking.** Source references remain parked until the
  tracked POSIX child process group is proven absent. Signals, surviving children,
  uncertain probes, destination conflicts and recovery metadata receive synthetic
  regression coverage. Actual native builds remain unrun.
- **Capability evidence labels.** Current offline evidence, historical native
  builds and still-unverified device acceptance are distinguished in the UI.

- **Strict stored evidence envelopes.** Duplicate decoded JSON keys are refused
  before canonical digest verification, including conflicting payload keys and
  escaped aliases. Existing valid record schemas and digests remain unchanged.
- **NFC lifecycle ownership.** Start/Stop, cancellation, singleton listeners and
  failed cleanup now keep a lease until native operations settle. iOS also waits
  for its close event. Stop remains usable during startup. The existing metadata retention scope and
  permission requests are unchanged; this is mocked/source-reviewed behavior.
- **Service-data matching preparation.** A pure matcher checks Android raw AD
  bytes separately from iOS normalized fields before source retention. It rejects
  ambiguous/malformed inputs and returns no callback or payload references. No
  automatic broad fallback is present. A separate explicit Android opt-in card
  now calls the reviewed exclusive-manager backend described below.

- **Bounded service-data session foundation.** A pure lifecycle controller caps
  processed callbacks, retained matches and characters, checks a cooperative
  monotonic deadline, and requires exclusive ownership plus confirmed teardown.
  Late/uncertain operations poison reuse. Independent mock review found no
  blocking issue under its explicit backend contract. A separate Android-only
  opt-in UI now calls the native adapter, with uncertainty fenced until explicit
  successful recovery. Browser and phone acceptance remain unrun.
- **I/Q time-frequency overview.** Explicit window/hop/frame options produce at
  most 64 frames and 16,384 frequency cells from prepared exact bytes. Common
  frequency axes and nominal sample times stay distinct from RF truth. A private
  shared FFT kernel preserves the old output; no acquisition, recognition or
  calibration was added.

- **Explicit one-tag phone NDEF capture.** A separate native Devices card copies
  selected normalized record fields into memory, then waits for confirmed reader
  release before explicit Inspect. Interpretation display and saving remain
  separate actions. The 30-second cooperative acceptance window includes preparation
  and uses a monotonic clock independently of receipt wall time. First-callback,
  invalid/oversized input, cleanup uncertainty, inactive/background transitions and
  stale callback cases are covered by mocks. Original serialized wire bytes are
  not reconstructed, and URLs remain inert.
- **BLE connection ownership and recovery.** Every connection attempt owns its
  lease through confirmed cleanup, independent of notification subscribers.
  Source-backed terminal-event fences control same-identifier reuse. Pending writes
  and ordinary scan start/stop promises stay fenced after JavaScript timeouts.
  Android has an explicit Reset APEX Bluetooth control; it does not change the OS
  Bluetooth setting, restart work, or close USB/simulator sessions. Hung native
  operations may still prevent recovery.
- **Android service-data acquisition backend.** A new callable adapter explicitly
  requests broad SDK advertisements, matches selected service data before source
  retention, and holds exclusive singleton ownership until settled Android
  teardown. A separate Android Devices card now requires one-session opt-in and
  explicit Start; it is never a fallback for the existing filter.
  iOS is gated off: the pinned bridge's void destroy method lacks native completion
  acknowledgement. Best-effort iOS shutdown cannot mark ownership released. No
  device acquisition or native compatibility is established by this source work.

- **Source-reviewed iOS bridge proposal.** An unapplied, exact-version/hash-guarded
  native patch would acknowledge local adapter invalidation, not RF silence or
  physical disconnect. Its three tests only check source structure and temporary
  fixture application; installed dependencies and the iOS availability gate are
  unchanged. Void start/stop exports and native queue assumptions remain explicit
  build/interop/device acceptance requirements.

- **Held-session controls.** An unexpected disconnect can clear capabilities while
  the app still holds its session. Disconnect now remains available for that held
  session, and observation controls use the same reference-based condition. Old
  session callbacks cannot clear a replacement session's UI. Native ownership and
  cleanup requirements remain independent of releasing the local session.

- **Exact I/Q window energy.** A separate offline core and CLI compare bounded
  selected-window mean I²+Q² against an explicit rational threshold using exact
  integer arithmetic. Above-threshold runs preserve unmeasured gaps. ADC count
  units, nominal time and complete-file hashes are explicit; no signal identity,
  calibrated RF power, physical burst boundary or native acquisition is inferred.

- **Advertised-UUID cleanup fencing.** The older observation path now discards
  sources after failed/timed-out SDK cleanup, prevents Inspect and restart, and
  synchronously fences competing App actions before busy is released. Explicit
  successful Android Reset clears the fence without restoring old sources or
  restarting. Ordinary iOS SDK reuse is not native teardown acknowledgement.

- **Foreground start dispatch.** Metadata NFC and ordinary AXP discovery now check
  current lifecycle state when dispatching Start, including queued events after
  background cleanup. NFC Stop still works during startup and backgrounding;
  this does not prove already-pending native work has finished.
- **Legacy recording state.** NEC/CAN/REA edits clear prior reports immediately.
  Pending saves keep their selected summary, and a successful insert remains
  consumed even if the evidence-list refresh then fails. Existing derived-summary
  schemas and source labels are unchanged.
- **Verified selected-record bundles.** A separate offline core and read-only CLI
  preserve explicitly selected record strings, verify existing content digests,
  and check a whole-bundle digest before preview. Selection/order and exact inner
  source strings remain covered. These unencrypted bundles are not signatures,
  complete-journal backups, or restore functionality; no actual user data was exported.
- **Exact selected-lag I/Q comparison.** A separate offline diagnostic reports
  bounded complex correlation and exact normalized squared ratios at explicit
  positive lags. Zero-energy normalization is unavailable, not zero. DC/tones can
  correlate at every lag; no repetition period, signal identity or protocol is inferred.

- **Whole-recording edit rejection.** Legacy NEC/CAN/REA input no longer relies
  on a widget cap that can discard a pasted suffix before validation. Oversized
  edits are refused whole without retention/parsing, the prior bounded draft stays
  visible, and analysis/save stays blocked until an accepted replacement. Browser
  and native widget behavior still needs acceptance testing.
- **Runnable synthetic lab and checkpoint runner.** The first complete runner
  execution passed all nine stages on clean d973a20. The current combined run on
  clean de30849 includes Flipper UI, I/Q phase increments, reviewed transport
  cleanup, strict AXP responses and the expanded walkthrough; exact results are in
  verification/increment43-final/result.json. `node tools/demo-offline-lab.ts`
  demonstrates exact BLE preparation, declared trials/candidate checks, inert
  NDEF, memory-only evidence/bundle verification, synthetic Flipper responses and
  I/Q diagnostics in one deterministic report. No partial success is printed on
  late failures. Fixed timestamps and every stage remain synthetic.

- **Offline Flipper response observations.** An independently written reader
  inspects bounded length-delimited identity, version and power replies using the
  project's existing exact schema/firmware pins. It preserves original bytes,
  unknown fields, presence/default distinctions and incomplete tails. It neither
  sends commands nor assembles or authenticates a live session. Upstream schema
  reuse licensing, transport compatibility and physical testing remain open gates.
- **Strict optional-provider response JSON.** Duplicate decoded keys and excessive
  nesting now fail before hypothesis validation, including overwritten observation
  references. Valid output schema, attribution and explicit export-selection rules
  are unchanged. No provider is connected and no Astra endpoint is assumed.

- **Stable I/Q input snapshots.** Pure imports now use intrinsic fixed-buffer byte
  sizes and a validated own-data context copied before asynchronous hashing.
  Spoofed sizes, changing getters, shared/resizable storage and proxy views reject.
  Valid existing arithmetic, metadata and hashes retain exact parity.
- **One-command offline checkpoint.** A fixed sequential runner records exact
  source revision/status, commands and bounded logs, independently settles child
  process groups and publishes a final result without replacing existing output.
  It never installs dependencies or substitutes listed browser tests/JS exports
  for browser, native or device acceptance.

- **Memory-only Flipper response UI.** Exact bounded hex drafts, declared
  provenance and explicit Inspect now feed immutable observations. Four-frame
  and eight-field pages show presence/defaults, status and incomplete-tail limits
  with inert quoted strings. No commands, live transport or persistence.
- **Explicit I/Q phase increments.** Up to 512 selected sample pairs report exact
  complex products/energies, principal phase and nominal frequency offsets with
  visible alias spacing. Zero endpoints remain unavailable. No unwrapping,
  carrier inference, symbol/protocol recovery or acquisition is added.

- **USB ownership and bounded writes.** Permission/open, late terminal events and
  pending writes retain one lease per native object. Writes are copied from actual
  fixed-buffer 1..524-byte inputs with sixteen active/queued slots. Failed native
  close stays uncertain even if retry becomes a no-op; no false recovery is claimed.
- **Session/BLE cleanup retention.** A locally closed session is distinct from
  transport release. Failed cleanup keeps the app's exact retry handle. BLE retains
  raw pending effects and exact GATT ownership; automatic cleanup failures are
  shared, explicit retry remains separate, and late final-chunk success is rejected.
  Native manager/Kotlin source and platform acceptance gates remain unchanged.

- **Strict AXP response parsing.** Duplicate decoded fields, oversized actual byte
  views, excessive nesting and non-scalar source values are rejected. Valid extra
  fields and raw ping remain compatible. Malformed device-error JSON stays generic;
  this does not authenticate device identity or change cleanup ownership.
- **Expanded synthetic walkthrough.** Manually authored Flipper version responses
  distinguish absent/default/status fields. Selected I/Q phase pairs expose exact
  products, energy, principal offsets and aliasing, with complete source hashes.
  One deterministic summary is emitted only after every assertion succeeds.
- **USB cleanup receipt design.** Source-grounded ownership/receipt requirements
  and blockers are documented without changing active native code. A corrected
  hypothetical model is separately tested; actual handles, native concurrency,
  bridge delivery and ambiguous OS effects remain unresolved acceptance work.

- **Protocol byte integrity.** Encode, CRC and streaming decode use actual fixed
  nonshared byte views rather than caller iterators or shadowed sizes. Encoding
  captures metadata once and preserves wire limits/golden output. Streaming stays
  fixed-buffer; callback mutation and immediate reentrancy remain explicit.
- **Evidence bundle preview.** A separate memory-only Evidence card verifies
  existing selected bundles and shows four bounded metadata summaries per page.
  Immutable reports, whole-edit rejection and activation/generation guards prevent
  changed or stale data retaining verified status. No restore, export or journal
  access. Digest checks are not authentication or completeness guarantees.

- **Offline infrared remote files.** A narrow ordinary Flipper .ir core/CLI
  inspects declared standard NEC fields and bounded raw durations, retaining exact
  source, hashes and line ranges. Raw recognition uses the whole sequence under
  the pinned first-mark convention. Carrier/duty are declared settings, not
  measurements; exact decimals and rounded projections stay distinct. No
  transmission, replay, device control or phone IR capability was added.

- **Memory-only IR workbench.** Analysis now exposes explicit declared-provenance
  inspection with four-record pages and compact timing summaries. Immutable state,
  whole-edit rejection and old-action/result fences preserve current observations.
  The local hash identifies the accepted ASCII draft, not guaranteed original file
  bytes before clipboard processing. No persistence, export or native acceptance.

- **Offline HCI advertising inspection.** Exact bounded btsnoop/H4 files now have
  opaque paged metadata and explicit selected legacy advertising inspection.
  Reports retain separate data, source offsets, timestamps, addresses and existing
  AD interpretations without pooling scan responses. Hashes establish supplied
  byte equality, not authenticated capture history, RF samples or device identity.
  Unsupported packets remain opaque. Explicit extended-event selection now
  exposes structurally checked header metadata only; advertising data is never
  returned or reassembled, even when a final fragment is marked complete.
  Conditional PHY meanings and reserved/contradictory fields remain explicit.
  Synthetic review only; no actual logs, settings, acquisition or native actions.

- **Memory-only HCI workbench.** Analysis accepts explicitly declared, bounded
  strict hex bytes, then separates metadata inspection from selected legacy
  reports. Four-row pages, private immutable source handles and lifecycle fences
  retain current results. Actual AD framing and service/BTHome parse statuses are
  shown separately from transport acceptance. Hashes cover decoded supplied bytes,
  not guaranteed pre-paste files. The visible input draft is separate from opaque
  metadata results. Local native byte hashing remains source/mock-tested only.
- **Broader reproducible synthetic lab.** The one-command walkthrough adds exact
  manually authored IR and HCI examples with whole-array/source/hash assertions.
  Opaque packets and extended payloads remain omitted. Malformed fixture hex is
  rejected before decoding; late failures produce no partial success. Removing
  just these new summaries exactly recreates the original stages and output hash.

- **Explicit extended HCI workbench headers.** The same memory-only card now
  selects extended headers separately from legacy reports. Four-row pages expose
  conditional field meanings and applicable addresses without advertising data.
  Switching kinds clears the previous selection, including on failed framing.
  Terminal complete can still be a final fragment; no reassembly is performed.
- **Offline static NFC data areas.** A separate core/CLI inspects an explicitly
  declared 48-byte static area or narrow 64-byte structure, retaining exact hashes
  and offsets. Whole-region TLV acceptance precedes any NDEF decoding; unknown
  controls/length forms stop the scan, multiple messages remain ambiguous, and
  NDEF errors remain distinct. UID/locks, proprietary and trailing bytes stay
  opaque. This is a vendor-fact-based APEX subset, not generic tag compatibility,
  security/access proof, current-spec certification or a licensing determination.

- **One inspector at a time.** Analysis now has a memory-only thirteen-choice selector
  instead of activating every workbench together. Stable mounted controllers keep
  their existing drafts. BLE and phone-NDEF handoffs select the correct inspector;
  successful BLE staging opens trials without interpreting or saving. IR/HCI and
  static-NFC results clear on inspector exit; other retention rules are unchanged.
- **Memory-only static NFC workbench.** The new static profile is available through
  an explicit separate mode/provenance/Inspect flow. It rejects whole invalid edits,
  hashes exact decoded bytes and shows bounded TLV, NDEF record and issue pages.
  An empty data-area example and complete inert APEX Text structure are manually
  authored and never automatically inspected. No tag read/write or journal added.

- **Explicit selected HCI documents.** One complete selected legacy advertising
  event can now be prepared as a bounded single-record derivative. Its exact
  original file header and record are retained, excluding unrelated records.
  A separate strict read-only CLI reopens the document, verifies its binary digest
  and whole-event structure, and recomputes interpretations. Original capture
  hash, size, record index and offset remain explicitly UNVERIFIED references.
  A selected event can still contain multiple advertisers or sensitive identifiers;
  this is neither anonymization nor authenticated origin. Default metadata and
  ordinary selection are unchanged. Explicit journal retention is described below.

- **HCI document workbench.** Explicit Prepare, Open and Verify/reopen are separate
  actions. The eleventh inspector receives exact JSON once, retains bounded manual
  drafts without normalization, and distinguishes derivative verification from
  unverified original references. Shared four-report summaries preserve AD/service
  status counts. Edits, repeated selection, Clear and inspector exits fence stale
  hashes and actions. No file import, export or clipboard writes are added; local
  save is a separate explicit action after successful verification.

- **HCI evidence retention with two integrity checks.** A current verified selected
  document can be explicitly saved exactly to the local journal. Save, verify and
  bundle paths require both the unchanged canonical envelope digest and full binary
  derivative/legacy validation; a newly signed outer hash cannot bless invalid
  inner bytes. Missing byte-hash capability fails closed for this new kind. Listing
  remains structural and unverified. Reopening privately snapshots the record and
  checks the derivative again before showing bounded read-only content. Dispatched
  saves retain their original snapshot and pending lock across edits, Clear and
  navigation. Original capture references remain UNVERIFIED. Existing kinds and
  their canonical digest contracts are unchanged.

- **Explicit HCI report comparison.** A separate pure API and read-only CLI verify
  two whole selected-event documents before comparing explicit report indices.
  Advertising-data rows preserve AD headers, positional differences and absent
  bytes without alignment, pooling or sender/field inference. Original references
  stay UNVERIFIED. The twelfth app inspector adds independent exact left/right
  drafts, explicit Verify/select/Compare, bounded pages and stale-work fencing.
  Current verified document reports can be staged once to a named slot; staging
  never verifies or compares automatically and does not cancel a pending save.

- **Explicit app I/Q inspection.** The thirteenth inspector stages a bounded local
  metadata/data file pair on web and reads exact bytes only after explicit Inspect
  checks both sizes. Native arbitrary-file import remains unavailable; a manually
  authored zero example supports the same inspection path. Exact-byte digests,
  declared provenance, digital statistics and eight-bin FFT pages are shown without
  storage, upload or acquisition claims. One outstanding job retains ownership
  through actual settlement, with stale-work and synchronous-observer fencing.
- **Shorter HCI document action path.** Editable Verify/Clear/Save and status now
  precede the duplicate exact-JSON preview, which is initially collapsed and bound
  to the current draft/activation. Warnings and read-only journal behavior remain
  unchanged. This is source/static coverage, not phone-layout acceptance.

- **Selected I/Q FFT windows.** The app can stage an explicit size and start sample
  before Inspect, with complete-window bounds checked before either file is read.
  Invalid edits block inspection without falling back to previous settings. Default
  short-file statistics behavior is unchanged. A separate exact integer example
  switches from positive to negative quarter-cycle digital samples, making window
  selection visible without pretending to represent a physical transmitter.
  Settings changes fence outstanding work, and actual window bounds accompany
  eight-bin pages. Core math and existing example hashes remain unchanged.

- **App time-frequency frames.** Explicit FFT/start/hop/frame settings now show a
  bounded overview and selected-frame bins within the existing I/Q inspector.
  Complete geometry and cell budgets are checked before either source read. The
  mode runs only selected transforms and explicitly omits full-file statistics.
  Four frame summaries and eight bin rows preserve nominal times, exact source
  hashes and relative-unit values; uncovered sample positions are not missing
  acquisition. Large output stays private and stale work remains fenced.
- **Original foundation documents recovered.** Fifteen missing README targets,
  including historical design and simulator image files, were restored as 147,233
  exact bytes from the pinned original commit. Independent hashes and a filtered
  provenance manifest preserve their historical status. They were omissions from
  this selected local reconstruction, not upstream loss. Existing license and
  source-copy registers are unchanged; old capability claims are not acceptance
  of the current continuation.

- **Direct I/Q peak navigation.** A separate explicit action jumps to the page
  containing the already reported peak in the current spectrum or selected frame.
  It preserves source, report and frame selection without new reads, hashing or
  computation. Null peaks remain unavailable and stale callbacks cannot navigate
  newer results. This is display navigation, not a new signal inference.

- **Exact energy/threshold workbench.** A fourth I/Q mode stages six separately
  validated activity settings and invokes the unchanged exact integer/rational
  core. Window geometry, cell budget and threshold validity are checked before
  reads. Bounded frame, run and measured-interval pages distinguish strict-above
  from equality and preserve gaps. No incidental FFT, full-file statistics or
  inferred noise threshold is computed. Six visible field labels and stale-work
  fencing are covered by independent source/host tests; this does not identify
  physical bursts, senders or calibrated RF power.

## Validation at this checkpoint

- **2081 Node tests**, **22 Python archive tests**, **5 REA preflight tests**:
  2108 tests total, plus portable C build/checks.
- Full semantic TypeScript checking passes. The final combined 2081-test run and
  all three JavaScript exports include the candidate workbench, strict evidence envelopes, reviewed NFC lifecycle repairs, service-data session foundation, I/Q time-frequency overview, explicit phone NDEF capture, BLE ownership/recovery, the Android service-data backend and its separate opt-in UI, trial authoring and
  held-session control corrections, advertised-UUID cleanup fencing and offline
  I/Q activity inspection, foreground dispatch, legacy recording state, selected-record
  bundles, selected-lag I/Q comparison, whole-edit input refusal and the synthetic
  lab walkthrough, offline Flipper response inspection and strict provider-response JSON.
- Offline Expo web, iOS and Android JavaScript exports pass. These are not native
  builds or evidence of phone compatibility.
- Four additional checks render the actual observation TSX through React DOM
  server with narrow native mocks. They cover initial controls/disclosures only,
  not mounted effects, events, layout, browser or phone acceptance.
- Forty browser scenarios are authored and discoverable; none executed here.
  Existing Chromium fails before page creation with `socket() EPERM`. The
  managed browser cannot reach this executor's localhost (`ERR_CONNECTION_REFUSED`).
  No successful screenshots or browser acceptance are claimed.
- Initial unrestricted-concurrency host run passed 217/218, with an existing REA
  subprocess hitting its 30-second timeout. Its exact failure is retained. The
  isolated REA suite and the entire two-worker-concurrency suite then passed;
  no timeout or assertion was removed.
- An independent Python Fraction/int.from_bytes oracle matched all 2,400
  synthetic numeric-candidate rows (1,200 generated datasets), including missing
  fields and tolerance boundaries. This is software arithmetic, not sensor truth.
- I/Q kernel extraction matched 50 complete previous single-window reports and
  100 time-frequency windows exactly across every supported FFT size. New
  overlapping off-bin frames also pass an independent direct DFT check.
- Independent I/Q energy review passed 305 separate integer-prefix oracle checks,
  spanning signed int16 values, 100-digit rational threshold boundaries, interval
  coverage, nominal times and JSON output. These were synthetic arithmetic checks.
- A separate Python integer oracle verified the actual lag CLI across 13 synthetic
  cases and 511 exact rows, covering every signed int16 value in compared samples,
  complex orientation, energies, Cauchy bound, sample geometry, times and hashes.
- I/Q numerical review compared independent DFT values at every supported FFT
  size, with maximum observed complex error 1.11e-11. Differential byte matrices
  matched an independent Python oracle across 250 datasets and 3000 payloads.
- Native scan lifecycle and UI coordination received independent mocked review,
  including delayed start/stop, unknown manager state, pending connection setup,
  stale handles, exact source retention and cleanup before lease release.
- NDEF framing/Unicode received independent review, including 90,000 Unicode
  oracle comparisons and 6,912 framing combinations in addition to checked-in
  tests. This does not establish native NFC reception.

Five further checks render actual Flipper JSX with bounded pages, explicit
provenance/defaults/tails and inert escaped content. Nineteen independent UI
controller checks passed after fixing mutable aliases and action-getter rereads.
A Python integer/atan2 oracle matched 4,012 sample-pair rows over 61 actual phase
CLI runs, including 33 atomic refusals. These remain synthetic software checks.

Independent USB/session/BLE review reproduced and repaired cleanup races before
this combined run. Seven additional synthetic full-session USB tests cover AXP
negotiation, maximum ping framing and retained cleanup uncertainty. These do not
establish actual native release, permissions, bridge ordering or device behavior.
The unchanged Kotlin source hash is retained with the final source checks.

The response parser passed an independent 104-check focused review. The initial expanded
walkthrough passed 25 independent focused checks and produced 5796 bytes. The later
IR/HCI expansion passed 16 overlapping checks and now produces 8806 bytes, including
its final newline; removing only the new fields restores the earlier output exactly. USB receipt design checks passed separately (16 in
the independent hypothetical model run), not within the 2108 aggregate tests and
not as evidence of native behavior. Original failures and model limits are retained.

The protocol boundary passed 27 independent focused checks, six real host-C
integration checks and a 123-check integrated session subset. The bundle preview
passed 26 independent focused checks after repairing verified-data aliases and
long timestamp rendering. Existing core digest rules and exact strings remain
unchanged. These overlapping counts are not additional aggregate totals; mounted
React, native hashing, visual layout and real paste behavior remain untested.

The offline IR importer passed 15 independent combined focused checks after fixing
an exact-decimal range error, plus four separate actual CLI failure/symlink checks.
Independent oracles cover all 256 parsed values and 256 raw complementary-byte
pairs. These are software input interpretations, not physical remote compatibility.

The IR workbench passed 26 independent focused checks with actual static TSX
projection and default/local hash parity. Review corrected the accepted-draft
versus original-file disclosure before this combined run. These remain source/
controller checks, not mounted widget behavior or native hashing acceptance.

The exact lockfile installation was authorized and completed in an isolated
copy with lifecycle scripts disabled: 503 platform-applicable packages, 541
locked inventory entries. No new runtime dependencies or lockfile changes. Exact original native module
files and the protected build wrapper have also been restored and SHA-verified.
Subsequent work reuses that installation. Lockfile SHA-256:
`8a9d0da060c260fb3009fecf79036c22fde1faf2737c0a5f4bf4c629901f1e74`.
Original source-register blobs remain unchanged (31 pins, 32 backup identities).

The ordinary C checks pass. The earlier ASan/UBSan command compiled but could
not run LeakSanitizer under this host's ptrace environment. A separately recorded
leak-disabled ASan/UBSan run passed, but it does not close the full sanitizer gate. Ghidra/JDK installation, persistent-worker acceptance and native
Android/iOS/ESP32 builds remain separate unfinished gates.

## Next acceptance gates

1. Run the authored UI suite and inspect screenshots on a browser-capable host.
2. Compile on provisioned Android/Mac builders. Read-only Expo introspection
   passes; the Java compiler module is available but Gradle discovery and Android SDK/NDK
   are not established, and Mac/Xcode/Pods are unavailable here. The Bluetooth
   purpose description now includes observation, with no permission expansion.
3. Validate the new Android service-data backend before relying on it: current Android UUID-list
   filtering excludes canonical BTHome broadcasts unless a matching service list
   is also delivered. Broad SDK scanning would cache unrelated devices before JS
   filtering, so no silent broad fallback was added. Its explicit mode requires per-session
   UI opt-in and still needs device acceptance. iOS additionally needs reviewed native teardown
   acknowledgement; ordinary iOS advertised-UUID matching remains unverified.
4. Build an Android/iOS development app, then explicitly test one owned lab
   sensor/tag with recorded model, OS, permission state and ground truth.
5. Treat BLE observations, NDEF messages, Wi-Fi metadata and accessory RF samples
   as different acquisition paths. Arbitrary sub-GHz/IQ reception and universal
   unlocking are not demonstrated capabilities.

Details and logs are in `docs/` and `verification/`. Existing remote CI run
[41470498298](https://github.com/BlackStateGroup/APEX/actions/runs/41470498298)
predates these local changes and is not validation of this checkpoint.
