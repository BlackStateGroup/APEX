# APEX phone acceptance checklist

Updated 8 November 2026. **All phone cases below are NOT RUN.** Before each run, record the exact tested commit, dirty-tree changes (if any), build artifact hash and the latest applicable verification manifest referenced by [VERIFICATION.md](VERIFICATION.md). Record that manifest’s tested commit and actual results separately; historical test counts and tests on another revision are not current-build or phone acceptance evidence. This document specifies expected behavior, not completed tests. Features under development must be present in the recorded build before their cases can run.

## Ordinary BLE stop evidence clarification

For U3–U6 below, “stop” and “successful cleanup” mean local callback/listener
retirement and SDK stop-request settlement, not native scan completion. Installed
iOS scan start/stop exports return void and provide no native completion
acknowledgment. Android Promise settlement follows the adapter call, not proven
RF cessation. Verify the visible local-collection/SDK-request explanation and
continued offline Inspect after normal local completion. Record native ordering
and radio behavior separately as NOT VERIFIED unless separately demonstrated;
neither idle controls nor a retained document prove them. Ordinary discovery and
connection handoff remain available. Existing iOS Reset and exclusive-service-data
gates stay closed. See [current copy checks](SCAN_COMPLETION_COPY_REVIEW.md).

## Before testing

- Use an already provisioned native development build, never Expo Go. Build/install/provisioning and permission-state resets are separate operator-approved actions; this checklist does not perform or authorize them.
- Confirm the tester owns or is explicitly authorized to use each phone, emitter and NFC tag. If no suitable emitter exists, mark physical cases BLOCKED. Do not assume a sensor is available or that an iPhone can advertise arbitrary service data. No transmitter setup, app installation, signing, Bluetooth setting changes or advertising is performed by this plan.
- Keep `neverForLocation` unchanged. Record it as enabled. Some Android beacons may be filtered; zero callbacks are inconclusive, not proof that a service is absent.
- Keep unrelated matching nearby devices out of the test record. Names/IDs do not establish ownership. Store source evidence locally; no automatic upload or external sharing.

## Three independent evidence gates

1. **Native compilation:** record exact commit, lockfile, builder/toolchain, generated config and command logs. Android must pass ApexDevice Kotlin compilation and complete arm64-v8a debug APK assembly. iOS must pass unsigned Simulator compilation on the known-good Mac/Xcode setup. These results prove neither phone execution nor radio reception.
2. **Phone UI/lifecycle:** execute applicable U1–U8, C1–C3, N1–N7, B1–B5 and S1–S4 cases on one named Android phone and one named iPhone. Record model/OS/build per run; do not generalize to all devices. Use a separate provisioned test state for initial permission prompts. Android API31+ uses Nearby Devices SCAN/CONNECT; supported older Android uses fine location. iOS uses the Bluetooth purpose prompt. Missing hardware/configuration is BLOCKED, not FAIL.
3. **Physical ground truth:** independently document the controlled emitter configuration and actual transmit evidence, if available, then compare app-visible service bytes. Emitter configuration alone is not measured over-air truth. Even a successful comparison does not make the app's source document authenticated or a complete RF capture.

## Controlled fixtures (only when an authorized emitter is separately available)

Use existing synthetic bytes as expected test vectors, never relabel the original JSON fixture as a captured observation:

- **FCD2/BTHome:** `tests/fixtures/bthome-observation.json`; service-data payload `4002c40903bf13` (temperature 25.00°C, humidity 50.55%). Original Android fixture AD bytes: `0201060b094449592d73656e736f720a16d2fc4002c40903bf13`.
- **FEAA/Eddystone UID:** first case in `tests/fixtures/eddystone-observations.json`; service-data payload `00ee000102030405060708090a0b0c0d0e0f0000`; namespace `00010203040506070809`, instance `0a0b0c0d0e0f`. Original AD bytes: `0201060303aafe1716aafe00ee000102030405060708090a0b0c0d0e0f0000`.
- Explicitly record which service UUID list the controlled emitter advertises as well as service-data bytes. The original FCD2 fixture contains service data but no separate advertised UUID-list AD structure. A selected-service OS filter may therefore yield no callback. If the independently authorized emitter configuration includes a UUID list, record the actual resulting AD document as a separate fixture; do not silently alter the expected original or broaden APEX's filter.
- Android comparisons concern delivered AD bytes, not necessarily the emitter's complete on-air sequence. iOS comparisons concern normalized service fields; `rawScanRecord` is opaque base64 JSON, not Android AD bytes. Preserve OS omissions/nulls, UUID spelling and exact source base64 before decoding. Do not require identical RSSI, IDs, callback count or whole advertisement representations across platforms.

## Phone run sheet

For each case record PASS / FAIL / BLOCKED / NOT RUN, expected vs observed, and a local evidence reference. No automatic connection, pairing, write or saving is expected from observation.

**U1 · First visit and first start**
Open Devices with no active accessory session, discovery or NFC reader. Merely visiting must not request Bluetooth permission or start collection. Select FCD2, then press **Start advertised-UUID BLE observation** once. Record the exact permission wording; it should describe foreground advertisements and AXP connections. On the grant run, answer within the 10-second window and observe state/results. Repeat with FEAA after cleanup. The 10 seconds includes permission preparation; a slow response may legitimately expire the session.

**U2 · Deny, delayed approval and cancel**
In a separate approved fresh permission state, deny the prompt. Expect one terminal failure, no retained callbacks, no pairing/write/save, and controls restored after cleanup. Do not reset permissions silently. For cancellation, press Stop if accessible, or leave the prompt unanswered until timeout; then grant after the session has already ended. Expect no late scanner start or callbacks. The OS prompt may remain until answered. Retry explicitly; persistent denial should fail clearly, not hang or falsely report receipt. OS behavior can vary; record whether another prompt is offered.

**U3 · Inactive, background and navigation**
On iOS, allow the permission sheet's transient inactive state without treating it as background cancellation; if resolved within the window, the explicitly requested scan may continue. During a running session, background the app and return: collection must stop and must not resume automatically. Repeat by leaving Devices for Analysis and returning. Late callbacks must not increase the old list. A new session requires an explicit Start while active. Do not use a screen recording alone to claim the OS radio has physically stopped.

**U4 · Filter and repeated callbacks**
Using the separately authorized fixture setup, run FCD2 and FEAA separately, then test selection with only the other service present. Record requested UUID, actual emitter advertisement/service list, observed callback fields and any unexpected callback. Do not silently infer service identity from the selected label. Repeat callbacks may appear and consume the 25-callback/65,536-character limits; they are not distinct packet or device counts. SDK duplicates are requested, but Android default callback policy and iOS/OS coalescing can differ. A 10-second run may end earlier at either cap. Missing/filtered results require a limitation entry, not an absence claim.

**U5 · Stop, cleanup and explicit retry**
Press Stop during observation; attempt a rapid second Start and service change while stopping. Neither may replace the active scan. After successful cleanup, Start with the other service and verify the new session does not receive old callbacks. Repeat three times and test the normal timeout. If cleanup fails or times out, expect an error, discarded callback sources, disabled Inspect and blocked retry. Competing acquisition must remain blocked even after the busy indicator clears. A late completion must not restore sources or clear the uncertainty fence. Do not accept an automatic manager reset or claimed successful stop. If the recorded Android build includes explicit Reset APEX Bluetooth, evaluate that separate recovery route under B3; never treat it as an automatic fallback. Native stop/start failures are not reliably inducible through normal UI: mark their phone execution NOT RUN unless naturally observed or a separately labeled fault-injection build is used. A fault-injection result is not the production binary result.

**U6 · AXP/NFC exclusion**
While observation is active, verify accessory discovery, connection actions and NFC start are unavailable/guarded. Conversely, accessory discovery or an active NFC reader must block observation. If an already authorized AXP session is available, confirm it also blocks observation; otherwise mark that branch BLOCKED. Do not initiate pairing, connection or GATT writes merely to complete this sheet. Stop the current operation and await cleanup before switching modes. AXP discovery must retain its own filter and must not inherit FCD2/FEAA callbacks.

**U7 · Exact source transfer and local save**
After observation stops, note a callback's app receipt time and select **Inspect BLE callback N**. The Analysis input must become the exact selected-source document, not a reconstructed Device/AD packet or decoded summary; interpretation and saving remain separate actions. Compare the complete input string against the retained callback document using an approved local test harness when available. If only visual UI access exists, record exact byte/string equality as NOT VERIFIED, not PASS. Check selected service, pinned SDK, platform representation, all 12 selected keys, unavailable/undefined lists, exact base64 and receipt-clock provenance. Interpret explicitly, then save explicitly; confirm one source record and no prior automatic save. Double-tap Save: the unchanged document must not insert twice. Editing must invalidate stale findings until reinterpreted.

**U8 · Verify, reopen, reload**
In Evidence choose the BLE verify/reopen action. Digest verification must precede fresh interpretation. Compare the saved exact document with the transferred string, including whitespace/case/nulls, and compare decoded values to the relevant platform representation. Reload/relaunch the app and repeat: the saved record persists; unsaved observation callbacks do not. Native persistence must be checked on the phone, not inferred from browser SQLite tests. Confirmation of a digest means content integrity only. Tamper rejection is a separate local test-database/fault-injection case; do not modify the user's real evidence database to force it. Leaving Evidence during reopen must not later display stale results on another screen.

## Native App connection cancellation (C1–C3: NOT RUN)

### Current narrow unissued-acquisition exception (host-tested; phone NOT RUN)

Runtime candidate `96cc5edd2d576d17cab2d365ccea77edee2baede` adds an exact,
one-shot trusted-adapter proof for initial explicit cancellation and normal Android
permission denial/cancellation **before this attempt calls getManager**, after successful scanner
stop and a clean settled prefix. A pending permission request still blocks cleanup;
only its normal complete canonical result can qualify. This releases only the
rejected transport attempt, never global manager uncertainty or a native connection.
Readiness, unexpected/malformed permission results, scanner/busy/health/epoch errors
and every issued listener/connection effect remain unconfirmed. There is no App
rewrite, automatic reconnect or new iOS recovery. See the
[current receipt contract](proposals/ble-unissued-acquisition/IMPLEMENTATION.md).
All phone cases remain NOT RUN; earlier source/test findings below retain their
original revision scope and are not retroactive claims for this candidate.



Source cross-check: `386cdaf957d49078cf660fd936def0b6ebfa219a`, including
`App.tsx`, [APP_SESSION_CANCELLATION.md](APP_SESSION_CANCELLATION.md),
[APP_SESSION_CANCEL_INDEPENDENT_REVIEW.md](APP_SESSION_CANCEL_INDEPENDENT_REVIEW.md)
and [NATIVE_ACQUISITION_CANCELLATION.md](NATIVE_ACQUISITION_CANCELLATION.md).
These are source/host-test expectations, not mounted UI, browser, native build or
phone observations. Record the actual run revision separately. This plan grants
no execution permission: connections/negotiation use only separately authorized
fixtures; unavailable physical branches are BLOCKED. Hard-to-reach timings remain
NOT RUN or separately labeled local fault-injection results, not reasons to add
stress, malformed traffic, installs, resets, settings changes or flashing.

**C1 · Global Cancel during prior cleanup, setup and negotiation — NOT RUN**
For native simulator, Android USB and Android/iOS BLE separately, locate
**NATIVE APP SESSION CONNECTION** during a connection attempt, including while
closing the previous session. **Cancel connection attempt** must remain available
while busy and across Console, Devices, Analysis, Evidence and Research. Navigation
alone is not this cancellation action. Press it once: the disabled label becomes
**Cancellation requested · waiting for cleanup**. The notice is
“Cancellation requested. Waiting for outstanding work and cleanup; permission
prompts may remain open.” Repeat/stale presses must not cancel a successor.
Simulator results remain software-only. Browser-owned work uses its separate
BrowserAxpControls; this native control must not be inferred to cover it.

**C2 · Pending permission/raw effects and no preventable new work — NOT RUN**
Cover cancellation during prior-session close, permission/readiness, connection,
service discovery, Android MTU, characteristic setup and Info negotiation only
where safely observable under the fixture authorization. Cancellation during prior
close must prevent creation of the next session. Once cancelled, no next setup
phase, Capabilities request after pending Info, or successful connected display
may be published. Already-issued effects may still complete; a permission sheet
may remain open. Returning from it must not resume preventable new work. The
original operation remains busy until outstanding open/raw effects and cleanup
settle; neither the press nor a timeout unlocks it. A hung effect may keep it busy
indefinitely. UI visibility alone cannot prove native call order or release;
mark those claims NOT VERIFIED without scoped evidence, and leave unexecuted
cases NOT RUN.

**C3 · Settled cancellation versus unconfirmed release — NOT RUN**
After settlement distinguish “Connection attempt cancelled. Local cleanup
completed. Start another connection explicitly.” from “Connection attempt
cancelled. Transport release is still unconfirmed. Use Disconnect to retry
cleanup; Bluetooth may require explicit Android recovery.” Neither notice proves
physical release. Unknown release retains the selected session fence even after
busy clears and capabilities disappear. Console **Disconnect**, when enabled
once work settles, is an explicit cleanup retry, not guaranteed recovery. In
particular, dispatched BLE acquisition rejection can retain transport uncertainty
even when the manager appears idle or cancellation preceded physical connection.
Android **Reset APEX Bluetooth** is only the separate explicitly approved B3
recovery case; it cannot bypass pending operations. iOS Reset remains disabled.
No automatic retry, reset, replacement connection or evidence deletion is expected.

## One-tag phone NDEF selected fields (N1–N7: NOT RUN)

Use a separately authorized tag and provisioned NFC-capable build. These cases concern **Read one phone NDEF tag**, not the legacy metadata reader or serialized offline NDEF parser. The contract is OS-normalized selected records from react-native-nfc-manager 4.2.0, not original tag/wire bytes. Native entitlements, permission handling and supported tags remain independent gates. Do not write a tag or open a tag URL for this plan. If a failure or timing race cannot be induced safely, leave that branch NOT RUN or use a separately identified fault-injection build; mock results never substitute for phone execution.

**N1 · Explicit start, permission and foreground lifecycle — NOT RUN**
Visiting Devices must not start NFC or request permission. Explicitly start while active, with no accessory session, scan, BLE observation or metadata reader. Record any native sheet and platform permission state. Transient `inactive` during an already requested native/permission sheet must not cancel the read, but must prohibit a new start; returning active must not start a second reader. Actual `background` cancels and never auto-resumes on return. Check denial, cancellation and delayed preparation separately, without silently changing permissions. Concurrent NFC/connection/discovery/observation starts must be blocked until ownership is released.

**N2 · One callback and preparation-inclusive monotonic deadline — NOT RUN**
Count preparation from the explicit start, including status/permission and native registration. Accept at most one callback strictly before the 30-second elapsed deadline, then request cleanup; multiple records in that one callback are not multiple tag captures. At/after the deadline, reject the callback even if the JavaScript timer has not dispatched. Timing must use a monotonic elapsed clock independent of wall-clock receipt time, including when wall time moves forward/backward. The monotonic correction is an implementation gate: verify it exists in the tested revision rather than assuming this checklist proves it. Use a separately labeled clock/delayed-dispatch harness if required; do not change phone clock settings without approval. Expiry requests cancellation, not proof of native release. Pending startup after expiry must settle and clean up without restarting or offering a late capture.

**N3 · Exact selected fields and separate receipt clock — NOT RUN**
For Android and iOS independently, compare the retained source document against the callback’s selected `ndefMessage` records: `tnf`, `type` byte array, optional record `id`, and `payload` byte array, preserving order and values. Android record IDs are hex strings, including their case; iOS record IDs are byte arrays. Preserve an omitted record ID as omitted. Do not include the tag identifier, technologies or other tag metadata. Retain the correct platform, pinned SDK and unverified recorded-import provenance. The new selected-field JSON is not an exact serialization of the entire native callback and must never be reconstructed or labeled as original NDEF wire bytes. Record app callback receipt time separately from this document and from monotonic duration; it is neither an RF/tag timestamp nor the journal save time. A visual check alone cannot establish exact-string equality; record NOT VERIFIED unless a local comparison is available.

**N4 · Cleanup uncertainty and explicit Stop — NOT RUN**
After a valid callback, withhold Inspect while native cleanup is pending or fails. A retained in-memory candidate must not imply released ownership. Restart and conflicting modes remain blocked. Explicit Stop may retry cleanup without starting a new read. On iOS, a close event alone must not release a still-pending unregister operation. Only confirmed cleanup makes the candidate available for Inspect. If cleanup hangs, retain the blocked state rather than showing false idle after a timer. Record ordinary production behavior and any injected failure separately. In the installed 4.2.0 JavaScript facade, Android subscribes StateChanged, not SessionClosed: state change is not unregister completion, and successful unregister callback completion is the Android release boundary. iOS additionally requires SessionClosed; its user-cancel closure maps to null, whereas an operation rejected with the same `NFCError:200` maps to UserCancel. Neither error text nor a null closure alone proves pending native work has settled.

**N5 · Explicit Inspect, interpretation and persistence — NOT RUN**
After release, press **Inspect captured phone NDEF fields**. It must replace the Offline phone NDEF selected fields draft with the exact selected document and platform, without interpreting or saving. Interpret explicitly, then Save explicitly. No record may be inserted merely by capture, cleanup or Inspect. This differs from the legacy metadata reader’s automatic local save after its explicit start. Double-tap Save must not duplicate an unchanged document; edits/platform changes invalidate previous findings, and stale save completion must not restore them. Verify/reopen must check the digest before fresh interpretation; check exact document equality, local persistence after relaunch, and failure on a separately authorized test-database tamper. Unsaved captures do not persist. URI text remains inert; no navigation, upload or provider request occurs.

**N6 · Absent, malformed and oversized data — NOT RUN**
Test missing `ndefMessage`, null and empty array separately: report unavailable honestly and offer no inspectable record document. Malformed TNF/field encoding, wrong platform-specific ID representation, and over-limit data reject the whole callback without truncation, partial success or automatic save, then clean up. Limits in the current adapter are 64 records, 8,192 payload bytes per field, 8,192 aggregate type/ID/payload bytes, 255 type/ID bytes, and 40,000 source-document characters. Record the tested revision’s constants. Unsupported data must not be coerced into a serialized-message envelope. Synthetic/fault-injected boundary cases remain labeled as such, not physical tag observations.

**N7 · Navigation, unmount, duplicate and stale callbacks — NOT RUN**
During preparation and reading, separately leave Devices, background the app and unmount the owning view. Expect cancellation, suppression of late callbacks and no automatic restart on return/remount. Duplicate callbacks cannot replace the accepted snapshot or produce another save; mutation of the original callback object cannot alter retained selected fields. After explicit restart following confirmed release, retained callbacks from the old generation must be ignored. Distinguish a retained old JavaScript callback from a newly delivered SDK global event: the installed facade supplies no generation identity and routes a fresh tag/closure event to the currently installed listener. Do not require the app to identify that event as stale from metadata it lacks, or infer actual native queue ordering from a fake schedule. Record that ordering as NOT VERIFIED without separate native evidence. A late successful registration after cancellation must still be cleaned up before reuse. Also leave Analysis/Evidence during pending work: stale interpretation, save or reopen completion must not replace a newer draft or display results on the wrong screen.

The installed NFC JavaScript evidence in
[NFC_JS_FACADE_HOST_REVIEW.md](NFC_JS_FACADE_HOST_REVIEW.md) and
[NFC_JS_FACADE_INDEPENDENT_REVIEW.md](NFC_JS_FACADE_INDEPENDENT_REVIEW.md)
executes pinned SDK JavaScript with fake React Native callbacks/events and a host
export bridge. It is not Metro, native queue, registration-rejection acquisition,
phone permission or physical release evidence. The independent correction fixes
host fixture isolation, not a production lifecycle defect. N1–N7 remain NOT RUN.

## BLE ownership and explicit recovery (B1–B5: NOT RUN)

These cases supplement U1–U8, not authorize new connections, pairing or writes. Use only an already authorized AXP fixture/session; otherwise mark physical branches BLOCKED. See [BLE_CONNECTION_OWNERSHIP.md](BLE_CONNECTION_OWNERSHIP.md) for source-derived expectations. Reset UI/recovery and Android broad service-data mode are source-implemented at the cross-checked revision, but may be absent from an older tested build: record feature availability, not assumed acceptance.

**B1 · Ordinary terminal disconnect and same-ID reconnect — NOT RUN**
For Android and successfully connected iOS sessions, test a normal disconnect and explicit reconnect to the same authorized peer. Setup/cancellation must settle and the old terminal disconnect event must be consumed before same-ID reuse. Cancellation settlement without that event can release native ownership while retaining the same-ID fence. Normal confirmed terminal disconnect/reconnect must not require an exceptional Reset. Notification unsubscribe must not remove connection-close tracking. Installed PLX 3.5.1 `monitor.remove()` requests native `cancelTransaction`; its ReadEvent subscription can remain until the monitor Promise settles. Verify late data cannot reach the closed session, but do not treat unsubscribe, JS listener removal or suppression of delivery as native monitor completion. Actual native transaction/queue ordering remains separately unverified; [the PLX host fixture](../tests/plx-facade-host/README.md) executes installed JS with fake native events, not a phone. Stale listeners must not close a newer connection, notify its consumers or deliver old packets. Record event ordering without claiming an identifier authenticates the peer.

**B2 · Pending setup/cancellation and uncertain ownership — NOT RUN**
Pending connect, service setup or cancellation must block manager shutdown/recovery. An early close while connect is pending is not proof that a later connection cannot appear; a close during cancellation does not waive settlement. Failed cancellation retains unknown ownership unless independent post-connect closure proves release. Unknown ownership blocks ordinary scan/connect/write operations; explicit disconnect may retry cleanup. A hung native promise may block indefinitely: no JavaScript timeout can certify release, and Reset is not universal recovery. Timing/failure injection needs a separately identified build and cannot be counted as production phone acceptance.

**B3 · Settled Android explicit Reset only — NOT RUN**
Once native operations settle, test **Reset APEX Bluetooth** only by explicit operator action in a build that includes it. Successful acknowledged manager destruction may clear BLE candidates, BLE session and retained fences, invalidate old handles and allow later explicit work. Record any old-handle local cleanup error separately from confirmed manager release. Reset must not change the OS Bluetooth setting, delete saved evidence, or automatically restart scans/connections. Confirm that ordinary successful disconnect does not trigger Reset. No recovery is inferred merely from a resolved UI action.

**B4 · Failed teardown and unrelated transports — NOT RUN**
Pending or failed manager destruction must not falsely clear the BLE session/candidates, mark unknown ownership healthy or claim successful release. Ordinary scan-stop progress may change independently. Retry only explicitly when the implementation safely permits it. Compare saved evidence before/after. An existing USB, host or simulator session must not be closed or cleared by Bluetooth recovery; use authorized fixtures or separately labeled local injection for unavailable transports. Do not connect new hardware simply to satisfy the case.

**B5 · iOS acknowledgement boundary and mode scope — NOT RUN**
With pinned react-native-ble-plx 3.5.1, iOS `destroyClient` is a void bridge method: JavaScript settlement is not native teardown acknowledgement. **Reset APEX Bluetooth must remain disabled on iOS** (also unavailable on web). The source-implemented broad service-data mode is Android-only and must reject iOS before preparation; do not claim it is present or accepted until the tested build includes it. Existing selected advertised-UUID observation remains a separate iOS path covered by U1–U8. Successful ordinary iOS terminal disconnect fencing does not repair the destruction acknowledgement gap or authorize broad-mode reuse.

## NFC metadata versus offline NDEF

For metadata NFC and ordinary AXP accessory discovery, first test a queued Start dispatched after background cleanup: it must recheck the live foreground state and refuse acquisition. Start must also fail in transient inactive state; an already requested operation follows its separately documented lifecycle. Stop must remain available after backgrounding and during NFC startup. These are dispatch guards, not proof that already-pending native work cannot complete after backgrounding.

With a separately authorized tag and explicit **Start NFC reader**, check foreground metadata and its existing local evidence behavior; note that the metadata reader can automatically save after this explicit reader start. Stop/background and record lifecycle behavior independently. Metadata (identifier, technologies, record types/payload lengths) is not raw serialized NDEF or complete radio evidence. Never reconstruct original bytes from that dictionary.

Separately load the synthetic offline NDEF example `d101055402656e4869`: expected English text `Hi`, synthetic provenance, no NFC reader activation. The URI fixture remains inert text, never opens a link. Interpret/save/verify/reopen use the offline NDEF record kind. Neither fixture proves physical tag reading; a native NFC record must not be accepted as a serialized-message envelope. iPhone provisioning/entitlements and actual tag compatibility remain independent gates.

## Copyable report (one per phone and case)

```text
Case ID / date / tester:
Result: PASS | FAIL | BLOCKED | NOT RUN
Phone model / hardware revision / OS version + build:
APEX exact commit / dirty-tree diff reference / app build ID / artifact hash / debug-or-release:
Latest applicable verification manifest / its tested commit / relevant actual results:
Native compilation evidence / install already provisioned by:
Permission state before / prompt exact text / user choice / state after:
neverForLocation: enabled (unchanged); Bluetooth OS state:
Authorized fixture identity / ownership or authorization scope:
Fixture source path + digest / expected service list / exact payload hex:
Emitter hardware + firmware + configuration / independently measured RF evidence:
Selected UUID / actual SDK field UUIDs / filtering caveats:
Android delivered raw AD hex OR iOS normalized service data + opaque raw base64:
Exact source document local reference + digest / missing-null-undefined fields:
Timing: monotonic elapsed start/deadline/release; separate app callback wall-clock receipt; journal save time:
Ownership / pending native operations / terminal event / teardown acknowledgement / explicit recovery:
Native cancellation phase / tab / exact labels / pending permission / raw-effect and cleanup settlement:
Retained old callback vs fresh SDK global event / native ordering evidence or NOT VERIFIED:
NDEF selected document/platform / missing-null-empty state / rejection without truncation:
Expected behavior / actual behavior / callback count / termination reason:
Transfer exact-string comparison method + result:
Save record ID / duplicate prevention / verify-reopen / relaunch persistence:
Local screenshots or logs (redact unrelated devices; no secrets):
Residual limits / untested branches / smallest next action:
```

A pass is limited to the named phone, build, fixture and case. No universal compatibility, authenticated identity, complete capture, RF-passive operation, transmission timing or successful unlocking claim follows from this plan or its software tests.


## Android service-data opt-in acceptance (all NOT RUN)

Also exercise unexpected accessory disconnection: displayed capabilities should
clear, but **Disconnect** must remain available while the app still holds that
session. Choose it to release the local reference before starting another
observation. Empty capabilities must not be treated as proof the session was
released. Native BLE ownership checks remain separate; failed or pending native
cleanup can still block reuse or require the documented recovery path. A stale
disconnect callback from a previous session must not clear a newer one.

The separate Android-only Devices card is now source-implemented. It deliberately
receives broad SDK callbacks before JavaScript service-data matching; it is never
a fallback for advertised-UUID observation. Use a controlled authorized test space
and record unrelated ambient data exposure. iOS stays disabled even though an
unapplied native acknowledgement proposal exists.

**S1 · Consent and selected service.** Merely visiting must not scan or ask for
permissions. Start requires the one-session broad-reception opt-in. Changing
FCD2/FEAA, leaving Devices, backgrounding, starting, clearing or finishing consumes
or clears it. Returning never restarts. Verify the selected service, bounds and
privacy limitations are visible.

**S2 · Exclusive operation and cleanup.** While preparing/running/stopping, verify
that advertised-UUID observation, AXP discovery/connect/write, NFC and new device
sessions cannot start. Stop remains callable during preparation. Test delayed
permission, start/stop/destruction and late callbacks with a separately labelled
fault-injection build; no timeout alone permits reuse. Unknown completion blocks
Inspect and device work until successful explicit Android Reset. Failed Reset
leaves the fence, successful Reset clears rejected sources and requires new opt-in.

**S3 · Matching and budgets.** Using separately authorized known FCD2/FEAA emitters,
compare service-data-only versus separately advertised UUID lists. Record total
processed callbacks, matches, nonmatches, unavailable, malformed, SDK errors,
retained count and characters distinctly. Verify 100 processed callback, 25
retained match and 65,536-character caps and the cooperative 10-second window.
These are not native queue/cache or RF limits. No matches proves no absence.

**S4 · Exact source handoff.** Only a reusable completion offers source rows.
Verify four-row pages, exact selected-source transfer to BLE Analysis, separate
Interpret and Save, and no automatic persistence or provider submission. A matching
source may contain unrelated fields. Confirm uncertain sources never become
inspectable merely after late teardown or Reset.


## Legacy NEC/CAN/REA recording state (all NOT RUN on phone/browser)

Editing or replacing a recording must immediately remove the prior displayed
report and disable Save until explicit analysis. While an earlier explicit save
is pending, a new draft/report may replace the display; the pending save must
retain only its originally selected analysis and may not restore that report.
A completed insert followed by evidence-list refresh failure must be described
as saved with failed refresh, and the unchanged saved draft stays consumed.
A failed insert can be retried only for a still-current interpreted draft.
These cases concern existing derived-summary schemas, not newly retained raw
NEC/CAN input or proof of the original firmware binary. Use separate local
fault-injection fixtures for delayed/failing storage, never alter real evidence
to force a case.
