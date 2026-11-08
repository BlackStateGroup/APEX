# Independent Mayhem C8 import review

## Decision

**Approved for the isolated offline prototype. No blocking finding.** This is not approval for UI integration, evidence persistence, native deployment, actual Mayhem capture authenticity, or hardware interoperability.

The exact reviewed production source is commit `87e2e4557b18cc444fe13d4446298317d821fd97`, tree `381e14741135db802ba96b8b17e24ba681d36ba5`, based on APEX `fa8e934363bfb39554f104d25ac6a19c502ebb83`. The review was performed in a separate local clone. No changes were made to the builder clone or active APEX checkout. The reviewer added only independent tests and evidence.

## Verified outcome

- **390/390 focused tests passed**, zero failed or skipped. This includes all existing `iq-*` and `inspect-iq*` tests, the supplied Mayhem tests, and **15 new independent adversarial tests**.
- TypeScript typecheck passed against the final review tests and unchanged prototype source.
- Dependency inventory check passed: 541 locked entries. No dependencies were installed.
- No whole-project pass is claimed by this reviewer. The parent is separately running the broader suite. The review did not execute recovered upstream sources or the REA runtime.

Commands, run with Node v24.22.1:

```sh
node --test tests/mayhem-c8-*.test.ts tests/iq-*.test.ts tests/inspect-iq*.test.ts
npm run typecheck
npm run inventory:check
```

The final outputs are `final-focused.tap`, `typecheck-independent-final.log`, and `inventory-final.log` beside this report. The source hashes, Git blobs, baseline comparisons, and exact source tree are in `source-manifest.json`.

## Independent adversarial coverage

1. Constructed all **65,536 possible I/Q byte pairs** in one maximum-size source input. Confirmed both components, channel order, little-endian encoding, normalized amplitudes, source SHA-256, derived SHA-256, and the exact 262,144-byte derived limit. The signed endpoints remain -128 → -32768 and +127 → +32512.
2. Checked **16,384 single-byte parser mutations and prefixes** against a separately written grammar oracle. The 97 accepted cases were unchanged or canonical numeric variants. Invalid cases were rejected before hashing. The supplied tests additionally cover every field order, LF/CRLF and optional final newline, strict numeric endpoints, malformed UTF-8/BOM, extra fields, duplicate fields, unsupported formats, and sidecar bounds.
3. Tested overlapping views over the same original buffer, post-invocation mutation, subsequent buffer detachment, returned-buffer detachment, hostile typed-array property/iterator/coercion hooks, and valid foreign-realm typed arrays. Retained source and derived bytes stayed stable; hostile source hooks were not invoked.
4. Independently checked the exact four SHA-256 input domains: derived metadata, derived data, original data, and original sidecar. Hash buffers are distinct disposable copies, uppercase digests normalize, retained originals do not alias caller/hash-adapter buffers, and getters provide fresh copies. Existing tests cover rejected/throwing hashes at every stage.
5. Confirmed explicit import-context snapshotting and inert supplier-label claims. Invalid origins, noncanonical dates, unsupported fields/prototypes, and invalid labels reject before hashing. Acquisition, producer, and authenticity verification remain false; no acquisition timestamp is invented.
6. Ran the real CLI under Node's permission model with filesystem writes, subprocesses, workers, and addons disallowed. It succeeded, produced the expected JSON/hashes, and left fixture names, contents, sizes, permissions, modification times, and change times unchanged. A separate attempted-write probe verified that the test sandbox actually denied writes. This permission check is not represented as a network sandbox.
7. Deterministically injected filesystem races in both input roles: same-byte inode replacement between `lstat` and open; growth, truncation, same-size content edits, and pathname replacement during read. All rejected, and file handles closed. A regular-file-to-FIFO swap rejected without blocking. Direct symlink, directory, and FIFO inputs in either role also rejected in actual CLI processes.
8. Confirmed explicit-path-only CLI behavior, no output option, and no filename-extension inference. Static inspection of its small dependency closure found no networking, device access, UI integration, persistence, or upstream execution.

## Important boundaries, not blockers

- **The pair is not atomic.** A deterministic test changed the data pathname after its completed read but while the sidecar was being opened. The import correctly retained and hashed the earlier data snapshot, not the now-current pathname contents. The documentation explicitly discloses individual reads and caller-claimed pairing. Any future requirement for a single producer snapshot would need a new contract.
- Hash identity is conditional on a trusted local hash adapter. The API checks digest shape, not the honesty of an arbitrary caller-provided implementation.
- Strict format declaration and numeric parsing cannot establish how arbitrary raw bytes were actually encoded or who acquired them. There is no producer/acquisition verification claim.
- Provenance exists in the wrapper and original-byte getters. Future persistence must retain them; saving only `recording` would lose original evidence. No persistence integration is included or approved here.
- No actual Mayhem recording, browser/native runtime, hardware, radio, or physical acquisition was tested. All test data was handwritten synthetic content.

## Scope and source integrity

The source commit adds exactly five files: the new converter, CLI, contract documentation, and two supplied test files. `prepareIq`, analyzer code, bounded JSON, the existing regular-file reader, package manifests/lockfile, App/UI, and persistence are unchanged from the baseline. In particular, `apex-ci16-le-v1`, 65,536-byte metadata and 262,144-byte data limits remain unchanged.

Key SHA-256 ties:

- `packages/core/mayhem-c8-import.ts`: `90277865cbc9672979bf8bdb0506ffa1f70e21e2ec490d749a9a6a1489c1f469`
- `tools/inspect-mayhem-c8.ts`: `b190fb35cd3f8674b086517e622f4d9f0c82cc998eca5526884753007b71d996`
- `packages/core/iq-offline.ts` (unchanged): `f39e70db503befc36d509fe1e37b8fb8041139fb18acd0433f755734c8ac9db8`
- `tools/inspect-iq.ts` (unchanged): `5e63dd514a334a082d8f00081b3ae00169af821a9c59225ef530532a043605cd`

The prototype documents format-fact provenance at Mayhem Mobile `a18fca46f58519fc81e19304fc13bbf3da2aa69f`. The review added no GPL source, GPL dependency, or copied upstream tests. This is source-scope inspection, not independent legal clearance or a claim that upstream history was exhaustively audited.
