# APEX Device Intelligence: first runnable offline implementation

**Implementation branch:** feat/device-intelligence-offline-20261110. **Evidence:** source and deterministic/synthetic tests only until CI confirms it; neither an operational router adapter nor a hardware acceptance. This is the initial implementation of [the design proposed in PR #25](https://github.com/BlackStateGroup/APEX/pull/25).

## Delivered code

| Component | What it actually does | What it does not do |
| --- | --- | --- |
| packages/core/device-intelligence.ts | Strict, immutable, bounded Device Passport schema; hash-bound REA ELF-note evidence linking; read-only declared scope checks; six independent unknown privilege/security boundaries | Authenticate a router; discover a password; certify root access or ownership |
| tools/device-intelligence/inspect-firmware.mjs | Node-only static import of an exact regular file (16 B–64 MiB); format recognition for ELF/uImage/SquashFS/gzip/zip/tar; SHA-256; boolean-only service/credential-configuration markers; unsafe TAR entries are counted without extracting; exclusive JSON output | Decompress firmware; execute anything; detect a vulnerability; recover or print secrets; contact a device |
| packages/core/device-intelligence-report.ts | Strict mobile-safe JSON report import and comparison; never upgrades marker changes into patch claims | No file selection, firmware execution or live router interaction |
| src/DevicePassportWorkbench.tsx | Analysis → Firmware Passport, explicit two-slot paste/inspect/compare, synthetic example and security-boundary display | Device or firmware validation on a physical handset |
| tools/device-intelligence/openwrt-https.mjs | Node-only TLS-verified, bounded, single-shot HTTPS request over exactly selected /ubus on private/loopback lab host; token never transmitted before TLS/private-peer validation | No automatic login, scan, public-host access, fallback, retry or root |
| packages/core/openwrt-ubus.ts | Build exact, session-scoped JSON-RPC 2.0 `system.board` and `system.info` read requests; validate and redact responses | No session login, HTTP transport, credential discovery, remote access or root claims |
| packages/core/router-lab.ts | Deterministic synthetic router state machine; connection does not imply login; declared scope and read-only operation checks; fixture responses tagged synthetic | Implement an OpenWrt API client; prove real administration; reach OS root; run mutation commands |
| tests/device-intelligence-https.test.mjs | Actual TLS loopback roundtrip with ephemeral test certificate, ACL refusal, redirect/oversize errors, host/scope guards and non-leaking diagnostics | Real router/physical networking |
| tests/device-intelligence-ubus.test.ts | Request allowlist, invalid sessions/scopes, permission-denied replies, ID mismatch and safe field projection | Live ubus/OS/hardware acceptance |
| tests/device-intelligence-ui.test.ts | Strict mobile report envelopes, comparisons, source-only results and inspector wiring | Native view acceptance |
| tests/device-intelligence.test.ts | Source integrity, schema, forged privilege, REA mismatch, read grants, emulator denial and immutable boundary graph regression suite | Actual OS/browser/native/hardware tests |
| tests/device-intelligence-cli.test.mjs | CLI subprocess, malformed input, archive safety, redaction, format recognition and firmware comparison tests | Real firmware extraction or full advisory validation |
| .github/workflows/device-intelligence.yml | Dedicated Node 24 test + repo typecheck CI on relevant file changes | Hardware or cryptographic trust acceptance |

## Run on a local Node 24 workspace

Install with the normal locked dependencies first:

~~~bash
npm ci
node --test tests/device-intelligence*.test.ts tests/device-intelligence*.test.mjs
npm run typecheck
~~~

Inspect an **already acquired, permitted** local firmware file (the parent directory of the destination must already exist). The tool refuses to overwrite prior evidence:

~~~bash
node tools/device-intelligence/inspect-firmware.mjs /path/to/owned-firmware.bin /path/to/new-passport.json
~~~

For **an ELF only**, link a saved REA ELF-note report if and only if the SHA-256 and byte count match the inspected firmware:

~~~bash
node tools/device-intelligence/inspect-firmware.mjs /path/to/host-firmware.elf /path/to/new-passport.json --rea-report /path/to/rea-evidence.json
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
- The data-only Analysis UI is now implemented in source and awaits browser/native CI and device acceptance. The OpenWrt ubus request/reply protocol codec and a **Node-only HTTPS local/private lab transport** now exist. The latter uses an already-authorised operator session, explicitly supplied CA, exact endpoint/private IPv4 literal, private network checks and fixed read-only calls, and is tested against a TLS loopback fixture. A physical OpenWrt adapter acceptance, login/user credential management, full extraction, advisory-aware comparison and recovery remain future work. Do not market them as implemented.

## Mobile operator workflow

In APEX select **Analysis → Firmware Passport**. Paste the desktop inspector JSON into slot A and choose **Inspect Firmware Passport A**. Optionally inspect a second report in slot B and select **Compare inspected firmware reports**. Results show source SHA-256, static indicator classes and six separate *unknown* trust boundaries. Nothing is saved or automatically interpreted; drafts live in memory, and leaving the inspector clears reported results. The **synthetic example** is labelled and cannot validate a real device. Both iPhone and Android UI integration still require native/build and physical testing.

## Acceptance and next PR sequence

1. **DI-01–DI-04:** Accept this source and test baseline, check Node/TypeScript CI results, fix all regressions. Retain true test outcomes against the exact commit.
2. **DI-05/DI-11/DI-12:** The data-only imported report viewer and source/marker comparison are now coded; extend to version-aware advisory references and a synthetic credential-exposure audit. Independently test strict redaction.
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

## Read-only OpenWrt ubus codec

The repo now contains a native-safe, transport-free JSON-RPC codec for two official OpenWrt ubus system methods: `system.board` and `system.info`. It takes an already-authorised, memory-held ubus session ID (32 hex characters, not the null session), exact source-hash scope and operator declaration; it refuses unknown/mutating functions, expired/mismatched scopes and bad request IDs. The server independently enforces session ACLs. Response projections retain only selected board/version or uptime fields, never an arbitrary returned JSON payload. A returned value is labelled *unverified ubus response* and is not root or even authenticated device identity.

Official references: [OpenWrt ubus HTTP/JSON-RPC and ACLs](https://openwrt.org/docs/techref/ubus), [OpenWrt system method catalogue](https://openwrt.org/docs/guide-developer/ubus/system). A Node-only HTTP-over-TLS client is now implemented and has synthetic loopback integration tests. It requires an already-authorised session token plus explicit CA trust, never requests a login or writes to the router. It is not enabled in the phone app. Physical router acceptance still awaits a named authorised fixture, reviewed TLS trust and safe operator token custody.
