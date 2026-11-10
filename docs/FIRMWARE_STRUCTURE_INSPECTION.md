# APEX firmware structure inspection: U-Boot and SquashFS

**Status:** implemented as an *additive offline static inspection* stacked on PR #29; no device access. It does not modify the v1 Device Passport export or mobile import schema. Design parent: [Device Intelligence implementation](DEVICE_INTELLIGENCE_IMPLEMENTATION.md).

## What this delivers

The first APEX firmware importer [recognises container magic](../tools/device-intelligence/inspect-firmware.mjs) and records source SHA-256 without opening archives. This extension adds bounded structural checks to selected **header-at-offset-zero** types:

| Type | Observed fields | Validation | Not established |
| --- | --- | --- | --- |
| U-Boot legacy uImage | Declared payload byte length, OS/architecture/type/compression numeric IDs, trailing bytes | CRC-32 over exact 64-byte header with zeroed hcrc field, and CRC-32 over the declared bounded payload; truncation and mismatch states distinct | Signature authenticity, bootability, running firmware, root privileges |
| SquashFS v4, little-endian | Superblock version, compression code, block size/log, inode count, declared bytes used | Header size (96 bytes), supported version, expected compression family, block power-of-two/log and used size within actual input | Filesystem integrity, mountability, data contents, user accounts |
| Legacy big-endian squash magic | Magic only | Explicitly unsupported result | Full parsing, compatibility |
| Other formats including ELF | None from this specialised module | Null/unavailable result | Decompilation, file semantics |

Inputs remain restricted to ordinary local files of **16 bytes to 64 MiB**. The common bounded file reader uses a single file descriptor, rejects symlinks where supported and detects changed file size/metadata. Results do not copy payload bytes, image names, boot addresses, arbitrary file paths from archives, credential strings or signature material.

**Important:** The checksum fields are not security authentication. A malicious image can contain valid CRC values. Even a completely consistent SquashFS superblock does not prove that the filesystem can be mounted.

## Run

From an APEX Node 24 workspace, with its checked-in dependencies:

```sh
npm ci
node --test tests/device-intelligence-structure.test.mjs tests/device-intelligence-structure-cli.test.mjs
node tools/device-intelligence/inspect-structure.mjs /absolute/path/to/owned-image.bin /existing/output/dir/new-structure.json
```

The CLI does not overwrite prior evidence. It produces `apex.firmware-structure` JSON with `source.sha256`, exact byte count, format and a data-only structural report, or an explicit unsupported result. No model, REA subprocess, remote network, arbitrary shell, firmware extraction, decompression or firmware execution is started.

If the file is an ELF, use the existing REA ELF-note workbench and preserve its original hash evidence; this specialist header parser deliberately returns `structure:null`.

## Acceptance tests

- Standard CRC-32 vector **123456789 → 0xcbf43926** with independent bitwise CRC reference.
- Synthetic U-Boot image with independently generated header and payload CRC; separate negative controls for header mutation, payload mutation, oversized declared payload, trailing bytes and truncated header.
- SquashFS v4 superblock fixture, malformed field combinations, impossible declared sizes and legacy big-endian recognition without attempting unsupported parsing.
- Source-identity preservation, no raw image name/credential-like text leakage, immutable outputs and file byte-for-byte unchanged.
- CLI source metadata, exact hash, no overwrite, and rejection of symlink, oversized and nonregular inputs.
- Existing complete APEX foundation, CI, mobile and firmware checks remain independent; tests against this source do not prove a physical router.

## Evidence references and licensing

Implementation derived from published **format definitions**, not copied firmware or upstream code:

- [U-Boot image.h pinned at ece349ade2973e220f524ce59e59711cc919263f](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/include/image.h) for the fixed network-byte-order 64-byte legacy header, uImage magic and header/data CRC fields.
- [Linux SquashFS header pinned at 067c5c24cef23d913b67eaaf71ae67e7169a6620](https://github.com/torvalds/linux/blob/067c5c24cef23d913b67eaaf71ae67e7169a6620/fs/squashfs/squashfs_fs.h) for little-endian superblock fields and compression IDs.
- [Existing APEX REA workbench](REA_RESEARCH.md) for independent, separately scoped ELF inspection.

These pins are documentation provenance, not new source imports. Do not turn structural findings into an inferred working management adapter or root access claim.

## Next integration gate

Import structural reports to the mobile UI **only after** a reviewed versioned data schema validates every field, binds to a matching Device Passport by SHA-256 and byte count, and labels integrity checks as unverified declarations on the phone. Extend to full archive structure extraction only in a memory/CPU-limited isolated worker with explicit path, symlink and decompression-bomb controls. Do not extract or execute unknown firmware inside the mobile process.
