# Readiness cleanup settlement investigation

Base: `4825e2c7a200ee43b5e4cd04f4545c45bc09158c`.
Isolated clone: `apex-readiness-cleanup-investigation`.
Production source, installed dependencies, loader and pin manifest unchanged.

## Reproduction

Run from this clone: `node evidence/readiness-cleanup/reproduce.ts`.
The script asserts characterization failures and writes `before.json`. Passing
characterization means the defect was observed, not that readiness is correct.

- Actual PLX event callback + synthetic RN subscription.remove throw: raw driver
  connect remains pending, original error escapes event callback, no native
  connect issued, accessory ownership stays owned, receipt is false.
- Actual PLX initial-state Promise callback + same throw: raw driver connect
  remains pending, original error becomes an unhandled rejection in PLX's `.then`
  chain, no native connect issued, accessory ownership stays owned, receipt false.
- Explicit synthetic synchronous `onStateChange` replacement: adapter resolves
  readiness before receiving the returned subscription. Its later remove throws,
  but catch calls an already-settled finish and discards that error. It proceeds
  to native connect (held indefinitely in this fixture). This is NOT actual PLX
  initial-state ordering.

Pending is observed across bounded event-loop turns. The source explains why it
cannot settle afterward: settled=true and clearTimeout precede remove; all later
finish calls immediately return. No promise timeout is treated as cancellation.
The script intentionally captures the SDK-initial unhandled rejection to record
identity without a test-process crash. It does not repair or intercept SDK code.

## Exact paths and ordering

`src/platform/bluetooth.native.ts:120-133`: readiness Promise, finish, registration.
`node_modules/react-native-ble-plx/lib/module/BleManager.js:269-300`: onStateChange
registers an emitter listener, schedules state() through `_callPromise(...).then`,
then returns its wrapper. Actual initial emission is asynchronous even if the
native result is immediately resolved. No catch follows this particular `.then`.
Its remove sets cancelled, deletes `_activeSubscriptions[id]`, then calls RN
remove. A throw leaves the underlying listener present but absent from the SDK
registry. Retrying the wrapper's remove is ineffective.
`BleManager.js:146-161`: `_callPromise` uses Promise.race and tracks active promises.
`BleManager.js:96-101`: `_destroySubscriptions` only iterates that registry.
`react-native/Libraries/EventEmitter/NativeEventEmitter.js:123-139`: remove calls
native removeListeners(1), then JS subscription.remove, then clears its reference.
Android `BlePlxModule.java:1085-1093`: addListener/removeListeners are no-op methods.
Android state at lines 196-202 resolves a Promise; iOS BlePlx.m:90-94 similarly
exports promise resolve/reject. These are source observations, not execution.

## Proposed correction, pending parent approval

1. Separate terminal request from publication; defer publication until registration
   returns. A synchronous callback cannot resolve before its subscription is owned.
2. Clear timer and try subscription and abort-listener cleanup independently.
3. Never throw cleanup errors through SDK event callbacks. Reject the preparation
   Promise deterministically. Preserve original Error identity for one error;
   use AggregateError carrying both exact causes for readiness + cleanup failures.
4. Latch manager unhealthy on cleanup failure, and prohibit automatic acquisition,
   receipt certification, reset or shutdown pretending to recover the lost listener.
   A distinct readiness-cleanup-unknown latch with an explicit restart requirement
   is safer than overloading managerCreationUnknown or merely managerUnhealthy.
5. Leave connection attempt/error binding, permission-prefix proof, transport
   pending effects, cancellation and native destruction acknowledgments unchanged.

A fresh independent review is needed before integration. Add regression coverage
for initial/event/abort/timeout/error states; synchronous callback ordering; thrown
non-Error values; both cleanup failures; repeated callback no-ops; denied receipt;
transport rejection with release unknown; manager isolation and shutdown fence.

## Limits

RN event emitter and native bridge are synthetic. Only installed PLX published
ESM and the adapter execute. Android's installed removeListeners implementation
provides no ordinary throw path; this investigation establishes defensive handling
of a synthetic JS cleanup fault, not native incidence, Metro/Hermes compatibility,
physical release or readiness eligibility. The synchronous case is deliberately
an adversarial fixture, not an assertion about real SDK callback order. No device,
radio, native build, firmware or denied startup/configuration review was touched.

## Original hashes

- bluetooth.native.ts: a4fc189ea28209c9c172b6aa92fd49e4e20a49da0165b83f1fbe7d6c7b7dd578
- loader.ts: 74b700c6fbb108923c190b6f30881067627e93d4d6afd07de00247c03d6483a7
- inputs.sha256.json: 2ddad250dd1a4cf4d43b9abfd37ae8b925bc9ce4c6f273ba89e3debba57f2337

## Approved design clarifications for the implementation handoff

Parent approved this narrow design in principle, not production edits in this
investigation clone. A fresh implementation worker and independent review follow.

- Track error presence with an explicit `hasError` boolean, independently of its
  value. Thrown/rejected undefined, null, false, 0 and empty string must reject,
  never become success through truthiness or sentinel comparisons. Preserve a
  single rejection value unchanged; AggregateError entries preserve originals.
- Latch only observed registration or cleanup uncertainty. Ordinary readiness
  denial, cancellation or timeout alone must not set the new terminal latch.
- Existing owned connection cleanup remains callable. Fence new acquisition,
  manager destruction and reset, without disabling lease cancellation/disconnect.
- Preserve the original before evidence. This commit contains reproduction and
  documentation only, with no production implementation or dependency edits.
