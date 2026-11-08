# Explicit native App connection cancellation

## Scope and user-visible behavior

The global native session card offers **Cancel connection attempt** during
simulator, USB or Bluetooth connection/negotiation, including the preceding
session's cleanup. It remains visible across tabs. A press changes its label to
**Cancellation requested · waiting for cleanup** and disables further presses.
It is deliberately not routed through the busy-gated generic run handler.
Browser-owned work retains its existing BrowserAxpControls and ownership model.

Cancellation stops preventable new effects, not already-issued effects. It does
not dismiss system permission UI, establish physical disconnection, or reset
Bluetooth. There is no timeout that abandons outstanding work. Pending
permission, transport or cleanup can therefore keep the original operation busy.

## Ownership

App stores a handle for this connect only. It captures the original operation
token, mount epoch, selected session and cancellation flag. The rendered handler
passes that exact object. It refuses stale mount, operation, session and handle
identities, and repeated presses. This is not a second general operation lock.

Cancellation before previous.close settles prevents creating the next session.
Cancellation after selection calls that session's close, forwarding the existing
BLE abort behavior. The original run(connect) still waits for open and cancellation
cleanup before finalizing its own lock. No cancellation handler clears a lock,
sets a replacement token, or clears a replacement session. Release is checked by
the existing clearReleasedSession helper, never inferred from protocol closure.

Failed or unknown release retains the session fence. Once the operation settles,
the existing Console Disconnect offers explicit cleanup retry; Android recovery
is separate. In particular native acquisition rejection still lacks a transport
release certificate, even if the mocked manager reports idle. The iOS teardown
acknowledgment limitation and disabled reset remain unchanged.

## Evidence and limits

Baseline c57f4f5: review-evidence/app-session-cancel/before.txt retains the new
actual-handler regression failing while all 13 original acquisition tests pass.
The failure observes the forbidden new transport connect after cancellation
during previous close. Before reproducing on baseline, use the initial test
revision's optional cancel dispatch or retain the current harness's optional
dispatch; baseline does not define the cancel handler.

tests/support/app-acquisition.ts extracts and executes actual App run, connect,
cancel, disconnect and cleanup handlers with injected refs/setters and the real
DeviceSession. It does not copy a controller algorithm. Existing acquisition
tests use this shared harness. The browser independent test now uses Node's
TypeScript stripper for the extracted function instead of manually removing a
few annotations; its ownership assertions are unchanged.

tests/native-c-roundtrip.test.ts additionally drives actual App cancellation
through real DeviceSession, BleTransport and the exact native TypeScript adapter,
with fake React Native/PLX permission and readiness calls, held native phases and
the existing host C fixture. It covers permission, readiness, connect, discovery,
MTU, characteristics and Info negotiation. Negotiation cancellation sends no
Capabilities request. Release uncertainty persists through explicit Disconnect.

All evidence is host-only. There is no mounted React acceptance, visual test,
browser execution, OS permission dialog, native build, physical radio/USB/device,
SDK startup or SDK-delta acceptance. The previously denied SDK initialization /
configuration delta review was not retried or reassessed. No firmware, native
OS source, dependency, lockfile, SDK/build/prebuild or CI edits were made.

Focused command (276 passing tests after finalization correction):
node --test tests/app-native-acquisition.test.ts tests/native-c-roundtrip.test.ts tests/web-axp*.test.ts tests/foreground-device-action.test.ts tests/foreground-ble-workbench.test.ts tests/session*.test.ts tests/ble-session-release.test.ts tests/usb-session-integration.test.ts tests/ble-transport-release.test.ts

Typecheck: npm run typecheck.
Logs and native effect traces: review-evidence/app-session-cancel/.
Locked dependencies are reused through a local ignored symlink.

Follow-up tests additionally exercise actual-handler reentrancy at clearSession
and listener registration, and successor selection while cancelled cleanup is
draining. Native trace hashes include the App and shared actual-handler harness.

Independent review identified a finalization microtask gap: awaiting null cleanup
would leave the handle live after capturing no cleanup promise. The correction
only awaits an existing cleanup promise; otherwise the handle retires without a
yield. finalization-race-before.txt preserves a failing actual-handler reproduction,
now passing. Review separately updates the existing independent lifecycle test's
injected environment for the new App refs; that test-only compatibility fix is not
part of this builder branch. Focused totals here do not include that suite.
