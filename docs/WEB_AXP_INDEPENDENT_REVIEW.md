# Independent Web AXP adapter review

Status: host-only independent review passed for the exact source below. No browser permission, actual
Bluetooth API, device, native build, network or physical tests were executed.
No App or platform integration is part of this work.

Base: `0f0d549b60f4063997399602a6cf23d1de638849`.

## Review boundaries

The independent fixture uses unchanged `BleTransport`, `DeviceSession` and
AXP framing. It is not a production adapter or browser substitute. Its explicit
phase gates separate browser-promise settlement from public cancellation. A
successful public cancellation never proves the underlying browser effect
settled or that radio access stopped.

Required review axes:

- Exact AXP-service chooser, synchronous call in explicit choose, immutable
  bounded opaque candidate, one outstanding chooser including cancelled chooser.
- No browser effects in constructor or driver handle acquisition. Invalid IDs
  receive cleanup-safe failure handles, never another session's ownership.
- Setup discovery and properties use only owned service/characteristics; READY
  is a received marker, not a fabricated startup event.
- Every raw connect/discovery/start/stop/write promise retains ownership until
  settlement. Public operations are bounded. Cancellation fences traffic and
  promptly requests own browser-local disconnect.
- Cleanup failure or timeout remains poisoned until an explicit retry verifies
  raw settlement, listener removal and own browser-local disconnected state.
- DataView intrinsic bounds, offsets, spoofed metadata, independent byte copies,
  no listener leakage, callback throws and reentrant cancellation.
- Actual protocol info/capabilities/ping negotiation, 20-byte conservative
  writes and 0/20/21/512-byte ping payloads. No negotiated-MTU claims.
- Unexpected disconnect, preconnected/foreign host state, stale callbacks,
  fresh characteristics on later owned acquisition, and retained
  `DeviceSession.transportReleasePending` on uncertain cleanup.

## Baseline

Focused unchanged-core run: 60 cases passed, zero failed/skipped/cancelled.
`tsc --noEmit`: passed. These precede candidate adapter inspection and are not
adapter acceptance. Full aggregate tests need their C firmware prerequisite
and are coordinated separately.

## Final reviewed source and outcomes

Builder source commit: `0e80aa3d77982516905ba5b016cd503d92cc598a`.
Source: `src/experimental/web-axp.ts`.
SHA-256: `7df9e14ab65598b52901dd0c9973bcc1df5b9da8474e6df435b4c174e84f668e`.

Final focused run: **181 cases passed**, zero failed, skipped or cancelled.
This includes 45 independently authored Web AXP cases, 36 builder cases,
60 unchanged BLE/core/session cases and 40 native-boundary host/mock cases.
Counts are named test cases, not assertions or loop iterations inside tests.
The four ping payload sizes are assertions within one negotiation case.
`tsc --noEmit` passed with no output.

The focused command was `node --test` with these files in `tests/`:

- web-axp-independent-review.test.ts, web-axp-foundation.test.ts
- ble-transport-release.test.ts, ble-session-release.test.ts
- ble-review-pending-effects.test.ts, ble-review-automatic-context.test.ts
- session.test.ts, session-controls.test.ts, session-release-boundary.test.ts,
  session-review-races.test.ts
- ble-native-observation.test.ts, ble-native-service-data.test.ts,
  bluetooth-recovery.test.ts

Evidence is retained in `review-evidence/web-axp/`. Original failures remain:

1. Initial builder source did not load in Node 24 strip-only mode because of
   TypeScript constructor parameter properties. Builder replaced these.
2. First behavioral run: 27/29 passed. A foreign-connection failure reason was
   masked by a generic closing error, and stopNotifications was incorrectly
   required after disconnect invalidated its characteristic. Both were fixed.
3. Next run: 40/42 passed. One test had to dispatch the raw stop through the new
   live unsubscribe seam rather than disconnect. The other demonstrated raw
   lease objects and public manager release hooks. Frozen method-only handles
   and private manager references/hooks fixed the API exposure.

Independent review also identified the retired-handle disconnect hazard before
behavioral execution: stale disconnect/unsubscribe could affect a same-device
replacement. A terminal retirement fence fixed it; explicit regression passes.

## Limits and remaining gates

No browser or physical compatibility is established. Supported-Chrome explicit
chooser activation, browser policy/security availability, device GATT properties,
notification timing, physical disconnect behavior and throughput require later
separately authorized browser/device acceptance. Ordinary iPhone browser support
is not claimed. No App/platform wiring is present, and no scanning, arbitrary
GATT, RF, native build, credentials, user data or persistence was exercised.

Core tracks bounded adapter promises; the adapter separately retains raw browser
operations. A timed-out raw operation can intentionally keep ownership poisoned
indefinitely. Explicit retry releases only after raw retirement and confirmed
browser-local disconnected state; this is not physical-radio cleanup or
permission revocation. Full aggregate/C-fixture validation is coordinated by the
parent and is not represented by this focused result.

## Selected-cancellation delta review

Reviewed builder delta `dae720fb06062d27e0521bf455f6af0dbfb517f5`.
Updated source SHA-256:
`61a0cb7cbbbeaf6ca0b632c8bf21f9bfbc6dece7fafdda0a9a99214d6a7fe50d`.

The unacquired selected branch clears references, candidate, state and error
before notifying observers. Existing picker and active/poisoned lease branches
return before this branch, preserving raw operation ownership. There is no new
browser effect and no post-publication mutation that could overwrite a chooser
started by a reentrant observer. No issue found in the delta.

Added three independent cases: effect-free cancellation with stale-ID rejection;
an idle observer starting and retaining a replacement chooser; and cancellation
reentered during the selected notification. Existing cancelled-picker and
poisoned-lease tests still pass.

Updated focused run: **194 named cases passed**, zero failed/skipped/cancelled:
48 independent, 46 builder and 100 existing host/core/session cases. The same
focused file list above was used. TypeScript passed. New logs are
`selection-cancel-independent.log` and `selection-cancel-independent-tsc.log`;
earlier source evidence and failures remain preserved. Browser/device and full
aggregate acceptance limits remain unchanged.
