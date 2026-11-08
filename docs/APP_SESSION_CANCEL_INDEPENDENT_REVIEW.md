# Independent review of native App cancellation controls

## Reviewed chain and result

Baseline: c57f4f50122fcf8abda3b5633855a9f23ae34417.
Initial candidate: 98eb1afc1a9544b33276944f2bfc655c6b266a51.
Additional builder tests: a2529031673a21e5c402131239db2bff8ad63634.
Final reviewed candidate: 67d6c52118df0a52ddc6fc0cec809cde788f7505.

No remaining scoped blocker. Production changes are confined to App.tsx.
Core transport/native TypeScript and firmware source remain unchanged from the
baseline. No dependency, lock, native OS source, SDK, build/prebuild or CI edits.
The previously denied SDK initialization/configuration review was not attempted.

## Independently reproduced defect and correction

The original finalizer executed `await attempt?.cleanup` even when cleanup was
null. That yielded with a live cancellation handle after capturing no cleanup
promise. A queued retained cancel could then start cleanup, while the original
run released its lock before cleanup settled. The independent test queues that
press from the actual successful-open journal publication and holds transport
cleanup. It failed against 98eb1af; raw failures are retained, including the
refined test that permits either synchronous handle retirement or fully drained
accepted cancellation.

67d6c52 awaits only an existing cleanup promise. The no-cancellation path retires
the handle synchronously; late retained presses are inert. Already accepted
cancellation retains its original operation lock through open and cleanup.

## Independent evidence

`tests/app-session-cancel-independent.test.ts` extracts exact production run,
connect, cancel and disconnect bodies into an independently authored harness,
using real DeviceSession and a software USB-labelled SimulatorTransport double.
It also tests reentrant cancellation before previous close dispatch and exclusion
of browser-backed simulator operations from native cancellation ownership.

The control test compiles the exact global JSX fragment with the installed
TypeScript compiler and evaluates its React element tree. It checks all five tab
values, busy=true availability, requested/disabled state, exact captured handle,
and absence with browser ownership or no acquisition. Source placement verifies
that the fragment is outside tab-specific blocks. This is not a mounted app,
visual/accessibility acceptance, or event-loop proof for React Native.

The existing independent lifecycle harness needed three newly referenced refs /
setters injected after the production change. Its initial failures are retained;
only that environment was adjusted, with no assertion relaxation.

Expanded suite: 285/285 pass. Typecheck passes. Logs and exact source hashes:
`review-evidence/app-session-cancel-independent/`.

Command:

```
node --test tests/app-session-cancel-independent.test.ts tests/app-native-lifecycle-independent.test.ts tests/app-native-acquisition.test.ts tests/native-c-roundtrip.test.ts tests/web-axp*.test.ts tests/foreground-device-action.test.ts tests/foreground-ble-workbench.test.ts tests/session*.test.ts tests/ble-session-release.test.ts tests/usb-session-integration.test.ts tests/ble-transport-release.test.ts
npm run typecheck
```

The builder acquisition tests and existing independent browser tests additionally
cover stale/repeated cancellation, pending previous release, exact new session,
failed cleanup with explicit retry, successor selection, mount/token replacement,
unmount, reentrant setters/listeners, browser same-gesture acquisition and retained
ownership. No foreground lifecycle policy or automatic resume/retry was added.

Native-to-C cases execute exact native TypeScript through fake RN/PLX and pinned
host C data callbacks. No firmware startup is invoked. No native build, installed
native SDK execution, OS permission sheet, real browser, radio, USB, flash, or
physical device acceptance is claimed. Transport release uncertainty remains
separate from protocol closure; iOS destruction acknowledgment/reset stays
unresolved. No full aggregate validation was run by this reviewer.
