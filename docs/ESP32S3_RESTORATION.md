# ESP32-S3 original-source recovery

Six missing original files (8,454 bytes) are restored unchanged from
[BlackStateGroup/APEX e51750ec0b34b280399877d67e1036058874c373](https://github.com/BlackStateGroup/APEX/tree/e51750ec0b34b280399877d67e1036058874c373/firmware/esp32s3).
The recovery base is `bb30f68ff4c4b959fdcfef0648ef86bd5caa9aef`.
All six destinations were absent at this base. This is a historical-source
recovery, not a native-build success or a board acceptance claim.

## Provenance and scope

[The manifest](ESP32S3_RESTORATION_MANIFEST.json) records pinned source links,
Git blob SHA-1, SHA-256, original byte counts and modes. Recovery used read-only
GitHub connector commit, complete recursive-tree and exact-blob reads. Each
UTF-8 response was re-encoded and independently checked against the tree's Git
blob SHA-1 and size. Both ESP32-S3 subtree objects were reconstructed from
names, modes and hashes and matched their upstream SHA-1s. The commit endpoint
identifies root tree `65feddc47127bd228383e5fa87ca1e70ff26b2c8`; the recursive
request used the commit as its selector. The upstream commit is unsigned;
content hashes establish identity, not an author signature.

All files retain mode `100644`. Existing LICENSE.md matches the upstream tree
blob `35c166622b94cd0a7d1810cbb3ef35e9f97d7f11` and is unchanged: original APEX
material remains all rights reserved, with no public software license granted.
No third-party corpus or SDK was retrieved. Raw connector responses remain
outside this repository. No current core, protocol, native module, dependency,
source register or previously restored document was changed.

The target CMake source dependencies are main.c, ble_accessory.c and the
existing ../../core/apex.c, with ../../core include directory. The remaining
requirements (`esp_driver_usb_serial_jtag`, `bt`, `nvs_flash`, ESP-IDF project
CMake and toolchain) belong to ESP-IDF, not additional missing APEX files.
No additional repository source is required by these CMake declarations.
Historical docs name ESP-IDF v6.1, but that SDK and this target were not built
or validated here.

## Static compatibility at the recovery base

- The reversed NimBLE UUID initializer maps exactly to current TypeScript
  service/write/notify UUIDs `6f1d0001-8632-4a97-a816-7776d2b7a101`,
  `6f1d0002-8632-4a97-a816-7776d2b7a101` and
  `6f1d0003-8632-4a97-a816-7776d2b7a101`.
- Subscription queues literal `AXP_READY` with length 9, matching the current
  transport's exact whole-notification readiness marker. It fits the minimum
  ATT payload of 20 bytes. READY is unauthenticated and not an authority grant.
- Writes require a subscribed connection and write-with-response characteristic;
  input chunks are limited to 244 bytes. Notification output uses min(MTU - 3,
  244, remaining). Current TypeScript writes use the same MTU/chunk cap.
- Both USB and BLE use the current portable `apex_device_init/feed` API and
  separate device instances. Current core and TypeScript agree on AX magic,
  version 1, 10-byte header, 512-byte maximum payload, 524-byte maximum frame,
  little-endian fields/CRC, CRC16-CCITT and info/capabilities/ping operations.
  The adapter does not duplicate or replace this packet parser.
- BLE queue capacity is four frames, versus up to sixteen client queued writes.
  Queue exhaustion terminates the link; sequential ATT acknowledgments are not
  evidence that replies have drained. Ten notification errors also trigger
  termination. Scheduling, stack API compatibility and real MTU behavior remain
  unverified; static agreement is not end-to-end transport acceptance.

## Integration gates and operational hazards

Do not run or flash this target merely because the source is restored.
`app_main` unconditionally invokes `apex_ble_start`, which starts a NimBLE host
and advertising on synchronization. Its NVS recovery branch erases NVS if
initialization reports no free pages or a version mismatch. These are actual
radio and persistent-storage effects on a board, not passive source checks.
The target also installs native USB Serial/JTAG, so physical-port ownership
and board identity need separate verification and authorization.

Before any authorized target execution, review these startup effects, acquire
and verify the named SDK/toolchain, build the target separately, and test USB,
BLE subscription/readiness, partial frames, queue saturation/retry termination,
MTU boundaries, disconnect/reconnect and phone lifecycle on named fixtures.
No SDK installation, native/host build, prebuild, radio/device access, flash,
remote write or setting/credential change occurred in this recovery.

Run `python3 tools/verify_esp32s3_recovery.py` for a non-executing byte/mode and
static transport compatibility check. It does not compile or execute firmware.

## Subsequent client and derivative work

The [client READY/data collision](ble-ready-data-boundary.md) was independently
reproduced and fixed without changing these originals. A separate
[reviewed opt-in target](../firmware/esp32s3-reviewed/README.md) addresses the
characterized queue/retry/subscription faults under host fake-interface tests.
It preserves this historical target and has no automatic NVS erase. Neither
target has been compiled against the SDK or exercised on a board in this
continuation; original byte hashes remain protected.
