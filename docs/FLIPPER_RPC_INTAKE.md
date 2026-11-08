# Flipper read-only adapter intake

This is source research for the next adapter, not implemented compatibility. Sources are the existing R01 firmware pin `9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a` and its protobuf submodule pin `1c84fa48919cbb71d1cc65236fc0ee36740e24c6` (annotated 0.25). Runtime version negotiation is still required.

| Read-only operation | Request oneof field | Response oneof field | Payload |
| --- | --- | --- | --- |
| Protocol version | 39 | 40 | Major/minor integers |
| Device identity | 32 | 33 | Streamed key/value strings |
| Power information | 44 | 45 | Streamed key/value strings |
| Ping | 5 | 6 | Echoed bytes |

The envelope carries request ID at field 1, status at field 2 and continuation at field 3. The pinned firmware uses nanopb length-delimited encode/decode. Identity and power callbacks set continuation on every pair except the last; a client must not require an additional empty terminal response after the last pair.

Source-derived request bytes for command ID 42, with omitted default status/continuation: version `05 08 2a ba 02 00`, identity `05 08 2a 82 02 00`, power `05 08 2a e2 02 00`. The first byte is the five-byte protobuf payload length. These are schema-derived examples, not captured traffic or a physical test result.

Implementation package: bounded length-varint parser, request ID correlation, strict read-only operation selection, streamed response assembly, explicit device errors, protocol-version negotiation and stale-response cleanup. Test every split/coalescing boundary and truncated/oversized lengths, unknown fields, out-of-order replies and cancellation. Frame, aggregate, count and time bounds are proposed engineering parameters requiring recorded fixtures, not measurements already made.

Transport remains a separate gate: research USB session entry/CLI-to-RPC transitions, official serial/BLE service definitions, flow control, pairing and iPhone/Android permission/lifecycle behaviour. Existing AXP discovery uses different UUIDs and its own READY marker. Sharing a radio or MCU family does not make the protocols compatible. DIY firmware forks require their own version and hardware acceptance evidence. This intake does not enable storage writes, application launch, GPIO actions or other vendor commands.

Primary source files:

- [Schema envelope](https://github.com/flipperdevices/flipperzero-protobuf/blob/1c84fa48919cbb71d1cc65236fc0ee36740e24c6/flipper.proto)
- [System messages](https://github.com/flipperdevices/flipperzero-protobuf/blob/1c84fa48919cbb71d1cc65236fc0ee36740e24c6/system.proto)
- [Firmware framing](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/applications/services/rpc/rpc.c)
- [System response lifecycle](https://github.com/flipperdevices/flipperzero-firmware/blob/9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a/applications/services/rpc/rpc_system.c)

Wire facts are recorded in research/flipper-rpc-intake.json. Source/licensing review of any reused definitions remains part of adapter implementation.
