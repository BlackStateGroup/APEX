# Phone NDEF selected-record adapter

The preparation and lifecycle-only sections below record historical checkpoints.
Later additions provide [offline Analysis/Evidence integration](#additive-offline-analysisevidence-integration-7-november-2026)
and an [explicit one-tag phone read](#explicit-one-tag-phone-read-8-november-2026).
Native/device acceptance remains unrun; selected normalized fields do not recover
original NDEF wire bytes.

The initial additive, dependency-free core slice accepted **OS-normalized record fields**, not original NDEF wire bytes. At that checkpoint it was not connected to the app, NFC callbacks, automatic metadata saves, the evidence journal, AI providers or a UI. `packages/core/nfc.ts` and `src/platform/nfc.native.ts` were unchanged. No native build, device, NFC/radio operation, browser, install, remote write or upload was used.

## Exact inspected source contract

Inspected 2026-11-07: the already installed `react-native-nfc-manager` package reports **4.2.0**, matching the unchanged lockfile. The [published package URL](https://registry.npmjs.org/react-native-nfc-manager/-/react-native-nfc-manager-4.2.0.tgz) is recorded in that lockfile with integrity `sha512-3LCVChwRxtGG89vMTSWgrGhxIYfM9WCkJ8qO5dGTy/E8X7US5XjSN3Xg2JbN6k2iPZKWVue3qImqhGpuJsqKFw==`. This slice did not download/reinstall the tarball or independently compare it with the installed tree. Exact installed source hashes are in `verification/phone-ndef/sdk-source-sha256.txt`; paths below are relative to that package. The [upstream repository](https://github.com/revtel/react-native-nfc-manager) is its package-declared source, not an independently verified release commit.

- `index.d.ts:66–82`: `NdefRecord` declares TNF 0–7, optional `id: number[] | string`, `type: number[] | string`, required `payload: number[]`; `TagEvent.ndefMessage` is optional. These public typings also serve JavaScript record construction and are wider than the inspected native output.
- Android `android/src/main/java/community/revteltech/nfc/Util.java:309–352`: `recordToJSON` uses `getTnf()`, `getType()`, `getId()` and `getPayload()`. Type/payload are arrays of unsigned numbers (`& 0xff`); ID is uppercase contiguous hex text, including `""` for zero bytes. Both type and payload are arrays, never the type string permitted by the broader typings. `messageToJSON` maps `getRecords()` in order. Null message returns Java null; `ndefToJSON` passes that to `JSONObject.put`, which omits/removes the member. The [JSONObject contract](https://developer.android.com/reference/org/json/JSONObject#put(java.lang.String,java.lang.Object)) defines that null behavior. The cached NDEF discovery path is not proof of a fresh read. `NdefHandler.java:332–336` separately converts a null message to `[]`; empty array therefore does not certify a valid empty wire message.
- iOS `ios/RNNfcManager.swift:124–136`: `convertNdefMessage` maps `message.records` to dictionaries with numeric `tnf` from `typeNameFormat.rawValue` and `type`, `id`, `payload` from Core NFC `Data`. `RNNfcSwiftUtil.swift:31–33` maps each byte to `NSNumber(Int(byte))`, giving unsigned arrays including empty arrays.
- iOS `ios/RNNfcManager.swift:163–169` adds `ndefMessage` only when `readNDEF` yields a message. `ios/RNNfcSessionDelegateProxy.swift:7–13` emits only the **first** detected message; if the callback array is empty it emits `ndefMessage: []`. Neither callback shape proves all messages or original reception framing were retained.

Android [NdefRecord API](https://developer.android.com/reference/android/nfc/NdefRecord) and independently inspected [AOSP android-14.0.0_r1 NdefRecord.java](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/android-14.0.0_r1/core/java/android/nfc/NdefRecord.java), class documentation at lines 45–75, explicitly describe logical complete records: parsing combines chunks and the class does not expose binary framing flags. The AOSP version is a semantic cross-check, **not** an assertion of the actual phone OS version.

Apple primary references: [NFCNDEFPayload](https://developer.apple.com/documentation/corenfc/nfcndefpayload), [message records](https://developer.apple.com/documentation/corenfc/nfcndefmessage/records), [payload initializer with chunkSize](https://developer.apple.com/documentation/corenfc/nfcndefpayload/init(format:type:identifier:payload:chunksize:)), and [NFCNDEFMessage](https://developer.apple.com/documentation/corenfc/nfcndefmessage). Search-index excerpts from Apple's documentation describe TNF/type/identifier/data and a chunk-size constructor. Full Apple page reads returned JavaScript shells; the linked Markdown representation could not be fetched by the research tool. Therefore this work makes **no claim about Core NFC's exact handling of every incoming chunk pattern**. The installed bridge itself decisively shows that no chunk boundary/header/length-field information is exported. This is enough to refuse reconstruction regardless of undocumented OS behavior.

For both platforms, current array byte counts are available; original short-versus-long payload length encoding, ID-length flag, MB/ME/CF/SR/IL flags, chunk boundaries, original offsets and full message bytes are unavailable. No fake headers, serialization, original byte lengths or capture claims are produced. Even a hypothetical reserialization would be a new encoding, not recovery. Record IDs are record metadata, not authenticated tag identities.

## Pure helpers

`preparePhoneNdefObservation(platform, tag, provenance)` validates plain data fields, snapshots the selected `ndefMessage` records and creates a **new selected-field JSON document**. It does not claim to preserve the original event's object serialization. Extra top-level tag metadata is not retained, including tag ID, technology, capacity and writable state. Each record may have only `tnf`, `type`, optional `id`, and `payload`; unexpected record properties are rejected rather than silently transformed.

`importPhoneNdefObservation(document, expectedPlatform)` imports exactly:

- `schemaVersion: 1`
- `inputKind: "nfc-manager-normalized-records"`
- `source: { sdk: "react-native-nfc-manager", version: "4.2.0", platform: "android" | "ios" }`
- `provenance: { origin: "synthetic-fixture" | "recorded-import", label: string }`
- `snapshot: { ndefMessage?: records[] | null }`

The importer retains the **exact original document string**, including spacing and hex case, and recomputes the projection. It rejects source/platform/version mismatch, unknown fields, duplicate decoded JSON keys, supplied interpretations/verification claims and excess nesting. Provenance and source are caller claims, including when the source matches. No timestamp is invented.

Snapshot and projection are separate: original Android ID spelling/case remains in the snapshot; projection hex is lowercase. The projection has only TNF, type/ID/payload hex and a value interpretation. It has no headers, offsets, raw record bytes or full-message serialization. Defensive copies prevent subsequent caller input mutation from altering the result. Results themselves are ordinary mutable objects, not attestations; use `sourceDocument` and re-import when replaying rather than trusting a stored projection.

### Absence and conservative acceptance

- Absent `ndefMessage`, explicit `null`, empty array, and a nonempty array have separate `availability` values. Null is retained as a caller-supplied unavailable sentinel, **not claimed to be emitted by either inspected discovery path**. None means a verified empty wire message.
- Missing optional record ID remains missing and projects to `idHex: null`; present empty string/array projects to `""`. Missing ID is accepted because the public type permits it, though the inspected native record converters supply it. Null ID is invalid. Explicit `undefined` is rejected, not silently erased by JSON serialization.
- Type and payload must be dense byte arrays. Native type strings, typed arrays, buffers and signed bytes are not guessed/coerced. Android ID must be bounded even-length hex; iOS ID must be bytes. Hex letter case is preserved; mixed/lowercase is accepted for caller imports even though Android's inspected emitter uses uppercase.
- TNF must be 0–7 except 6 (a fragment is not a logical record). Empty TNF requires empty fields; TNF 5/7 requires empty type. Reserved TNF 7 stays opaque, without claiming assigned semantics or full NFC conformance. Other type grammars are not fully validated.
- Strict Text/URI payload interpretation reuses `interpretNdefPayload` from the existing offline decoder, **without passing through a fabricated wire message**. Invalid known Text/URI encodings reject this adapter's import. Unknown types, nested records, Wi-Fi payloads and unknown URI prefix codes remain opaque. Unknown URI prefixes do not entail decoding the unknown suffix encoding. The offline wire decoder still retains malformed bytes under its existing, unchanged acceptance policy.
- URI output always has `actionable: false`. URI/text/control characters are untrusted inert data, never HTML, navigation, commands, credential extraction, Wi-Fi configuration or provider input.

### Resource and object boundary

- 64 records; 255 bytes each for type and ID; 8,192 payload bytes per record.
- 8,192 aggregate bytes across **all** type, ID and payload fields. Android hex counts decoded bytes.
- 40,000 UTF-16 code units per document, five container levels; 1–128 code units for labels. Lone surrogate labels are rejected.
- No truncation. Rejected inputs are not returned as partial valid observations. Negative zero and nonintegral/nonfinite/out-of-range bytes are rejected to avoid silently changing selected numeric fields in JSON.
- Ordinary object prototypes and ordinary dense arrays only; getters/setters, symbol properties, non-enumerable fields, sparse/decorated arrays and class instances in selected data are rejected. Property descriptors avoid executing getters. Extra top-level tag fields are not recursively inspected or retained, but top-level accessors are rejected.
- JavaScript cannot reliably identify arbitrary hostile Proxies without running their traps. The preparation function is for bridge/plain caller data, not sandboxing hostile JavaScript. Use the bounded JSON string importer at an untrusted serialized-data boundary. It creates plain data through JSON parsing and avoids that executable-object ambiguity.

No existing evidence sanitizer or journal schema is changed. These documents intentionally fail the existing serialized-NDEF and `analysis.ndef` evidence importers. A future explicit app integration must specify retention/privacy, source binding, user-controlled saving and native acceptance separately; do not feed this result into the current automatic metadata saver.

## Synthetic fixtures and validation

`tests/fixtures/phone-ndef/android.json` and `ios.json` are manually constructed SDK-shaped examples, not captures. They include Text `Hi`, inert URI `https://example.com`, and opaque MIME payload. Tests cover exact string/field retention, mutation isolation, missing/null/empty distinctions, source mismatch, getters, object/array restrictions, inclusive limits, aggregate counting, malformed Unicode, invalid TNF, inert dangerous URI text, duplicate keys, old-importer refusal and 500 deterministic generated opaque-record round trips.

Run `node --test tests/nfc-manager-ndef.test.ts tests/ndef*.test.ts`, `npm test`, and `npm run typecheck`. Verification logs are in `verification/phone-ndef/`. Host checks do not validate Core NFC, Android OS behavior, RF reception, identity, native build/runtime or physical devices. No UI or journal integration is included.

Final local validation: Node 24.22.1, focused NDEF suite **44/44**, aggregate host suite **273/273** (including firmware host build), and full strict TypeScript check passed. Only existing app and REA dependencies were reused through ignored symlinks. No Expo export/native/browser/hardware verification was attempted in this slice.

## Additive offline Analysis/Evidence integration (7 November 2026)

The earlier preparation-only description above records the adapter's original scope. The adapter itself and native reader remain unchanged. A separate **Offline phone NDEF selected fields** card now accepts these documents in Analysis, with an explicit expected Android/iOS platform. It is separate from the original serialized NDEF wire importer; each card retains its own draft across tab changes. Synthetic demos reuse the reviewed Android/iOS fixtures. Interpretation, persistence and verified replay are explicit actions; nothing is scanned, sent to providers or automatically saved.

`analysis.ndef-source` is an additive journal kind. Its exact payload is `{schemaVersion: 1, format: "NDEF-normalized-source-document", document: string, expectedPlatform: "android" | "ios"}`. Save, parse and replay revalidate the adapter contract and bind the outer offline source to the retained provenance. Android hex spelling, whitespace, missing/null/empty distinctions and opaque payloads survive unchanged. No projection is persisted or trusted. Reopen first verifies a private snapshot's SHA-256, then derives the interpretation again. A digest detects local changes; it does not authenticate source, reception or identity.

The journal accepts at most **4096 UTF-16 code units** for the complete source document, narrower than the adapter's 40000-character analysis boundary. Existing 16000-character pre-digest total, 16384-character stored envelope, depth, key, array and string bounds are unchanged. Oversized imports may be interpreted but cannot be saved: there is no truncation or partial save. Existing schema and canonical digest computation remain unchanged. The new kind's `observedAt` envelope field is the journal's save time, explicitly labeled in Evidence; source timestamp is unavailable, and no RF/tag capture time is inferred.

Edits, including expected-platform changes, invalidate interpretation. Pending saves have an immediate synchronous duplicate guard; late completions cannot restore stale findings. Successful persistence stays marked saved even if evidence refresh fails. No native scanner, permissions, source registers, metadata observation callback, automatic metadata save, dependencies or lockfiles were changed.

Verification for this integration is recorded under `verification/phone-ndef-workbench/`. Browser scenarios are authored for both platforms, draft separation, source mismatch, explicit save/reload/reopen, inert URI text and oversized-save refusal. They are not browser acceptance results: browser execution remains blocked by the previously documented environment restrictions and was not attempted here. JavaScript export and host tests are not native/device validation.

## Later NFC lifecycle-only repair (8 November 2026)

At this checkpoint, the native metadata reader received lifecycle ownership,
cancellation and retryable cleanup repairs. Its metadata-only capture scope and
automatic metadata-saving behavior remained unchanged; the normalized phone-record
workbench was still an explicit offline import, not native payload collection.
The later one-tag read is described below.
See `verification/nfc-lifecycle/README.md` and the current continuation manifest
for exact mocked verification and unrun device gates.

## Explicit one-tag phone read (8 November 2026)

The Devices **One-tag phone NDEF selected fields** card now connects the adapter
to the same reviewed native backend/session controller as the separate metadata
reader. It is not an additional SDK listener. Start requires an active native
foreground, no connected device, no accessory discovery, no BLE observation, no
metadata reader and no pending App operation. Synchronous refs and the singleton
native lease guard races. Web is unavailable.

The fixed 30-second observation window includes status and registration
preparation. At most one callback is accepted. Its selected fields are copied
synchronously through the strict adapter without truncation. Only TNF, type,
optional record ID and payload are retained in a newly created selected-field
document, with the existing SDK/platform envelope and recorded-import caller
label. The separate app receipt timestamp is not an RF/source timestamp and is
not added to the source document or evidence schema. Tag identity/technologies,
wire framing and other event fields are not retained. Missing, null and empty
records produce distinct unavailable results; invalid/oversized fields produce
errors and no inspectable partial document.

A callback immediately requests stop; Inspect is unavailable until the reviewed
reader confirms release. Deadline, background entry, Devices-tab leave and unmount
cancel and suppress callbacks. Transient inactive states (such as native permission
sheets) block new Start but preserve a pending read; returning active never
automatically resumes or restarts. They cannot settle hung native promises. Pending
startup/cleanup, failed unregister and missing iOS close events retain ownership;
Stop can retry failed cleanup. Timers never certify release. Unmount cleanup is
best effort, with singleton ownership still preventing a replacement session.

Inspect deliberately replaces the offline phone NDEF card's draft with the exact
selected document and platform, and opens Analysis. There is no automatic display of interpretation or save. The adapter internally
computes a projection for validation, but Inspect does not present that projection.
It does not open URLs, send to providers or create another journal kind. The document is
memory-only until the existing explicit local Save action. Existing interpretation,
4096-character journal limits, verification and stale-save guards remain intact.
The separate metadata reader still automatically saves metadata only.

Text-only changes: app.json's NFC usage description now truthfully mentions
metadata **or selected NDEF record fields**, and the shared iOS session alert says
“selected foreground inspection” instead of metadata. Entitlements, permissions,
SDK/source pins and actual grants are unchanged. No native permission was requested.
See verification/phone-ndef-capture/README.md for host checks and device limits.

### Separate duration and receipt clocks

The acceptance deadline now uses the runtime's monotonic `performance.now()`;
`Date.now()` is used only for the separate ISO app receipt metadata. Wall-clock
corrections therefore cannot widen the 30-second acceptance window, even when a
timer callback is delayed. The trusted runtime clock (and any injected test clock)
must advance monotonically: start/callback samples are checked for finiteness,
nonnegative bounded values and nondecreasing time within the read. Invalid start
time refuses acquisition; invalid callback time rejects the document and requests
normal cleanup. An unavailable/throwing clock is also refused. Receipt wall time
must be finite and inside JavaScript's valid Date range; invalid receipt time
rejects the callback and stops the native session without offering Inspect.
Neither clock nor the timer proves native release. A pending/failed cleanup still
retains ownership under the existing reviewed contract.
