# Offline I/Q app inspector host evidence

Base: c3bafcaa8a1c28734163a3e37f4eeb9599d4a67b. Source implementation: 88606c2.
Node v24.22.1; reused sibling node_modules without installation or lockfile change.

## Completed

- 19 new controller, exact-byte adapter and actual TSX tests pass. Native Crypto is mocked; actual native input TSX is statically projected. Mock-hook tests exercise the actual owner callback wiring, AppState/background and stable reentry with the same controller; actual web input onChange receives Node-authored synthetic File objects. This is not a browser picker or native runtime.
- 143 focused tests pass: all IQ core/CLI tests, new app tests, navigation, static NFC inspector-list checks and HCI comparison regression tests.
- Full `tsc --noEmit` passes.
- `playwright test --list` lists 40 scenarios; none executed. New scenario is synthetic-only and authored for future acceptance.
- SHA-256 manifest covers changed source, tests and feature documentation. Core, CLI, native modules, package.json and lockfile unchanged.

## Initial failures retained

- `initial-tsc.log.txt`: owner AppState synchronization initially accepted only string; React Native currentState may also be null/undefined. The callback now handles unknown/non-active states conservatively.
- `initial-render.log.txt`: host event test polled only 30 setImmediate turns, which could finish before Node's real File.arrayBuffer work settled. Host polling now allows up to two seconds in two-millisecond ticks; no product code was changed to accommodate the test. Final reruns pass.
- Test review identified and fixed immediate read-buffer snapshot isolation before awaiting the second read and an explicit SHA algorithm allowlist before these regressions ran. Final tests cover both.

## Reproduction

```
node --test tests/iq-app*.test.ts
node --test tests/iq-*.test.ts tests/inspect-iq*.test.ts tests/analysis-navigation.test.ts tests/analysis-inspector-independent.test.ts tests/nfc-static-memory-review.test.ts tests/hci-comparison*.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/playwright test --list
```

No browser execution, browser/native build, installed dependency, real user file, storage/provider/network call, radio/device/permission action or publication occurred. Static and mocked tests do not establish phone layout, picker cancellation in a real browser, native TextDecoder/Expo/Hermes acceptance, physical acquisition or calibrated RF measurement.

## Observer ownership hardening

Additional independent review reproduced public-subscriber edge cases: a throw at running publication could strand busy, a throw at final publication could reject completed work, and pre-lock recursive Inspect could start two metadata reads. Clear during initial validation notification could also start stale reads because generation was captured too late. Independent original failing tests/logs are retained in reviewer commit `1b35017` under `verification/iq-app-independent/` for parent integration. No mounted React failure is claimed; its listener normally only requests a refresh.

The fix claims ownership/generation before synchronous notification, places all owned work inside try/finally, fences before first read, and isolates each observer exception. Notification uses a subscriber snapshot and suppresses nested dispatch without suppressing observer-triggered state changes. All existing 19 affected app tests and full typecheck pass after the correction; see `observer-fix-affected.log.txt` and `observer-fix-tsc.log.txt`. The independent reviewer is rerunning their unchanged reproduction and race tests against the exact fix.

The broader focused rerun after observer hardening also passes 143/143 tests (`observer-fix-focused.log.txt`).

## Synthetic metadata without TextEncoder

The synthetic example now constructs its exact ASCII literal bytes directly with `Uint8Array.from(..., character => character.charCodeAt(0))`. No core/runtime decoder changes were made. An absent-global TextEncoder regression originally reproduced a Load exception; `encoder-original-failure.log.txt` preserves it. The final tests verify the same literal byte count, metadata/data SHA-256 and zero result with no encoder. Missing TextDecoder or WebCrypto during explicit Inspect already refuses cleanly, releases the slot and permits explicit retry when restored. This is simulated source robustness, not an observed native failure. Final affected tests pass 21/21, broad focused tests 145/145, and full TypeScript passes (`encoder-final-*.log.txt`).

## Atomic selection observer transitions

Independent one-shot observer probes reproduced six staging inconsistencies: Clear/exit during example could dereference released handles, observer replacement could receive the outer synthetic origin, and outer file staging could overwrite newer Clear/exit/replacement state. Original failing probes/logs remain with the independent reviewer (`verification/iq-app-independent/staging-observer-original.log.txt`) for parent integration.

Selection transitions now commit private handles, public labels, origin and invalidation together before one notification. Example, file stage, Clear and deactivate perform no subsequent selection writes after notification, so the observer's newer state remains authoritative. Inspect ownership/generation fences are unchanged. Tests exercise all six example/stage observer combinations plus coherent Clear/exit replacement and exact data hashes. An initial added test accidentally returned a pooled Node Buffer's full backing buffer; production correctly refused the length mismatch. `atomic-selection-test-fixture-failure.log.txt` preserves that test-only error. The fixture now returns an exact copied Uint8Array backing buffer. Final app tests pass 23/23, focused checks 147/147 and full TypeScript passes (`atomic-selection-*.log.txt`). These defensive API probes are not claims of observed native/browser/React failures.
