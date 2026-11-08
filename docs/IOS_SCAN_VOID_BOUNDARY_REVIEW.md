# Installed iOS scan completion boundary

Base: 3aca2bae4a4c45e671ae9949989663df2434dd5e. Isolated investigation only;
no production edits. Installed PLX 3.5.1 ESM bytes execute unchanged through the
existing loader; only RN/native boundary is synthetic. Source pins and execution
traces are in verification/plx-ios-scan-void/. Five focused tests pass; TypeScript
passes. No aggregate test, firmware review/build, native build, Metro/Hermes,
phone, radio, or OS queue execution was performed.

## Finding

The iOS stop Promise is a JavaScript completion, NOT an iOS native acknowledgement.

- ios/BlePlx.m:98–105 exports startDeviceScan/stopDeviceScan with no resolver or
  rejecter; the installed Swift header:299–300,355–356 also declares void methods.
- lib/module/BleModule.js maps directly to NativeModules.BlePlx.
- lib/module/BleManager.js:318–336 registers/removes the JS ScanEvent subscription
  and passes the underlying return into _callPromise. :146–160 uses
  Promise.race([destroyPromise, promise]); undefined therefore fulfills it.
- Installed RN React/Base/RCTModuleMethod.mm:510–519 classifies non-sync methods
  without RCTPromise parameters as normal, not promise methods. The legacy
  Libraries/BatchedBridge/NativeModules.js normal method enqueues without returning
  a Promise. This corroborates the declared boundary; it does not execute or prove
  ordering of the app's eventual architecture/bridge.
- Android BlePlxModule.java:208–254 accepts a Promise and resolves it after the
  adapter call. This is stronger adapter-call completion evidence, not RF release.
- src/index.d.ts:1124–1145 exposes Promise<void> on both platforms. That JS API
  type does not upgrade the iOS native export.

## Exact reproduced consequences

With iOS start/stop returning undefined, not async functions:

1. Ordinary scan stop settles, calls onEnd without an error, and allows another
   scan without receiving any native-completion input. JS subscription removal
   and old callback fencing still work.
2. bleDriver.connect awaits scanner.stop, then preparation/state and connect run.
   The recorded JS order is stop dispatch before connect dispatch. No native stop
   acknowledgement is required on this path. state() is readiness information,
   not scan-stopped evidence, and this test does not establish a queue barrier.
3. Foreground observation's real controller publishes reusable:true, healthy
   remains true, current is cleared, and ordinaryScanOperations drains. Its
   outstanding-Promise protection cannot see work behind a void bridge dispatch.
4. The real foreground workbench enters idle, uncertain:false, retains the bounded
   callback document, and allows document(1) for Inspect after that JS-only stop.
5. Android's boundary Promise does hold connection handoff until its resolution.

These are observations about JS and the declared bridge API. They do NOT reproduce
native scan/connection overlap, device failure, unsafe CoreBluetooth scheduling,
or actual late event delivery. A scheduled fake native-completion task would not
prove those things either. Error conversion from actual ScanEvent remains useful.
Async native start/stop rejection on iOS is not the installed normal contract.

## Existing barrier search and limits

The exported scan methods have no completion parameter. BleEvent in the installed
Swift header:404–423 lists scan/read/state/restore/disconnection/connecting/connected,
not a stop-complete event. BleManager's ScanEvent callback carries error/device,
not a scan-generation or stop token. Listener removal is local, and neither scan
silence, a timer, a state() read, nor a connection event proves scan release.

The podspec declares MultiplatformBleAdapter 0.2.0, but its Swift implementation is
not bundled here. The Objective-C wrapper supplies methodQueue to that adapter;
this is not sufficient proof of completion/barrier semantics. No existing exposed
scan-stop acknowledgement was found in the inspected installed interface. Proving
any native ordering guarantee requires the actual selected bridge/adapter source
and native acceptance, outside this investigation. No new barrier is invented.

## Scope correction and smallest justified choices

Required now: supersede the iOS native-ack interpretation in candidate scan reports
and labels. Held/rejected iOS start/stop Promise tests are hypothetical alternate-
contract fault tests; preserve them if useful, but pair with this void-return
fixture and never count them as installed iOS acknowledgement coverage. Android
Promise and both-platform callback/error/cap tests remain useful.

Existing ScanResult already says controller/SDK reuse, not physical teardown.
Thus reusable:true is demonstrably true for local controller availability; it is
not evidence of native stop. The misleading part is treating raw SDK settlement
as native acknowledgement, including the adapter comment saying each SDK effect
really settles, controller start-ack terminology, and any stronger report/UI claim.
The foreground workbench's error branch says 'Controller/SDK cleanup completed';
that should explicitly mean local listener cleanup plus stop request on iOS.
Normal 'Observation ended' is valid for local collection, not native release.
Inspect is offline use of retained immutable documents; it need not be disabled
merely because native-stop acknowledgement is unavailable.

Recommended smallest correction: tests/docs and precise local-versus-native
completion terminology, plus explicit platform stop-evidence metadata if callers
need to distinguish policy. Do not globally poison iOS or throw on every ordinary
stop solely because this fixture cannot prove OS ordering; that would remove useful
existing SDK functionality without demonstrating a native failure. Likewise do not
silently certify an exclusive release with reusable:true.

Acceptance choices for a production follow-up:

- Preserve ordinary iOS discovery and connection handoff as the existing SDK
  dispatch contract, explicitly unvalidated native ordering. Preserve local bounds,
  callback fences, independent connection leases and same-ID protections. Keep
  release-dependent capabilities closed until their stronger requirements are met.
- If a feature explicitly requires acknowledged native scan stop before reuse,
  close only that feature's iOS entry gate (before acquisition), or retain an
  explicit unacknowledged scan-ownership state for that policy. Do not retrofit a
  universal post-stop failure without planning recovery: iOS manager destruction
  is also unacknowledged and Reset is already unavailable.
- A new native completion API or verified existing native barrier would be a
  separate change requiring new evidence/acceptance, not a TypeScript await fix.

Broad service-data observation remains Android-only, and iOS shutdown still fails
closed after unacknowledged destroy. This finding does not justify weakening either
gate. Direct-manager/independent leases are untouched. No production change was
made or authorized by this report.
