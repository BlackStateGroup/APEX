# Independent offline HCI review

Reviewed source: 102b12619ae7d4c9af08ac754ba7e8585df65c51.
Node v24.22.1; reused approved sibling node_modules, no install.
No AGENTS.md exists in this repository or its immediate workspace parent.
Read HCI_OFFLINE.md, HCI core/CLI/tests, BLE AD parser/service interpreter,
readBoundedRegularFile and APEX_CONTINUATION.md.

The independent literal oracle initially miscounted total wrapper/event length by
one byte. fixture-authoring-failure.log preserves that reviewer fixture failure,
not a product defect. Corrected literal has total 69 bytes, H4 29 bytes, event
parameters 26 bytes, report offsets 45/58, AD offsets 54/67.
pre-repair.log then shows 7/8 independent tests passing with only the identified
standalone selected-output disclosure regression failing. typecheck.log is empty
because typecheck succeeded. Original implementation suite also passed 10/10.

Independent checks cover all 256 RSSI, event-type and address-type octets; every
shortened candidate and mismatched parameter-length octet; all 256 first-payload
bytes with exact safe metadata keys; manual big-endian and signed timestamp,
address and offset expectations; parser/service parity; storage view offsets,
detachment, copied-hasher mutation and prepared branding; subprocess strict option,
opaque marker redaction, late report/EOF failure, size, directory, nonexistent
file, final symlink refusal and permitted ancestor symlink cases.

Boundary assessment: no production defect found in framing, legacy semantics,
AD reuse, metadata privacy or CLI atomicity in tested cases. Standalone selection
omitted source/time/drop/identity/RF/hash limitations (reported to builder).
No production files were edited by reviewer. No device/capture/log access,
aggregate/native/browser/network/provider/remote actions, or installs occurred.
Subprocess Node permissions verify filesystem-write denial only, not OS network
isolation. No claim of exhaustive filesystem-race resistance, authenticated
capture, actual device behavior, or upstream compatibility is established.

Builder correction 1aac6ac (cherry-picked here as 88e6912) adds frozen common
warnings to metadata and selected output without changing parsing. The first
repair rerun passed 18/19 combined tests; the remaining expectation is explicit
SHA-256/digest byte-equality-only wording. Generic no-authenticity/identity
wording is already present, so this is a narrow completeness follow-up, not
an input acceptance or leakage failure. The builder was asked to add it.
first-repair-missing-digest-disclosure.log retains the exact failure.

## Final verification

Builder f37a2ef (review worktree cherry-pick a808172) adds the explicit SHA-256
byte-equality-only warning. Final reviewed production content is exactly the
builder's f37a2ef source: original 102b126 plus 1aac6ac and f37a2ef. The warning
fixes change no parsing/CLI logic. final-source-sha256.txt pins the four relevant
production files. Final tests: 19/19 (8 independent + 11 implementation),
typecheck exit 0, git diff --check exit 0. Raw logs are final-tests.log and
final-typecheck.log. No open blocker from this bounded review remains.

Run from repository root:

    node --test tests/hci-independent-review.test.ts tests/hci-offline.test.ts
    node node_modules/typescript/bin/tsc --noEmit

Independent commits for integration (after builder originals): 0394dff,
4d25da4, and the final evidence commit containing this paragraph. Do not also
cherry-pick local builder duplicates 88e6912 or a808172.
