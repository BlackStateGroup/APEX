# Signed-read lab: completed software and final review status

Verified on 10 November 2026. Draft [PR #22](https://github.com/BlackStateGroup/APEX/pull/22)
is ready for human review. **It has not been merged, deployed, installed on a phone
or flashed to hardware.**

Tested code commit: `ec9d4ba54e9b327e1b670ab5e4027650e9fb038d`.
Tested tree: `56868bf2ab5ee36397aa4edbb91bf1a14d2436d2`.
GitHub's tested PR merge ref `682f10556bb05d3ebd108d5a4e2430d9d5944a5d` was
fetched and its tree matched this code tree exactly. This final status document
is a subsequent documentation-only change and makes no implementation changes.

## Completed from the report

- Separate ESP32-S3 USB laboratory firmware for experimental opcode `0x70`, using
  pinned real Ed25519 signing and the unchanged exact AXP transcript. Explicit
  opt-in, fresh offline lab keys and startup refusal without valid key material.
- Native Android 13+ and Apple Ed25519 verification, secure random challenges and
  monotonic clocks. No signing/private-key API in the phone module.
- Explicit lab screen with full independent key comparison, ownership declaration,
  individually selected read grants, explicit USB selection, revocation and
  background cancellation. Default app behaviour remains unchanged.
- Android USB signed-read connection with bounded requests, strict framing,
  acknowledged writes, late-response rejection and ownership retained while
  cleanup is pending or uncertain. No fallback/reconnect or automatic trust.
- Firmware partial-frame expiry and terminal cleanup on detected USB bus loss;
  actual target-source tests for startup and I/O failure branches.
- Reproducible interoperability, native crypto, lifecycle, UI and firmware CI,
  plus updated usage, provisioning and evidence documentation.

Only information, capabilities and ping are available. Access-control, arbitrary
commands, writes, unlocking and RF transmission remain unavailable in this lab flow.

## Final GitHub CI results

Both workflows completed successfully for the tested code commit.

| Workflow / job | Result | Evidence |
| --- | --- | --- |
| Lab: interoperability | Passed; 39 authority/C interop tests, 21 sanitizer interop tests, 10 actual target-source SDK scenarios, Java 32/32 | [Job](https://github.com/BlackStateGroup/APEX/actions/runs/42779414335/job/129705560839) |
| Lab: Apple crypto | Passed; CryptoKit 32/32 C-generated valid/tampered/bounded cases | [Job](https://github.com/BlackStateGroup/APEX/actions/runs/42779414335/job/129705560841) |
| Lab: rendered UI | Passed; exported screen at 390×844 refuses unavailable native pairing/reads, zero page errors | [Job](https://github.com/BlackStateGroup/APEX/actions/runs/42779414335/job/129705560436) |
| Lab: ESP32 opt-in off | Cross-compilation passed | [Job](https://github.com/BlackStateGroup/APEX/actions/runs/42779414335/job/129705560788) |
| Lab: ESP32 opt-in on | Cross-compilation passed | [Job](https://github.com/BlackStateGroup/APEX/actions/runs/42779414335/job/129705560850) |
| Foundation: host | Passed; **2,561 tests**, **40 browser regression tests**, typecheck, export, sanitizers and dependency inventory | [Job](https://github.com/BlackStateGroup/APEX/actions/runs/42779414699/job/129705729220) |
| Foundation: Android | Passed; native module compilation, existing native tests and debug APK assembly; `apex-trust` Kotlin/Java compile tasks confirmed in logs | [Job](https://github.com/BlackStateGroup/APEX/actions/runs/42779414699/job/129705729561) |
| Foundation: iOS | Unsigned iPhone Simulator application compilation passed | [Job](https://github.com/BlackStateGroup/APEX/actions/runs/42779414699/job/129705729560) |
| Foundation: existing ESP32 target | Cross-compilation passed | [Job](https://github.com/BlackStateGroup/APEX/actions/runs/42779414699/job/129705729490) |

Native module discovery was also checked locally for both Apple and Android.
All 38 recorded follow-up source hashes matched tracked Git files. The first
follow-up Apple CI attempt caught missing Swift sources caused by the broad
`ios/` ignore rule; the corrected module-source exception is included in the
successfully checked commit above.

Local normal/sanitizer tests and genuine ESP-IDF builds also passed. Local
LeakSanitizer was disabled because of environment tracing; the separate CI
sanitizer run passed with its configured default leak handling. A local Chromium
Unix-socket restriction blocked rendering here; the real browser check succeeded
in GitHub CI. These distinctions are preserved in the
[local evidence report](../review-evidence/lab-signed-read-followup/REPORT.md).

## What remains unfinished

| Remaining item | Why it remains |
| --- | --- |
| Physical Android + USB + ESP32 acceptance | No hardware was connected or operated. Requires an identified authorised board, cable/phone and separately approved provisioning/flashing/testing. |
| Physical iPhone acceptance and accessory transport | Apple verification and app compilation are implemented; this USB-only peer has no iPhone transport integration. No BLE/RF workaround is enabled. |
| Real stack headroom, signing latency, bus/port close and cleanup behaviour | Software tests and cross-compilation cannot measure these physical properties. USB SOF is bus presence, not proof of an open serial application. |
| Independent protocol, implementation and lab key-custody review | Required before approval for lab use. Disposable keys remain plaintext; production key custody is not provided. |
| Merge, phone installation, hardware provisioning/flashing | Not performed; require explicit user approval. |

Host authentication, encryption, attestation and anti-relay are not properties of
this read-only extension. They have not been represented as completed features.
No private production keys or public test-vector trusted identities were used.

See [client usage](SIGNED_READ_LAB_CLIENT.md),
[firmware and offline key format](../firmware/esp32s3-signed-lab/README.md), and
[trust/transcript specification](ACCESSORY_TRUST_FOUNDATION.md).
