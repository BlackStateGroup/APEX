# Service-data-only BLE observation: filter review

7 November 2026. Source-backed filter research and design; no scans, native builds, OS permission grants or transmissions. The current app wording now discloses advertised-UUID filtering. Broader acquisition alternatives below remain unimplemented.

## Finding and UI consequence

**Android: confirmed filter mismatch.** APEX passes a one-element UUID list to PLX3.5.1. Its installed `android/src/main/java/com/bleplx/adapter/BleModule.java:1192–1199` constructs RxAndroidBle `setServiceUuid`, not `setServiceData`. RxAndroidBle1.17.2 compares that filter to `scanRecord.getServiceUuids()`. Its parser populates that list from service-list AD types 0x02–0x07; service-data types 0x16/0x20/0x21 populate a separate map. A service-data-only FCD2 advertisement does not satisfy this UUID-list predicate. A scan response that separately includes the UUID could change the delivered result; test the actual combined advertisement/response, not just one example string.

The official [BTHome format](https://bthome.io/format/) requires 16-bit service data, recommends Flags, and permits an optional name. It does not require a separate advertised-service list. Its published example, already used by APEX, has no such list. Consequently current Android behavior cannot be described as general BTHome discovery: a conforming BTHome broadcaster can be excluded before JS sees it. This is separate from Android `neverForLocation` filtering.

**iOS: native filter forwarding confirmed; service-data-only delivery is not established.** PLX's installed podspec pins MultiplatformBleAdapter0.2.0. At tag commit `3601846076c7749e9419ea93cf20f3357e7d5617`, `iOS/classes/BleModule.swift:212–238` converts supplied UUIDs and calls `scanForPeripherals(withServices:uuids,options:...)`. `iOS/RxBluetoothKit/RxCBCentralManager.swift:101–107` forwards them unchanged to CoreBluetooth. No service-data predicate or fallback is added. Apple's [API documentation](https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/scanforperipherals(withservices:options:)) describes filtering advertised services and separately exposes [service data](https://developer.apple.com/documentation/corebluetooth/cbadvertisementdataservicedatakey). These public sources do not settle whether every iOS version matches a UUID carried only in service-data AD. Treat omission as a compatibility risk and service-data-only support as UNVERIFIED, rather than claiming a proven universal iOS exclusion or inclusion. No Apple internals or physical scan were inspected.

Suggested truthful current UI: **“Advertised-service UUID filter: FCD2. Service-data-only BTHome advertisements may be omitted; Android requires the matching service UUID list. Zero results do not prove absence.”** The existing FEAA synthetic fixture includes a service list; do not extrapolate from its success to FCD2.

## Sources pinned to dependency versions

- Installed PLX3.5.1 `BleModule.java:1195`, `BlePlxModule.java:207–232`, and `src/index.d.ts:157–177`: exposed options are duplicates, scan mode, callback type, legacy scan. There is no JS service-data filter option.
- [RxAndroidBle1.17.2 ScanFilter](https://github.com/dariuszseweryn/RxAndroidBle/blob/release-1.17.2-rxjava2%2Brxjava3/rxandroidble/src/main/java/com/polidea/rxandroidble2/scan/ScanFilter.java), blob `31148eff8940bae37d1dcaa12c75eaf0cf2d0682`, lines328–348: UUID and service-data predicates are distinct.
- [Pinned ScanRecordParser](https://github.com/dariuszseweryn/RxAndroidBle/blob/release-1.17.2-rxjava2%2Brxjava3/rxandroidble/src/main/java/com/polidea/rxandroidble2/internal/util/ScanRecordParser.java), lines107–156: AD list vs service-data map separation.
- [Pinned AndroidScanObjectsConverter](https://github.com/dariuszseweryn/RxAndroidBle/blob/release-1.17.2-rxjava2%2Brxjava3/rxandroidble/src/main/java/com/polidea/rxandroidble2/internal/scan/AndroidScanObjectsConverter.java), blob `fed2de1d4dc03ba7be6710de54f98ccf80b56ad3`, lines68–80: distinct native setters preserved.
- [Pinned iOS adapter](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/classes/BleModule.swift#L212-L238) and [CoreBluetooth forwarding](https://github.com/dotintent/MultiPlatformBleAdapter/blob/3601846076c7749e9419ea93cf20f3357e7d5617/iOS/RxBluetoothKit/RxCBCentralManager.swift#L101-L107).
- [Android ScanFilter.Builder](https://developer.android.com/reference/android/bluetooth/le/ScanFilter.Builder) documents separate service-data and service-UUID filtering APIs.

## Minimal explicit opt-in broad-receive design (not implemented)

Keep existing narrow mode as default. Add a separate, one-session **“Find service-data-only FCD2 advertisements”** opt-in (FEAA may use the same explicit design). Before Start explain that the SDK temporarily receives nearby advertisements without a UUID-list filter, that only callbacks containing chosen service data enter the workbench, that unrelated callbacks can exhaust the cap, and that OS/SDK may retain transient device metadata. Never silently retry a zero-result narrow scan broadly.

1. Require active foreground, selected FCD2 or FEAA, explicit Start and existing exclusive lease. No AXP connection/discovery or NFC work concurrently. Keep permissions and neverForLocation unchanged. No pairing, connection, GATT write, advertising, automatic save or network output.
2. Start PLX with `UUIDs:null`, not an empty/modified guessed service list. Fixed 10-second total deadline including preparation; hard **100 total SDK callback deliveries**, **25 retained matching callbacks**, and **65,536 retained serialized characters**, whichever ends first. These are proposed explicit budgets, not current broad-mode behavior. Use a monotonic deadline checked at callback entry as well as a timer. Count every callback before filtering, including unrelated, invalid, duplicate and empty/error callbacks; errors terminate. On the 100th callback, permit at most that callback's bounded processing, then invalidate/stop synchronously. Never count only matches.
3. Membership gate is a bounded inspection of own service-data keys normalized to the selected base UUID, not name, RSSI, identity or mere service-list membership. Reject ambiguous aliases/accessors/oversized maps; do not execute getters or arbitrary methods. Cap inspected keys/string lengths before allocating or decoding. For Android raw-only fallback, use a strictly bounded AD parser and verify actual selected-service data. Do not serialize or log nonmatching Device objects. Drop their references immediately. Maintain only aggregate total/matched/rejected counters.
4. For matches, preserve the existing exact selected-source document and validation limits; malformed/oversized selected data terminates without truncation. “Only chosen service retained” must mean **only callbacks matching that service are retained**, not “all other bytes are redacted”: a matching callback's exact raw AD or service-data map can contain other service/manufacturer data. Either disclose this scope or introduce a separately named redacted projection, never falsely label redaction an exact source snapshot.
5. Preserve existing stop/background/navigation/cancellation, stale-callback suppression, bounded cleanup, fail-closed poison state and explicit retry. Report total-budget exhaustion separately from no matches. Phone source evidence retains callback-receipt timing, not on-air timing. No retention/authentication/completeness guarantee arises from the broader mode.

### Important SDK retention and hard-cap limitation

PLX Android `BleModule.java:1201–1204` inserts **all discovered devices** into a manager-level `discoveredDevices` map before emitting JS events. `stopDeviceScan` does not clear that map; `destroyClient` calls `clearActiveConnections`, which does (`:129–154`). Thus a JS-only broad mode cannot promise that unrelated devices are never retained by the SDK or that a JS callback cap bounds native allocations/queued events. Nor can it guarantee stop exactly at a wall-clock deadline if JS is blocked.

The smallest honest JS design can bound **application-processed callbacks and retained workbench snapshots**, disclose native transient caching, and require successful manager destruction after each isolated broad session to clear PLX's Android device map, with no concurrent accessory session. Recreating a manager must be an explicitly designed lifecycle step, not an unreviewed automatic recovery of unknown state. Destruction does not establish OS cache deletion. Verify iOS manager/cache lifetime separately.

If the product requirement is a hard bound on **all native callbacks/SDK retention**, the implementation must add native entry-point counters/deadlines before caching and event emission, or use a dedicated observation-only native scanner with no discovered-device cache. JS-only PLX reuse does not meet that stricter requirement. This distinction must be explicit before implementation approval.

## Android-specific narrower alternative

Expose a deliberately scoped native service-data filter: `setServiceData(selectedUuid, new byte[0])`, without also setting `setServiceUuid`. In the pinned RxAndroidBle matcher, a non-null empty data prefix accepts a present service-data value without constraining payload bytes; absence rejects. Its converter maps this to Android's native service-data filter. An empty byte array avoids the pinned matcher's null-data ambiguity. Test actual Android controller/offload behavior; this is a source-level design, not executed proof.

This requires an Android native bridge/SDK change because PLX3.5.1's JS scan API cannot express it. It avoids broad delivery to JS and PLX caching of unrelated filter rejects, while still requiring bounded native callbacks, lifecycle tests and neverForLocation caveats. Do not combine UUID-list and service-data predicates in the same filter: that would require both and recreate the omission. An OR of separate filters changes accepted scope and needs its own tests. iOS has no equivalent service-data filter exposed through this pinned SDK/CoreBluetooth call, so its strategy and limits remain separate.

## Required tests before changing the promise

Use synthetic controller tests for 100 nonmatches, mixed matches/nonmatches, duplicate/invalid callbacks, deadline checks, cancellation while permission is pending, filtering before retention, cache teardown failures, late callbacks, exact source provenance and no AXP lease interference. Native test builds must verify budgets before SDK caching if claiming native hard caps. On named authorized phones/emitter fixtures compare service-data-only versus explicit-list+service-data advertisements under both selected modes. Keep iOS-only matching behavior unresolved until observed; record neverForLocation unchanged. No result should claim full capture, transmitter authenticity or verified RF-passive behavior.

## Offline membership foundation (8 November 2026)

The [source-specific matcher](BLE_PLX_SERVICE_DATA_MATCHER.md) now implements a
pure selected-service gate, without enabling broader scanning. Android uses raw
AD exclusively; normalized fields never override or substitute for that source.
iOS uses its normalized service-data dictionary exclusively. This supersedes the
suggested normalized-first/raw-fallback predicate in design step 3 above, not the
unimplemented lifecycle/budget controls.

Installed PLX 3.5.1 is a singleton: `src/BleManager.js:75–80` returns the existing
shared instance; native creation is at `:111`, and `destroy():151–165` awaits native
destruction before removing the shared instance. A future broad session must
exclusively own/recycle the shared manager and refuse active accessory work.
Constructing two managers does not isolate caches or sessions. No such native
lifecycle change is implemented by the offline matcher.
