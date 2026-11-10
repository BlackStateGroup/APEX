# APEX firmware structure reports in the mobile Analysis screen

**Status:** Source implementation and regression gates; physical phone acceptance is separate.

This change adds a strict, data-only import route to the existing **Analysis → Firmware Passport** screen, stacked on the [U-Boot/SquashFS structure analyzer](FIRMWARE_STRUCTURE_INSPECTION.md). It does not run native firmware tools on the phone and does not grant credentials, ownership or root access.

## Operator workflow

1. On an owned, authorised desktop/lab workstation, inspect the same firmware bytes with both offline commands:

   ```sh
   node tools/device-intelligence/inspect-firmware.mjs /path/to/owned-image.bin /existing/output/passport.json
   node tools/device-intelligence/inspect-structure.mjs /path/to/owned-image.bin /existing/output/structure.json
   ```

   Both outputs are exclusive-create. The user chooses two new file names in an existing directory; no prior evidence is overwritten.

2. In APEX, choose **Analysis → Firmware Passport**. Paste `passport.json` in Passport A, then select **Inspect Firmware Passport A**.
3. Paste `structure.json` in **Firmware structure report JSON** and select **Inspect firmware structure against Passport A**.
4. The mobile importer checks the structure report's exact SHA-256, byte count and container format against the separately inspected Passport A. A mismatch produces a rejection and clears any previously linked structure.
5. The result shows the header status, explicitly **reported** U-Boot CRC outcomes, architecture/compression information where available, and SquashFS declared size where available. It displays **Root: UNKNOWN**, **Signature: NOT VERIFIED** and the caveat that original bytes were not independently opened on the phone.
6. Editing or replacing Passport A, modifying the structure JSON, or leaving the Analysis inspector invalidates linked results. Draft text remains in memory until cleared or reload; results are not automatically saved.

## Security and data boundaries

- Strict bounded JSON; duplicate keys, unexpected fields, impossible U-Boot/SquashFS sizes, forged privilege claims and contradictory header statuses reject.
- Untrusted warnings are validated for basic format but **never echoed back**. Fixed, canonical warnings replace them.
- A self-reported SHA-256 from two imported JSON files establishes that they *claim* the same bytes. This is not cryptographic verification of the source firmware unless those bytes are separately rehashed on a trusted workstation. No digital signature or silicon identity is established.
- No raw firmware, image name, boot address, archive path, credential, private key, router command, session token or native file pointer crosses the mobile report importer.
- The OS has no automatic access to a router or transport through this screen; it cannot perform hardware reads, recovery, flashing, firmware modification, shell execution or decompilation.
- No new network permission, storage dependency or native module is required by this change.

## Tests and acceptance

- Exact same-source acceptance for U-Boot and SquashFS summaries; wrong source digest/size/format reject.
- Immutable summarised reports and canonical warnings.
- Security-projection rejection: field injection, forged trusted firmware or root status, alleged execution/network contact.
- Inconsistent CRC payload completeness or SquashFS plausibility claims reject.
- Browser at an iPhone-sized viewport covers a successfully linked report, a deliberately mismatched hash, invalidation after an edit and navigation away.
- Full foundation tests, browser, TypeScript, Android/iOS and ESP32-S3 CI run on the branch; success must be confirmed on **exact** commit.

Do not mark this work as physical phone acceptance, firmware attestation, real OpenWrt communication or an actual root recovery.
