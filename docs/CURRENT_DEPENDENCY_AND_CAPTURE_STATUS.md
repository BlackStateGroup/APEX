# Current dependency and NFC capture status

Source-reviewed on 8 November 2026 against packaged checkpoint v40,
`edb0c714f9bb5b7a26c56890929d00e1560d4541`. This additive status note qualifies
the preserved [historical licensing inventory](LICENSING.md) and
[historical source-mining register](../research/SOURCE_MINING.md). Their
reference-only BLE/NFC labels and blanket “Does not retain NDEF payloads” statement
must not be read as current runtime/capture descriptions.

## Reference pins are not runtime releases

The historical R15 reference checkout is pinned at
`92a496d60f81642d2f45cecfc44f47a62904a86d`; R16 at
`c44f7110f791901823252610627dc5cbee7dddcd`. These research commit identifiers are
not asserted to be the source commits of the installed npm releases. No copying
of reference-checkout source into APEX is claimed here.

[package.json](../package.json) and [package-lock.json](../package-lock.json)
actually include `react-native-ble-plx` **3.5.1** and
`react-native-nfc-manager` **4.2.0** as runtime dependencies. They are used by
[src/platform/bluetooth.native.ts](../src/platform/bluetooth.native.ts) and
[src/platform/nfc.native.ts](../src/platform/nfc.native.ts), respectively.
The already installed packages used by the continuation were inspected read-only:

- **PLX 3.5.1:** `node_modules/react-native-ble-plx/LICENSE` contains the
  **Apache License 2.0**, while that package's `package.json` declares **MIT**.
  The lockfile and [npm dependency inventory](../research/npm-dependencies.json)
  also report **MIT**, faithfully recording declaration metadata. This discrepancy
  is unresolved; the inventory is not a selected-file license audit or clearance.
- **NFC manager 4.2.0:** `node_modules/react-native-nfc-manager/LICENSE` contains
  **MIT**, copyright Richie Hsieh and Revteltech; package metadata, lockfile and
  inventory also declare MIT.

The inspected installed-tree files have these SHA-256 values (package-relative
paths, not reference checkout files):

| File | SHA-256 |
| --- | --- |
| `react-native-ble-plx/package.json` | `444d4ca4869195ce4919c3eed4d66c9fa511bfe4997f15382f90c49a020cd279` |
| `react-native-ble-plx/LICENSE` | `f6387df69841a4423411e83f739fd4e4b80dc0622d3da948f67d9606e9d996fe` |
| `react-native-nfc-manager/package.json` | `d7b01e3f9378096baa684905e738c5ddaf47fee2f476a68c54dd4550bd77aaa7` |
| `react-native-nfc-manager/LICENSE` | `2d3795e77cfd1f3e1e4873e87a70d997e7996f80d9815f238236494bb76e2996` |

No reinstall, tarball fetch or independent tarball-to-installed-tree comparison
was performed for this note. The unchanged lockfile SHA-256 is
`8a9d0da060c260fb3009fecf79036c22fde1faf2737c0a5f4bf4c629901f1e74`, matching
the inventory's recorded lockfile digest. Resolve the PLX discrepancy and review
selected files, notices, transitive/native SDK components and distribution
obligations before release. Neither these observations nor historical intake
labels constitute legal clearance.

## Two distinct NFC workflows

1. **Legacy metadata reader:** [normaliseNfcTag](../packages/core/nfc.ts) retains
   bounded tag ID/technology metadata and record TNF/type/payload lengths, not
   record payload bytes. [App.tsx](../App.tsx) still automatically saves its native
   observations as `nfc.metadata` in the local Evidence journal. The historical
   no-payload statement describes this path, not all current NFC functionality.
2. **Explicit one-tag selected-field capture:** the Devices card uses
   [PhoneNdefCapture](../packages/core/phone-ndef-capture.ts) through the shared
   native backend/session controller. An explicit foreground Start accepts at
   most one callback within a 30-second window including preparation. The strict
   [adapter](../packages/core/nfc-manager-ndef.ts) copies selected OS-normalized
   record **TNF, type, optional record ID and payload** into a new bounded JSON
   document. Tag ID/technology and original wire framing are not retained in that
   document. Cleanup must settle before Inspect is offered; timers alone never
   establish native release. Web acquisition is unavailable.

For the new path, the document is **memory-only until explicit local Save**.
Inspect transfers the exact document and platform to the offline phone NDEF card,
replacing its draft. Interpretation and saving are separate user actions, with no
automatic interpretation display or save. The
[workbench](../src/PhoneNdefWorkbench.tsx) and
[state/replay contract](../src/phone-ndef-workbench.ts) preserve this separation.
The existing `analysis.ndef-source` journal kind stores the selected-field source
document, not a trusted projection. Replay verifies a private snapshot's SHA-256
before deriving the interpretation again. The journal document limit is 4,096
UTF-16 code units versus the adapter's 40,000; oversize saves are rejected, not
truncated. A digest detects local changes, not authentic reception or identity.

Android's inspected bridge emits record IDs as contiguous uppercase hex strings;
iOS emits unsigned byte arrays. The importer preserves Android hex spelling,
accepts bounded mixed/lowercase hex imports, and rejects platform mismatch rather
than guessing. Both use byte arrays for type/payload. Missing optional record ID
is distinct from an empty ID, and a record ID is not an authenticated tag identity.
See [the SDK field contract and later capture additions](NFC_MANAGER_NDEF.md) for
exact inspected native paths, availability distinctions, bounds and provenance.

These are selected **OS-normalized fields**, not recovered original NDEF wire
bytes, RF samples, secret keys, tag cloning, emulation or authenticated access.
Untrusted payload text/URIs remain inert; these workflows do not open URLs or
send payloads to model providers. App receipt time and journal save time do not
establish RF/source capture time. Host/facade checks use simulated native bridges;
real native builds, OS callback ordering, release behavior and physical phone/tag
acceptance remain separate unrun gates. See the [phone acceptance plan](PHONE_ACCEPTANCE_PLAN.md)
and [native-build audit](DEVICE_BUILD_AUDIT_20261108.md).

## Preservation check

This documentation-only reconciliation leaves production sources, dependencies,
lockfile, inventory and verification gates unchanged. Both protected historical
originals match [v40 source checks](../verification/increment40-final/source-checks.json):

- `docs/LICENSING.md`: `a65a8972072e059894bf55c6faf5b296fe732869b3cf7af463cc316ab8cf642e`
- `research/SOURCE_MINING.md`: `9574be04f527eace24d6b6daf1f59d790e70c0961b86d2f35ca0955925024cf8`

Verification here is source inspection, digest comparison and documentation diff
checking only. No tests, builds, browser, native SDK, device or radio actions were
performed for this addendum.
