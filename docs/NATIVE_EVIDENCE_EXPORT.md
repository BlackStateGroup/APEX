# Selected journal export and native text sharing

The Evidence tab now provides a separate **Export selected local evidence** card.
It prepares selected exact stored records in the existing `apex.selected-evidence`
format. iPhone and Android development builds can pass that prepared document to
the system share sheet as text. This is not an automatic backup, file export,
journal restore, remote sync, or proof of delivery.

## Explicit workflow

1. Tap **Load local records for export**. The card reads up to the latest 100
   records through the existing local backend. Nothing is selected automatically.
2. Select individual record IDs. Four metadata rows are shown per page. Metadata
   is structurally checked, but its content digest is unverified at this stage.
   Payloads are not displayed in the selection list.
3. Tap **Prepare selected evidence bundle**. Only the selected exact stored
   strings are used, in selection order. Every selected record's existing v1
   canonical content digest is checked, including HCI binary derivative checks
   when applicable. A whole-bundle digest is computed and then read back through
   the existing verifier. This deliberately repeats the selected-record hashing
   before exposing output. An invalid selected record rejects the entire result.
4. For a suitably small bundle, review the exact selectable text. In a native
   development build, **Share prepared evidence text** opens the OS sheet with
   the whole document, including payloads, identifiers and timestamps. Choose the
   destination yourself. Preparation alone does not share anything.

Each successful preparation receives a new, monotonic in-memory ID. Each ID
allows one share attempt, even if callbacks are repeated or the API returns
immediately. Preparing the identical text again still creates a fresh ID. After
an ordinary completed attempt, explicitly prepare again to attempt another.

The source strings are preserved exactly, including whitespace. Individual
record hashes continue to use their existing canonical content rules. The
bundle hash covers the canonical envelope, order and exact record strings, not
outer bundle formatting. Export time is a local-clock declaration. Digests are
not signatures and do not authenticate the source, record time, ownership,
physical reception, completeness or chronology.

## Bounds and lifecycle

- At most 100 records are loaded. Stored documents retain the existing 16384
  UTF-16-code-unit limit. Invalid backend types, oversized replies, malformed
  records and duplicate IDs reject the list as a whole.
- The core bundle limit remains 2097152 UTF-16 code units. Exact text display
  and native sharing have a separate conservative **262144 UTF-8-byte** limit.
  Larger preparations require fewer selected records; no partial document is
  displayed, shared or silently truncated. This application bound is not a
  guarantee about any operating system or recipient limit.
- The exact loaded documents are private in-memory snapshots. Later journal
  saves are not included until an explicit new Load. Listing invokes no write
  or digest in the export API and does not rebuild strings from parsed records.
  The existing native backend may create or initialize its SQLite database on
  first use; this export flow does not insert, update or delete evidence rows.
- Selection changes invalidate the prepared output. Load, Clear, tab exit,
  backgrounding and unmount discard selection and prepared text. No automatic
  journal read occurs on mount, tab return or foregrounding. Already-issued
  native sharing cannot be recalled.
- Current state and activation leases guard rendered actions. Source changes
  fence pending list/hash results. Hash guards stop additional work after an
  outstanding hash settles when its preparation has been superseded.
- Live AppState is checked before actions, in addition to lifecycle listeners.
  The share gate survives component remount while a native API request remains
  pending. A native rejection, synchronous dispatch error or unexpected result
  leaves delivery uncertain and blocks further native share dispatch until app
  restart. Fast Refresh/module reload is not a safe recovery procedure.

## Native API limits

The installed React Native Android implementation resolves `sharedAction`
immediately after launching the chooser. That result does not establish
dismissal, a selected recipient, completed transfer or delivery. The gate owns a
pending API request, not the entire Android chooser lifetime. iOS reports a
separate dismissal result, which also is not a delivery receipt. UI text makes
these limits explicit instead of saying the document was sent.

APEX supplies only text and a title to React Native Share. It does not create a
temporary export file, change permissions, choose a recipient, open an external
URL, write the clipboard, or add a dependency. The user may choose OS-provided
actions, and the OS/receiving app controls its own copies. Clearing APEX cannot
recall those copies. A receiving app may alter or truncate text; verify the
received bundle using the existing preview before relying on it.

On web, the same explicit local selection/preparation workflow provides bounded
selectable text. The platform component has no browser share, clipboard write,
download or network action. The existing pasted-bundle preview remains a
separate unchanged card with no store access.

## Validation and remaining acceptance

Host tests cover every stored kind, exact whitespace, selection, tampering,
repeated preparation IDs, failure atomicity, stale work, real owner callbacks,
native component callbacks with mocked bindings, UTF-8 bounds, module gates and
actual Metro platform resolution. Real Expo transforms exercise the frozen
controller on development and production iOS, Android and web.

These are not mounted React or physical phone tests. Metro exports are compiled
JavaScript/Hermes bundles, not Xcode/Gradle applications. No actual share sheet
or recipient transfer was exercised. Before claiming native acceptance, test
both platforms with small and boundary-size selections, Unicode and long labels,
cancellation, immediate return, background/navigation while hashing, repeated
buttons, tab return, recipient modification/truncation and denied/error paths.
Compare the received exact record strings and run whole-bundle verification.
No delivery, native chooser closure, device performance or full-backup guarantee
is made.
