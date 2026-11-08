# Independent HCI selected-report byte comparator review

Review worktree starts at 6beec27. All input is reviewer-authored synthetic binary data, never device captures, credentials, user logs or network sources. No native, UI or journal integration was exercised. No packages installed and no publication performed.

## Method

- Literal btsnoop file/record/event constructors are independent of the production preparation and selection functions. Expected data offsets are calculated from fixed 16-byte header + 24-byte record + 5-byte event prefix + 9-byte report prefix, then prior report lengths.
- 256 pairs each contain 31 bytes, covering every possible byte value at every position. Expected rows use numeric arrays, never production output. Additional pairs cover zero and maximum lengths, absent versus 00, and insertion/deletion without alignment.
- Selected report 24 in a 25-report event has data offset 294. A second report after an 8-byte first payload has data offset 72. Literal row expectations verify these derivative coordinates.
- Tests cover malformed late unselected reports with recomputed matching SHA-256, injected hash errors and buffer mutation, two independent sequential hashes, impossible selected indices, negative zero and boxed primitives, decoded duplicate keys, both UTF16 document bounds, original references staying UNVERIFIED, context preservation, deeply frozen results and excluded payload/document markers.
- Real subprocess tests run Node with filesystem reads enabled and filesystem writes not granted. They cover explicit indices, strict syntax and argument counts, regular file checks, final symlinks rejected and ancestor symlinks allowed, both file limits, malformed UTF8, BOM, empty files, generic errors with no stdout and retained input bytes/listings. This is Node filesystem write denial, not an OS network sandbox.
- The complete JSON is bounded including the final newline: independent serialization boundary tests cover 65536 versus 65537 UTF8 bytes and multibyte text.
- Existing frozen HCI serialized output baseline is replayed via hci-selected-document-independent.test.ts. BLE differential/field-hypothesis suites run alongside it; old source hashes are retained independently.

## Results

Builder production commit reviewed: 2598715 (local review cherry-pick 560829a). Production files were not edited by this review. Exact source SHA-256 values are in reviewed-source.sha256; all five retained old source hashes match.

Initial independent + prior parity run passed 47/47, and typecheck passed. An expanded run added metadata assertions and builder tests. Its sole failure was a reviewer expectation using the nonexistent AD status "complete" rather than the established "parsed" status. The failing output and exact test source are preserved in expanded-first-reviewer-status-expectation-failure.log and failed-test-source.txt. Only that assertion was corrected; no production code changed.

Final focused run passed 58/58, and typecheck passed. Results are recorded in final-focused.log and final-tsc.log. No source defects were found. This is focused synthetic acceptance, not a full aggregate or device acceptance.
