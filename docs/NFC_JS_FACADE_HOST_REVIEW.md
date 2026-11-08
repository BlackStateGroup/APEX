# NFC installed JavaScript facade host integration

Baseline: `0c38590ff379dd09fdae31b9356634302ffeb150` (v39 checkpoint).
No production changes. This closes a test-boundary gap, not native acceptance.

## What actually executes

`tests/nfc-js-facade.test.ts` imports the complete, unchanged
`src/platform/nfc.native.ts` through Node 24's TypeScript type stripping.
The real `createNfcSessionController`, `NfcReader`, `PhoneNdefCapture`, and selected
NDEF-field projection execute. Earlier session tests inject `NfcSessionApi` and
therefore do not exercise the SDK's callback, event, and exception conversion.

The helper resolves the existing locked `react-native-nfc-manager@4.2.0` package's
`dist/src/index.js`, loads its actual CommonJS dependency graph in a fresh VM
realm, and verifies SHA-256 before executing every installed JS file. It uses a
normal CommonJS function wrapper, not copied or rewritten SDK implementation.
The fresh realm isolates the manager singleton between cases. No SDK compilation,
source transformation, package install, or native module loading occurs.

An explicit ESM bridge exports that actual facade's `exports.default`,
`NfcEvents`, and `NfcError`. This models the package's `__esModule` default export
interop used by the application bundler. Plain Node dynamic import of this CJS
package would instead expose the whole exports object as default. The bridge is
an acknowledged host interop seam, not a Metro execution or bundler acceptance
claim. No NFC method is substituted. No compiled APEX output exists to hash:
Node executes the original TS modules with type stripping.

React Native is entirely fake: `Platform`, `NativeModules`,
`TurboModuleRegistry`, `NativeEventEmitter`, codegen event subscriptions, and all
native method callbacks. Test bytes and error strings are synthetic public
fixtures. Both the codegen and legacy event routes are exercised; this does not
assert legacy architecture support for any target React Native release.

## Results and distinctions

20 new cases pass. The focused five-file NFC set passes 95/95; `npm run typecheck`
passes. Commands and raw output are in `verification/nfc-js-facade/`.

- Actual iOS facade maps `NFCError:200` SessionClosed to **null**, while a rejected
  native operation with the same string becomes `NfcError.UserCancel`. The
  adapter/controller handles both. Timeout becomes `NfcError.Timeout`; unknown
  strings become `NfcErrorBase`.
- Android native `cancelled` becomes UserCancel for rejected operations. Its
  facade subscribes StateChanged, not SessionClosed. State changes do not certify
  unregister completion. Android's unregister callback releases ownership;
  iOS additionally waits for SessionClosed.
- Pending start cancellation prevents session registration (Android still
  completes its status `isEnabled` query). Failed start is retried; a successful
  start is cached. Registration rejection releases ownership.
- Pending register and unregister callbacks cannot be bypassed by an early iOS
  closure event. A late rejected unregister after confirmed closure is tolerated.
  Rejected unregister without closure retains singleton ownership and the copied
  candidate until explicit cleanup retry succeeds.
- A single synthetic tag is copied before caller mutation, later tag callbacks
  are ignored, nonselected tag identity is omitted, and Inspect remains blocked
  until release. Opposite-platform record-ID encodings are rejected, not coerced.

No production lifecycle bug was established by these cases. There is no claimed
before/after fix. Invalid initial host fixture IDs and cross-realm assertion
comparisons were harness issues, not application defects.

## Remaining proof boundaries

The SDK routes each fresh global tag/closure event to its currently installed
client listener. Its facade supplies no session generation metadata. A captured
old JS callback can be fenced by ownership; a newly dispatched global event
arriving after replacement cannot be identified as stale by this facade alone.
A fake event schedule does **not** establish whether actual native queues can
produce that order. Native callback/event ordering, delivery loss/duplication,
registration-rejection acquisition semantics, and real platform release require
separate authorized platform evidence. None was attempted here.

This suite does not execute App UI, Metro, React Native, Android/iOS SDKs, radios,
devices, NFC hardware, or native builds. It does not inspect or revisit any
separately denied firmware SDK-delta operation. No dependencies, lockfile,
installed package bytes, firmware, native platform source, CI, BLE, or App files
are changed.

## Reproduction and pins

Run with the already installed locked dependencies and Node 24:

```
node --test tests/nfc-js-facade.test.ts tests/nfc-lifecycle.test.ts tests/phone-ndef-capture.test.ts tests/nfc-manager-ndef.test.ts tests/phone-ndef-workbench.test.ts
npm run typecheck
```

`verification/nfc-js-facade/inputs.json` records baseline, Node version, npm lock
entry (including tarball integrity), hashes for every executed installed JS file,
installed package metadata, five principal APEX source files and package-lock.
The suite fails on SDK-byte drift or a changed recorded APEX input; an intentional
source update requires a fresh review and explicit pin refresh. The tarball's
registry integrity is recorded from the lock, not revalidated by a network fetch.
`artifact-sha256.txt` pins the helper, tests, and input manifest used in this run.

## Independent review follow-up

See `NFC_JS_FACADE_INDEPENDENT_REVIEW.md` for the overlapping-fixture import-hook
correction, 20 adversarial cases, 115/115 focused result, and explicit realm,
cleanup and pin-enforcement limitations. Original artifacts above describe the
pre-review candidate; current helper hashes are in the independent evidence.
