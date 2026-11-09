# Native session cleanup on app background

The iPhone and Android App paths now treat a real `AppState` background event as
cancellation of native session work. This closes a gap where delayed USB/Bluetooth
acquisition could complete after backgrounding and still publish `Connected`, or
an already-open native session remained selected and open.

## Behavior

- Native Connect checks the current foreground ref and `AppState.currentState` at
  dispatch. A stale rendered handler cannot start from inactive/background state.
- An already-issued connection is not cancelled merely because iOS becomes
  `inactive`, as system permission sheets may cause that transition. A real
  `background` event latches cancellation; returning active does not undo it.
- Background during a connection uses the existing exact-attempt cancellation
  handle. Preventable new work stops, but issued permission/connect/write work
  still has to settle. The original operation retains ownership until it drains.
- Background of an open session closes that exact object once. It does not wait
  for an ordinary Ping/action lock before requesting close. A separate cleanup
  fence blocks new actions and direct Connect calls until release settles; the
  UI's busy state includes that fence.
- A successful release clears only the same selected session. A failed release
  keeps the closed session selected and reports uncertainty. Repeated background
  events never silently retry a failed release. Explicit Disconnect remains the
  cleanup retry path after outstanding work settles.
- Resuming never reconnects. Start a new connection explicitly in the foreground.
- A late completion cannot clear another selected session or publish to an old
  mount. An expected `Error('Session closed')` during background cleanup does not
  replace its explanatory notice; unrelated errors remain visible.

This policy applies to App-owned sessions in native builds, including the native
simulator path. Browser-owned AXP lifecycle remains with its existing owner. It
does not introduce navigation-triggered disconnection, turn off phone Bluetooth,
clear evidence, change OS permissions or enable radio-receive operations.

## Verification boundaries

Independent tests execute the actual App handlers and registered lifecycle
callback with software transports and injected React state setters. Integration
tests execute those handlers through the native TypeScript adapter, the pinned
installed `react-native-ble-plx` JavaScript, and actual C protocol callbacks. Native
promises, events, permissions and ordering remain synthetic. Both iOS and Android
cases cover delayed acquisition, rapid resume, repeated background, held close,
failed release, explicit retry and interruption of Ping.

Typechecking and Expo exports cannot establish native ABI, OS scheduling,
permission-sheet behavior, accessory compatibility or physical release. No
Xcode/Gradle native build, phone installation, RF operation, firmware flashing or
physical-device acceptance is included in this slice. Devices can suspend or kill
JavaScript before cleanup completes; this code does not promise an execution or
physical-stop deadline. Native cleanup may remain pending indefinitely, and a
closed protocol session is not proof that hardware stopped.

Before shipping, verify on named iPhone and Android devices: background/foreground
at each permission and connection boundary, permission denial, OS termination,
USB detach, Bluetooth disconnection, repeated events, failed cleanup and explicit
retry. Preserve uncertainty if the platform cannot acknowledge release.
