# App cancellation through the installed PLX facade

Base: `386cdaf957d49078cf660fd936def0b6ebfa219a`. Isolated local clone; no main checkout edits.

## Executed path

Exact handlers extracted by unchanged `tests/support/app-acquisition.ts` from unchanged App.tsx → real DeviceSession / BleTransport → unchanged native TypeScript adapter → unchanged installed react-native-ble-plx 3.5.1 published JavaScript modules → synthetic RN/native methods/events → existing host-compiled C data callbacks. The original PLX fixture was extracted to `tests/plx-facade-host/fixture.ts` so both suites use one implementation. Gates were added only at synthetic boundaries. No SDK source, dependency, lockfile, native platform, firmware, application, or core changes.

## Coverage and results

- 12/12 new cases in `focused.log`.
- 62/62 focused existing tests (29 installed-facade + 33 fake-native/C) in `regression.log`.
- Typecheck passed in `typecheck.log`.
- Android boundary ladder: permissions, initial SDK state/readiness promise, connect, discovery, MTU, characteristics, monitor readiness, and first protocol write.
- Cancellation before session creation causes no native effect. Outstanding permission/connect/setup/write effects retain the App operation lock until settlement; no next setup/protocol effect starts after cancellation. The first Info write may finish, but Capabilities never starts.
- For both platforms, a held close retains ownership; failed cancellation reports unknown ownership and cannot silently retry. Explicit App Disconnect retries once, releases the selected session, and allows a later attempt. Repeated/stale captured handlers do not cancel successors.
- Real PLX `Subscription.remove()` dispatches cancellation but its ReadEvent listener survives while the native monitor Promise is pending. Late callbacks do not change the retired App; late Promise rejection removes the real SDK listener. Prior facade regression covers late resolution too.
- One Android cancellation runs alongside a separately scoped iOS manager/C fixture; the second session remains open and completes a C ping.

These cases intentionally do not multiply every boundary across both platforms and MTUs. Existing suites retain that protocol coverage.

## Initial failures and corrections

`initial.log` preserves the first raw run (10 pass, 2 fail). Both failures were test-fixture misuse: the test tried to open a successor fully on a C bridge whose CLOSE deliberately retires the link permanently. The successor timed out waiting for READY, and the test then read `.state` from a cleared session. The bridge has no reconnect command. The corrected test starts a successor, proves the stale handler cannot cancel it, then cancels the current successor before discovery. No production failure or fix is claimed. `initial-source.test.ts.txt` reconstructs the original test source by reversing that edit; initial traces were superseded by reruns and are not presented as preserved failure traces.

`typecheck-initial.log` preserves a later test-only TypeScript narrowing failure after asserting the mutable session ref null. An explicit current-session type assertion fixes the test's flow typing. Final typecheck passed.

## Evidence and historical scope

`source-hashes.json` records exact final candidate inputs, including unchanged executed application/core/C inputs and installed SDK pins. `artifacts.sha256.json` hashes current logs, source manifest, and final per-fixture traces. Traces are from the final focused run; they record synthetic calls, exact C commands/notifications, and fixture process retirement.

Earlier `verification/plx-facade/artifacts.sha256.json` and related reports/traces are preserved byte-exact. They describe the earlier candidate, not this extracted-fixture candidate; their old test-file hash is historical and is not silently updated. The original loader and its installed-source pin manifest are unchanged.

## Limits

No React mounting/render/touch execution; exact App handlers run with injected setters. No native Android/iOS execution, bridge ABI validation, device, radio, USB, flashing, startup acceptance, real permissions UI, or native ordering proof. Synthetic close/event ordering is one chosen schedule. Host C is existing callback code under fake SDK infrastructure, not a firmware build. iOS destroy acknowledgement/reset remains unresolved and is explicitly still rejected. Setup cancellation may leave DeviceSession transport release unconfirmed even when adapter ownership is idle; tests preserve that conservative state and do not invent release proof. Only focused tests/typecheck ran, not the aggregate suite or native builds.
