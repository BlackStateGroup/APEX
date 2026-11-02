# REA research and firmware workbench

REA is morluto/rea, Reverse Engineer Anything. APEX now pins `rea-agents` 6.8.0 in a separate desktop tooling package. The reference checkout is R31, commit `144843ccc26bd372d61b8c6a27b37a01a5b0fb61`; its root source archive is preserved in the source catalogue. Five provider-source submodules remain uninitialised and are recorded separately in the manifest; the root archive does not contain their source trees. The npm release and the later reference checkout are distinct provenance records. REA is MIT; declared transitive licences and release integrity are in `research/rea-toolchain.json`. These tools are not bundled into the iPhone/Android app.

## What was actually run here

On 2 November 2026, the REA CLI's built-in ELF note parser inspected APEX's own compiled host firmware. It reported ELF64/x86-64, a 16,712-byte artifact, six note observations (including overlapping section/program declarations) and one distinct GNU build ID. Both subject and artifact digests matched independently computed SHA-256. GNU objdump directly captured file headers, sections, symbols and `apex_crc16` disassembly. Supplement files have their own digests and an explicit GNU provider label. The selected target was never invoked as a program by this inspection workflow.

The compiled lab binary is a Linux host build, not an ESP32 image or physical device. Observed SHA-256: `367acc06436a2499defdf1b76bb314fb37d03ab619305cbfd164b7e7304631e0`. Other compilers/build environments can produce a different digest. Raw evidence and a concise manifest are in `research/evidence/rea-lab/`; the original code remains in `firmware/core/apex.c` and is covered by the existing independent protocol/C tests.

### Available and unavailable capabilities

| Capability | Observed result |
| --- | --- |
| REA CLI 6.8.0 | Runs locally |
| REA built-in ELF notes | Successful, artifact-bound report |
| Direct GNU objdump | Headers, sections, symbols and selected disassembly successful |
| REA-supervised objdump | Refused before launch; process ownership inspection failed |
| Process ownership diagnostic | `ps -axo pid=,ppid=,pgid=,uid=,stat=,command=` fails under REA's child with `fatal library error, lookup self` |
| REA binary layout | Unavailable: caller-supplied pwntools Python stack is not configured |
| Ghidra / IDA / Hopper / JADX | Not installed/configured; no decompilation claimed |
| Global REA MCP registration | Not changed; current work uses the CLI |
| Physical device access | No attached hardware established |

The audit-wide `rea doctor` result is unhealthy because optional engines and agent registration are absent. It does not invalidate the successful built-in parser. No process-ownership guard was patched or bypassed. Failed attempts are retained alongside successful evidence. Other supervised providers remain unverified in this environment, even when their prerequisites could be installed.

## Reproduce and import

```sh
npm ci
npm run research:setup
npm run firmware:build
npm run research:inspect -- build/apex-firmware build/my-first-inspection
```

Use Node 24.22.1 or a later supported 24.x patch for the pinned CLI. Use a new output directory each time. The tool refuses existing directories, uses bounded subprocess calls without a shell, compares the selected artifact's before/after digests and REA's reported digest, and retains raw evidence plus each GNU supplement and diagnostic stream. Missing or unsupported GNU operations remain explicit supplemental failures; they do not erase successful REA metadata. Digest agreement is an endpoint observation, not proof against a concurrent ABA file replacement. Inspection does not recover secrets, prove runtime behaviour or establish hardware compatibility.

In the mobile/web app, open Analysis, choose **Import REA report**, paste the generated `rea-evidence.json`, then analyse and save. A recorded sample is available separately. The app validates operation/provider/version, digest agreement, counts, bounded note ranges and metadata lengths. It drops execution-shaped extra fields and local filesystem paths. Imported data always retains the warning that the original artifact has not been verified on this device. Saving a summary uses the existing local journal and does not execute report content or call a remote model.

## Next research packages

1. Establish a working supervised-process host, then verify a bring-your-own Ghidra engine against the same known C binary. Compare findings to source and independent golden vectors before importing conclusions.
2. Add Flipper read-only identity/status interoperability using its official pinned protobuf schema. Review framing, BLE transport, version negotiation and licensing separately; the custom AXP UUIDs do not make Flipper firmware compatible.
3. Add real capture fixtures from owned accessories, with firmware revision, timestamps, hardware identity and collection method. Extend analysis to IR, receive-only radio and isolated CAN/industrial observation.
4. Treat Pwnagotchi integration as a separate proposed accessory adapter. No password-recovery or live Wi-Fi capture integration is implemented by this work.

Primary sources: https://github.com/morluto/rea, its pinned `docs/cli.md`, `docs/reverse-engineering-tools.md`, `docs/installation.md`, and https://github.com/flipperdevices/flipperzero-protobuf. Research scope remains owned or explicitly authorised equipment and controlled tests.
