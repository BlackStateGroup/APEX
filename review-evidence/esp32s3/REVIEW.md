# Independent ESP32-S3 recovery review

Reviewed recovery commit `4d9417de8bc095029d656a3a2178ca5fe35cfb13`, base `bb30f68ff4c4b959fdcfef0648ef86bd5caa9aef`, original pin `e51750ec0b34b280399877d67e1036058874c373`.

## Disposition

Accept as exact historical source recovery, not as build/device acceptance. No original-file fix is proposed in this recovery. One confirmed current client framing defect and several execution gates remain before interoperability acceptance.

## Independent identity and scope checks

`python3 review-evidence/esp32s3/verify-independent.py /path/to/retained-raw-responses` passed. It reads the retained connector commit/tree/blob responses independently of the restoration helper. It reconstructs every tree object, including the root `65feddc47127bd228383e5fa87ca1e70ff26b2c8`, and verifies all six files, 8,454 bytes, raw blob contents, SHA-1/SHA-256, tree/index/file modes, destination set, pinned links and absence at the base. All six are regular non-executable files. Trust remains in retained connector responses for an unsigned commit; this was not a fresh network fetch or signature verification.

The recovery diff adds precisely the six target inputs, documentation/manifest and helper. It does not alter portable core, native module, lockfile or registers. CMake source dependencies resolve to the existing portable core. No repository AGENTS.md or local skills were present in this checkout.

## Confirmed interoperability defect: READY collides with framed bytes

`node review-evidence/esp32s3/ready-collision.ts` reproduces against the actual current TypeScript `BleTransport`, using a fake driver and no radio/native API. At MTU 23, the recovered adapter's chunk rule splits a valid 29-byte ping response into 20 + 9. The final nine bytes can be exactly `AXP_READY`. `BleTransport` consumes that notification as readiness even after opening, so the frame decoder receives only 20 bytes and the request cannot complete from this response.

Reproduction payload: `80a700000000000000004158505f524541`.
Response: `4158010203000300110080a700000000000000004158505f5245414459`.

The check asserts the existing defect, not successful interoperability. Correcting the client to recognize the marker only during initial readiness, and forwarding all subsequent bytes, is a separate development change requiring tests for marker-shaped frame tails, duplicated subscription markers and session restart semantics. Do not silently rewrite recovered originals. This is a source-level defect demonstrated with host TypeScript, not a physical-board observation.

## Queue pressure and error handling

The adapter has four queued *responses*, not four outstanding ATT writes. The TypeScript transport can queue 16 caller writes; DeviceSession defaults to eight outstanding requests (configurable up to 32). It serializes ATT writes, not application responses. Thus fast request delivery relative to the 5 ms notification timer can overflow. Multiple complete requests can also fit one accepted write: five empty request frames occupy 60 bytes and synchronously generate five replies before the host-event callback returns, if input MTU permits. The default client does not normally concatenate requests this way.

On overflow, `output` drops that response and calls `ble_gap_terminate`; the access callback still returns success. The termination result is ignored. Therefore say "requests disconnect on overflow", not "always terminates": there is no immediate closed state or synchronous assurance of release. Ten consecutive notification errors similarly request termination; successes reset the retry count. No real scheduling, resource failure or disconnect behavior was tested. A transport write acknowledgment is not application completion. Existing DeviceSession timeouts/disconnect handling bound caller waiting but do not guarantee successful delivery.

## Startup and acceptance gates

- `app_main` installs USB Serial/JTAG then unconditionally calls `apex_ble_start`. Successful NimBLE synchronization attempts connectable advertising; disconnect/advertising completion attempts restart it. Source presence is passive, running it is not. Startup errors or address/advertising failures can prevent actual advertising.
- On either NVS no-free-pages or new-version errors, `nvs_flash_erase()` erases the default NVS partition before retrying initialization. It is not an unconditional whole-flash erase. Any other data in that partition could be lost. Do not run this recovery merely as a USB-only test.
- The BLE service is unauthenticated. It exposes current portable info, capabilities and ping, not downstream authority. UUIDs, exact initial READY marker, frame format, CRC and size bounds agree statically. SDK configuration requests one connection and preferred MTU 185, not a guarantee of negotiated MTU.
- Native SDK/API compatibility, compilation, board identity, actual USB port/log separation, stack/heap headroom (nested parser/dispatch buffers), notification memory ownership under the selected SDK, failed termination, subscription transitions, reset/reconnect, MTU/queue limits and phone lifecycle remain acceptance work.
- Existing `firmware/README.md` still says no radio drivers and describes USB-only I/O. Recovery adds BLE startup. That statement is stale and should be clarified in a separate docs change or clearly overridden by the restoration warning before anyone follows build/run instructions.

The supplied restoration helper passes normally, but is a convenience check rather than an independent provenance or acceptance gate: its assertions disappear with Python `-O`, it trusts the manifest, and textual matches are not executable semantic tests. Run without optimization and retain this independent evidence.

## Executed / not executed

Passed independent read-only provenance audit, original restoration helper and host-only TypeScript collision reproducer. No target or host-C build, SDK install, native/prebuild, firmware execution, device/radio/browser API, flash, setting/credential change or remote write. No denial occurred. SDK and physical acceptance were not attempted.
