# APEX upstream source library

This folder contains actual pinned source checkouts for study. Each checkout is an independent Git repository with its original files and licence notices. APEX records these as Git submodules, so the application does not silently absorb their licences or compile their code.

The authoritative copy inventory is `../source-imports.json`. It records the exact commit, checkout path, archive checksum, file count, backup identity and any nested submodules that were not initialised. A recorded reference URL alone is never considered a completed copy.

After cloning APEX, materialise the pinned root checkouts with:

```sh
git submodule update --init --depth 1 -- research/upstream-sources/
```

The separately preserved per-repository archives include the checked-out files and local Git object database. They can restore these exact versions if an upstream changes or disappears. Their persistent identities are recorded in the inventory. Keep those backups separate from volatile working copies.

These are shallow root-repository copies, not complete Git histories. Nested upstream submodules are enumerated explicitly and require separate acquisition before building affected upstream projects. No upstream build script is executed during import. No physical hardware capability is established by copying code.

The earlier conversation is not fully available. Its recovered Mayhem Mobile entry is included, along with Mayhem firmware. Unnamed earlier suggestions remain in the inventory's unresolved list; they must not be silently treated as recovered or invented.
