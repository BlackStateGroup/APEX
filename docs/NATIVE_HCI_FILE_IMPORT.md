# Native supplied HCI file import

The iPhone and Android HCI workbench can load a user-selected btsnoop/H4 file
directly into its existing strict hex draft. This removes the manual file-to-hex
copy step. It does not acquire Bluetooth traffic, open a device, upload a file,
or add a new decoder or dependency.

## Flow

1. Open **Analysis → HCI** in an APEX development build.
2. Tap **Choose native HCI file** and select one file. Its provider must return
   a known size of **16–32768 bytes**. No extension is required; names do not
   validate the capture format. Unknown sizes and oversized files are refused
   whole rather than truncated.
3. Return to foreground APEX and tap **Load selected HCI bytes**. Only this tap
   opens and reads the file. A successful read and close replace the hex draft
   atomically, set the declaration to imported, and clear earlier results.
4. Tap **Inspect HCI metadata**. This parses the unchanged supported btsnoop v1/H4
   profile and hashes the exact decoded bytes. Existing explicit record
   selection, selected-event preparation and separate journal controls remain.

Choose does not read, hash, parse or automatically replace an existing draft.
Load does not inspect, save or authenticate it. Cancellation/read failure retains
the previous draft. Imported provenance describes supplied input, not proof that
the file is a real physical capture. Synthetic files can also be imported.

The web interface retains its existing paste-only strict hex input. Native
controls are selected by Metro's platform resolver, not displayed on web.

## Bounds and file ownership

- Only the selected local `file:///` or `content://` handle is opened. No file
  search, directory enumeration, broad storage grant or persisted URI permission
  is requested. This implementation accepts path-only URIs; query/fragment,
  remote-host file URIs, malformed escapes and control characters are refused.
- Selection labels are bounded and control/bidirectional-format characters are
  replaced for display. Source URI and provider error text never enter UI state.
- The open uses Expo `FileMode.ReadOnly`. Handle size must match the captured
  size before and after reading. Reads request at most **16384 bytes**; shorter
  nonempty chunks are allowed, followed by one extra EOF-byte probe.
- At most 32769 source bytes may be consumed by one import, including its probe.
  This is not a total heap bound or a bound on the OS/provider's own transfer.
- Every returned handle gets a close attempt, including interrupted or failed
  reads. A failed close rejects the result and latches the HCI read gate until
  a full app restart. Both primary and cleanup errors are preserved internally.
  Fast Refresh/module reimport is not a recovery procedure.
- SDK-internal failures before returning a handle remain outside APEX's cleanup
  reach. A stable size does not detect same-size mutation or authenticate a
  snapshot. Hashes describe the bytes returned to APEX, not the original capture
  history, device identity, ownership or completeness.

The picker requests `copyToCacheDirectory:false`; APEX does not request an extra
cache copy. The OS/provider may still download or stage the selected document,
including iOS's import copy. That flow is not promised to be network-free, and
APEX cannot guarantee secure deletion of OS/provider copies. User files are never
written, renamed or deleted.

## Foreground and stale-action behavior

An OS picker may background APEX. Its returned candidate is still only a handle
and requires a fresh foreground Load. Later backgrounding discards it. A read
checks current intent before opening and each new chunk, and again after awaits.
Already issued native work drains before close; cancellation is not assumed to
interrupt native I/O.

Clear, edits, provenance changes, examples, Inspect and navigation invalidate old
handoffs. Old rendered callbacks cannot overwrite newer work. Foreground checks
also consult current AppState before its listener arrives. Unmount does not free
the module-lifetime HCI picker/read slots while their actual operations remain
pending. Expo's existing native picker gate separately refuses another picker
already active in another inspector, such as I/Q; no second SDK was introduced.

The controller's frozen public surface uses the repository's explicit Metro
private-field transform override. Real Expo development/production transforms
are exercised for iOS, Android and web, in addition to Node source tests.

## Remaining acceptance

Host tests exercise the actual native controls and actual HCI owner callbacks
with mocked React Native/Expo bindings, bounded-provider faults and stale action
sequences. They are not native phone, provider or mounted React acceptance.
Metro exports are compiled JS/Hermes bundles, not Xcode/Gradle application builds.

On both iPhone and Android development builds, verify known-good and maximum-size
files, independently calculated hashes, unsupported/truncated capture rejection,
cancel, denied/revoked URI access, unknown/oversized provider sizes, repeated Load,
Clear/edit while pending, background/return and navigation/remount. Verify file
picker contention with I/Q and record provider download/copy behavior separately.
No physical acceptance or live reception is claimed until those checks run.
