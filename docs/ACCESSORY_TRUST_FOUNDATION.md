# Explicit accessory key trust: opt-in signed-read foundation

This host library adds a memory-only pairing authority and a bounded signed-read
protocol extension. It is **not enabled by the application or implemented by any
shipping firmware target**. Existing `DeviceSession`, Bluetooth/USB adapters,
receiver firmware and AXP/1 frames remain unchanged. Their ordinary identity,
capability and ping replies remain unauthenticated. Do not describe this library
as securing those paths.

An isolated, disabled-by-default [USB-only laboratory peer](../firmware/esp32s3-signed-lab/README.md)
now implements this extension in portable C for an ESP32-S3 target. Its tests
run the compiled peer against this unchanged authority. That experimental target
does not enable application pairing, supply native adapters, or establish physical
accessory/mobile acceptance; its key provisioning and verification limits are
documented separately.

The new reader fails closed if its peer does not implement the extension. There
is no legacy fallback, automatic discovery trust, trust-on-first-use, automatic
pairing, transport retry, reconnect, write authorization or RF operation.

## Trust boundary

`AccessoryTrustAuthority` is constructed with trusted local adapters for:

- A CSPRNG returning exactly 32 bytes per request.
- Real Ed25519 signature verification over the supplied exact bytes and raw
  32-byte public key. The library does not implement cryptography or accept a
  non-boolean truthy result as verification.
- A monotonic millisecond clock. Invalid, throwing or regressing clocks
  permanently fault the authority, including previously created readers.

The host test uses Node's Ed25519 implementation. There is no production
Expo/native crypto adapter in this slice. Never ship the test's RFC 8032 public
test seed or replace cryptographic verification with a fake successful callback.

These adapters and the host application are trusted code, not a sandbox against
malicious local JavaScript or compromised runtime intrinsics. Untrusted inbound
bytes are separately bounded and copied. Shared, resizable, detached and non-byte
storage are rejected. Received identity strings and JSON cannot invoke pairing.

## Explicit pairing and authorization

A trusted local confirmation flow must obtain the raw public key through an
independent authenticated channel and show the **full key** for confirmation.
A name, BLE address, USB ID, displayed firmware string, network key advertisement,
CRC, or self-signed key response is not that independent channel.

`confirmPairing` requires the full key and matching confirmed key, the explicit
`out-of-band` verification declaration, an `owned-or-authorized-lab` declaration,
a bounded local label, and an explicit nonempty read allowlist. Those declarations
record the caller's approval; this code cannot verify ownership or that a human
actually compared the key. Only trusted user-confirmation code may call it.

Only `system.info`, `system.capabilities` and `system.ping` are grantable. Metadata
queries require an empty request body; ping is at most 128 bytes. Incoming
capability manifests cannot expand the grants. No receive, transmit, firmware
update, key rotation, unlock, mutation or arbitrary opcode can be authorized.

The authority stores at most 32 unique pairings. Duplicate labels/keys and
implicit replacement fail. Revoke a pairing, then explicitly pair again to change
its key or grants. Existing readers retain the old pairing identity and cannot
be revived by reusing its label/key. Revocation is checked before dispatch, after
exchange, and after crypto verification. A pending adapter is not physically
cancelled by revocation, but its result cannot publish as authenticated.

No persistent trust store, private key provisioning, certificate chain, backup,
key export, pairing UI, access-policy service or remote credential is created.
Reloading discards local approvals and requires explicit pairing again.

## Bounded AXP/1 extension

The experimental extension uses opcode `0x70`; it does not change the existing
AXP version, header, frame ID rules, 512-byte payload bound or CRC. This opcode
must be reviewed/reserved with a future firmware implementation before shipping.
It is not added to the existing `DeviceSession` operation map.

Request frame: AXP kind Request, opcode `0x70`, authority-issued nonzero request ID.
The payload is:

| Offset | Length | Meaning |
| --- | --- | --- |
| 0 | 1 | Signed-read version 1 |
| 1 | 1 | Inner read opcode: Info 1, Capabilities 2, Ping 3 |
| 2 | 32 | Fresh CSPRNG challenge |
| 34 | 2 | Little-endian request body length, 0–128 |
| 36 | length | Exact request bytes |

Response frame: AXP kind Response, the same opcode and ID. The payload is:

| Offset | Length | Meaning |
| --- | --- | --- |
| 0 | 1 | Signed-read version 1 |
| 1 | 1 | Same inner read opcode |
| 2 | 32 | Exact request challenge |
| 34 | 2 | Little-endian reply body length, 0–256 |
| 36 | length | Exact reply bytes |
| 36 + length | 64 | Ed25519 signature |

The signed message is the exact concatenation of:

1. UTF-8 `APEX/AXP1/SIGNED-READ/V1` followed by one NUL byte.
2. The explicitly paired raw 32-byte Ed25519 public key.
3. The entire canonical encoded AXP request frame, including header and CRC.
4. The response payload prefix through the reply body, excluding its signature.

The transcript binds the selected key, protocol domain/version, outer request
opcode/ID, inner operation, fresh challenge, exact request bytes, and exact reply
bytes. The response outer kind/opcode/ID must separately match the request.
Because their accepted values are fixed by the signed request and parser, a
substituted envelope cannot be accepted. The CRC is included as a framing byte
fact only: **CRC is corruption detection, not authentication**. Recomputing a CRC
after tampering does not produce a valid signature.

The largest request payload is 164 bytes and largest response payload is 356,
both within the unchanged AXP bound. Unknown versions, malformed lengths,
trailing bytes, unsigned/legacy replies, error replies, wrong keys, mismatched
challenges and invalid signatures are terminal errors for that reader.

`accessorySignedReadTranscript` exposes this canonical layout for future peers.
It is a codec, not a verifier or authority. A successful reader result contains
immutable exact reply bytes and the paired key. It does not automatically parse
or trust an Info/Capabilities body. Apply the existing bounded semantic validators
separately if needed. A signed ping must also echo the exact request body.

## Lifecycle and no downgrade

`createReader` requires a current pairing, a trusted single-connection exchange
adapter, and explicit lease/exchange bounds. The adapter receives only the new
signed-read frame. It must transmit that exact frame and return the matching raw
response without retry, fallback or reconnect. This slice has no production
transport adapter. The host fixture exercises actual AXP encode/decode with
fragmented reads and real Ed25519 verification.

- One request per reader may be pending; concurrent requests are refused.
- A reader lease is at most 30 seconds; each exchange and verification together
  have an independent timer of at most five seconds, plus monotonic deadline
  checks before dispatch and after each asynchronous boundary. An overdue
  microtask cannot succeed ahead of a delayed timer callback.
- Fresh challenges and request IDs are never reused within an authority.
- At most 4096 challenges are issued per authority. All used challenges remain
  retained until the authority is discarded; no eviction re-enables replay.
- Repeated RNG output is rejected before a second dispatch, even after revocation
  and re-pairing. Across authority restarts, freshness relies on the real CSPRNG.
- Close, timeout, invalid reply, adapter failure or verification failure closes
  the reader. Late exchange/verification completions cannot restore it or publish
  a successful result. No automatic retries or insecure fallback exist.
- Close/timeout invalidate local work, not the physical connection. The caller
  remains responsible for real transport cleanup. A new reader is always an
  explicit local action under a still-current pairing.

The local allowlist controls what this host reader may request. It does not
provide cryptographic host authentication or impose authorization on the
accessory. An independently implemented peer needs its own host policy if it
should refuse unpaired hosts. This extension deliberately supports only reads.

## What successful verification means

A valid signature proves possession of the paired private key and integrity of
this specific challenged reply, conditional on trustworthy local crypto/RNG/clock
adapters and private-key custody. It does not prove the silicon's identity,
physical proximity, absence of a live relay, firmware integrity, truthful device
metadata, ownership, sensor truth, actual RF reception or hardware compatibility.
There is no encryption, mutual authentication, attestation, anti-relay guarantee,
or signature protection for ordinary legacy AXP traffic.

## Local validation and remaining acceptance

Run `node --test tests/accessory-trust.test.ts` and `npm run typecheck`.
The focused host tests cover real signatures; an independently constructed peer
transcript; fragmented existing AXP frames; recomputed-CRC tampering; wrong keys;
request/response substitutions; replay; repeated RNG output; grant mutation;
revocation/re-pairing during verification; expiry, rollback, timeout/cancellation;
late completions; unsafe buffers; and capacity/exhaustion bounds. The budget-only
test explicitly uses a fake verifier and is not cryptographic evidence.

Future integration requires reviewed firmware key custody and signing, a real
native verification provider, human pairing UI, trusted connection adapter,
physical USB/BLE tests, clean transport ownership/cleanup, independent protocol
review and a decision on host authentication. No accessory was paired, flashed,
connected, transmitted to or physically validated by this change.
