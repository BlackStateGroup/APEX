# Source receipts

[INVENTORY.md](INVENTORY.md) lists every registered upstream root, exact immutable commit, recorded licence assessment, preserved archive SHA-256 and missing nested sources. [recovery-inventory.json](recovery-inventory.json) is the portable restoration receipt, including licence-file hashes and all 63 unmaterialized root Git links.

These receipts record the independent 8 November recovery review: 31 roots, 32 archive parts, 1,986,961,997 archive bytes and 164,492 tracked entries. They do not ship 1.99 GB of source in this documentation change. The actual restored corpus was kept separate from the active application checkout. Source availability is distinct from code integration, build dependency closure, licensing clearance and physical compatibility.

Use [the original acquisition manifest](../../../research/source-imports.json), [preservation guide](../../../research/SOURCE_COPIES.md), and [existing restore tool](../../../tools/restore_source_archives.py). Archive access requires the owner's stored copies; Git links do not embed nested content. Verify archive hashes, safe extraction, exact HEAD and clean tree in a new destination before use. Do not silently fetch a replacement branch or run upstream scripts.
