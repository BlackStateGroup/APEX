# Installed PLX facade → native adapter → C data callback fixture

This is a host-only test boundary, not Android/iOS execution. Run from repository root:

```
node --test tests/plx-facade-c.test.ts
APEX_PLX_EVIDENCE=verification/plx-facade/traces node --test tests/plx-facade-c.test.ts
```

## Exactly what executes

- Installed `react-native-ble-plx` **3.5.1 published `lib/module/*.js`** bytes, including BleManager, Device, Characteristic, error conversion, subscriptions and Promise handling. They are read directly from node_modules. No copied SDK, generated replacement, transpilation, regex rewrite, patch or new dependency.
- Exact `src/platform/bluetooth.native.ts`, existing BleTransport, DeviceSession, protocol encoder/decoder and bounded C fixture.
- C data callbacks only. No firmware startup calls. The existing fixture input manifest is verified; reviewed firmware SHA-256 `57503eaabc1773bb46272d72bd3c9b04e85964d1666093e02bb672eaf569242c` is integrity, not a new approval.

The package's ordinary entry is Flow-annotated `src/index`; this test deliberately resolves it to its **shipped ESM artifact**, not that Flow entry or Metro output. Node loader changes only resolution (relative extensionless imports receive `.js`), module classification (ESM) and per-case module-cache isolation through query strings. It returns the installed source string unchanged. It does not assert that a real Metro build, Hermes, RN runtime or TurboModule interoperability was tested. This PLX artifact itself imports `NativeModules.BlePlx`, not TurboModuleRegistry. Package metadata, all shipped top-level module JS files, corresponding Flow source JS files and two cited native files are SHA-256 pinned before and after execution. Flow files and native files are inspected/pinned, not executed.

## Synthetic boundary and scope

RN Platform, foreground state, Android permission results, NativeModules and NativeEventEmitter are synthetic. Their event bus is only an in-process listener set, not RN's native listener reference-counting or native dispatch bridge. Native device/characteristic dictionaries, Promise settlement, transaction completion, connection cancellation and event scheduling remain chosen inputs. The C fixture emits the actual READY/info/capabilities/ping bytes; the native model puts those bytes in characteristic base64 values. Android starts with reported MTU 23 and returns 23 or 517 from the actual facade's requestMTU(185) flow. iOS reports 23 or 517 without requestMTU. Neither models actual negotiation or OS limits.

The platform models are separate objects: only Android supplies requestMTU and acknowledged destroy Promise; iOS destroy returns void. This distinction is grounded in installed `android/src/main/java/com/bleplx/BlePlxModule.java:118-125` and `ios/BlePlx.m:63-66`. The tests **do not** infer actual native disconnect/monitor ordering from chosen synthetic order. Native ABI, queueing, CCCD setup, native transaction cancellation, RF, radio security and physical devices remain untested. The iOS destruction acknowledgment deficiency remains unresolved, and the adapter's reset gate stays closed. No installed-native patch is applied.

## Assertions

18 cases cover both platforms, MTUs 23/517, exact READY and request/reply frames and IDs, info/capabilities and empty/512-byte ping, chunk ceiling, data/base64 mapping, distinct transaction IDs, wrong-transaction and wrong-device event filtering, C ATT failure converted to actual BleError (code **401**, reason preserved), monitor event and monitor Promise errors, spontaneous disconnect, failed connection cancellation/retry and unknown ownership.

Crucially, real PLX `monitor.remove()` calls native `cancelTransaction` **without removing its ReadEvent subscription immediately**. The subscription survives until the monitor Promise settles. Tests hold that Promise beyond session close, directly exercise the retained real SDK listener, and verify the adapter ignores late data and disconnect callbacks. After settlement, the real subscription removes itself. These tests strengthen an assumption boundary, not a claim of new native safety proof. No production defect or production fix was needed.

Two simultaneous fixtures also run in both creation and reverse lazy-import order. A single loader routes by the importing module’s exact case query into an environment map, never a mutable current fixture. The tests create Android and iOS adapters before lazy imports, exercise both, then destroy Android while iOS remains usable.

Evidence: `verification/plx-facade/` contains 20 synthetic/C traces, focused TAP-style results, regression results and typecheck output. No full aggregate, native build, installation or device test is implied.
