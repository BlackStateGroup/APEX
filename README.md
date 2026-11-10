# APEX

**Universal Master Key**: a modular electronic interoperability platform from Black State Group.

**Mobile targets: iPhone and Android.** Native NFC and AXP Bluetooth integrations are implemented; physical phone/accessory testing remains pending; see [platform scope](docs/PLATFORM_SCOPE.md).

The [source-copy catalogue](research/SOURCE_COPIES.md) records 31 pinned upstream source projects under `research/upstream-sources/`, with original licences, verified commits and independently retained source backups. Local checkouts can be restored on demand; missing nested dependencies and unrecovered suggestions are listed explicitly.

One workspace for supported electronic systems across NFC/RFID, radio, Bluetooth, Wi-Fi, infrared, embedded accessories, vehicle electronics and industrial/access-control benches. Compatibility is recorded per operation, equipment revision and test environment. Protocol recognition and authenticated access are distinct.

## Local continuation status

Start with the [consolidated engineering handoff](docs/ENGINEERING_HANDOFF_20261108.md)
for runnable workflows, evidence boundaries and remaining engineering gates.

For this selected local snapshot, start with [APEX_CONTINUATION.md](APEX_CONTINUATION.md)
and [the machine-readable validation record](verification/continuation.json).
Earlier verification below concerns named historical revisions; it is not
acceptance of the current local changes. The continuation is unpushed.

Read the [current dependency and NFC capture status](docs/CURRENT_DEPENDENCY_AND_CAPTURE_STATUS.md)
for runtime package/license details and explicit selected NDEF payload retention.
Older licensing and source-mining documents are preserved historical records.

Missing original design documents and the historical simulator image have been
[restored with pinned provenance](docs/FOUNDATION_RESTORATION.md). Their historical
claims are not acceptance of this continuation.

Offline Analysis offers [thirteen inspectors](docs/ANALYSIS_INSPECTOR_CHOOSER.md),
including source-separated BLE trials, exact rational checks of declared numeric
candidates, serialized NDEF and normalized phone NDEF. Selected HCI event documents
support [exact local journal save/reopen](docs/hci-journal-workflow.md) and a separate
[bounded, memory-only report comparison](docs/HCI_COMPARISON_WORKBENCH.md).
The [I/Q app inspector](docs/OFFLINE_IQ_APP_INSPECTOR.md) supports explicit web
local-byte inspection with default or selected FFT windows and bounded time-frequency frames; native arbitrary-file
I/Q import remains unavailable. Saved evidence rejects ambiguous envelopes before
digest verification. These are implemented software workflows, not browser/native
acceptance or proof of physical reception or unlocking.

The [experimental browser AXP path](docs/features/web-axp-application.md) now
connects an explicitly chosen, authorized custom-service accessory to the shared
Console on eligible secure browsers. Selection, actual READY negotiation,
identity/capability reports, ping and explicit cleanup are integrated in source.
Ownership survives navigation/remount and uncertain cleanup blocks replacement.
This is not general Bluetooth scanning, arbitrary RF access or device acceptance;
standard Safari/iOS browsers are unavailable. Host-only review caught and fixed
[a READY/data framing collision](docs/ble-ready-data-boundary.md).

The [native client-to-C fixture](docs/NATIVE_C_SESSION_INTEGRATION.md) also joins
the exact phone TypeScript adapter to real C replies through fake RN/PLX boundaries.
It exposed and helped fix [new connection work after cancellation](docs/NATIVE_ACQUISITION_CANCELLATION.md).
A separate [App lifecycle fix](docs/APP_NATIVE_ACQUISITION_GUARDS.md) prevents
acquisition after detach and stale completion updates. Both have independent
source/host regression review; neither is phone execution or native acceptance.

Native setup now has an explicit cross-tab [Cancel connection attempt](docs/APP_SESSION_CANCELLATION.md)
control while busy, with exact attempt ownership and retained uncertain cleanup.
The [installed NFC facade](docs/NFC_JS_FACADE_HOST_REVIEW.md) and
[installed PLX facade](tests/plx-facade-host/README.md) also run in host integration
tests. Their actual JavaScript is exercised; native event/callback bridges remain
fake, and these checks do not establish Metro, OS or device compatibility.

The [six original ESP32-S3 target files](docs/ESP32S3_RESTORATION.md) are restored
with exact provenance. This historical target starts BLE advertising and may
erase its default NVS partition during specific initialization recovery. Its
queue/retry hazards remain documented; restoration is not permission to run or
flash it. See the [current native-build audit](docs/DEVICE_BUILD_AUDIT_20261108.md)
for absent toolchains and separate compilation/physical acceptance gates. The
historical firmware guide's earlier no-radio wording does not describe the
restored BLE-enabled target.

A separate [reviewed source target](firmware/esp32s3-reviewed/README.md) preserves
that historical target and adds atomic bounded write admission, explicit failure
fencing and idempotent subscription. Its BLE startup defaults off and it never
automatically erases NVS. Actual-source host tests and independent fault/mutation
probes cover the revised behavior; SDK compilation and board acceptance remain
unrun. The original target is not silently redirected to this derivative.
The latest SDK initialization/configuration correction has builder regression
coverage but fresh independent review remains open; earlier review is tied to
its exact prior source hash. No native build or physical acceptance is implied.

The [browser-to-C roundtrip fixture](docs/features/browser-c-roundtrip.md) now
exercises the actual TypeScript client through the existing C protocol callbacks,
using a bounded fake GATT bridge. It is software integration, not SDK or device
acceptance. A separately tested [build-only helper](docs/REVIEWED_IDF_BUILD.md)
prepares isolated default-off and explicit-on builds on a future authorized,
already-provisioned SDK. No authentic SDK build has run. The
[owned-bench acceptance plan](docs/BROWSER_DERIVATIVE_ACCEPTANCE.md) remains
blocked with every case unrun; it supplies no flashing or device-operation permission.

## Design and research

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Capability matrix](docs/CAPABILITY_MATRIX.md)
- [Hardware strategy](docs/HARDWARE_STRATEGY.md)
- [Research register: 28 pinned projects](docs/RESEARCH_REGISTER.md)
- [Current dependency and capture status](docs/CURRENT_DEPENDENCY_AND_CAPTURE_STATUS.md)
- [Historical licensing inventory](docs/LICENSING.md) (see current addendum above)
- [Engineering work packages](docs/ENGINEERING_WORK_PACKAGES.md)
- [AXP/1 device protocol](docs/DEVICE_PROTOCOL.md)
- [Security research boundaries](docs/SECURITY_RESEARCH.md)
- [Verification record](docs/VERIFICATION.md)
- [Project state and continuity](docs/PROJECT_STATE.md)
- [Physical bench acceptance](docs/BENCH_ACCEPTANCE.md)
- [REA research and firmware inspection](docs/REA_RESEARCH.md)
- [Device intelligence and recovery blueprint](docs/DEVICE_INTELLIGENCE_AND_RECOVERY_BLUEPRINT.md), [16 staged work packages](docs/DEVICE_INTELLIGENCE_WORK_PACKAGES.md), and [10 November conversation record](docs/DEVICE_INTELLIGENCE_CONVERSATION_20261110.md) (planning only; not an operational root-access feature)
- [Controlled offline BLE byte comparison](docs/BLE_DIFFERENTIAL_EXPERIMENT.md)

The research branch defines the system. The dependent `feat/platform-foundation` branch establishes the Expo application, native Android module, shared protocol and portable C firmware. Review research before implementation. Physical hardware claims require separate evidence; no product-wide universal unlocking claim is made.

Research and security testing use owned or explicitly authorised equipment and controlled environments. Nothing is automatically merged, deployed or flashed.

## Run the foundation

Requires Node 24.3 or newer within Node 24, npm, Python 3 and GCC for the portable C tests. The audit records the broader, not-yet-corrected root engine declaration.

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run demo
npm run build
npm run web
```

`demo` connects the TypeScript session to the compiled C firmware process. The application offers a separate, explicitly selected simulator plus offline NEC, classic CAN and BLE/BTHome analysis. The BLE panel accepts
pasted source envelopes or an explicitly synthetic demo, saves the exact document
locally, and reinterprets saved evidence only after a digest check. See the
[offline BLE workbench](docs/BLE_EVIDENCE.md). These are not physical hardware
tests; the new BLE UI still needs browser/native acceptance.

For browser checks after `npm run build`: `npx playwright install chromium` then `npm run test:ui`. `npm run inventory:check` verifies the lockfile licence inventory.

For native Android, install the Android SDK/JDK toolchain, run `npm run android`. NFC and Bluetooth on both mobile platforms require a development build. On a Mac with Xcode, run `npm run ios`. The npm native scripts protect reference sources during Expo prebuild. The native source supports a conservative single CDC-ACM interface pair, not arbitrary USB serial chips. See the [firmware guide](firmware/README.md) for the ESP-IDF v6.1 target.

Current evidence and unexecuted native/hardware gates are recorded in [VERIFICATION.md](docs/VERIFICATION.md). Planned adapters are listed openly in the capability matrix. A bounded, data-only AI provider contract and hypothesis validator are implemented; no model or endpoint is connected. The session journal is in memory. NFC metadata and offline analysis summaries can now persist in the local Evidence journal with SHA-256 verification. An encrypted vault, RF drivers and vehicle/industrial integrations remain work packages. See the [accessory workbench](docs/ACCESSORY_WORKBENCH.md) and [historical source mining register](research/SOURCE_MINING.md), qualified by the [current dependency and capture status](docs/CURRENT_DEPENDENCY_AND_CAPTURE_STATUS.md).

![Historical APEX software-simulator console, not a screenshot of current changes](docs/images/console.png)


### IR receiver timing excerpts

Analysis → IR includes an original bounded [IRremoteESP8266 receiver excerpt importer](docs/ir-receiver-import.md), alongside the ordinary `.ir` inspector. Paste `rawData` source-code excerpts, declare provenance and inspect locally. Exact accepted text is retained and hashed; carrier and capture completeness remain unknown. No upstream runtime, device connection or transmission is added.
