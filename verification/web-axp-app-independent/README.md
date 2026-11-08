# Independent browser AXP application review

Reviewed source: `4804236b712c99ea6745817bdad7fda7fa9ccb24` (documentation/evidence only after production source `e210dbf26509e012ae228a8205d3de1b8a6537f2`). Initial source was `f786ae34afd2ddca4626bf7b6089b591716bcc98`; foundation parent was `dae720f`.

Production hashes are retained in `reviewed-source-sha256.txt`. This review adds only tests and evidence, not production changes.

## Findings and fixes

- Before first implementation commit, source review found ordinary Console Disconnect lacked a live browser-owner guard, despite its disabled UI prop. Builder routed owned sessions through coordinator cancellation before the first pinned commit. No executable initial failure exists for that pre-commit finding.
- On `f786ae3`, the actual extracted Ping callback appended old-session replies after session replacement, unmount, StrictMode-style mount epoch change, or closure. Four raw assertion failures are retained in `independent-ping-initial-failure.log`. Builder fixed the exact session/state/attachment/epoch checks in `e210dbf`; all four now pass.
- On `f786ae3`, poisoned `cancel(false)` fulfilled without release. Executing the actual App Cancel and browserAction closures consequently announced cleanup completed while ownership remained held. Raw failure is retained in `independent-cancel-initial-failure.log`. Builder changed this path to reject with explicit Retry instructions; regression now passes.
- `independent-after-fixes.log` retains a test expectation failure caused by the intentional change from fulfilled no-op to rejected explicit-retry status. The regression was updated to require that rejection, while still asserting no cleanup effects occurred.
- `handler-extraction-harness-initial-failure.log` retains a harness syntax failure: extracted App simulator-connect function still contained TypeScript non-null assertions. The harness now strips only that syntax and the argument type before execution; no production logic is rewritten.

## Independent checks

17 tests use an independently implemented synthetic host and actual production classes. They cover same-stack chooser/filter invocation before observer publication; frozen snapshots; all acquisition gates; held simulator preservation; pending chooser rejection and raw fencing; observer-reentrant reservation cancellation; exact session close ordering outside operation lock; pending open and write cancellation; late raw settlement and explicit poison retry; stale notification/old session callbacks; exact cleanup identity; view detach; reentrant newer selection; actual Ping callbacks; actual Cancel/browserAction callbacks; actual generic simulator-connect guards; and the actual platform lifecycle adapter/module singleton.

The lifecycle fixture substitutes synthetic global EventTarget objects. It checks import, bind/unbind/rebind, visible/pageshow, hidden/pagehide, unsupported/insecure support reporting, and singleton retention. It does not run React or a browser. Actual App handler tests extract production handler text, remove only necessary TypeScript syntax, and execute with host bindings. Remaining JSX wiring is asserted from source; it is not browser UI acceptance.

Final ownership regression: **142 passed, 0 failed** (`final-ownership-regression.log`), including 17 independent tests, 16 builder application tests, 46 foundation tests and 63 core/session/lifecycle regressions. TypeScript no-emit check passes (empty `typecheck-final.log`). Earlier 96-test focused run also passed; its command included an unmatched `tests/ble.test.ts` name, so the final explicit existing-file command below is authoritative.

```sh
node --test tests/web-axp-application-independent.test.ts tests/web-axp-application.test.ts tests/web-axp-foundation.test.ts tests/session.test.ts tests/session-release-boundary.test.ts tests/session-review-races.test.ts tests/session-controls.test.ts tests/ble-session-release.test.ts tests/ble-transport-release.test.ts tests/foreground-device-action.test.ts
./node_modules/.bin/tsc --noEmit
```

## Acceptance limits

No browser execution, localhost server, sockets, browser chooser, permissions, actual Bluetooth/GATT APIs, hardware, radio, native build/prebuild, install, credentials, settings or remote writes were used. Existing exact dependency directories were reused by symlink. Browser execution was explicitly excluded due to prior managed-environment denial and was not retried. Builder export evidence was inspected but not independently repeated here.

This is acceptance of the application ownership/session integration in host mocks and source review only. Physical Chrome-platform compatibility, Safari/iOS support (currently reported unavailable), actual OS chooser behavior, React runtime lifecycle/UI, and native/physical behavior remain unvalidated. Device name/READY/identity remain unauthenticated claims; no reception/RSSI/authentication/unlock claim follows. The separately identified pre-existing core READY-marker collision is outside this review's production changes and needs the parent's separately reviewed core fix.
