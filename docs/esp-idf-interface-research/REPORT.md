# ESP-IDF 6.1 / APEX reviewed adapter: pinned static interface research

## Scope and exact identity

Read-only official GitHub source inspection on 2026-11-08. No SDK installation, build, execution, prebuild, device/USB/radio/flash operation, remote write or configuration change occurred. Main checkout was read at 5ee849e9a30e10517aac46e70794e491c3bccd6f. Reviewed ble_accessory.c SHA-256: 4c4a7ac3829f87088c8c9bebbe361be752de200943401986c6cb69f20408dd7c. This report does not apply automatically to subsequent fixes.

Read the derivative README, independent REVIEW.md, restoration documentation/manifest and historical USB startup. The requested research/workbench-verification.json is absent from that checkout and its tree; it supplied no evidence.

The workflow pins espressif/idf:v6.1@sha256:81893c71bb5e570088901f21def8684c25cd2a9020281bd01b843a7655edb18c, but builds firmware/esp32s3, NOT firmware/esp32s3-reviewed. A static workflow is not a build result.
- [Official v6.1 tag](https://api.github.com/repos/espressif/esp-idf/git/ref/tags/v6.1) resolves to annotated tag object 4dc1c65503e98e9a6b4c3c5646237280ba79829b.
- [Tag object](https://api.github.com/repos/espressif/esp-idf/git/tags/4dc1c65503e98e9a6b4c3c5646237280ba79829b) resolves to IDF commit fff9895c82d744c7237be8847347bdd1b07c6643. GitHub reports its signature verified; no independent local signature verification was performed.
- [Pinned submodule entry](https://api.github.com/repos/espressif/esp-idf/contents/components/bt/host/nimble/nimble?ref=fff9895c82d744c7237be8847347bdd1b07c6643) resolves to espressif/esp-nimble commit 139cada0ae932957fa06ba37d17e3c9c2c95c773.
- Container digest contents were NOT inspected. These source pins establish the official release tree, not cryptographic proof that the image contains it. Future build evidence should record actual IDF HEAD, submodule HEAD, generated config and image platform/digest.

sources.json records exact file URLs and Git blob SHA-1s. No SDK source blobs are included in this deliverable. Private raw responses retain original file notices: inspected NimBLE implementation headers carry Apache License 2.0 notices; individual IDF files may carry Apache-2.0 or Apache-2.0/MIT SPDX identifiers. These source licenses do not change APEX licensing. Source references below use N = espressif/esp-nimble at 139cada0ae932957fa06ba37d17e3c9c2c95c773 and I = espressif/esp-idf at fff9895c82d744c7237be8847347bdd1b07c6643. Raw connector responses are outside this deliverable.

## Actionable finding: unhandled callout initialization failure

**Confirmed source-level startup fault outside current fake coverage.**
[N NPL header](https://github.com/espressif/esp-nimble/blob/139cada0ae932957fa06ba37d17e3c9c2c95c773/porting/npl/freertos/include/nimble/nimble_npl_os.h#L273-L294) declares init as int, reset as ble_npl_error_t, stop as void.

[N NPL implementation](https://github.com/espressif/esp-nimble/blob/139cada0ae932957fa06ba37d17e3c9c2c95c773/porting/npl/freertos/src/npl_os_freertos.c#L783-L979):
- init returns -1 on heap allocation failure (835–839) and timer creation failure (807–811, 853–857; also FreeRTOS branches). Timer creation failures clean up and leave co->co NULL.
- stop explicitly returns when co->co is NULL (965–969).
- reset dereferences callout->handle with no NULL check (923–925).
- APEX ignores init's return and starts the host. A successful connection and first subscription can reach ready→schedule→reset with the null internal callout. Existing fake init is void/no-op (or forbidden in independent tests), hiding the real recoverable return.

Required improvement: check init success before scheduling/launching the host task and fail startup explicitly; align fake declaration with real int return; test unsuccessful initialization cannot enter host startup/advertising/scheduling. Checking this return does not make memory allocation or task startup fully fail-safe: event allocation contains assertions and the port's host-task wrapper ignores xTaskCreatePinnedToCore's return (N porting/npl/freertos/src/nimble_port_freertos.c36–45,69–73).

### Selecting the correct NPL

[I NimBLE CMake](https://github.com/espressif/esp-idf/blob/fff9895c82d744c7237be8847347bdd1b07c6643/components/bt/host/nimble/CMakeLists.txt#L173-L225) selects the esp-nimble FreeRTOS NPL source and include path when controller disabled OR not SOC_ESP_NIMBLE_CONTROLLER. ESP32-S3 soc_caps.h does not define that controller capability. Do not substitute the similarly named IDF components/bt/porting/npl/freertos source used by other controller configurations. Both were initially inspected, but the conclusions above cite the selected submodule implementation.

## Callout scheduling and stale events

I components/bt/host/nimble/Kconfig.in314–318 defaults BT_NIMBLE_USE_ESP_TIMER=y. Under this default:
- Time conversion uses milliseconds directly (N NPL1071–1086); reset stops timer, removes queued event, starts one-shot at ticks*1000 microseconds (921–930).
- ESP_OK maps to BLE_NPL_OK, INVALID_ARG to INVALID_PARAM, INVALID_STATE to EINVAL, other failures to ERROR (748–762). APEX's nonzero check matches this API.
- stop ignores esp_timer_stop return and removes the queued event (963–979).
- timer callback enqueues its event when evq is non-NULL, otherwise calls it directly (734–744). APEX passes default event queue.
- eventq_put suppresses another already-queued copy (384–406); eventq_get clears the queued bit before callback execution (355–380).
- removal drains/requeues all other elements and clears queued (410–474).

This narrows the one-pending-event fake assumption, but is not proof of absence of a race with a concurrently executing timer callback or a precise stop-completion barrier. No timer implementation/dual-core execution or stress experiment established those physical timing properties. A stopped callback cannot be assumed canceled once already executing. Preserve stale-callback eligibility guards.

Nondefault FreeRTOS timer reset returns BLE_NPL_OK without propagating xTimer command results (933–958). Thus a fake reset failure is useful fault injection but not a prediction that every underlying timer failure is surfaced. Nondefault timer paths require separate examination; do not generalize default behavior.

## Event serialization: narrower than the README

N porting/nimble/src/nimble_port.c417–431 consumes the default queue one event at a time. N ble_hs.c1027–1029 selects that queue; RX data is enqueued at837–859 and dispatched at364–369/669–672. The timer uses that same queue. These support serialized normal host processing.

**The blanket claim that all GAP callbacks are queued and non-reentrant is false.**
[N notify implementation](https://github.com/espressif/esp-nimble/blob/139cada0ae932957fa06ba37d17e3c9c2c95c773/nimble/host/src/ble_gattc.c#L5335-L5397) calls ble_gap_notify_tx_event inline at5393, before returning to transmit. [N GAP](https://github.com/espressif/esp-nimble/blob/139cada0ae932957fa06ba37d17e3c9c2c95c773/nimble/host/src/ble_gap.c#L9788-L9801) directly calls event listeners and the connection callback for BLE_GAP_EVENT_NOTIFY_TX.

APEX currently ignores NOTIFY_TX, so this particular nested callback does NOT mutate the queue/parser and is NOT a demonstrated corruption. No reviewed call chain establishes an inline handled disconnect/subscribe during notify_custom. Avoid claiming that none can ever occur in every SDK/configuration; enforce no added external listeners/callers that mutate adapter state and audit any future callback changes. Normal ATT callbacks are themselves called inline within host processing (N ble_gatts.c624–629), not separately queued.

The actual useful invariant is one owner of mutable adapter state, plus no state-mutating nested callbacks along invoked APIs. Same numeric handle reuse still relies on host event ordering, not on an APEX generation token.

## Outbound mbuf ownership

[N header contract](https://github.com/espressif/esp-nimble/blob/139cada0ae932957fa06ba37d17e3c9c2c95c773/nimble/host/include/host/ble_gatt.h#L889-L901) explicitly says notify_custom consumes supplied mbuf regardless of outcome.
- Normal implementation passes txom to ble_att_clt_tx_notify and nulls local pointer (5381–5382), then frees remaining pointer on other failures (5395).
- Lower ATT notification routine frees txom for invalid handle/allocation errors (N ble_att_clt.c1047–1080); after concatenation ownership transfers through ble_att_tx. This is consistent with the normal enabled contract. It is not real heap/leak testing.
- Important configuration exception: !MYNEWT_VAL(BLE_GATT_NOTIFY) returns ENOTSUP immediately (5338–5339), without freeing a supplied mbuf. Do not blindly add a free on normal error: that would violate the enabled API ownership contract.

[I configuration default](https://github.com/espressif/esp-idf/blob/fff9895c82d744c7237be8847347bdd1b07c6643/components/bt/host/nimble/port/include/esp_nimble_cfg.h#L754-L756) sets MYNEWT_VAL_BLE_GATT_NOTIFY to1 unless overridden. APEX defaults enable NimBLE, no local override was found in the reviewed target. Therefore the disabled branch is a configuration caveat, NOT a proven leak under this intended default. Verify generated config/preprocessor output at native build; reject unsupported notification-disabled configurations explicitly with a compile-time guard inside the opt-in path. Existing includes expose MYNEWT_VAL: N ble_hs.h33 includes ble_gap.h; ble_gap.h33 includes syscfg/syscfg.h; N porting/nimble/include/syscfg/syscfg.h8–9 includes esp_nimble_cfg.h under ESP_PLATFORM; I esp_nimble_cfg.h19 defines MYNEWT_VAL. The syscfg blob is158f3846a964e334a8ea4e29507cb4e0711ec556. Fail closed if the macro itself is absent rather than guessing a default.

## Disconnect structure and reset lifecycle

N ble_gap.h729 declares event.disconnect.conn as struct ble_gap_conn_desc; APEX event->disconnect.conn.conn_handle agrees with that declaration.

N ble_gap.c8653–8685 termination finds connection, requests termination and returns status; success is not a disconnect event. Persistent APEX ownership/fencing until callback is appropriate.

[N host reset](https://github.com/espressif/esp-nimble/blob/139cada0ae932957fa06ba37d17e3c9c2c95c773/nimble/host/src/ble_hs.c#L506-L527) clears RX, invokes ble_gap_reset_state, resets addresses, optionally calls reset_cb, then syncs.
[N GAP reset](https://github.com/espressif/esp-nimble/blob/139cada0ae932957fa06ba37d17e3c9c2c95c773/nimble/host/src/ble_gap.c#L2078-L2089) walks all active connections through ble_gap_conn_broken. That function snapshots descriptor into event.disconnect.conn (1820–1836), deletes connection (1909), then delivers DISCONNECT to the saved callback (1911–1916). For peripheral connections never reported as connected it instead suppresses disconnect and reports connect failure (1873–1897).

Thus normal pinned host reset of a reported established peripheral connection supplies the matching disconnect before sync. The README's unrecovered ownership scenario remains a hypothetical abnormal/missing-callback failure, not the normal implementation behavior. No automatic recovery change is warranted solely from static observation. The callback attempts advertising while unsynchronized; later sync retries advertising. Actual reset/termination/reconnect ordering and radio behavior remain device acceptance gates.

## ATT write-with-response and bounds

- BLE_ATT_ERR_INSUFFICIENT_RES is0x11 (N ble_att.h111); APEX returns the ATT code, not BLE_HS_ENOMEM.
- N ble_gatts.c624–629 forwards access callback result. N ble_att_svr.c655–683 places nonzero callback rc into att_err and reports BLE_HS_EAPP internally.
- N ble_att_svr.c2430–2492 allocates a write response before applying callback, then tx_rsp sends error response on callback failure (760–801). Error response transmission itself can fail. A successful callback/ATT ACK does not imply notification drainage; an on-air ACK or error cannot be promised just from a C return value.
- Admission rollback is APEX's parser/queue property, not a general NimBLE transactional guarantee. APEX scheduling failure after commit still fences and returns UNLIKELY.
- N ble_att.h269/275 defines default23 and max527; preferred-MTU setter rejects outside that range (N ble_att.c648–660).
- APEX preferred185 is within bounds; chunk cap244 plus mtu-3 is consistent. ble_att_mtu returns0 if connection/channel cannot be found (ble_att.c463–488), so mtu<23 fence also handles invalid/disconnected handle, not only bad negotiation.
- A preferred MTU is not a measured negotiated MTU. Real peer/platform negotiation remains untested.

## Startup, Kconfig, includes and CMake

I tools/cmake/kconfig.cmake24–55 discovers component-root Kconfig.projbuild; derivative main/Kconfig.projbuild has correct name and default n. Source #if gate encloses all NimBLE startup, exposing a no-op apex_ble_start otherwise. This is static registration agreement, not generated sdkconfig verification. A preexisting sdkconfig can override defaults; verify both clean off/on configurations separately.

Derivative CMake includes its own BLE source, historical USB main/header and unchanged portable core; REQUIRES bt nvs_flash esp_driver_usb_serial_jtag. I NimBLE CMake exposes host, service-gap/gatt, host/util and port include paths (186–225). N ble_hs.h29–47 transitively includes GAP, GATT, ATT, mbuf and NPL definitions used by the source. No missing include is proven by this read, but fake builds cannot establish authentic declaration/layout/link compatibility.

N nimble_port.c286–322 returns esp_err_t and initializes/enables the controller before host setup. APEX's ESP_ERROR_CHECK matches return representation for this call; callout failure occurs AFTER controller initialization, so stopping host-task launch does not prove the controller was never enabled. Do not describe startup failure as zero radio/controller side effects. Cleanup policy needs deliberate review, not automatic NVS erasure.

APEX calls nvs_flash_init and aborts on every error, without its historical erase branch. No NVS API/device initialization was performed. The off path still allows historical USB app_main to initialize USB Serial/JTAG if firmware is executed. Default-off is not permission to execute.

## Remaining gates and prioritized next steps

1. Fix ignored callout_init return in derivative only; add accurate failure-path fake coverage and document controller already initialized at that point.
2. Narrow queue/non-reentrancy claims; exercise harmless inline NOTIFY_TX in fake notification tests, while keeping actual mutation invariant explicit.
3. Record/restrict effective notification and timer configuration; retain enabled notify ownership semantics.
4. Separately authorize native ESP-IDF builds for derivative with off/on configs; record IDF/submodule/image identity, generated sdkconfig, actual API warnings/link results and map/stack/RAM evidence. The historical workflow alone does not cover this target.
5. Physical timing, memory pressure, negotiated MTU, notification backpressure, termination/reset/reconnect and phone lifecycle remain unaccepted until explicitly authorized owned-device tests.

A static source match is neither an API/ABI compilation nor device acceptance. No production source was changed by this research.

