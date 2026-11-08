# Pinned FreeRTOS NPL initialization correction

## Confirmed gap and minimal correction

The original reviewed target ignored `ble_npl_callout_init` and its fake declared
that function `void`. Pinned ESP-IDF v6.1 commit
`fff9895c82d744c7237be8847347bdd1b07c6643` selects esp-nimble commit
`139cada0ae932957fa06ba37d17e3c9c2c95c773`'s FreeRTOS NPL. Its
[header lines 273–288](https://github.com/espressif/esp-nimble/blob/139cada0ae932957fa06ba37d17e3c9c2c95c773/porting/npl/freertos/include/nimble/nimble_npl_os.h#L273-L288)
declare an `int` return. Its
[implementation lines 783–979](https://github.com/espressif/esp-nimble/blob/139cada0ae932957fa06ba37d17e3c9c2c95c773/porting/npl/freertos/src/npl_os_freertos.c#L783-L979)
returns `-1` on object allocation or timer creation failure, leaving a null
internal pointer that later reset can dereference.

The revised target now uses `ESP_ERROR_CHECK` before starting the host task.
This is fail-stop startup after partial NimBLE initialization, consistent with
its other initialization checks. It does not claim rollback of allocated
resources/controller initialization, and attempts no cleanup, retry or NVS erase.
Pinned `nimble_port_init` initializes and enables the controller before this
check, so the failure policy is specifically no host-task start, not no prior
controller side effects.
Both failure causes have the same public result; the host regression injects
that `-1`, not a substitute SDK allocator implementation. Zero still permits
host task start. All three host harness fake declarations now return `int`.

## Notification configuration and callback clarification

Pinned IDF's
[configuration lines 754–756](https://github.com/espressif/esp-idf/blob/fff9895c82d744c7237be8847347bdd1b07c6643/components/bt/host/nimble/port/include/esp_nimble_cfg.h#L754-L756)
default notification support on. In the pinned
[notify_custom implementation](https://github.com/espressif/esp-nimble/blob/139cada0ae932957fa06ba37d17e3c9c2c95c773/nimble/host/src/ble_gattc.c#L5335-L5397),
the disabled branch returns ENOTSUP before taking mbuf ownership. The reviewed
opt-in source now rejects notification-disabled configuration at compile time;
it does not attempt speculative free-after-error ownership handling. The host
runner checks the exact rejection diagnostic. BLE opt-out remains isolated.
The pinned existing include chain exposes the configuration macro:
`host/ble_hs.h:33` -> `host/ble_gap.h:33` -> `syscfg/syscfg.h:8–9`
(ESP_PLATFORM) -> `esp_nimble_cfg.h:19`. No speculative new include is needed.
The syscfg blob is `158f3846a964e334a8ea4e29507cb4e0711ec556`; the ESP
configuration blob is `a0f62f36aa2b949c4a4aee0750248e09df8c2e4b`.

The normal notification branch invokes NOTIFY_TX inline. This adapter's GAP
handler ignores that event. A blanket claim that every SDK callback is
non-reentrant is incorrect; the requirement is absence of reentrant *mutating*
callbacks during adapter operations. Future handler expansion requires review.
Pinned host reset source breaks established connections and delivers matching
GAP disconnect before reset/sync, narrowing the earlier hypothetical missing-
disconnect concern. These are pinned source findings, not runtime observation.

## Evidence and remaining gates

`before.txt` retains a failing actual-source init regression before the guard.
The original initial reproducer tested the same -1 twice under allocation/timer
labels; the final regression deliberately tests that common public return once.
`after-node.txt` contains both passing wrappers. Revised C now passes 19
scenarios including 10,000 deterministic interleavings; historical C remains
17 scenarios plus its two expected safety failures. Disabled/zero BLE opt-in
builds still compile/link/run without undefined SDK symbols. Notification-
disabled opt-in compilation must fail explicitly.

`after-asan-ubsan.txt` records 19 revised scenarios with ASan/UBSan and
`ASAN_OPTIONS=detect_leaks=0`. No new LeakSanitizer attempt was made. Earlier
independent eight probe groups/eight mutations can be rerun as regressions;
that is NOT independent approval of this changed source. The requested new
independent review was blocked before it produced delta findings and was not
retried or rerouted. That review gate remains open.

All six historical files and portable core remain unchanged. No SDK install,
SDK compilation, native build, device/radio/flash, settings or remote write
occurred. API source reconciliation does not establish authentic header
compilation, CMake/Kconfig behavior, board behavior or physical acceptance.
