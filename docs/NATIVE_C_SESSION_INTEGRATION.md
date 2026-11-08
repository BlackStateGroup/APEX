# Native adapter to C data-callback integration (host only)

**Historical baseline:** This report describes commit `6ddbb80`. The follow-up cancellation correction is documented in `NATIVE_ACQUISITION_CANCELLATION.md`; baseline traces and expected-failure evidence below are retained unchanged. Check out `6ddbb80` to reproduce its known-gap test.

## Result and scope

The previously separate native-mock and browser-to-C tests did not execute the complete native adapter / BleTransport / DeviceSession / C data callback chain. `tests/native-c-roundtrip.test.ts` now does, using the exact imported `src/platform/bluetooth.native.ts` with Node module hooks replacing only React Native and PLX modules. The driver is not copied or transformed. Each case gets a fresh module instance, equivalent only to a fresh JavaScript app state.

The existing bounded C bridge gains an optional observer for actual C notification bytes. Its fake browser manager is constructed but unused by the native tests. Fake PLX turns base64 writes into bridge W commands and C notification bytes into base64 characteristic callbacks. Permissions, radio readiness, service discovery, MTU, disconnect completion, SDK scheduling, and manager destruction are all fakes. This is not native Android/iOS execution, installed SDK acceptance, hardware validation, or radio/device evidence.

The matrix distinguishes simulated Android (permission and requestMTU(185) calls) from simulated iOS (neither call). Fake negotiated MTUs 23 and 517 deliberately exercise transport chunk limits independently of real negotiation. It verifies exact reconstructed request/reply wire bytes and CRC via decoder plus re-encoding, request correlation, identity/capabilities, empty and 512-byte pings, the READY-marker collision, C ATT flatten rejection, notification retirement, and stale callbacks. Pending-write cases require settlement before cancel; rejected cancel holds unknown ownership until explicit retry. Fake iOS shutdown still raises the unacknowledged teardown error and blocks reuse.

## Confirmed open lifecycle defect

If a user closes a DeviceSession while Android permission preparation is unresolved, granting permission afterward starts a **new** connect, discovery and MTU request before cleanup. It is not merely settlement of an already-issued connection. Reproduction executes the production native adapter, BleTransport and DeviceSession; at the moment close is requested, only fake permission acquisition has begun. The client never subscribes or sends AXP data and eventually cancels successfully, but avoidable connection effects still happen after closure.

This is deliberately left unfixed. `BleDriver.connect(id)` has no cancellation parameter; an interface/propagation correction needs independent review without weakening unknown-acquisition fences. The normal test names and asserts this behavior as a **known gap**, not a success criterion. To require the desired behavior and reproduce the failure:

```
APEX_NATIVE_C_REQUIRE_CANCELLED_PREPARE=1 node --test --test-name-pattern='known gap' tests/native-c-roundtrip.test.ts
```

Raw failing output: `evidence/native-c-session/known-gap-expected-failure.txt`.
Actual effect order: `evidence/native-c-session/android-late-permission-known-gap.json`.
No application or firmware source was changed.

## Reproduction and evidence

From the repository root, with existing locked node_modules available (no install):

```
APEX_NATIVE_C_EVIDENCE=evidence/native-c-session node --test tests/native-c-roundtrip.test.ts
node --test tests/native-c-roundtrip.test.ts tests/browser-c-roundtrip.test.ts tests/browser-c-bridge-independent.test.ts tests/ble-native-service-data.test.ts tests/ble-transport-release.test.ts tests/ble-session-release.test.ts
npm run typecheck
```

`evidence/native-c-session/focused-tests.txt` records 69 passing focused tests, including one explicit known-gap characterization. `typecheck.txt` records the typecheck. `initial-tests.txt` preserves the initial 10-case run before the permission investigation; `permission-gap-tests.txt` preserves the initial 11-case characterization. The JSON traces record source hashes at execution, actual C notification hex, client write hex, fixture acknowledgments and fake lifecycle events. Initial run logs are retained without rewriting. No broad aggregate was run in this clone.

## Source identity and gates

The source baseline is f012225bb166b7a2faab305b3c97ca2db6a56fef. The existing bridge input manifest is enforced unchanged before compilation. Exact input SHA256 values:

- Native adapter: `1b5ed3e76b3c289b2e63b690f51f9e5c8de10988b566320389802e829d7c56bf`
- BleTransport: `30bf233d19a90efd83819d5fb45dbc0e1569c76f72dd2af2d49a46d723602762`
- DeviceSession: `9244f34f52b579adf2676c54790a99710432c91d83b4a031df5581205dc9c404`
- C BLE input: `57503eaabc1773bb46272d72bd3c9b04e85964d1666093e02bb672eaf569242c`
- C protocol core: `8ad23b15b4243c3cc82a63209d718f20cee476e69e38e4857d38d062541188ee`
- Unchanged C bridge: `b9a53bf7738a9ab6e707171a1ba12f1534471b21687962ec72188e80faccea5e`

The C file is only pinned input for existing data callbacks; no SDK initialization/configuration delta was reviewed or changed. Prior independent firmware review applies only to `4c4a7ac3829f87088c8c9bebbe361be752de200943401986c6cb69f20408dd7c`, not the current C input. The separate initialization/configuration source-delta review remains open and was not retried or rerouted. No apex_ble_start/app_main invocation, SDK/native build/prebuild, browser run, hardware action, provider changes or publication occurred. Installed iOS teardown acknowledgment remains unresolved; its reset gate remains closed.
