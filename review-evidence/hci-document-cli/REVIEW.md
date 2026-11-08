# Independent selected HCI document CLI review

Reviewed builder commit `cc429f6dda1de59c210589b64a06de99ad17acbd`, cherry-picked without changes as `34e355b3cedd9b2a9f3f6f2ee5567748fd87f608`. Production file hashes are in `source.txt`. Separate sibling review worktree; main and builder worktrees were not edited. Existing dependency installation was symlinked; no installs or external access.

No production defect identified. Three additional actual-subprocess suites cover explicit opt-in and excluded record markers, exact derivative bytes and original coordinates, strict arguments and generic atomic refusals, fatal UTF-8 and preserved BOM rejection, 4096 decoded UTF-16-unit acceptance/rejection with multibyte text, 12289-byte refusal, final symlink/directory/missing-file rejection, source content/mtime preservation, original-reference substitution remaining UNVERIFIED, independently hashed derivative source/offsets, stale digest, recomputed digest over a late invalid RSSI, and escaped duplicate keys. Existing builder suites additionally check byte-for-byte metadata/legacy/extended compatibility and ancestor links.

Commands and results:

- `node --test tests/hci-document-cli-independent.test.ts tests/hci-selected-cli.test.ts tests/hci-selected-document*.test.ts`: 33/33 passing, exit 0. Original first run: `first-focused.log`.
- `node_modules/.bin/tsc --noEmit`: exit 0. Original first run: `first-tsc.log` (empty successful output).

No failed test runs occurred. The exact added regression source accompanies this evidence. Parent owns full aggregate integration validation.

These checks used synthetic bytes only. Node permission flags denied filesystem writes/child spawning within CLI subprocesses; this is not OS-level network isolation. Selected whole events can retain multiple advertisers and sensitive identifiers. SHA-256 verifies derivative equality, not original capture authenticity or physical origin. No browser, native, device, provider, credential, settings or remote acceptance is claimed. The source's read-only file-race checks are inherited, not a newly demonstrated filesystem isolation guarantee.
