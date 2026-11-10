# First iPhone accessory workflow: Flipper status

Target: a stock Flipper Zero with its default Bluetooth serial profile. The user
does not yet have an accessory. No physical test or signed iPhone installation
has taken place. This is an isolated software implementation for that test, not
a claim of verified hardware compatibility or a completed universal multi-tool.

## What the workflow does

1. The user confirms ownership/permission and starts a ten-second foreground scan.
2. APEX shows up to 32 devices advertising the reviewed Flipper service IDs.
   These are `3080`–`3083`: unknown, black, white and transparent hardware colours.
3. The user explicitly selects one. iOS handles pairing if required; enter the
   code displayed on the Flipper. APEX never captures or stores the pairing code.
4. APEX checks the expected services and reads six fixed GATT characteristics.
5. APEX closes the connection, checks it is disconnected, then shows a status
   report. The user may open the iOS share sheet and choose Files or a recipient.

| Displayed value | Service | Characteristic | Interpretation |
| --- | --- | --- | --- |
| Manufacturer | `180A` | `2A29` | Device-reported text |
| Hardware target | `180A` | `2A26` | Upstream places the hardware target here, despite the standard Firmware Revision label |
| Firmware build | `180A` | `2A28` | Upstream build hash, branch, branch number and build date string |
| RPC version | `180A` | `03f6666d-ae5e-47c8-8e1a-5d873eb5a933` | Reported version only; no RPC session |
| Battery | `180F` | `2A19` | One byte, 0–100% |
| Power state | `180F` | `2A1A` | Charging bits 4–5; unknown/unsupported retained explicitly |

The upstream Serial Number characteristic is a constant `1.0`; APEX deliberately
does not present it as a unique device identity. Advertised names, services and
status values are device claims. OS pairing does not establish APEX signed-read
identity, genuine hardware attestation or anti-relay protection.

No custom firmware or flashing is required. The adapter exposes no characteristic
writes, RPC commands, filesystem operations, unlocking, emulation or instrument
transmit operations. Ordinary Bluetooth discovery, pairing and reads necessarily
use the phone and accessory radios. This is separate from PR #22's USB-only
signed-read lab peer and does not change that peer or its restrictions.

## Build selection and installation preparation

Default APEX remains the ordinary console. Set
`EXPO_PUBLIC_APEX_FLIPPER_STATUS=1` to select the first-connection screen.
The native adapter is iOS-only in this milestone; web and Android display an
unavailable message and cannot dispatch connections from this screen.

The opt-in iOS build uses bundle ID `group.blackstate.apex.flipper`, display name
APEX Flipper and scheme `apex-flipper`, so it can install beside APEX. It does not
request NFC access or the NFC entitlement. No private keys, signing identifiers,
Apple team, Expo owner or project ID have been invented or embedded.

Two EAS profiles are prepared in `eas.json`:

- `flipper-iphone`: internal, signed Release build for a registered physical iPhone.
- `flipper-simulator`: simulator build for software checks; cannot prove BLE access.

After selecting the user's authorised Expo project and Apple signing team and
registering the iPhone, the documented build command is:

```sh
eas build --platform ios --profile flipper-iphone
```

EAS CLI/account setup, Apple signing and device registration are prerequisites,
not actions performed by this change. Do not run `--auto-submit`. No TestFlight
or App Store publication is requested. Record the build's Git SHA in the
acceptance receipt; optional `EXPO_PUBLIC_APEX_BUILD_REVISION` is included in
shared reports, otherwise it explicitly reads `unrecorded`.

For local web layout verification:

```sh
EXPO_PUBLIC_APEX_FLIPPER_STATUS=1 npx expo export --platform web --output-dir dist-flipper
npx playwright test -c playwright.flipper.config.mjs
```

The dedicated workflow compiles an unsigned iPhone Simulator **Release** app,
including the selected JavaScript bundle. This is not a phone-installable IPA.

## Lifecycle and evidence behaviour

No scan, connection or permission request occurs merely by rendering the screen.
Scan results do not auto-connect. The fixed status read list is enforced again
in the native adapter. All values are bounded; malformed values fail the whole
capture. No incomplete report is labelled successful.

Cancellation, timeout, backgrounding and an unexpected disconnect invalidate
the capture. Native effects remain owned until their original promises settle;
a timeout does not release ownership. The first disconnect interrupts pending
work, and a final connectivity check closes any late successful connection.
Uncertain cleanup blocks replacement until the app restarts. Closing can remain
pending if the underlying native SDK never settles. The controller retains its
single native manager across screen remounts. iOS scan-stop acknowledgement is
JavaScript/bridge dispatch, not a measurement of physical radio quiescence.

Reports are in memory only and are cleared on backgrounding/new scans/explicit
clear. The share sheet receives the report selected by the user. It includes the
advertised device name, six status values, timestamp and app revision; it excludes
the OS peripheral identifier. A returned share sheet does not prove delivery or
that Files persisted the report. Verify the saved document explicitly.

## Physical acceptance receipt: all pending

Record these on the **actual** iPhone and accessory, without substituting host
tests, browser screenshots or simulator compilation:

| Check | Required observation | Current result |
| --- | --- | --- |
| Build identity | Git SHA, signing/build ID, iPhone model and iOS version | Not tested |
| Accessory identity | Owned stock Flipper, firmware/build version shown on device | No accessory available |
| Permission | Denial gives useful recovery; granting permits an explicit retry | Not tested |
| Discovery | Correct device appears; empty scan and Bluetooth-off recover correctly | Not tested |
| Pairing | iOS code prompt matches physical Flipper; denial cancels cleanly | Not tested |
| Status | Firmware build and battery agree with physical device; charging changes on next capture | Not tested |
| Cancellation | Cancel during scan, connect and read; background/lock phone during each | Not tested |
| Disconnection | Power off/out-of-range during read; no successful stale report | Not tested |
| Repetition | Three complete scan/select/read/disconnect cycles, no automatic reconnect | Not tested |
| Sharing | Save JSON through Files, reopen and compare full report to selected capture | Not tested |
| Cleanup | No replacement while cleanup is pending; restart recovers blocked state | Not tested |

Do not merge or flash without explicit user approval. Buying hardware, registering
devices, changing Apple/Expo accounts and publishing an app are not performed here.

## Primary sources

Interface facts were checked against the existing firmware pin on 10 November
2026. This implementation is independently written; no firmware source, schemas
or generated protobuf bindings are copied or redistributed. Broader APEX and
upstream distribution/licensing review is not resolved by this workflow.

- [Device information](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/targets/f7/ble_glue/services/dev_info_service.c), blob `ae2b976b649f245ce839c49f286b682097e12beb`.
- [RPC version UUID](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/targets/f7/ble_glue/services/dev_info_service_uuid.inc), blob `ad520f62e5e007d4fe274e2fdefdacf682197690`.
- [Battery service](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/targets/f7/ble_glue/services/battery_service.c), blob `66aafc4959289f953d3da0ddb8dada795d04a6e7`.
- [Serial profile and advertised IDs](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/targets/f7/ble_glue/profiles/serial_profile.c), blob `9bba0d897e92d0dfecedd0a1f575e9856f82b80d`.
- [Serial service UUID](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/targets/f7/ble_glue/services/serial_service_uuid.inc), blob `577e8f2eda449a590d10bf17017b8595be1fbb91`.
- [Hardware colour identifiers](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/targets/furi_hal_include/furi_hal_version.h), blob `f702aed13dc9ae960eafa444ebf42e7ee045f201`.
- [Official Flipper pairing instructions](https://docs.flipper.net/zero/mobile-app).
- [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/) and [build profiles](https://docs.expo.dev/build/eas-json/).
