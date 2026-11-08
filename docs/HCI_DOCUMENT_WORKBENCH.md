# Selected HCI event document workbench

## Explicit workflow

1. In Analysis → HCI captures, paste bounded contiguous hex, declare provenance,
   and explicitly inspect metadata. Example loading does not inspect.
2. Explicitly select a valid legacy event. Selection does not prepare a document.
3. Choose **Prepare selected event document**. The existing reviewed core builder
   validates and copies the whole selected event, then hashes its binary derivative.
4. Choose **Open prepared HCI document**. The exact prepared JSON is delivered once
   using the existing monotonically increasing selected-source ID pattern. This
   routes to the separate HCI selected event document inspector, without verification.
5. Choose **Verify/reopen HCI document** to check the binary derivative digest and
   whole legacy framing. Manual paste is supported through the same controller.

The original ten inspector IDs/routes remain; `hci-document` was added as the
eleventh choice chronologically, not as the current array’s eleventh entry.
All inspector components remain stable across chooser/tab navigation. BLE, trial,
phone and other inspector workflows are unchanged. The explicit journal follow-on
is described in [HCI journal workflow](hci-journal-workflow.md).

## Boundaries

- Uses only `createHciLegacyEventDocument` and `readHciLegacyEventDocument` for the
  format. No core contract or native digest implementation changes.
- Exact JSON is retained and displayed as inert, selectable text. Imported JSON is
  never trimmed, normalized, rewritten or automatically verified. Whole edits over
  4096 UTF-16 code units (including surrogate pairs as two units) are rejected;
  previous draft remains and verification is fenced until accepted replacement or
  Clear. Syntax validation occurs only on explicit verification.
- No file import/export/download, automatic persistence, sharing, clipboard
  writes, radio, device or provider actions are introduced. Explicit local Save
  is available after successful current verification; see the journal workflow
  for exact-snapshot and pending-write semantics. User-driven selection of text
  is not an app copy/export action.
- Whole selected events can contain multiple advertisers and sensitive arbitrary
  vendor content. Only unrelated records are excluded.
- Original-source hash/size/index/offset claims remain **UNVERIFIED** on reopen.
  Derivative verification covers binary header plus record, not JSON/hex text or
  original capture. Provenance and label are shown exactly as operator declarations.
  Digest/framing acceptance is not authentication, physical reception, ownership,
  device identity, completeness or truthful timing. The hash adapter remains trusted.
- Reports use derivative-relative offsets and four-item pagination. Shared pure
  summary projection and view preserve AD framing and service/BTHome status counts,
  avoiding full nested decoded values. URI/text is inert; no pooling/reassembly.
- Controllers have private mutable internals and frozen public state. Active
  leases and generation fences reject stale callbacks and late hash settlements.
  A repeated selection fences old preparation, including the same record selected
  again. Edits, rejected edits, Clear and exits clear old derived results. Pending
  work is fenced, not cancelled. Source IDs are consumed once even while hidden.
  Opening consumes the prepared document before App handoff, preventing replay.

## Initial memory-only verification scope

The historical checks below cover the first UI increment. Current combined
verification is linked from [VERIFICATION.md](VERIFICATION.md); explicit journal
follow-on checks are documented separately.

Builder evidence is in `verification/hci-document-ui/`:

- `node --test tests/hci*.test.ts tests/analysis-navigation.test.ts`: **107 passed**.
  Includes core regression, original HCI privacy/default rendering, new controller
  races, exact input/rejection, nonfirst-record privacy markers, source-once routing,
  and actual TSX rendering under narrow React Native primitive mocks.
- `node node_modules/typescript/bin/tsc --noEmit`: passed on final source.
- `node node_modules/@playwright/test/cli.js test --list`: **37 discovered**;
  includes an authored explicit prepare/open/reopen scenario and updated chooser.
  **No browser scenario was executed.** Discovery is not acceptance evidence.
- `git diff --check`: passed.

Original first typecheck failure is retained: mechanical extraction duplicated two
initial-state keys. This was corrected before subsequent successful checks. Earlier
focused and typecheck runs are retained rather than overwritten. Static rendering
executes no effects/events or platform callbacks and does not prove browser/mobile
behavior. No dependency installation, network, native build, device or remote action
was performed. Independent review and aggregate checkpoint remain parent-owned.
