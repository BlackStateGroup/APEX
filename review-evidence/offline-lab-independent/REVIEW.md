# Independent offline walkthrough review

Reviewed base: `6657f48aff12a276d563a85d5e7f166b94f91d3c` in a distinct sibling worktree on `review/offline-lab-independent`. No repository AGENTS.md or local skill directory was found. Existing Node 24.22.1 and approved node_modules symlink were reused; no installations occurred.

## Result

No blocking defect found in the reviewed synthetic demonstration. Production code and walkthrough documentation were not edited. Original dedicated CLI tests passed 3/3. Independent additions and focused phase/Flipper tests passed 25/25; TypeScript `tsc --noEmit` exited 0. Raw original and focused outputs are preserved alongside this report. No test failure occurred; injected failure cases are expected passing assertions, not suppressed original failures.

Commands:

- `node --test tests/offline-lab-walkthrough.test.ts`
- `node --test --test-concurrency=2 tests/offline-lab-walkthrough.test.ts tests/offline-lab-independent-review.test.ts tests/iq-phase-increment.test.ts tests/flipper-offline.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- Twice: `node --permission --allow-fs-read="$PWD" tools/demo-offline-lab.ts` with shell-captured stdout/stderr.

Both actual CLI summaries were byte-identical, 5796 bytes including newline, SHA-256 `a3d5a315c053b80d7c7fa4a5c62aa2d67b2a6316dcef9087f3a8eabe2ec35b82`. Both stderr captures are empty. Capture files were written by the review shell, not the demo; demo subprocess filesystem writes were denied.

## Claims checked

- Phase selections are precisely two pairs at left indices 0 and 4 for lags 1, 2, 4, not a whole-record phase estimate. Exact conjugate products and endpoint energies match the quartertone. The negative-real-axis convention is +pi. Principal offset intervals and alias spacings match the declared 1024 Hz rate. Lag 4 aliases a nonzero tone to zero phase; it is not zero energy. Existing core tests separately exercise zero-energy unavailability.
- Full metadata/data hashes are carried, not selected-pair hashes. Added independent literal metadata oracle supplements the existing complete-data reconstruction and output snapshot. Hashes authenticate no source identity.
- Flipper frames contain version responses only, manually authored synthetic bytes with omitted, explicit-zero and nonzero status. Scalar presence differs from effective defaults. Absent command ID/hasNext cannot imply correlation/completion; no identity response is asserted.
- All stages retain synthetic labels and fixed demonstration time. BLE public interpretation, declared trial agreement, inert NDEF text and memory-backed evidence records make no physical-reception or authentication claims.
- Main collects its result before a single stdout write. Existing faults exercise later phase and Flipper stages. Added final serialization exception and 8192-byte summary rejection both exit 1 with exactly empty stdout and the fixed diagnostic.
- Runtime import closure has only local pure analyzers plus node assert/fs/crypto; filesystem access in the demo is readFileSync of fixtures. The review also executes with common fetch/WebSocket/TCP/HTTP/HTTPS/UDP entry points trapped. No native/device/provider module or operation is reached.

## Limits

The network trap is a targeted regression guard, not an operating-system network sandbox or exhaustive future-API proof. Node filesystem permissions deny writes; they do not alone establish network isolation. Static closure review supports the no-network/no-device claim for this code version. Atomic stdout means no output before analysis/assertion success; it does not guarantee delivery if the final stdout write itself encounters an I/O error. Fixed output hashes are platform/runtime regression evidence, not signatures or trusted timestamps.

No full aggregate test/export, build, browser, native API, hardware, physical RF/BLE/NFC reception, real Flipper compatibility, calibrated receiver, remote publication or universal-access validation was attempted. Those remain separate gates. Independent tests and evidence only are committed.
