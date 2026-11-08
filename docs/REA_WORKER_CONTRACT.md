# APEX REA worker acceptance contract

## Result on 2026-11-07

Against APEX e51750ec0b34b280399877d67e1036058874c373, REA 6.8.0 now successfully supervises GNU objdump on this host. Both the target-free architecture query and actual `apex_crc16` disassembly completed. This is a narrower verified improvement over the older REA_RESEARCH.md failure, not a Ghidra or durable worker claim.

The selected APEX host binary was compiled from the pinned source with the repository's normal C flags, then read, never executed. SHA-256 before, independently after, and in REA evidence: `a9d2393adc37fffa3ef8eed26344a20d572930ec207f26de96c07db07ea7cca5`. REA reports completion_status=complete, exit_code=0, output_truncated=false, artifact_changed=false. See supervised-objdump.json and binary.sha256. This build's digest differs from the earlier recorded compiler environment; it is not claimed to be the same file.

Node 24.22.1, GCC 14.2 and GNU objdump 2.44 are available. Java 21.0.13 is present, but javac is absent both on PATH and in its installed JRE bin directory. Ghidra is unconfigured. The actual scoped REA doctor returns healthy=false and `GHIDRA_INSTALL_DIR is not set`. Raw report: ghidra-doctor.json. No engine install was attempted, so this is missing prerequisites, not an installation denial.

`npm ci --ignore-scripts --no-audit --no-fund --cache .npm-cache` installed 176 locked dependencies. The initial default-cache attempt failed because /home/agent/.npm was unavailable; selecting a workspace-local npm cache resolved it. No process guards, system settings, persistent credentials or agent registrations were changed. No private source was uploaded and no service was provisioned.

## Proposed host setup

Use an already authorized private Linux x86-64 worker with a persistent work directory and ordinary procps process visibility. Do not patch REA ownership checks, relax host security or substitute direct execution for supervised evidence. The current sandbox is adequate for the verified objdump step but has no demonstrated persistence/restart guarantee.

Install official Ghidra 12.1.4 and a full vendor JDK 21 on that host through its approved software-installation path. Pin the Ghidra archive SHA-256 and the exact JDK distribution/version, retaining license and provenance. Upstream R31 docs verify the Ghidra 12.1.4/JDK21 pairing; the reference checkout and the npm release are separate provenance records. Do not blindly select latest Ghidra: newer releases may change JDK requirements.

Official release verified through GitHub metadata:
https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.1.4_build

Archive: ghidra_12.1.4_PUBLIC_20260921.zip (569649598 bytes).
SHA-256: ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db.

Set absolute GHIDRA_INSTALL_DIR and JAVA_HOME only for the job. REA validates its native decompiler, JDK and engine compatibility. Use the exact APEX lockfile and Node 24.22.1 or a later supported 24.x patch. Do not run `rea setup` or register MCP globally for this CLI test.

## Acceptance gates

1. From the repository root, run `node --test tools/reverse-engineering/preflight.test.mjs` and `node tools/reverse-engineering/preflight.mjs`. The preflight uses bounded no-shell subprocesses and omits the host-wide process command list from output. All checks must pass. It distinguishes a real supervised objdump result from a successful direct ps diagnostic and checks structured child completion, not merely CLI exit code. It does not prove decompilation, isolation or persistence.
2. Compile the pinned APEX firmware source using its checked-in build configuration and run the existing independent C/protocol golden-vector tests as a separate controlled test step. Keep the selected analysis target itself unexecuted by the inspection workflow. Record source commit, compiler flags/version and artifact digest.
3. In a new per-run private evidence directory, run the pinned CLI `analyze BINARY --provider ghidra --json`, then `function BINARY apex_crc16 --provider ghidra --json`. Select the function address from observed output, not a guessed address, and run `decompile BINARY ADDRESS --provider ghidra --json`. Capture all output, errors, versions, digests and cleanup status. Never import success on timeout, truncation, cleanup uncertainty or artifact mismatch.
4. Compare pseudocode against firmware/core/apex.c: CRC initial value 0xffff, polynomial 0x1021, byte shift and eight-bit loop. Record discrepancies and compiler transformations rather than claiming source recovery or semantic proof. Validate any substantive interpretation against the existing independent fixtures. This is a host ELF experiment, not an ESP32 or hardware compatibility result.
5. Verify engine child cleanup after success and controlled timeout using only job-owned process identities. Do not kill arbitrary processes. Persist the evidence and checksum manifest, reconnect/restart the selected worker through its supported lifecycle, and verify retained bytes before labeling the worker persistent. No persistence check was performed here.

## Local deliverables

- tools/reverse-engineering/preflight.mjs: fail-closed readiness diagnostic (not a security boundary).
- tools/reverse-engineering/preflight.test.mjs: five passing tests including false-success and ownership failures.
- research/evidence/rea-2026-11-07/observed-preflight.json: actual current host result, not ready for Ghidra acceptance.
- research/evidence/rea-2026-11-07/ghidra-doctor.json and supervised-objdump.json: actual REA output.
- tools/reverse-engineering/package.json and package-lock.json: unchanged pinned APEX tooling inputs used for the recorded run.
- firmware/core/apex.c, apex.h and firmware/host/main.c: pinned test source.

Sources:
https://github.com/BlackStateGroup/APEX/blob/e51750ec0b34b280399877d67e1036058874c373/docs/REA_RESEARCH.md
https://github.com/BlackStateGroup/APEX/blob/e51750ec0b34b280399877d67e1036058874c373/tools/reverse-engineering/package.json
https://github.com/morluto/rea/blob/144843ccc26bd372d61b8c6a27b37a01a5b0fb61/docs/installation.md
