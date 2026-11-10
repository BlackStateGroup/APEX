# Full REA/Ghidra firmware baseline

This implements the next reproducible experiment for WP-V14. It operates only on the repository's own portable AXP C source. The runner accepts an empty output directory, never a device, URL or arbitrary target.

## Experiment

1. Verify REA 6.8.0 and its explicitly selected Ghidra provider.
2. Compile the original APEX core and a source-copy negative control with CRC polynomial `0x1021` changed to `0x8005`. Retain source and binary hashes. Original binaries are made non-executable and never invoked.
3. Decompile all six public AXP functions through REA and validate each Evidence record's engine, operation, integrity and original binary digest.
4. Retain a CRC analysis snapshot; open it in a fresh CLI process and require identical pseudocode. Reject a tampered snapshot.
5. Require a distinguishable polynomial in the negative control's pseudocode.
6. Recompile the two recovered CRC functions with explicit type aliases and a fixed test harness. Compare 130 vectors per variant, including the empty input and `123456789`, against an independent table-based reference.
7. Retain all outputs, failures and process-group cleanup observations. A failed step never writes a successful report.

This measures finite-vector agreement for known source. It is not proof of semantic equivalence, blind algorithm discovery, credential extraction or physical accessory behaviour. Snapshot reuse across a process restart is not a persistent authenticated worker service.

## Reproduce

Use the committed workflow or a Linux environment with Node 24.22.1+, a full JDK 25, GCC, and the pinned REA dependencies:

```sh
npm ci --prefix tools/reverse-engineering --ignore-scripts --omit=optional
GHIDRA_INSTALL_DIR=/absolute/path/ghidra_12.1.4_PUBLIC \
  node tools/research-full-engine.mjs /absolute/path/new-experiment
```

The workflow pins Ghidra 12.1.4 to SHA-256 `ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db`. Download origin: https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.1.4_build.

## Local verification, 10 November 2026

- REA and the selected Ghidra 12.1.4/JDK 25 provider passed `rea doctor --provider ghidra`. Unselected providers and optional client registration remain unconfigured.
- Official Ghidra and Temurin archives were SHA-256 checked before extraction.
- Ghidra 12.2 was initially rejected by REA's supported-version check. No version check was bypassed; the supported 12.1.4 release was then selected.
- Ghidra performed initial ELF analysis, but the REA bridge could not open its Unix-domain socket in this workspace (`java.net.SocketException: Operation not permitted`). No complete REA pseudocode result was returned locally.
- The real experiment therefore runs in the dedicated GitHub workflow. Its result is pending, not a successful decompilation claim.
- No original target, phone or accessory was executed, contacted or flashed by the local setup probe.

Still separate: independent review, engine hardening for untrusted third-party firmware, authenticated submit/status/cancel/result service, controlled interruption/recovery and physical source-to-behaviour experiments.
