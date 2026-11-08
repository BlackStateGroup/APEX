# Independent READY collision fix review

Approved source commit: `e9defd0fbb946baa70c3539ab4534616d1f7a3b6` in the sibling `apex-ble-ready-collision` checkout. Production diff is only the `!ready` marker-consumption guard and explanatory comment. The reviewed TypeScript source and tests matched that commit when checks ran; only documentation/evidence remained uncommitted in the producer checkout. No production code was edited by this reviewer.

## Independent checks

`node review-evidence/esp32s3/validate-ready-fix.mjs /absolute/fix/checkout` passes four scenarios. The same fixture first failed against the original client because 20 rather than 29 response bytes reached the listener.

1. Initial READY is consumed. A real CRC-valid response split into 20 bytes plus marker-shaped tail reaches FrameDecoder intact while subscription is still pending. After subscription settles, subsequent marker-shaped bytes remain data. Closed callbacks have no effect and cleanup occurs once.
2. Invalid initial data rejects setup even if followed immediately by READY.
3. A fake GATT driver feeds the real DeviceSession through info/capability negotiation and the collision ping; echoed payload matches and pending count returns to zero. Close confirms release.
4. An oversized notification after readiness but before subscription settles closes the transport and reports one failure.

Independently ran:

`node --test tests/accessory.test.ts tests/protocol.test.ts tests/session.test.ts tests/ble-transport-release.test.ts tests/ble-session-release.test.ts tests/session-release-boundary.test.ts tests/session-review-races.test.ts tests/ble-ready-collision.test.ts`

Result: **71 tests passed, zero failures, cancellations or skips**, Node 24.22.1. Raw output is `fix-focused-tests.txt`; independent scenario output is `fix-independent-scenarios.txt`.

The production worker's added collision tests were also read and rerun within these 71 tests. They include all 495 supported MTUs with the recovered firmware's min(MTU - 3, 244) rule, all two-way splits of the specific 29-byte response, listener copy isolation, false initial markers, empty/oversized data, closed callbacks and repeated marker delivery. For this 29-byte fixture, nominal uniform sizes larger than its length collapse to the same single-notification case; this is not an exhaustive payload/stack acceptance claim.

## Disposition and limits

The minimal guard correctly keys on readiness observation, not transport `open` state, so it covers asynchronous subscription settlement. There is no remaining collision-specific blocker from this review. Updating the old accessory test's repeated-marker expectation is intentional and matches framed-byte preservation.

Do not interpret repeated marker bytes as a device-reset signal. Midstream resubscription/reset recovery remains a separate protocol/lifecycle acceptance concern. Queue saturation, ignored termination return values, unconditional startup BLE attempt, conditional NVS erasure and stale original firmware README caveats from the recovery review remain unchanged.

The initial recovery review and reproducer are preserved as historical evidence; its old reproducer explicitly asserts the original bug and is not a passing acceptance test after the fix. Use `validate-ready-fix.mjs` against the fixed checkout instead.

This review ran host JavaScript only. No SDK, C compilation, target execution, browser, native/prebuild, device/radio, flash, install, remote write or settings changes. The producer's broader test/typecheck results are separate evidence, not rerun claims here. No recovered original files, current core source, native modules, dependencies or registers were modified by this supplemental review.

Producer follow-up `2c6459ced48584fae09a4d88c818680c157e681b` was checked: evidence/documentation only, no packages/tests/firmware/modules/lockfile delta from reviewed source commit. Producer reports 1,581 broad tests passing; that broader run is not independently rerun here.
