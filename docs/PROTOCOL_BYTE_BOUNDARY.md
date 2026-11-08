# Protocol byte boundaries

`encode`, `crc16`, and `FrameDecoder.push` accept genuine Uint8Array views
(including Buffer, subclasses, subarrays, and cross-realm Uint8Arrays) over fixed,
nonshared, attached ArrayBuffers. Other typed arrays, DataView, plain iterables,
proxy views, SharedArrayBuffer storage, resizable storage, and detached storage
are rejected. Empty fixed views remain valid. Intrinsic accessors read the actual
byte type, extent, offset, and storage; caller-owned getters, iterators, species,
and overridden view methods are not used. This is not a hostile-JavaScript or
modified-global-intrinsics sandbox.

Encoding reads kind, opcode, id, and payload once, in that order. These ordinary
property reads can run getters and are not transactional: later getters may
mutate earlier inputs. Validation uses the captured metadata and the payload's
actual storage after all four reads. Invalid metadata is not coerced. The payload
is bounded to 512 bytes before allocating the result, then copied directly into
the independent result with no caller hooks in between. Maximum wire size remains
524 bytes. Ordinary wire bytes and CCITT-FALSE CRC are unchanged.

CRC uses indexed access to a fresh plain view of the same storage, not the
caller's iterator. It runs synchronously without user callbacks. Streaming input
is likewise a plain alias, **not an immutable whole-chunk or whole-stream
snapshot**. No chunk-size cap or input-proportional copy is introduced; decoder
retained storage remains 524 bytes, with bounded copies for delivered payloads.
Unsupported input is rejected before parser state changes. Parsing noise and
corrupt wire frames retains the existing discard/recovery behavior.

## Callback contract

A decoded frame is removed from retained parser storage before its callback.
Delivered payloads are independent copies. Callbacks are synchronous and may
mutate unread bytes of the active input chunk; subsequent parsing observes those
mutations. A callback may reset the decoder or synchronously push more input.
Nested pushes execute immediately against current parser state, before the outer
push resumes; partial nested input can therefore combine with remaining outer
bytes. Callers that require stream serialization must provide it themselves.
There is no reentrancy queue or transactional rollback.

If a callback throws, its error propagates, the consumed frame stays removed,
and remaining outer input is not consumed. If a callback detaches the active
chunk and returns, push throws before resuming (including at the chunk's end),
without feeding undefined bytes to the parser. Any callback or nested-push state
changes already made remain effective. This preserves the former native iterator
detachment behavior while avoiding caller iterators.

## Compatibility and verification

Previously tolerated non-Uint8Array iterable CRC/decoder inputs and shared or
resizable storage are deliberately rejected. Caller getters/iterators no longer
control byte interpretation, and metadata getters are read once instead of
repeatedly. Cross-realm genuine Uint8Arrays are now accepted by encoding. Error
messages/types for invalid inputs are not specified as a compatibility contract.

Work started at bafb60e. Dedicated bounded reproductions initially failed 3 of 7
tests; the untouched output is `verification/protocol-byte-boundary/before.log.txt`.
An intermediate regression from a shadowed local length variable is also retained,
along with all subsequent raw outputs. Final commands, run locally using existing
approved dependencies, were:

- `node --test tests/protocol-byte-boundary.test.ts tests/protocol.test.ts`: 21 passed.
- `node_modules/.bin/tsc --noEmit`: passed, empty output.
- `python3 tools/build_firmware.py`: portable host C build and checks passed.
- `node --test tests/firmware.integration.test.ts`: 6 passed, including real C golden
  requests and maximum binary payloads; final rerun after the callback adjustment passed.

Logs are in `verification/protocol-byte-boundary/`. No aggregate suite, application
export, native mobile build, browser, hardware, provider, remote, or network action
was performed. The host C peer and in-process BLE MTU bridge are not device tests.
