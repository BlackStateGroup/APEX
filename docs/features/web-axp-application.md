# Experimental browser AXP application integration

This extends the injected foundation into a real, explicitly invoked host binding and shared Console session. It does not establish physical interoperability, RF teardown, browser acceptance, authentication, or native capability. Only synthetic host tests, TypeScript and offline web bundle generation are permitted verification here. No browser or device API was executed during development.

## Ownership and entry points

`src/platform/web-axp.ts` lazily owns one application envelope per loaded JS module. App remounts reuse its manager, shared Console session slot, synchronous operation lock and cleanup state. Construction and render never request a device. Import does not read browser globals. Support presentation reads secure-context/API presence only; no enumeration, availability query, permissions query or GATT operation is used. The `.native.ts` module is an unavailable stub and does not instantiate a manager.

Choose runs only from the explicit Devices control. Live foreground/tab/session/lock/scan/observation/capture/NFC gates are checked before reservation. Application reservation precedes the manager chooser call, which remains in the originating event stack without await, dynamic import or observer publication. The foundation checks live secure context and Bluetooth API presence and requests only the exact custom AXP service. Selected ownership persists until explicit Connect or Cancel.

Connect refuses a held Console session instead of silently replacing it. It reserves a concrete cleanup-owning manager handle before the unchanged core transport's deferred acquisition, creates an unchanged DeviceSession, and uses BleTransport's 30000ms deadline across subscription and actual READY. Notification setup alone does not populate Console identity/capabilities. The existing Console ping and journal use that same session. Browser identity/capabilities are labeled device reports, not trust decisions. The conservative 20-byte fragments and three existing system operations remain unchanged.

Simulator acquisition and native starts have live guards, not just disabled presentation. Browser manager ownership includes selected, raw picker, acquiring, closing and poisoned states. Existing native implementations and core were not changed. Generic Console locks use exact operation tokens; mount epochs keep old continuations from publishing to later mounts or acquiring after detached cleanup.

## Cancellation and lifecycle

Browser controls remain visible outside Devices while ownership or failed cleanup exists, including while opening or pinging. They do not use the Console operation lock. Cancellation installs cleanup operation identity, synchronously fences the manager, and only then closes the exact owned session. Session cleanup is not retried automatically after failure. Explicit Retry coordinates session close and manager cleanup; concurrent attempts join the same operation. A raw promise settling is not sufficient to clear a poisoned session.

The shared slot clears only for the exact owned session, with no pending transport release, no opening continuation, and a fully idle manager with no pending raw operations. Cleanup operation state clears before its public promise settles, so awaiting callers cannot observe false completion or have a stale finally overwrite newer work.

Hidden, pagehide, browser AppState background and actual App unmount request fencing/cleanup. Visible/pageshow only refresh presentation. Inactive blocks starts without changing native inactive semantics. Unmount detaches observers, but manager/session/poison survive remount; failed automatic cleanup is not silently retried by remount or another lifecycle event. StrictMode setup/cleanup does not acquire a device.

A cancelled browser picker may remain visible and may still grant permission. The app cannot revoke that permission. Its raw settlement blocks replacement; late selection never connects. Cleanup reports only confirmed local browser-handle release, not physical radio teardown or effects on other apps.

## Presentation and verification limits

The UI says Experimental browser AXP accessory, owned/authorized custom service only, not general scanning or RF capture. Secure supported Chrome platforms are required; standard Safari/iOS is unavailable. Names are marked device claims; RSSI is unavailable. Pending and failed cleanup stay visible and block replacement. Browser cleanup is never called Android Reset or native release. Offline tabs remain navigable.

Host suite: `node --test tests/web-axp-application.test.ts` (16 tests). Includes same-stack chooser, reentrant reservation, pre-render double click, live eligibility, simulator-first exclusion, actual core negotiation/ping, picker/open/write cancellation, raw poison, retry joining, stale handles, observer detach/remount, late READY, 30000ms READY deadline, host-mocked lifecycle order and source wiring contracts. The lifecycle test uses plain fake global objects, not a browser. Source contracts do not establish React runtime behavior or visual acceptance.

Focused regression command and retained evidence are in `evidence/web-axp-application/`. The command is:

```sh
node --test tests/web-axp-application.test.ts tests/web-axp-foundation.test.ts tests/session-controls.test.ts tests/session-release-boundary.test.ts tests/session-review-races.test.ts tests/session.test.ts tests/ble-transport-release.test.ts tests/ble-session-release.test.ts tests/foreground-device-action.test.ts tests/nfc-lifecycle.test.ts
node_modules/.bin/tsc --noEmit
CI=1 EXPO_OFFLINE=1 node_modules/.bin/expo export --platform web --output-dir dist-web-axp-final
```

The focused run has 145 passing tests, including 16 application and 46 foundation tests. TypeScript passes; offline web export produces a 296-module bundle. Browser rendering and device acceptance remain untested. Failed initial logs are retained: Node strip-only parameter-property syntax (fixed), public cleanup settlement ordering (fixed), and a TypeScript test assertion narrowing issue (fixed). Do not treat focused checks as an aggregate or browser/device test pass.

Independent review identified two stale callback paths before release: Ping success needed an exact session and mount-epoch check after await; a retained Cancel callback after cleanup failure needed to reject instead of reporting success. Both are fixed. Browser action journal success also checks a coordinator revision, so completion from an older operation cannot describe newer work.
