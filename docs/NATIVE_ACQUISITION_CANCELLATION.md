# Native acquisition cancellation correction

## Scope

This follows the independently reproducible integration baseline `6ddbb80`. Only two production TypeScript files change: BleTransport and the native Bluetooth adapter. No firmware, SDK, native project, or startup behavior was reviewed or changed. The C data callback fixture remains host-only pinned input, with unchanged C hashes and all previously stated acceptance limitations. The test input manifest updates only the changed BleTransport hash.

## Behavior

BleDriver.connect now accepts an optional AbortSignal. BleTransport owns its controller and aborts synchronously on disconnect. If cancellation precedes deferred driver dispatch, no driver call occurs and cleanup can complete without an unknown-acquisition flag. This conclusion follows the local dispatch flag, never exception text or an AbortError name.

Once a driver call is dispatched, its raw promise remains tracked. The optional signal does not race away, cancel, or release that effect. Legacy drivers can ignore it and remain compatible: returned handles are still captured and explicitly disconnected after settlement. A dispatched driver rejection still marks acquisition release unknown regardless of the error type or apparent native cleanup success.

The native adapter forwards the signal to existing permission/readiness preparation, checks it after scanner stop, and checks it through the existing current/open guards between every awaited setup phase. An already-issued native connect/discovery/MTU/characteristic request settles before the existing cancellation cleanup runs. No subsequent setup effect is issued. Cleanup guards do not consult the aborted signal, so cancellation remains possible. Failed cancellation still retains unknown native ownership.

## Remaining conservative behavior

After a dispatched native driver rejects, BleTransport has no returned cleanup handle or explicit release certificate. Consequently DeviceSession remains transportReleasePending even if the native adapter successfully cancelled, or if cancellation occurred during permission/readiness before any connection was issued. This is intentionally conservative. Manager ownership and transport release proof are separate; neither abort nor successful manager recovery silently clears the transport fence. No broad released-error shortcut was introduced. Installed iOS teardown acknowledgment and its closed reset gate remain unchanged.

## Verification

`tests/native-c-roundtrip.test.ts` covers simulated Android permission, Android/iOS readiness, pending connect, discovery, Android MTU, characteristic lookup, and failed setup cancellation. Each pending effect is held across close; the tests prove no next setup phase starts, and no cleanup starts before settlement where applicable. The existing full native-to-C wire cases still run.

`tests/ble-transport-release.test.ts` adds pre-dispatch cancellation and optional-signal/legacy-driver coverage. Two existing pending-acquisition tests now explicitly wait for actual dispatch before closing, preserving their original late-handle cleanup purpose. Raw initial failures before this test correction are retained in `evidence/native-acquisition-cancel/initial-existing-tests.txt`.

Final execution evidence is under `evidence/native-acquisition-cancel/`: source hashes and effect traces in JSON, focused-tests.txt, candidate-tests.txt, and typecheck.txt. The baseline failure and traces under `evidence/native-c-session/` remain unchanged. The pre-fix desired-behavior failure can still be reproduced on `6ddbb80` with the command in the baseline report.
