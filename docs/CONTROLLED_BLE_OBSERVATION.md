# Controlled foreground BLE observation seam

This is code preparation, not a physical capture demonstration. An explicit native-only Devices trigger is wired; it has not been exercised on a phone. Importing the module does not create a BLE manager or request permissions. No new dependency, app permission, Android `neverForLocation` flag, or SDK version is introduced.

## Superseding completion scope (8 November 2026)

The lifecycle/SDK review wording below describes JavaScript settlement, not native
scan acknowledgment. Installed iOS PLX start/stop exports return void: Stop fences
local collection, removes the JS listener and dispatches an SDK stop request;
its Promise can settle without native completion input. Android settles after its
adapter call, which still does not prove radio cessation. “Cleanup”, “start
acknowledgement” and local lease reuse below must not be read as native release.
Native ordering and radio behavior remain unverified. Ordinary discovery,
connection handoff and offline Inspect remain available; iOS Reset and exclusive
service-data gates remain closed. See [boundary audit](IOS_SCAN_VOID_BOUNDARY_REVIEW.md),
[scope correction](PLX_SCAN_SCOPE_CORRECTION.md) and
[current copy checks](SCAN_COMPLETION_COPY_REVIEW.md).

## Explicit API

`startForegroundObservation(options)` in `src/platform/bluetooth.native.ts` accepts exactly one selected public service: `FCD2` (BTHome) or `FEAA` (Eddystone). It expands that UUID to the Bluetooth base UUID and passes a one-element SDK filter. Other UUIDs and broad scans are rejected. This matches separately advertised service UUIDs, not guaranteed service-data-only advertisements. Standard BTHome service-data-only broadcasts may therefore be absent; this is not a general BTHome acquisition path. Web throws an unavailable error. The returned session exposes `stop()` and `done`; `onEnd` fires once after cleanup. Invalid options, non-foreground state, and a busy scanner throw before starting.

The receipt clock is mandatory and supplied by the caller. Each accepted callback uses it once. `callbackReceivedAt` and `timestampBasis: caller-supplied-sdk-callback-receipt` identify its semantics. The existing offline selected-source document schema requires `recorded-import` with `capturedAt`; its provenance label explicitly says this is SDK callback receipt, NOT hardware transmission time. It is not a live/native verification claim. The source label also retains the selected service. The UI keeps the explicit receipt basis while collecting and preserves the exact labeled source document when transferring it to Analysis; it never relabels the time as over-air timing or authenticated reception.

The adapter prepares an exact bounded document of selected SDK fields, not a complete Device object or radio capture. Android `rawScanRecord` is AD bytes; iOS `rawScanRecord` is opaque base64 JSON and the interpreted information is normalized SDK fields. Missing Android raw data stays unavailable, never synthesized. Invalid fields or a selected document over 4096 characters terminate with an error, rather than truncate, omit, or invent bytes. Source callbacks are delivered transiently; the controller does not retain a device list, save evidence, export files, or invoke Device methods. Saving through the Analysis workbench requires a separate explicit action.

## Bounds and lifecycle

Defaults: 10 seconds (including preparation), 25 accepted callbacks, 65,536 cumulative serialized observation characters. Hard upper bounds: 30 seconds, 100 callbacks, 409,600 characters. Values must be positive integers. Each observation includes at most the existing 4096-character source document plus a bounded envelope; source validation has its own field and aggregate limits. The budget counts JavaScript string characters, **not allocated bytes**. There is no controller collection; consumers must not retain arbitrary additional SDK state. Duplicate callbacks consume the count and character budgets; no device identity deduplication or unique-device inference is made. Observation requests SDK `allowDuplicates: true` for bounded repeated updates, while AXP discovery retains `false`. PLX 3.5.1 documents this option as iOS-only; Android uses its default callback policy. Neither setting guarantees all advertisements, unique callbacks, or complete capture.

A background AppState invalidates observation callbacks immediately and requests stop. The transient inactive state (including an iOS permission sheet) does not cancel an already explicitly requested session; a new session still requires active state. Stop, errors, expiry and bounds also invalidate late callbacks before cleanup awaits. Cancellation during permission/preparation prevents a later SDK start, even if the OS permission dialog cannot be dismissed. The core races cancelled preparation; the native preparation checks its abort signal around asynchronous work and removes the state subscription. A pending OS dialog may remain visible until the user answers it.

SDK start/stop are asynchronous. If termination happens while start acknowledgement is pending, the controller requests an early stop and then another stop after start settles or its cleanup grace expires, retaining its exclusive lease until cleanup completes. Unresolved start acknowledgement, early stop and final stop each have a two-second cleanup grace; expiration reports an error, resolves `done`, notifies `onEnd` once, and poisons that controller. Cleanup therefore adds at most six seconds after invalidation, even if SDK promises never settle. Its manager must be successfully destroyed before creating a fresh controller. Late callbacks remain invalidated; unresolved native operations are not presumed stopped. A wall-clock deadline cannot guarantee a malfunctioning OS has stopped its radio. Any stop rejection reports an error once and poisons that controller against further scans. Successful manager destruction via `shutdownBluetooth()` is required to reset it; a failed destroy does not reset it. Unhealthy state blocks new scans, connections and existing connection operations, not just the current scan. A failed destroy also marks the manager unhealthy. Consumer callback exceptions cannot strand the scanner lease.

## Shared manager and AXP scope

Observation and original AXP discovery share one dependency-injected scan controller. An overlapping start is rejected as busy rather than silently replacing a listener, widening a filter, or stopping another mode. Call stop and await cleanup before switching. The global stop functions intentionally cancel whichever scan owns the manager, including pending preparation. AXP connection cancels discovery/observation before preparing a connection. It retains an exclusive setup lease through connect, service discovery, MTU negotiation and characteristic validation; competing connections, scans and shutdown reject while setup is pending. The lease releases in finally, including failures. Connection handles validate manager health and epoch before subsequent operations and reject after reset. Shutdown cancels the same lease before destroying its manager. Observation has no connect/pair/write operation.

AXP retains its original service UUID, name/RSSI projection, 10-second discovery window, connection/characteristic discovery, MTU request, notification and write paths. Discovery now also has count/character bounds, returns its cancellation handle before preparation completes, reports preparation/start errors through `onEnd`, rejects overlapping starts, and emits only one terminal callback. This is a deliberate lifecycle fix: the prior error path could call `onEnd()` and then `onEnd(error)`. The AXP UI continues to consume errors via its end callback; observation controls additionally block ambiguous overlapping operations. There is no change to AXP characteristic write authorization or transport semantics.

## Pinned SDK review and physical limits

Reviewed the installed exact `react-native-ble-plx@3.5.1` `src/index.d.ts` and `src/BleManager.js` startDeviceScan/stopDeviceScan implementations. Both return promises. Start installs a manager-wide event subscription; stop removes that subscription and calls native stop. The SDK documents automatic stopping of an earlier scan when starting another, which is why APEX owns exclusivity above it. Selected field semantics remain documented in `BLE_PLX_OBSERVATION_BRIDGE.md`.

This is **read-only observation at the application/GATT level, not verified RF-passive scanning**. The SDK/OS can transmit Bluetooth scan requests. No arbitrary radio payloads, connections, pairing, writes, identity attribution, complete-capture or authenticated-identity claims are part of this API. Android `neverForLocation` can filter some beacons; advertised-service filters, OS normalization and duplicate suppression can also omit observations. Zero results do not prove a service is absent. iOS and Android phone compatibility, permissions, foreground transitions and physical beacon results are untested. No native permission prompt, radio action or phone execution was performed during development.

## Verification

`node --test tests/ble-scan-session.test.ts tests/ble-native-observation.test.ts tests/ble-plx-observation.test.ts tests/ble-plx-source-evidence.test.ts tests/accessory.test.ts` exercises the pure controller, mocked native wrapper and existing source/AXP regressions. Native wrapper tests intercept modules with Node hooks and inject fake permission, AppState and BLE manager functions. They do not load the actual native runtime or use a radio. Semantic typecheck and Expo bundle exports are build checks, not native/browser acceptance. See `verification/controlled-ble-*` for exact outputs.

## Explicit app workflow

The Devices screen now provides an experimental native-only observation card. Select BTHome FCD2 or Eddystone FEAA, then explicitly start while using owned or authorized lab devices. Nearby matching broadcasts can appear; no inferred ownership is attached to names or identifiers. The app must have no active device session, accessory discovery or NFC operation. Existing native permission handling remains in the collector; no permission request runs merely by visiting the screen.

The UI adds a synchronous start guard, bounded in-memory copies, callback-receipt labels, stop and clear controls. It stops on leaving Devices; the native collector independently stops on background. A stopped callback can be explicitly opened in Analysis, replacing the current BLE document, without interpreting or saving it automatically. The Analysis workbench still requires interpretation and an explicit local save. Source claims remain unverified. Repeated callbacks do not establish distinct RF packets. Callback clock labels survive in the source document provenance.

No UI auto-reset destroys a manager or active connection after a cleanup error. A manager whose state is unknown fails closed; the operator is told to close and reopen the app. Browser controls remain disabled and explain that a native development build is necessary. Pure coordinator tests exercise lifecycle races, bounds, exact source transfer and stale callbacks. Semantic checks and JavaScript exports do not replace browser/native/physical acceptance.
