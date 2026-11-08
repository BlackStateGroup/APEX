# Transport release acceptance: all cases NOT RUN

This is a future acceptance checklist, not execution evidence or authorization to
connect equipment. Use an already provisioned build from the exact tested revision
and only phones/accessories the tester owns or is explicitly authorized to use.
Record build hash, model/OS, permissions and observed outcomes. Native compilation,
JS tests and phone execution are not interchangeable. Preserve the three independent
evidence gates in [PHONE_ACCEPTANCE_PLAN.md](PHONE_ACCEPTANCE_PLAN.md): native
compilation, phone UI/lifecycle, and independently supported physical ground truth.
Do not infer radio silence or physical release from a local label, promise, timeout or callback alone.

Some failure orderings cannot be induced safely on ordinary hardware. Leave those
NOT RUN or use a separately identified fault-injection build. Report injected
bridge behavior separately from production/native behavior. This document does not
request installs, signing, permission resets, OS changes or new hardware access.

## Shared native App cancellation (C1–C3 in the phone plan: NOT RUN)

### Current narrow unissued-acquisition exception (host-tested; phone NOT RUN)

Runtime candidate `96cc5edd2d576d17cab2d365ccea77edee2baede` adds an exact,
one-shot trusted-adapter proof for initial explicit cancellation and normal Android
permission denial/cancellation **before this attempt calls getManager**, after successful scanner
stop and a clean settled prefix. A pending permission request still blocks cleanup;
only its normal complete canonical result can qualify. This releases only the
rejected transport attempt, never global manager uncertainty or a native connection.
Readiness, unexpected/malformed permission results, scanner/busy/health/epoch errors
and every issued listener/connection effect remain unconfirmed. There is no App
rewrite, automatic reconnect or new iOS recovery. See the
[current receipt contract](proposals/ble-unissued-acquisition/IMPLEMENTATION.md).
All phone cases remain NOT RUN; earlier source/test findings below retain their
original revision scope and are not retroactive claims for this candidate.



Source cross-check: `386cdaf957d49078cf660fd936def0b6ebfa219a`.
The global **NATIVE APP SESSION CONNECTION** card now exposes
**Cancel connection attempt** during native simulator, USB or BLE connection,
prior-session close and negotiation. It remains available while busy across all
five tabs. A press disables it with **Cancellation requested · waiting for cleanup**;
permission UI may remain. This is not the busy-gated Console **Disconnect** and
not browser-owned cancellation. Detailed labels and per-phase expectations are in
C1–C3; all real UI/browser/native/device cases remain NOT RUN or BLOCKED.

Cancellation prevents the next session after pending prior close and preventable
new setup/negotiation work, not completion of already-issued effects. Raw work and
cleanup settle before the original operation unlocks; there is no timeout-based
release. Failed/unknown release retains the session fence after busy clears.
Explicit Disconnect can retry cleanup only when available after settlement;
Android recovery is separate and cannot bypass pending effects. iOS Reset stays
closed. A dispatched BLE driver rejection may leave transport release unconfirmed
even when manager cleanup appears successful. Neither protocol closure nor empty
capabilities certifies release. Do not infer that a retained stale Cancel press
can act on a newer session, or that changing tabs cancels native acquisition.

[App cancellation review](APP_SESSION_CANCEL_INDEPENDENT_REVIEW.md) covers exact
handlers and an evaluated JSX fragment, not mounted React Native or visual
acceptance. [Native cancellation evidence](NATIVE_ACQUISITION_CANCELLATION.md)
uses fake RN/PLX phases and host C data callbacks, not physical devices. This
checklist neither reruns those tests nor supplies execution permission or expands
existing ownership, recording or data-sharing scope. Keep unrelated device data
out of local records; no upload is authorized.

## USB, Android only

1. **Permission and delayed acquisition.** Explicitly start one authorized CDC
   connection. Denial must not open or write. Use the global
   **Cancel connection attempt** during pending permission/open if observable. A late grant/result must
   not establish an active local session; cleanup must await the outstanding
   acquisition. The OS prompt may remain open. Leave inaccessible timings NOT RUN
   or separately label an authorized local harness result. Another USB attempt must
   not bypass a held per-module lease.
2. **Framing and bounded writes.** With an owned AXP test peer, verify ordinary
   identity/capability negotiation and a 512-byte ping payload. This creates a
   524-byte protocol frame, while received USB chunks remain at most 512 bytes.
   Compare exact bytes and ordering. Queue-limit, invalid-input and mutation cases
   belong in a labeled local harness, not malformed traffic to unrelated hardware.
3. **Early closure and pending native writes.** Record actual token/event order.
   Closure before open resolves must not be lost, and a late callback must not
   revive the session. Pending raw writes must retain ownership after caller work
   rejects. A fulfilled caller request does not alone establish physical transfer.
4. **Failed close and no-op retry.** In a controlled injected failure, preserve the
   exact cleanup token and held session. A native close failure remains uncertain
   even if a later call returns successfully with no live link to close. Reuse
   must remain blocked. Explicit Disconnect is an attempted cleanup, not a
   guaranteed recovery mechanism. Do not claim that reloading, unplugging or
   changing settings fixes this branch without separate evidence.

## BLE AXP transport, independently on Android and iOS

1. **Late driver/notification setup.** Delay acquisition or subscription completion
   in an identified harness, then cancel. Late READY/data cannot reopen setup.
   The returned handle and pending native effect must remain owned until cleanup
   settles. Installed PLX 3.5.1 `monitor.remove()` requests native
   `cancelTransaction` but does not immediately remove its ReadEvent subscription;
   that subscription survives until the monitor Promise settles. Suppressed late
   delivery and even JS callback removal are not native monitor completion.
   [Installed-facade host evidence](../tests/plx-facade-host/README.md) exercises
   actual published SDK JavaScript with fake RN/native events and C data callbacks;
   it establishes neither native queue/CCCD ordering nor device release. Actual
   platform event ordering needs its own evidence.
2. **Native write outliving a timeout or close.** A caller timeout is not native
   completion. A single final chunk resolving after cancellation must not report
   success. Verify queued chunks do not start after closure and the raw native
   write still prevents a false release while pending.
3. **Automatic versus explicit cleanup.** Inject a failed exact-handle cleanup.
   Transport setup catch, terminal handling and session failed-open catch must
   observe the same failure, rather than automatically making another attempt.
   An explicit later Disconnect may retry that handle. Unknown acquisition with
   no handle stays uncertain; no replacement connection is invented.
4. **App ownership and recovery.** Failed cleanup must retain the closed local
   session and explicit Disconnect action. Stale completion cannot clear a newer
   session. Labels must distinguish local session state from physical release.
   Existing confirmed Android manager destruction is a separate recovery case;
   iOS destruction acknowledgement remains unresolved and its Reset gate must
   stay closed. USB or unrelated sessions must not be cleared by Bluetooth reset.

Current source/mock evidence and limitations are in [SESSION_RELEASE.md](SESSION_RELEASE.md),
[BLE_TRANSPORT_RELEASE.md](BLE_TRANSPORT_RELEASE.md) and the USB validation notes.
Passing any subset establishes only the recorded revision, platform and tested
conditions. It is not universal compatibility, authenticated peer identity or
an unlock/control capability.
