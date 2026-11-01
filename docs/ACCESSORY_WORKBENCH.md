# iPhone and Android accessory workbench

The workbench adds native NFC metadata inspection and custom-service BLE transport on both mobile platforms, with local evidence persistence. Use `npm ci`, then `npm run ios` on a Mac with Xcode 26.2 (Swift 6.2) or `npm run android` with the Android SDK. Expo Go is not a supported native runtime. `npm run web` provides the simulator, offline analysis, source atlas and browser evidence store.

## AXP BLE contract

| Attribute | UUID | Behaviour |
| --- | --- | --- |
| Service | `6f1d0001-8632-4a97-a816-7776d2b7a101` | Discover only APEX laboratory peripherals |
| Write | `6f1d0002-8632-4a97-a816-7776d2b7a101` | Write with response; MTU minus 3, capped at 244 bytes |
| Notify | `6f1d0003-8632-4a97-a816-7776d2b7a101` | Notifications; raw `AXP_READY` after CCCD subscription, then AXP/1 byte stream |

AXP frame boundaries need not match GATT packet boundaries. Notifications are subscribed before identity/capability negotiation. The host bounds queued writes, frame length, notification length and timeouts. ESP32-S3 has independent USB and BLE parsers. NimBLE host callbacks and a host-queue callout serialise peripheral state, bound pending frames to four, retry notification allocation/send failures at most ten times and clear parser/queue state on disconnect or subscription change.

This service is unauthenticated and has no pairing-based identity assurance. Advertising and READY are not authentication. Only the existing identity, capability and ping operations are supported; do not add privileged operations before designing peer authentication and operator authorisation. No vendor accessory is automatically AXP compatible.

## Evidence

NFC observations keep identifier, technology names, record type and payload length only. Record payload content is discarded. Analysis summaries explicitly distinguish synthetic fixtures from user-imported offline data. Each immutable row contains a version, identifier, source, observation timestamp, bounded canonical JSON payload and SHA-256 digest. Native uses SQLite in the app sandbox; web uses versioned localStorage with a 500-record cap that reports capacity errors without deleting old records. The screen displays the latest 50 records.

Digests detect changed content but do not attest sensor provenance or resist an attacker replacing both data and digest. Encryption, signed exports, retention management, backup/recovery UI and large capture storage remain future work. NFC identifiers can still be sensitive metadata; use authorised tags and keep device access controlled.

## Verification boundaries

Host tests exercise BLE chunking, queue saturation, readiness, cancellation and stale callbacks, NFC lifecycle/metadata limits, and real SQLite reopen/corruption/insert failures. Browser tests exercise persisted evidence and project search. iOS and Android bundles are exported; native build results are recorded separately. Linux prebuild verifies generated iOS permissions and NFC entitlements, not Xcode compilation. iPhone Simulator cannot prove NFC hardware operation. Signing, provisioning, real tag reads and physical BLE/USB bench tests require owned hardware and remain outstanding until explicitly recorded.

Use the npm native run scripts rather than invoking Expo prebuild directly when the research corpus is checked out. The wrapper temporarily parks the reference corpus outside the app root, because Expo 58 prebuild otherwise renames matching app.json fixtures recursively. It restores the corpus in a finally block. If the process is forcibly killed, recover the sibling apex-source-parking-* directory before fetching references again. CI does not materialise submodules and is unaffected.
