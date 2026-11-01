# AXP/1 device protocol

Original APEX control envelope. Little endian integers; transport is an ordered byte stream. It is not Flipper RPC, Meshtastic PhoneAPI or Chameleon's protocol. Those need their own adapters.

| Offset | Bytes | Meaning |
| --- | --- | --- |
| 0 | 2 | Magic 0x41 0x58, ASCII AX |
| 2 | 1 | Version = 1 |
| 3 | 1 | Kind: 1 request, 2 response, 3 error |
| 4 | 1 | Opcode |
| 5 | 1 | Flags = 0; others rejected |
| 6 | 2 | Request ID 1–65535; 0 rejected |
| 8 | 2 | Payload length 0–512 |
| 10 | length | Payload |
| 10 + length | 2 | CRC-16/CCITT-FALSE over header plus payload |

CRC polynomial 0x1021, initial 0xFFFF, no reflection, no final XOR; check value for ASCII 123456789 is 0x29B1. CRC is transmitted little endian. Frame overhead is 12 bytes; maximum total size is 524 bytes. CRC is corruption detection, not authentication, secrecy or replay protection.

| Opcode | Operation | Request | Response |
| --- | --- | --- | --- |
| 1 | system.info | Empty | UTF-8 JSON: id, board, firmware, protocol, source |
| 2 | system.capabilities | Empty | UTF-8 JSON: operations array of supported names |
| 3 | system.ping | 0–512 opaque bytes | Exact same bytes |

Unknown opcodes return kind 3 and JSON `{ "code": "UNSUPPORTED_OPERATION" }`. Nonempty info/capabilities requests return INVALID_ARGUMENT. Requests are the only kind dispatched by firmware. Responses/errors use the request's ID and opcode. Unknown error codes are still errors, never success. No raw transmit, bus-write, shell or credential operation is defined.

The host validates identity shape, protocol version, duplicate/unknown advertised operations and required baseline operations. It exposes a finite pending limit and a timeout for each request. An opcode mismatch rejects that request. Late responses without an outstanding ID are ignored. IDs are not reused during a single session, preventing a delayed response from satisfying a later request after wraparound; reconnect when the ID space is exhausted. There is no automatic retry.

Both decoders use fixed bounded buffers. Bad prefixes, headers and CRCs resynchronise one byte at a time. They accept split headers/payloads and multiple frames per chunk without retaining the original large chunk. A plausible but truncated frame can delay a following frame until enough bytes arrive or the host timeout resets the session; this is an explicit v1 limitation, not a self-synchronisation guarantee. Native input uses finite read timeouts. Random/boot text is not considered data until a valid envelope passes checks.

Responses can arrive before write completion. Install pending state and timeout before calling transport.write. On close/failure, remove listeners, clear decoder state, reject outstanding work and close transport resources. Transport writes must preserve frame ordering. Device errors and failed/partial native writes are reported.

Future versions can add typed streaming/capture references, authenticated sessions and version negotiation. Do not overload ping as a generic operation tunnel or treat an unauthenticated device's advertised capability as execution authority. High-rate IQ capture remains outside this control envelope.
