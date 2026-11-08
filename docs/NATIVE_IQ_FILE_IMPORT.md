# Native supplied I/Q file import

The iOS and Android I/Q workbench now has an OS document-picker path for an explicitly selected SigMF pair. This is offline analysis of supplied bytes, not phone RF acquisition. The supported SigMF metadata/data profile and analysis modes are unchanged.

## User flow

1. Open **Analysis → I/Q** in a development app rebuilt with the new dependencies.
2. Tap **Choose native I/Q pair** and select exactly one file ending in `.sigmf-meta` and one ending in `.sigmf-data`. Selection order does not matter. Names do not authenticate the source or establish that the files belong together.
3. Back in the foreground app, check the bounded labels and tap **Stage selected I/Q pair**. The pair is staged atomically, without reading or hashing either file.
4. Tap **Inspect staged I/Q pair** to read and inspect the exact returned bytes. The existing FFT, selected-window energy, and time-frequency controls apply as before.

Cancellation does not stage a new pair. Unsupported names, missing provider sizes, invalid sizes and nonlocal URI schemes are refused. If native bindings are unavailable, rebuild the development app; synthetic examples remain usable. No additional app permission prompt is requested by this path.

## Bounds and ownership

- Metadata: 1–65,536 bytes. Data: 4–262,144 bytes, divisible by four. Both captured sizes are checked before either source read begins.
- The picker requests `multiple: true` and `copyToCacheDirectory: false`. There is no application-managed staging copy, upload, durable URI store, broad storage grant, or persisted URI permission.
- The native adapter opens only the returned `file:///` or `content://` URI with `FileMode.ReadOnly`. It checks the opened handle's size, reads at most 16,384 bytes per request, accepts shorter nonempty chunks, probes one extra byte for EOF, and checks size again. Unknown handle sizes fail closed.
- A successful pair contains at most 327,680 source bytes. The two one-byte EOF probes mean the reader can consume at most 327,682 bytes if the sources grow. This is not a total heap bound or an OS/provider transfer bound.
- Handles close in `finally`, including errors and short reads. A failed close refuses the import. Reads are sequential. Every Inspect reopens and rechecks the selected handles; no prepared-analysis cache is reused.
- A same-length source modification during reading is not an authenticated snapshot. Hashes describe the exact bytes returned to APEX, not source identity or acquisition history.

The system/provider may download or temporarily copy selected files before returning their handles, including iOS's document import copy. APEX cannot bound that OS/provider work or promise secure deletion of those copies. `copyToCacheDirectory: false` prevents Expo's *additional* cache copy. User originals are never written, renamed or deleted.

## Lifecycle

OS pickers can send the app to the background. The analysis controller still drops old source handles/results and fences outstanding reads/hashes. It does not suspend its ordinary foreground policy for the picker.

The separate picker session retains no file bytes. A returned pair becomes a candidate only and always requires a new foreground Stage tap. Clear, either synthetic example, replacement selection, and unmount invalidate picker candidates/results. Background after picker settlement releases the candidate. Navigation before lazy native binding load is checked again before opening the system picker. Picker cancellation is not promised; a module-lifetime gate retains one actual OS picker slot across component unmount/remount until settlement. Choose and Stage callbacks must still match the rendered candidate state, so a stale callback cannot consume a replacement pair.

Physical provider behavior varies. Revoked URI access, unsupported/nonseekable providers and unavailable size metadata fail closed. Selection is not persisted across app restart.

## Dependencies and licences

- `expo-document-picker` 58.0.4, MIT, is added using Expo SDK 58's bundled compatible range (`~58.0.4`).
- `expo-file-system` 58.0.13, MIT, is promoted from the existing transitive dependency to a direct compatible dependency (`~58.0.13`).
- The lockfile and generated npm dependency inventory are updated. No upstream implementation source is copied into application code. No iCloud entitlement/config plugin or new permission settings are added.

## Verification and remaining acceptance

Host tests cover the bounded reader, exact byte hashes, malformed assets, length changes, partial reads, failures/close, repeated selection, cancellation, stale results, explicit staging, navigation and background. The actual native TSX is exercised with mocked Expo and React Native bindings; these tests do not establish physical OS/provider acceptance.

Physical iPhone and Android acceptance remains unrun. Before claiming it, verify with real local-files providers: valid and maximum-size pairs, mixed selection order, cancel, one/three files, unknown-size provider refusal, oversized data, access revocation, repeated Inspect, background/return, Clear while pending, navigation away, and a fresh development-build install. Compare reported hashes against a separate known file hash. Test cloud providers separately and record their download/copy behavior; do not label that flow as network-free.
