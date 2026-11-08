# AXP BLE startup marker / framed-data boundary

The BLE transport consumes exactly the first whole notification equal to
`AXP_READY` while awaiting startup readiness. Before that marker, any other
notification rejects setup. The marker is unauthenticated and grants no downstream
authority.

Once readiness has been observed, **all** subsequent nonempty notifications of at
most 512 bytes are ordinary data, including notifications identical to the marker.
This applies even while the subscription promise is unsettled and transport state
is still `opening`. Repeated markers do not renew readiness or authorization.
There is no content filtering, scanning for markers inside notifications, or
protocol-schema change. The normal frame decoder still validates framing and CRC.

## Why this is necessary

The restored ESP32-S3 adapter splits arbitrary response bytes into chunks of
`min(MTU - 3, 244, remaining)`. At MTU 23 the following valid ping response splits
into 20 + 9 bytes, and its last nine bytes spell `AXP_READY`:

- Ping payload: `80a700000000000000004158505f524541`
- Response: `4158010203000300110080a700000000000000004158505f5245414459`

Previously the transport discarded that last chunk, so the decoder never received
the complete CRC-valid response. Gating marker consumption on the local `ready`
flag fixes this without changing native ownership, subscription settlement,
cleanup, bounds, ATT writes or framing. Gating on `state === 'opening'` would be
incorrect because notifications can arrive before subscription settlement.

A second READY-like notification is not a reset signal. A link that actually
closes remains closed, late callbacks are ignored, and this transport cannot be
reused. Reconnection requires a new transport and its own first marker. Native
resubscription/board resets and real timing remain physical acceptance work.

## Host evidence

Base: `f84843bf9ba7944cd8d35e5b4d9016594b492d1a`. Independent original reproducer:
`ace18c9c2a0bb5b5b4a535570a1514c460bc7170`,
`review-evidence/esp32s3/ready-collision.ts` in the independent review checkout.

`verification/ble-ready-collision/pre-fix.txt` preserves the initial seven-test
run: five failures, two passes, including the genuine ping timeout. The final
focused suite passes seven tests. Its nested cases cover every uniform chunk
size 1–512, every two-part split of the 29-byte frame, and all 495 supported MTUs
(23–517) with firmware's 244-byte cap during full session negotiation and ping.
The pre-fix session fixture did not yet apply the 244-byte cap; it failed at MTU
23, where both rules are identical. The final fixture matches firmware exactly.

Other cases cover marker-shaped chunks before/between/after ordinary data while
subscription remains pending, independent listener copies, false first markers,
bounds failures during opening/open states, and callbacks after closure. Existing
release/race and native-mock suites cover ownership and cleanup regressions.

Commands (Node 24.22.1, pre-existing dependencies reused by symlink, no install):

- `node --test tests/ble-ready-collision.test.ts`
- `python3 tools/build_firmware.py` (portable host C only)
- `node --test tests/*.test.ts`
- `./node_modules/.bin/tsc --noEmit`

No recovered original firmware files, protocol schema, dependencies or native
implementation were changed. No browser, native build/prebuild, device/radio,
flash, SDK install or remote write was performed. Physical acceptance is unrun.

Initial broad runs are retained rather than overwritten:
`core-first-stale-expectation.txt` contained the old accessory test's expectation
that repeated READY was discarded. That expectation was explicitly updated to
forward the bytes. `all-first-stale-expectation-missing-rea.txt` additionally had
eight failures because this fresh clone lacked the existing REA dependency
symlink. The same pre-existing pinned REA tree was linked locally (no install or
dependency edit), and the complete suite was rerun. Native-build/process tests
use synthetic CLI fixtures; these do not constitute an actual native build.

Final results: focused 7/7, core/foundation/native-mock/host integration 257/257,
complete TypeScript test suite 1581/1581 (zero skipped/cancelled), portable C checks
passed, and final `tsc --noEmit` exited 0. Complete raw logs and SHA-256 manifest
are in `verification/ble-ready-collision/`. Source change commit:
`e9defd0fbb946baa70c3539ab4534616d1f7a3b6`.
