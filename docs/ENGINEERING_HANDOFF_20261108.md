# APEX engineering handoff · 8 November 2026

## Start here

This consolidates the ongoing local continuation at tested source snapshot
`de3084959e9c1ff455c98c820ec0416ea5f0991c`. Work is local and unpushed.
APEX now has substantive bounded offline analysis, explicit selected-source
capture/evidence workflows, and AXP session integration through real installed
JavaScript SDK code and host C replies. It is not yet a phone/accessory-accepted
product. Universal unlocking, arbitrary phone RF access and authenticated device
identity are not established capabilities.

Use this document as the grouped entry point; use [APEX_CONTINUATION](../APEX_CONTINUATION.md)
and [continuation.json](../verification/continuation.json) for checkpoint detail.
The latest complete aggregate is **v43**, tested on clean source `de3084959e9c1ff455c98c820ec0416ea5f0991c`:
2,081 Node +22 archive +5 preflight = 2,108, zero skips. All nine stages and
process groups passed. Forty browser cases listed, **zero executed**; TypeScript,
portable C, inventory and three offline JS exports passed. See the
[exact result](../verification/increment43-final/result.json). Focused counts
below overlap this aggregate, not extra tests.

## 1. Controlled capture and exact local evidence

**Implemented, awaiting native/physical acceptance:**

- Devices has an explicit native foreground BLE observation card for advertised
  FCD2/BTHome or FEAA/Eddystone UUIDs. Defaults are 10 seconds, 25 callbacks and
  65,536 serialized characters. Stop, tab exit, background and cleanup failure
  fence callbacks and subsequent work. Advertised-UUID filtering can miss
  service-data-only beacons; this is not a general BTHome receiver.
- A separate **Android-only service-data card** requires fresh per-session opt-in
  to transient reception of nearby advertisements before JavaScript selection.
  It does not silently broaden the advertised-UUID card. Uncertain cleanup blocks
  inspection/device reuse; explicit confirmed Android reset is separate from
  restarting. iOS reset remains closed.
- Native **one-tag Phone NDEF capture** starts explicitly in the foreground,
  accepts at most one callback within 30 seconds including preparation, and waits
  for cleanup before offering Inspect. It retains selected OS-normalized TNF,
  type, optional record ID and payload, not original wire framing or tag identity.
  The legacy NFC reader remains a distinct automatic metadata-only journal path.

**Operator path:** Devices → explicit Start → Stop/settled cleanup → select a
source → Inspect in Analysis → explicit interpretation → explicit local Save.
Opening Analysis neither interprets nor saves automatically. BLE preserves exact
selected SDK field documents and missing/null distinctions; Android scan bytes
and iOS normalized fields/opaque base64 JSON are not interchangeable. Receipt
clocks label callback receipt, not over-air capture time. NDEF records preserve
platform-specific ID representation. The selected NDEF adapter permits larger
inputs than the 4,096 UTF-16-unit journal limit; oversized saves fail, never truncate.

Evidence reopening hashes a private exact source snapshot before reinterpreting
it. A digest detects changed bytes; it is not a signature, trusted timestamp,
proof of reception, ownership or authenticated identity. Source text and URIs
remain inert. Collection is not verified RF-passive: the OS may send scan requests.

Details: [controlled BLE](CONTROLLED_BLE_OBSERVATION.md),
[Android service-data workbench](BLE_SERVICE_DATA_WORKBENCH.md),
[selected BLE evidence](BLE_PLX_SOURCE_EVIDENCE.md),
[current dependency and NFC capture status](CURRENT_DEPENDENCY_AND_CAPTURE_STATUS.md),
[evidence envelopes](EVIDENCE_ENVELOPE.md).

## 2. Offline workbench and replay

**Runnable software workflows:** Analysis has a [thirteen-inspector chooser](ANALYSIS_INSPECTOR_CHOOSER.md).
Use explicit paste/import or a labeled synthetic example, declare provenance,
then Inspect. Choice changes are navigation, not acquisition or analysis.

- Recording supports bounded NEC/classic CAN and the separate REA workflow.
  BLE/BTHome and Eddystone inspectors retain source boundaries and leave unknown,
  malformed or encrypted content uninterpreted.
- BLE trial authoring stages exact documents, then separately declares/adds
  trials, builds a dataset and compares source-separated byte positions. Numeric
  hypotheses are checked with exact rational arithmetic; conditions, held-out
  labels and receipt references remain operator declarations, not causation.
- Serialized NDEF, normalized Phone NDEF and explicit-mode static NFC data areas
  are different inputs. Static inspection is not a native tag reader.
- Flipper response inspection is response-only. IR inspection distinguishes
  declared fields from conditional duration-array recognition. Neither sends
  commands or establishes device compatibility.
- HCI inspection reads bounded host/controller containers. To retain a selected
  legacy event: Inspect capture → select event → Prepare document → Open document
  → Verify/reopen → explicit Save. Reopen verifies the selected binary derivative;
  original capture hash/offset/index claims remain unverified. A separate two-slot
  report comparison remains memory-only. Extended HCI metadata is not pooled or
  reassembled into legacy advertising data.

Persist only where an explicit Save exists. Trials, numeric hypotheses, static
NFC, Flipper, IR and report comparisons are not a general attachment store.
Evidence bundles preserve selected exact documents with digest verification and
preview; a bundle does not upgrade source declarations into trusted provenance.

Guides: [offline lab walkthrough](OFFLINE_LAB_WALKTHROUGH.md),
[BLE trials](BLE_TRIAL_AUTHORING.md), [numeric hypotheses](BLE_FIELD_HYPOTHESIS.md),
[Flipper](FLIPPER_OFFLINE_WORKBENCH.md), [IR](IR_WORKBENCH.md),
[static NFC](NFC_STATIC_WORKBENCH.md), [HCI journal](hci-journal-workflow.md),
[HCI comparison](HCI_COMPARISON_WORKBENCH.md), [bundles](EVIDENCE_BUNDLES.md).

## 3. Bounded I/Q analysis

**Implemented offline:** a strict SigMF 1.2.6 `ci16_le` profile hashes original
metadata/data bytes and checks optional SHA-512. CLI tools and the Analysis I/Q
inspector share bounded math. Web selection only stages two local file handles;
explicit Inspect reads them. Native arbitrary-file import is unavailable;
explicit synthetic zero/quarter-cycle examples are available in source.

- Default or selected periodic-Hann FFT windows expose digital statistics and
  signed frequency bins. Selected sizes are 256–4,096, without padding or fallback.
- Time-frequency mode supports at most 64 complete windows and 16,384 FFT cells,
  with explicit start/hop, frame/bin pagination and navigation to computed peaks.
- Separate exact energy/threshold mode uses integer sums and rational comparisons,
  at most 256 windows and 262,144 processed cells. Equality is not above threshold;
  gapped selected windows do not imply continuous bursts.
- Separate CLI/core lag-correlation and phase-increment diagnostics retain
  ambiguity and aliasing rather than claiming modulation or transmitter recognition.

One outstanding read/hash job owns its slot until settlement. Edits, Clear,
background and exit fence old publication; they do not promise cancellation or
secure erasure. Reports are memory-only. Digital amplitudes are not volts/dBm,
producer sample rates are declarations, and display floors are not measured noise.

Start with [I/Q app inspector](OFFLINE_IQ_APP_INSPECTOR.md),
[energy mode](iq-activity-workbench.md), [CLI inspection](OFFLINE_IQ_INSPECTION.md),
[lag correlation](OFFLINE_IQ_LAG_CORRELATION.md) and
[phase increments](offline-iq-phase-increment.md).

A separate original [Mayhem C8 core/CLI prototype](MAYHEM_C8_PROTOTYPE.md)
accepts explicit bounded signed-int8 recording/sidecar pairs and converts with
scale256 into the unchanged ci16_le profile. Original bytes and original/derived
hashes stay distinct. It has no app picker, persistence or live RF integration;
all tests are synthetic and pair reads are not an atomic producer snapshot.

## 4. AXP ownership, cancellation and installed SDK integration

Native Bluetooth and the experimental secure-browser custom-service path use
DeviceSession/BleTransport and the Console for READY negotiation, identity and
capability **reports**, and bounded ping. Browser selection is explicit; standard
Safari/iOS browsers are unavailable. Browser ownership survives navigation/remount.
Native USB is a conservative Android CDC-ACM source path, not arbitrary serial
support or an iOS implementation.

Substantive corrections prevent further setup after cancellation, acquisition
from detached App handlers, stale completion publication and a READY/data framing
collision. A global native Cancel connection attempt control is identity-bound.
Pending raw calls and writes retain ownership until settlement; abort alone is
not release proof. Failed/unknown cleanup blocks replacement and requires explicit
cleanup rather than an automatic retry.

The test chain now reaches **actual installed PLX 3.5.1 shipped ESM → real C data
callbacks**, through actual extracted App handlers, native TypeScript adapter,
transport and session. Installed NFC 4.2.0 CommonJS facade tests similarly exercise
real JS error/event handling. RN/native promises, events, permissions and scheduling
remain synthetic; firmware startup is never invoked by these integration fixtures.
The PLX monitor listener really survives `remove()` until its native promise
settles, so late callbacks are tested rather than assumed absent.

After v40, 12 builder App cases plus 6 independent cases were integrated. The
independent 80-test focused set passed, then passed five repeated runs, with
TypeScript passing. These App integration additions were test/fixture work, not production fixes or
mounted React/native acceptance.

A subsequent **narrow unissued-acquisition correction is now integrated**. A fresh
attempt identity and exact original rejection can obtain a one-shot receipt from
the trusted native adapter only for an initially aborted invocation or supported
normal Android permission-result denial/cancellation before manager acquisition.
Permission receipts additionally require settled scanner stop, no outstanding raw
scan operation, and unchanged healthy ownership state. This lets the transport
release that unissued attempt instead of leaving it falsely held. It neither
clears another owner nor certifies cleanup of an issued connection. Readiness,
manager/listener/connection effects, unexpected permission rejection, malformed
results and uncertain scanner work remain unknown. iOS reset remains closed.

Independent review corrected two candidate defects before integration: malformed
permission maps could falsely certify an exit, and a rejected Promise returned by
a malformed proof hook could cause an unhandled rejection. Only literal `true`
certifies; Promise rejection observation does not adopt or await the proof. The
contract assumes a trusted adapter, not hostile-code isolation or native
attestation. Builder and independent focused suites plus typecheck passed; the
[implementation contract](proposals/ble-unissued-acquisition/IMPLEMENTATION.md)
and [final independent review](../review-evidence/unissued-independent/REPORT.md)
record exact scope and retained before/after failures. The implementation note
retains its earlier pending-review wording; the final review records integration
approval. No aggregate, OS/device release or native ordering claim follows.

Exact integrated runtime SHA-256:
- BleTransport: `a377ccd2563a03d329a5cab19b804424467a5d8a09cbea2ba0421a17fe8649b8`.
- Native Bluetooth adapter: `c50d769b3a5c5266e3fd3119b078258c584306cac0fb79a5e1bd90a8b3303f1d`.

Read [browser application](features/web-axp-application.md),
[session cancellation](APP_SESSION_CANCELLATION.md),
[native acquisition correction](NATIVE_ACQUISITION_CANCELLATION.md),
[native-to-C integration](NATIVE_C_SESSION_INTEGRATION.md),
[installed PLX boundary](../tests/plx-facade-host/README.md),
[App→PLX independent review](../evidence/app-plx-independent-review/README.md)
and [NFC facade review](NFC_JS_FACADE_HOST_REVIEW.md).

Readiness subscription cleanup faults now settle deterministic rejection instead
of hanging or allowing early success. Unknown SDK listener ownership is latched;
new acquisition/destruction is blocked while owned connection cancellation remains
available. Local-only cleanup faults and ordinary readiness denials are distinct.
See [the independent review](../review-evidence/readiness-independent/REPORT.md).
The latch belongs to its module instance: full app/process restart is recommended,
not Fast Refresh/reimport. The initial state query is now explicitly owned; see the correction below.

Installed iOS scan start/stop exports are void. Local callback retirement and
Inspect work, but JS Promise settlement cannot establish native completion.
Android Promise completion means adapter-call return, not RF cessation. See
[the corrected scan contract](PLX_SCAN_SCOPE_CORRECTION.md). Ordinary scanning
remains; UI copy describes local stop requests and existing iOS gates stay closed.

The initial state-query correction uses supported `onStateChange(false)` and
explicitly owned `state()` handling. Cancellation/error can settle the caller
while the query remains fenced; successful preparation waits drainage. Newer
state events invalidate later snapshot values, late rejections are consumed, and
existing connection I/O/cancellation remain available. It does not grant native
release proof or broaden readiness receipts. See [independent verification](../review-evidence/owned-query-independent/REPORT.md),
including two actual extracted App-handler cases and preserved baseline failures.

## 5. Preserved firmware and separate derivative

The [six original ESP32-S3 files](ESP32S3_RESTORATION.md) were restored with exact
provenance, not silently repaired. The historical target starts BLE advertising,
can erase default NVS on specific initialization recovery, and retains demonstrated
queue/retry/subscription hazards. Restoration is not authorization to execute it.

The separate [opt-in derivative](../firmware/esp32s3-reviewed/README.md) has bounded
atomic admission, failure fencing and idempotent subscription. BLE startup defaults
**off**, and automatic NVS erase is removed. Host characterization and independent
fault/mutation work are useful software evidence, not ESP-IDF or board acceptance.

The latest initialization/configuration delta has regression evidence only:
current SHA-256 `57503eaabc1773bb46272d72bd3c9b04e85964d1666093e02bb672eaf569242c`;
earlier independently reviewed SHA-256
`4c4a7ac3829f87088c8c9bebbe361be752de200943401986c6cb69f20408dd7c`.
Its separate independent review remains incomplete; this handoff does not close
that gate. The
[build-only helper](REVIEWED_IDF_BUILD.md) has synthetic orchestration tests, not
an authentic SDK build, and cannot close that gate.

## Verification entry points and next engineering gates

With already provisioned approved dependencies and Node 24.3+ within Node 24,
these offline entry points are reproducible from the repository root:

```sh
# Synthetic, memory-only workflow; no build/install/device operation.
CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_offline=true node tools/demo-offline-lab.ts
# Read the aggregate plan without executing it.
node tools/verify-offline-checkpoint.mjs --plan
```

For a separately authorized full offline checkpoint, follow
[OFFLINE_CHECKPOINT](OFFLINE_CHECKPOINT.md) with a fresh output directory. It runs
portable host compilation, tests, typecheck, inventory, browser **listing only**
and Expo JavaScript exports. It needs Python/GCC and existing app/REA dependencies,
never installs them, and must not run concurrently with builds in that checkout.
Documentation edits add no runtime acceptance beyond the exact aggregate above.

Prioritize these remaining gates:

1. Revalidate any later source changes against the exact aggregate and package
   manifest. The current v43 result does not validate future edits.
2. Obtain an authorized, provisioned native builder. The dated
   [build audit](DEVICE_BUILD_AUDIT_20261108.md) found no Android/ESP-IDF toolchains;
   the Mac was explicitly offline/deferred. Java 21 compiler modules **are present**
   despite no `javac` launcher. Native compilation and physical acceptance remain
   separate. Do not treat `npm run android` as compile-only.
3. Keep iOS BLE reset closed until native destruction acknowledgement is resolved.
   Real RN/OS ordering, Metro/Hermes, phone permissions, release and storage need
   exact-build evidence under the [phone plan](PHONE_ACCEPTANCE_PLAN.md) and
   [transport plan](TRANSPORT_RELEASE_ACCEPTANCE.md). All physical cases are unrun.
4. Browser execution remains unavailable/unrun. Listed cases, exports
   and mocked rendering do not establish browser UI or accessibility acceptance.
   The [browser/derivative bench plan](BROWSER_DERIVATIVE_ACCEPTANCE.md) remains
   blocked, all cases unrun, and grants no device-operation permission.
5. Resolve PLX 3.5.1's installed Apache-2.0 LICENSE versus MIT metadata discrepancy
   before distribution; see [current dependency status](CURRENT_DEPENDENCY_AND_CAPTURE_STATUS.md).
   Source restoration/mining has not adopted new adapters or cleared licensing.
6. Provider contracts remain bounded data-only seams, with no connected model or
   endpoint. Cross-provider live interoperability, provider identity and security
   acceptance are not established. RF drivers, calibrated receiver integration,
   encrypted vault and vehicle/industrial integrations remain future work.

Historical docs remain preserved references. This handoff changes no production,
dependency, test, verification record or acceptance gate.

## Native research and full product trail

See [native experiment status](NATIVE_EXPERIMENT_STATUS_20261108.md) for the
compiled-but-rejected C++ numerical candidates and source-only Rust candidate,
with exact verification limits. See [the full vision pack](vision/README.md) for
requirements, recovered conversations, source provenance, architecture and
phased delivery. These preserve future scope without claiming unbuilt functions.
