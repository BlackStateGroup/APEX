# App acquisition after detach

This host-only correction extends App session lifecycle guards to native paths.
It is not mounted React, browser, native-module or physical-device acceptance.

## Reproduced defect

Base: `20947d88a61607d564a8eaa70a649f0be5195bea` (v38).
Base App.tsx SHA-256:
`fdcd0795ce2d07343dd13ecc46e16cd05b676dcbc449e1533d20a2b19749c933`.

Native App has no browserAxp object. Previously its retained run handler could
invoke actions after detach, and connect could resume after previous.close()
and acquire a new transport after unmount cleanup had already selected/closed
the previous session. Browser-only checks did not fence either native path.

`tests/app-native-acquisition.test.ts` extracts and executes the actual App
run/connect bodies and native attachment/resource cleanup bodies. It uses the
real DeviceSession and clearReleasedSession, with a software SimulatorTransport
wrapped as a USB-labelled transport double. It does not load a native bridge.

The first two tests failed before the fix (2/2) with actual transport connect
calls after detach. The completed 13-test suite against the same base failed
10 tests and passed 3. Full logs are under
`review-evidence/app-native-acquisition/`; the initial log predates the extra
regression cases. The completed test source is the reproduction authority.

## Correction and invariants

- run rejects detached invocations on every platform, retaining its operation
  lock and existing observation/recovery exclusions.
- connect checks attachment before touching the current listener; prior-close
  and open continuations require the captured mount epoch and operation token.
  Existing clearReleasedSession checks continue to require the selected object
  and confirmed transport release before replacement.
- Late connect failures cannot clear a successor's session/listener/UI. Native
  unmount retains its existing ownership of cleanup, including pending open and
  uncertain release. The patch does not infer release from protocol closure.
- Session disconnect notifications require their exact session and mount, but
  deliberately do not require the old operation token: these listeners must
  still work after a successful run releases its token.
- run errors and final UI updates require the current operation/mount. Busy is
  cleared before browser refresh so a synchronous refresh observer starting a
  successor operation cannot be overwritten by the old completion.
- Foreground/background/inactive policy and browser chooser gesture execution
  are unchanged. Browser ownership, native cleanup and core transports are not
  modified.

## Verification

Focused command:

```
node --test tests/app-native-acquisition.test.ts tests/web-axp-application.test.ts tests/web-axp-application-independent.test.ts tests/web-axp-navigation-independent.test.ts tests/session-controls.test.ts
npm run typecheck
```

55 focused tests pass, including 13 new acquisition tests; typecheck passes.
The existing locked node_modules was reused by a local symlink. No dependency,
lockfile, native source, firmware, SDK/build/prebuild or CI change was made.
Independent review is separate from this builder result. No full aggregate,
mounted app, browser/device/radio/USB/flash acceptance is claimed. Firmware
SDK-delta review remains blocked and was not attempted.

Expanded focused regression command also passes 213/213 tests:

```
node --test tests/app-native-acquisition.test.ts tests/web-axp*.test.ts tests/foreground-device-action.test.ts tests/foreground-ble-workbench.test.ts tests/session*.test.ts tests/ble-session-release.test.ts tests/usb-session-integration.test.ts
```

This adds all existing browser foundation/application/navigation, foreground
and selected core/session/USB software integration cases. No existing test
fixture or source assertion was changed. See `expanded-after.txt` for the log.
