# APEX Device Intelligence: first runnable offline implementation

**Implementation branch:** feat/device-intelligence-offline-20261110. **Evidence:** source and deterministic/synthetic tests only until CI confirms it; neither an operational router adapter nor a hardware acceptance. This is the initial implementation of [the design proposed in PR #25](https://github.com/BlackStateGroup/APEX/pull/25).

## Delivered code

| Component | What it actually does | What it does not do |
| --- | --- | --- |
| packages/core/device-intelligence.ts | Strict, immutable, bounded Device Passport schema; hash-bound REA ELF-note evidence linking; read-only declared scope checks; six independent unknown privilege/security boundaries | Authenticate a router; discover a password; certify root access or ownership |
| tools/device-intelligence/inspect-firmware.mjs | Node-only static import of an exact regular file (16 B–64 MiB); format recognition for ELF/uImage/SquashFS/gzip/zip/tar; SHA-256; boolean-only service/credential-configuration markers; unsafe TAR entries are counted without extracting; exclusive JSON output | Decompress firmware; execute anything; detect a vulnerability; recover or print secrets; contact a device |
| packages/core/router-lab.ts | Deterministic synthetic router state machine; connection does not imply login; declared scope and read-only operation checks; fixture responses tagged synthetic | Implement an OpenWrt API client; prove real administration; reach OS root; run mutation commands |
| tests/device-intelligence.test.ts | Source integrity, schema, forged privilege, REA mismatch, read grants, emulator denial and immutable boundary graph regression suite | Actual OS/browser/native/hardware tests |
| tests/device-intelligence-cli.test.mjs | CLI subprocess, malformed input, archive safety, redaction, format recognition and firmware comparison tests | Real firmware extraction or full advisory validation |
| .github/workflows/device-intelligence.yml | Dedicated Node 24 test + repo typecheck CI on relevant file changes | Hardware or cryptographic trust acceptance |

## Run on a local Node 24 workspace

Install with the normal locked dependencies first:

~~~bash
npm ci
npm run intelligence:test
npm run typecheck
~~~

Inspect an **already acquired, permitted** local firmware file (the parent directory of the destination must already exist). The tool refuses to overwrite prior evidence:

~~~bash
npm run intelligence:inspect -- /path/to/owned-firmware.bin /path/to/new-passport.json
~~~

For **an ELF only**, link a saved REA ELF-note report if and only if the SHA-256 and byte count match the inspected firmware:

~~~bash
npm run intelligence:inspect -- /path/to/host-firmware.elf /path/to/new-passport.json --rea-report /path/to/rea-evidence.json
~~~

An output has four relevant sections: a source-hashed offline passport, optional REA ELF evidence link, optional TAR safety indicators, and explicit inspection limitations. It contains **no raw firmware contents, credentials, passwords or key material**. The input is read with a bounded regular-file descriptor and never executed, decompressed, written back or transmitted.

### Report interpretation

- Format recognition is only a magic-byte classification. An OpenWrt image may have nested or proprietary containers this first implementation cannot inspect.
- Boolean marker presence is **not a finding of embedded credentials** and absence does not prove that secrets are absent; compressed contents are not inspected.
- TAR safety counts are not full archive validation. No archive entries are extracted or used as filenames.
- The REA binding only accepts the **existing specific ELF note report format**, not every REA provider, arbitrary decompilation output or a non-ELF router image. Existing REA toolchain integration remains separate.
- A hash identifies the bytes read in that observation, not signed firmware authenticity. File changes between endpoint observations cannot be fully excluded.
- The synthetic router lab never makes a network connection. Declared operator scope is **not proof of legal authority or a successful login**.
- Every privilege boundary is deliberately **unknown** until independently verified through authorised hardware-specific tests.
- iPhone/Android UI, a real OpenWrt authenticated adapter, full extraction, repository-wide firmware comparison and physical recovery remain future work. Do not market them as implemented.

## Acceptance and next PR sequence

1. **DI-01–DI-04:** Accept this source and test baseline, check Node/TypeScript CI results, fix all regressions. Retain true test outcomes against the exact commit.
2. **DI-05/DI-11/DI-12:** Add a mobile-safe imported report viewer, version-aware comparison with structured source references, and a synthetic credential-exposure audit; independently test strict redaction.
3. **DI-06–DI-09:** Design a properly scoped read-only OpenWrt ubus adapter and a restricted local sidecar. Enable live transport only with explicit operator-controlled auth and target scoping.
4. **DI-10/DI-13:** Acquire named owned hardware, confirm vendor recovery procedures and physical electrical/network safety; test actual device communication and recovery on isolated benches.
5. **DI-14–DI-16:** Add version-pinned signed adapter grants, native iPhone/Android acceptance, independent evidence review and controlled field-release gates.

The first PR does not permit secret recovery, exploitation, bypass automation or state-changing device control. The [design backlog in PR #25](https://github.com/BlackStateGroup/APEX/pull/25) remains the source of the larger programme.

## Key invariants for reviewers

- No unbounded firmware reads or archive extraction.
- No firmware execution, network sockets or subprocesses in the inspector; the only subprocess is invoked by the test harness to run the inspector.
- No unconstrained command or filesystem paths emitted from imported firmware.
- Credential markers are booleans; values are not retained or exported.
- Strict object keys prevent untrusted reports smuggling executable or privilege fields.
- No “root: true” state exists in offline schema.
- A connection event cannot become an authenticated session without an explicit separate synthetic state transition.
- Denied/expired/mismatched scopes fail before the adapter publishes a simulated response.
- CI must pass before merging; all physical acceptance remains unrun.
