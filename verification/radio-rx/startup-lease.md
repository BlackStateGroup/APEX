# Startup lease review, 2026-11-08

Reviewed lead: [PR11 comment](https://github.com/BlackStateGroup/APEX/pull/11#discussion_r4507327179).
Live main checked at `7f1110f9455d0c5b87419046b864314e1f1df191`.
The focused checkout's radio inputs match the previously reviewed and merged
`8c19452` source blobs. This is not a new full-repository build.

## Finding

The observation is reproducible. Pinned RadioLib commit
`3a664b64099e4bdbdb3e6f28a5ca6b833050b21e` calls `delay(150)` in
`CC1101::config()`, reached by `beginCommon()` during the first initialization.
The service starts its total lease before initialization and checks it before
arming. Expiry does not start reception, extend the deadline or retry.

This behavior was intentionally covered by the original 50 ms initialization
expiry test. The documentation said that initialization consumed the lease,
but did not explicitly warn that a short first request cannot capture. The
patch makes that limitation explicit and expands the regression coverage.
It changes no production code, accepted duration range, protocol, pins, radio
profile, transmit filter or default-disabled configuration.

## Synthetic reproduction

Actual pinned RadioLib CC1101 code linked against the host register/FIFO model:

| Request | Model elapsed | Status | RX arms |
| --- | --- | --- | --- |
| Cold 50 ms | 150 ms | EXPIRED | 0 |
| Cold 149 ms | 150 ms | EXPIRED | 0 |
| Cold 150 ms | 150 ms | EXPIRED | 0 |
| Cold 151 ms | 150 ms | RUNNING | 1 |
| Cold 1,000 ms | 150 ms | RUNNING | 1 |
| Warm 50 ms | 0 ms | RUNNING | 1 |

The expanded tests verify that cold expiry emits no RX command, no later tick
auto-arms, a separate explicit warm request receives a new capture ID without
a second reset, and both warm and remaining cold leases expire at their original
deadlines. A 49 ms request is rejected before hardware-facing operations.
These times are model results, not physical startup or stop measurements.

## Validation

- `python3 tools/check_radio_rx.py --radiolib-root /tmp/apex-radiolib-pin`
- `ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 python3 tools/check_radio_rx.py --radiolib-root /tmp/apex-radiolib-pin --sanitize`
- `python3 tests/test_radio_rx_pin.py --radiolib-root /tmp/apex-radiolib-pin`
- `git diff --check`

All passed locally. LeakSanitizer remains unavailable in this ptrace sandbox.
No ESP-IDF rebuild, new remote CI, flash, radio start or physical test was run
for this documentation/test-only patch. Prior PR11 CI is not evidence of a
new full-suite run for these added tests.
