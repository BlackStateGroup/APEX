# Synthetic USB/session integration evidence

Source baseline: `3bd88c9470272acd70e577d38172894c8d9c4122`.
Production sources are unchanged by this test/evidence commit. The parent checkout advanced from the assigned `ee35153` to this documentation/evidence revision before the worktree was created.

The new `tests/usb-session-integration.test.ts` runs real `DeviceSession`, `AndroidUsbTransport`, and `clearReleasedSession` against an authored synthetic `ApexNative` peer. Seven cases passed on their first run (`focused-initial.txt`). No original failing run was discarded; none occurred.

Coverage:
- Real Info/Capabilities negotiation; a 512-byte ping payload becomes a 524-byte native write. The fixture emits its reply synchronously before native write settlement, in callbacks of 512 and 12 bytes. Caller mutation does not affect captured payload. Explicit header bytes, request IDs, opcodes, token, frame size, and payload are asserted.
- Malformed identity and malformed capabilities each preserve their original negotiation error when automatic close rejects. Session remains closed but release-pending; reference clearing and competing USB ownership are refused. A fulfilled second close of the same token still cannot certify release.
- Permission denial clears safely with no native open, write, close, or retained listener. A replacement session can negotiate afterwards.
- Close during a real pending native write rejects pending session work immediately but cannot clear the session slot or admit another transport until the raw write settles.
- Deferred native open plus session cancellation, and matching early native terminal event before token resolution, both clean up without cross-layer deadlock, without sending handshake bytes, and allow a replacement session only after cleanup.

The protocol encoder/decoder are used solely to author/consume fixture peer traffic. This is not an independent protocol oracle, CRC interoperability certification, native-module execution, physical USB result, permission-dialog exercise, or device claim. No browser, provider, network, installation, settings, or hardware action was performed.

Validation (both exit 0):

```
export CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false
node --test tests/usb-session-integration.test.ts tests/usb-transport.test.ts tests/usb-review-adversarial.test.ts tests/session.test.ts tests/session-release-boundary.test.ts tests/session-review-races.test.ts tests/session-controls.test.ts
npm run typecheck
```

`focused.txt`: 85 passed, 0 failed/cancelled/skipped. `typecheck.txt`: TypeScript passed, with the existing npm environment `http-proxy` warning. Existing dependency symlink reused; no dependency install. Aggregate validation/export remains the parent's responsibility.

Exact production source SHA-256:

```
c7a804495a36e585bb193d877e806c680b95a9dc776d0ad677eff735ce41b3a6  packages/core/session.ts
71b95987c922f3ec61938eb6473f434f5d8fed5766ec784c2798126425b1cd6d  modules/apex-device/usb-transport.ts
35aef58b3a8508a3697359240d1ea19ae6a600f6d74be3c7ab78e2aff268eb44  src/session-controls.ts
8d4e91fb7c08bdd0364052a4d860f6695713f31986971cde5e61d740f16dd1eb  packages/protocol/index.ts
```
