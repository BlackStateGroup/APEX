# First physical acceptance session

Use owned phones, an owned ESP32-S3 development board and a non-sensitive NDEF test tag on an isolated desk. Record phone model, OS version, APEX source commit, firmware commit, board revision and transport. These checks are pending; a compiled binary does not pass them.

Build mobile with `npm run ios` (Mac, Xcode 26.4+) or `npm run android` (Android SDK/JDK 21). Use development builds, not Expo Go. Physical iPhone NFC requires a signed NFC-capable app and provisioning entitlement. Follow `firmware/README.md` to build/flash your board; flashing is a separate deliberate bench action.

| Check | Action | Acceptance evidence |
| --- | --- | --- |
| Runtime permissions | Deny Bluetooth/NFC permission where offered, then grant through OS settings | Clear error; simulator/offline workbench still usable; no stuck reader/scan state |
| iPhone NFC | Start foreground NFC reader; present the test NDEF tag; dismiss the system sheet | Metadata event has native-ios source; no NDEF payload contents saved; reader returns to idle |
| Android NFC | Repeat with the same tag | Native-android source; expected supported technology metadata; stop releases reader |
| Backgrounding | Start discovery or NFC, move app to background, return | Readers/discovery stop; operator can start again; transient iOS permission sheet does not count as background |
| BLE identity | Discover custom AXP service on flashed board; connect | Explicit Bluetooth source, firmware identity and exactly three system capabilities |
| BLE round trip | Ping from iPhone, then Android | Echo matches; no disconnect or indefinite spinner; journal states transport |
| USB round trip | Attach native USB Serial/JTAG port to Android USB host | Inventory, permission, identity, capabilities and ping succeed |
| Independent firmware parsers | Use one BLE client and a second USB client | Concurrent ping replies retain the right payload and request ID on each link |
| Disconnect/reconnect | Disconnect or power off board during a request; reconnect deliberately | Pending request fails; stale replies do not satisfy a new session |
| Persistent evidence | Save analysis summary or NFC metadata; terminate and reopen app | Record survives; source remains explicit; digest verifies |
| Negative capability | Attempt an unsupported operation only through the controlled test harness | Explicit unsupported-operation response; no other action occurs |

Keep real observations separate from synthetic fixtures. Do not infer compatibility with Flipper, Mayhem, Proxmark, vehicle ECUs or access controllers from the AXP peer. Authentication, encrypted evidence, firmware update signing and vendor adapters require separate engineering gates.

Attach measured results to a new verification record with exact source revisions. No physical check above has been executed in this workspace.
