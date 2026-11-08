# Independent protocol byte review

Reviewed production commit `7c91983e5fe3f0d778462abcdd2ac7de4e6f87b9` in a separate worktree. No production changes or blocking defect found. Added six independent regression tests. Reviewed the original seven-test baseline (three failures), intermediate failure, final 21-test output, and documented callback contract.

## Findings

- Metadata capture order is kind, opcode, id, payload. Ordinary property getters can execute and mutate inputs; captured primitive values are subsequently validated without coercion. The payload is validated after the reads. This is not a transactional or hostile-JavaScript guarantee.
- Intrinsic typed-array getters recover the true brand, extent, offset and backing buffer. The ArrayBuffer getter rejects shared storage; resizable and detached backing stores are rejected, including empty and cross-realm cases. An oversized backing allocation with a valid 512-byte subview is correctly accepted. Own buffer/size shadows cannot bypass these checks.
- Plain aliases avoid caller byte getters, iterators, species and methods. Golden fixtures match for plain, Buffer slice, subclass and cross-realm inputs even with poisoned properties. This assumes ordinary unmodified global intrinsics; it does not claim defense against changed globals.
- Input validation precedes parser mutation. Independent tests preserve both retained bytes and existing discarded counts after invalid pushes, then complete the original frame.
- Payload bounds remain 512 and wire bounds 524. Streaming allocates a fixed 524-byte retained buffer rather than copying input chunks. The new deterministic fragmentation test checks retained buffer identity/capacity across 64 payloads, alternating maximum payloads and random smaller payloads. This is source inspection plus bounded regression evidence, not a heap benchmark or exhaustive proof.
- Consumed frames are removed before callbacks. Tests cover unread valid-frame replacement, independent delivered payload mutation, nested partial input plus reset, and preserved nested partial state when the outer callback throws or detaches the active chunk. Existing tests additionally cover detachment on the final byte and synchronous complete nested pushes.

## Validation

All commands used the existing approved dependency directory via a local node_modules symlink; no installs.

- `node --test tests/protocol-byte-independent.test.ts tests/protocol-byte-boundary.test.ts tests/protocol.test.ts`: 27 passed, both initial and final runs.
- `node_modules/.bin/tsc --noEmit`: final pass. Initial failure was in the new test's species getter (TS2378), not production. Retained `typecheck.log.txt` unchanged; changed the test to an explicit throw and retained final empty output separately.
- `python3 tools/build_firmware.py`: portable host C build and checks passed, including one million noise bytes.
- `node --test tests/firmware.integration.test.ts`: 6 passed, including independent golden requests, maximum binary payloads and in-process BLE MTU bridge.

Raw outputs are retained beside this report. No production failure was discovered, so no production fix was made. No full aggregate, export, native mobile, browser, device, network, provider or remote action was performed. Portable host C and the in-process BLE bridge are not hardware validation.
