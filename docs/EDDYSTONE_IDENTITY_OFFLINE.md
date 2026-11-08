# Offline Eddystone UID and URL format interpretation

This dependency-free addition interprets existing FEAA service-data input only.
It adds no radio collection, connections, native transport, UI, network lookup,
URL navigation, address resolution, beacon registration or cloud service.
TLM v0 and BTHome logic and existing input limits are unchanged.

## Sources and layout decisions

Official Google specifications were read through the read-only GitHub connector
on 2026-11-07, pinned to commit `a52406ee6053720f78fb0c63bfc38b38e6800824`:

- [Common elements](https://github.com/google/eddystone/blob/a52406ee6053720f78fb0c63bfc38b38e6800824/protocol-specification.md): FEAA service data; frame byte low nibble must be zero. Unknown frame types, reserved frame bits and encrypted EID/TLM remain opaque.
- [UID frame](https://github.com/google/eddystone/blob/a52406ee6053720f78fb0c63bfc38b38e6800824/eddystone-uid/README.md): exactly 20 payload bytes, frame byte 0x00, signed power at offset 1, ten-byte namespace at 2..11, six-byte instance at 12..17, two zero RFU bytes at 18..19. Nonzero RFU stays opaque. Historical 18-byte UID frames omitting RFU are mentioned by Google but intentionally rejected by this strict current-layout interpreter.
- [URL frame](https://github.com/google/eddystone/blob/a52406ee6053720f78fb0c63bfc38b38e6800824/eddystone-url/README.md): frame byte 0x10, signed power at 1, prefix at 2, zero through 17 encoded bytes at 3 onward. Prefix 0..3 and expansion 0..13 are expanded exactly. Graphic ASCII 0x21..0x7e is retained; reserved 0x0e..0x20 and 0x7f..0xff, or unsupported prefixes, stay wholly opaque (no partially decoded URL returned).

Both layouts specify signed power from -100 to +20 dBm, not the entire signed
byte range. Other values and incorrect lengths are invalid, not clamped. The
specification's +18/0x12 and -18/0xee examples are tested. Prefix-only URL frames
are a format match because the encoded suffix may have length zero; that does
not establish a usable URL. Graphic characters are decoded literally, with no
URI normalization, validation, escaping, redirect following or safety claim.

## Claim and evidence boundaries

`namespaceHex`, `instanceHex`, `calibratedTxPowerAtZeroMetersDbm` and `urlText`
are unauthenticated advertiser claims. A format match proves neither a unique
identity nor ownership, location, range, physical reception or calibrated power.
No distance estimate is calculated. Decoded URL text is inert, untrusted data,
never a trusted link or markup. Any future consumer must preserve that boundary.
The strings may contain graphic characters that would be unsafe as HTML.

The complete original payload is retained in matched readings and in the
existing Android raw / iOS normalized inputs. Invalid and opaque readings leave
source input untouched. Exact source documents, including whitespace and
provenance, remain the journal's hash-covered evidence; decoded results are
recomputed. Recorded timestamps are source claims, not attestation. Existing
metadata-only hypothesis summaries do not export namespace, instance, URL,
power or payload bytes. No evidence schema migration is necessary.

As with TLM, service-data matching alone does not verify the required complete
service UUID list, all advertising data constraints, timing or radio conformance.
This archived protocol needs no live Google service to interpret offline.

## Verification

`tests/fixtures/eddystone-observations.json` contains paired Android/iOS
synthetic envelopes, not captures: a UID with sequential namespace/instance
bytes chosen to expose offset errors, and the URL example `https://goo.gl/Aq18zF`
from the pinned specification, constructed as encoded bytes without visiting it.
No upstream implementation code or new dependencies are copied.

`tests/eddystone-identity.test.ts` tests offsets, every signed power byte, strict
length boundaries, both RFU bytes' nonzero values, frame reserved nibbles, every
prefix and suffix code, inert graphic text, wrong service UUIDs, encrypted/unknown
opacity, provenance, private-value omission and 4,000 deterministic malformed
cases. `tests/ble-evidence.test.ts` additionally reopens SQLite and verifies
exact documents/digests, matched and opaque results, and recorded provenance.
Run `npm test` and `npm run typecheck`; native and RF validation are not implied.
