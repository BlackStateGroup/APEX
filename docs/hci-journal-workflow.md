# Explicit selected HCI event journal workflow

The Analysis document workbench retains exact bounded JSON. Edit, receive, verify,
and tab navigation never persist. Save is enabled only for a current successful
full verification without a rejected edit, pending verification or pending save.
Save dispatch snapshots the exact selected document through the existing trusted
EvidenceStore, which repeats the binary and whole-event gate. Repeated/stale
callbacks cannot dispatch duplicate concurrent writes. The saved document is
remembered to prevent a repeat click for the same current document.

Saving is not cancelled by edit, Clear or leaving Analysis. Pending status and
completion refer to the dispatched snapshot, not the newest draft. Completion
never restores old interpretations. Refresh failure is reported separately from
successful storage. A backend error reports no confirmed successful save.

HCI journal rows do not automatically reveal raw JSON or advertisers. Explicit
reopen snapshots before awaiting, checks the canonical envelope via the store,
and independently invokes the full byte-hash/legacy reader before revealing a
read-only exact document and four-report pages. Record replacement, lifecycle
leases and generations fence stale results and errors. Original source hash,
size, record index and offset remain UNVERIFIED. Journal observedAt is declared
save time, not authenticated acquisition/capture time.

Bundle inspection now supplies the byte adapter as well as the existing text
hasher. HCI metadata rows distinguish envelope and binary/legacy checks. The
preview still exposes only four metadata rows, without decoded report output,
restore/import/export/share or automatic saving.

Validation is local synthetic controller/storage-mock and static actual-TSX
rendering plus full typecheck. Browser scenarios are authored and listed only.
No browser execution, native build, native acceptance, real user storage,
hardware/radio, provider/network or publication is claimed. Initial failed test
logs are preserved beside successful reruns in verification/hci-journal-ui.

## Editable document action order

In Analysis, input limits, rejected-edit behavior, whole-event privacy and the
original-source/no-authentication warning remain visible before the editor.
Verify, Clear, Save and both live status messages now follow the retained count.
The duplicate selectable JSON follows them behind an initially collapsed
Show/Hide control. The raw input remains visible and unchanged. Save uses the
exact verified snapshot; editing or leaving does not cancel a dispatched save.

The disclosure holds presentation-only state, keyed by exact draft inside a
view keyed by the existing activation lease. A different draft, Clear, or leaving
and returning creates a fresh collapsed presentation, without changing controller
mounts, effect order, receipt handling, verification, staging or save ownership.
The same exact string during one activation has the same disclosure identity.
Read-only Evidence reopening retains its original output order and exact text,
only after explicit verified reopen, with no disclosure or edit/save/stage action.

Static actual-TSX assertions check both disclosure projections, expanded semantics
in narrow native mocks, inert exact whitespace/content, source order, save states
and reset keys. These are not mounted React, phone scrolling, keyboard or assistive
technology acceptance tests. Evidence is in `verification/hci-document-actions/`.
