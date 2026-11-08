# REA research and firmware workbench

REA is morluto/rea, Reverse Engineer Anything. APEX now pins `rea-agents` 6.8.0 in a separate desktop tooling package. The reference checkout is R31, commit `144843ccc26bd372d61b8c6a27b37a01a5b0fb61`; its root source archive is preserved in the source catalogue. Five provider-source submodules remain uninitialised and are recorded separately in the manifest; the root archive does not contain their source trees. The npm release and the later reference checkout are distinct provenance records. REA is MIT; declared transitive licences and release integrity are in `research/rea-toolchain.json`. These tools are not bundled into the iPhone/Android app.

## What was actually run here

On 2 November 2026, the REA CLI's built-in ELF note parser inspected APEX's own compiled host firmware. It reported ELF64/x86-64, a 16,712-byte artifact, six note observations (including overlapping section/program declarations) and one distinct GNU build ID. Both subject and artifact digests matched independently computed SHA-256. GNU objdump directly captured file headers, sections, symbols and `apex_crc16` disassembly. Supplement files have their own digests and an explicit GNU provider label. The selected target was never invoked as a program by this inspection workflow.

The compiled lab binary is a Linux host build, not an ESP32 image or physical device. Observed SHA-256: `367acc06436a2499defdf1b76bb314fb37d03ab619305cbfd164b7e7304631e0`. Other compilers/build environments can produce a different digest. Raw evidence and a concise manifest are in `research/evidence/rea-lab/`; the original code remains in `firmware/core/apex.c` and is covered by the existing independent protocol/C tests.

### Available and unavailable capabilities, updated 7 November 2026

| Capability | Observed result |
| --- | --- |
| REA CLI 6.8.0 | Runs locally |
| REA built-in ELF notes | Successful, artifact-bound report |
| Direct GNU objdump | Headers, sections, symbols and selected disassembly successful |
| REA-supervised objdump | Passed on 7 November: architecture listing and actual `apex_crc16` disassembly; 2 November failure retained |
| Process ownership diagnostic | Passed on 7 November from a Node child; the earlier `fatal library error, lookup self` did not recur |
| REA binary layout | Unavailable: caller-supplied pwntools Python stack is not configured |
| Ghidra / IDA / Hopper / JADX | Not installed/configured; no decompilation claimed |
| Global REA MCP registration | Not changed; current work uses the CLI |
| Physical device access | No attached hardware established |

The 2 November audit-wide `rea doctor` result was unhealthy because optional engines and agent registration were absent. On 7 November, the scoped Ghidra doctor still reports `healthy:false`: Ghidra is unconfigured and a full JDK (`javac`) is missing. Neither result invalidates successful operations from another provider. No process-ownership guard was patched or bypassed. Failed attempts are retained alongside successful evidence. Other supervised providers remain unverified in this environment, even when their prerequisites could be installed.

### Supervised disassembly, 7 November

REA 6.8.0 itself supervised GNU objdump on the newly compiled, unexecuted APEX
host binary and returned complete, untruncated `apex_crc16` disassembly with exit
code zero. Independent before/after and evidence digests agree:
`a9d2393adc37fffa3ef8eed26344a20d572930ec207f26de96c07db07ea7cca5`.
This is a new compiler-environment artifact, not the earlier binary. Raw reports
are retained in `research/evidence/rea-2026-11-07/`. The module-relative preflight
and next acceptance steps are in [REA_WORKER_CONTRACT.md](REA_WORKER_CONTRACT.md).
No Ghidra decompilation or persistent worker setup is claimed.

## Reproduce and import

```sh
npm ci
npm run research:setup
npm run firmware:build
npm run research:inspect -- build/apex-firmware build/my-first-inspection
```

Use Node 24.22.1 or a later supported 24.x patch for the pinned CLI. Use a new output directory each time. The tool refuses existing output paths (including paths created during inspection), reads only regular files from 16 bytes through 64 MiB through a bounded descriptor read, and analyzes a private read-only local snapshot rather than reopening the source for each analyzer. It uses bounded subprocess calls without a shell, compares the source's initial/final identity and digests with the snapshot and REA's reported digest, and retains raw evidence plus each GNU supplement and diagnostic stream. Additive `analysisInput` metadata identifies the original source and the temporary snapshot, its size and digest; raw REA paths accurately refer to that snapshot, which preserves the source basename. Snapshot cleanup must succeed before report publication; analysis errors trigger cleanup too, and a cleanup failure is reported alongside the original error rather than hidden. Report-write failures retain partial evidence without claiming success. `sourceObservation` clarifies the endpoint-only unchanged observation. Missing or unsupported GNU operations remain explicit supplemental failures; they do not erase successful REA metadata. Source digest agreement is an endpoint observation, not proof against intervening changes or a concurrent ABA file replacement. All analyzers consume the same snapshot bytes even when the original path changes between observations. This is not isolation from another process with permission to alter the private snapshot or report directory. Inspection does not recover secrets, prove runtime behaviour or establish hardware compatibility.

In the mobile/web app, open Analysis, choose **Import REA report**, paste the generated `rea-evidence.json`, then analyse and save. A recorded sample is available separately. The app validates operation/provider/version, digest agreement, counts, bounded note ranges and metadata lengths. It drops execution-shaped extra fields and local filesystem paths. Imported data always retains the warning that the original artifact has not been verified on this device. Saving a summary uses the existing local journal and does not execute report content or call a remote model.

## Next research packages

1. Supervised GNU inspection is now working. Configure a full JDK and authorized Ghidra installation, then verify the engine against the known C binary. Compare findings to source and independent golden vectors before importing conclusions. Verify worker persistence separately.
2. Add Flipper read-only identity/status interoperability using its official pinned protobuf schema. Review framing, BLE transport, version negotiation and licensing separately; the custom AXP UUIDs do not make Flipper firmware compatible.
3. Add real capture fixtures from owned accessories, with firmware revision, timestamps, hardware identity and collection method. Extend analysis to IR, receive-only radio and isolated CAN/industrial observation.
4. Treat Pwnagotchi integration as a separate proposed accessory adapter. No password-recovery or live Wi-Fi capture integration is implemented by this work.

Primary sources: https://github.com/morluto/rea, its pinned `docs/cli.md`, `docs/reverse-engineering-tools.md`, `docs/installation.md`, and https://github.com/flipperdevices/flipperzero-protobuf. Research scope remains owned or explicitly authorised equipment and controlled tests.
