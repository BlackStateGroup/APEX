# Opt-in signed-read laboratory client

This is an experimental client for the isolated ESP32-S3 peer, not a shipping
accessory integration. The ordinary APEX entry point stays unchanged unless the
build-time flag `EXPO_PUBLIC_APEX_SIGNED_LAB=1` selects the separate lab screen.
It can request only signed information, capabilities and ping. There is no legacy
fallback, automatic connect, RF alternative, unlocking or arbitrary-command API.

## Platform boundary

| Platform | Implemented software | Remaining boundary |
| --- | --- | --- |
| Android 13/API 33 or later | Platform Ed25519 verification, SecureRandom, monotonic clock, existing native USB transport and explicit lab screen | Rebuilt app, compatible USB host/cable and separately approved physical acceptance required |
| iOS | CryptoKit Ed25519 verification, Security CSPRNG, uptime clock and lab screen | No iPhone USB accessory transport; connection controls refuse access |
| Web / missing native module / older Android | Unavailable state | Cannot pair or authenticate through a fake or JavaScript verifier |

The native Expo module is `modules/apex-trust`. It has no signing API, device
private keys or persistent trust store. Java accepts the raw 32-byte key through
an RFC 8410 SPKI envelope. Apple uses `Curve25519.Signing.PublicKey`. Both bound
the signature to 64 bytes and transcript to 1..523 bytes and reject invalid input.
A Java desktop test is not an Android device test; a CryptoKit macOS test is not
an iPhone test. CI separately compiles the bindings into native apps.

Compile a development app containing the new local module using the repository's
usual native build workflow. Then select the lab entry point for that build or
Metro session, for example:

```sh
EXPO_PUBLIC_APEX_SIGNED_LAB=1 npm start
```

Expo Go does not contain these custom modules. Restart/rebuild as appropriate when
changing the flag; this is a separate build entry, not a runtime navigation toggle.
Compilation does not authorise installing on a phone, provisioning or flashing an
accessory. No physical operation was performed in preparing this change.

## Explicit confirmation and reads

1. Enable the laboratory while the app is active.
2. Obtain the full public key from the independently protected offline provisioning
   record. Enter and re-enter all 64 lowercase hex characters; editing either
   field clears the comparison acknowledgement.
3. Confirm ownership/authorisation and independent full-key comparison, then
   individually select information, capabilities and/or ping. No grant is selected
   automatically. Confirm the key and grants.
4. Refresh attached USB devices and explicitly select one. Names and USB IDs are
   untrusted descriptors. Merely opening USB does not authenticate the accessory.
5. Choose a granted read. Only a valid challenged signature with a matching
   request and key is displayed as verified. Information/capabilities also pass
   the existing bounded semantic validators. Signed metadata remains a claim by
   the holder of that key. Ping is an exact echo of at most 128 UTF-8 bytes.

The full key and grants remain visible. Nothing is persisted or imported from a
network pairing endpoint. Revoke before changing a key or grants. Revocation and
backgrounding clear trust, selected device inventory, consent controls and visible
results. Returning to the foreground does not re-enable or reconnect the lab.
A transient OS `inactive` permission sheet is distinct from backgrounding.

## Ownership, cancellation and framing

`AccessorySignedConnection` owns one raw USB transport. It sends the unchanged
experimental `0x70` frames, with no ordinary handshake, and requires native write
completion before accepting a reply. CRC/header errors, mismatched IDs/opcodes,
unsolicited responses, duplicate or trailing frames, disconnect, failed verification,
revocation and expiry close the reader. Fragmented frames are accepted within the
bounded decoder. Late native or verification completions cannot restore trust.

The open connection has a maximum 30-second lease; exchange plus verification
has at most five seconds. USB acquisition uses the existing native permission/open
lifecycle, not the reader lease. Cancelling during acquisition requests native
cleanup and waits for acquisition and disconnect to settle. Replacement remains
blocked while cleanup is pending or failed. There is no claim that a stalled
native cleanup promise is forcibly terminated after a fixed deadline. Failed
cleanup requires an app restart after checking the device; there is no silent
retry which assumes ownership was released.

The firmware independently drops partial request data after 500 ms without input.
A USB SOF/bus loss detected after an observed connection is terminal for that boot;
the peer wipes its key and uninstalls USB. SOF presence is not proof that a serial
application is open. A port close without bus loss cannot be detected by this
mechanism. Reconnect/stack/latency behaviour still requires physical acceptance.

## Verification and remaining work

Run the full host suite and typecheck, plus:

```sh
python3 tools/build_lab_signed_read.py
node --test tests/lab-signed-read.test.ts tests/lab-screen.test.ts tests/accessory-trust.test.ts
node tools/check_lab_native_crypto.mjs --java
# macOS with Swift/CryptoKit:
node tools/check_lab_native_crypto.mjs --swift
```

The SDK harness executes the actual target `main.c` with controlled SDK calls;
it does not replace the genuine ESP-IDF cross-compilation. The C signing peer
provides fresh ephemeral signatures to Node, Java and Apple verifiers. Tests cover
cancellation, write acknowledgement, replay, tampering, key mismatches, malformed
frames, consent changes and late results. The real exported browser check verifies
that unavailable native providers leave the lab disabled, not successful pairing.

See the [follow-up evidence](../review-evidence/lab-signed-read-followup/REPORT.md).
Remaining acceptance comprises independent protocol/key-custody review, actual
Android/USB/ESP32 behaviour, measured stack/signing latency and a separately scoped
iPhone transport. Encryption, host authentication, anti-relay and attestation are
not properties of this read-only protocol. Do not enable privileged operations.
Merge, phone installation and any accessory provisioning/flashing remain separate
explicit approvals. This change performed none of them.
