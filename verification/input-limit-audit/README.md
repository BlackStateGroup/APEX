# Offline input-size audit

Base: f8aa135. Controller/source-level verification only. No browser, native,
provider, network or device actions were performed. No dependencies installed.

## Confirmed narrow gap and correction

The Recording input was the only offline document TextInput with a platform
`maxLength` (262144). Its controller checked length only during analysis. A valid
NEC JSON, CAN log or REA JSON padded to that boundary, followed by invalid text,
has an acceptable prefix if an upstream widget truncates it. Host tests model
that truncation explicitly; they do not establish behavior on any browser/phone.

Remove that widget cap and reject the whole incoming edit in RecordingWorkbench
before parsing or retaining it. Keep the prior bounded input, format and fixture
provenance unchanged; discard the analysis/save candidate and show a rejection.
Repeated Analyse stays blocked until an accepted edit or fixture/import action.
This avoids interpreting the previous draft as the failed paste. The parser's
size guard remains defense in depth. Exact 262144 UTF-16 code units are accepted;
262145 and larger are refused. No summary schema/source labels changed.

Tradeoff: React Native must deliver the attempted string before the O(1) length
check can reject it. This is not an OS clipboard-allocation or transient widget
memory bound. The controller never retains or parses the oversized value and
never substitutes a truncated prefix. The previous bounded draft remains visible
for recovery; its report is deliberately unavailable until a new accepted edit.
No foreground or native guards changed.

## Other offline inputs reviewed (unchanged)

- BLE trial dataset and candidate document reject complete edits above 196608
  and 262144 code units, respectively, retain previous draft, and clear results.
  Their explicit Analyze can reanalyse that retained draft; no automatic parse
  or prefix replacement occurs. UI has no maxLength.
- Serialized NDEF, phone selected-field NDEF, BLE envelope and selected-source
  BLE retain exact edits and clear findings. Their import/evidence validators
  reject limits on the full document. Some imports can be previewed above the
  smaller 4096-character journal limit, with saving disabled and an explicit
  warning. This is intentional preview-vs-save policy, not partial source saving.
  These existing controllers retain oversize edit strings; this patch does not
  expand that behavior or change their established exact-source policy.
- BLE authoring form fields are declarations/aliases/receipt references, not
  pasted evidence documents. The UI rejects whole edits above 128 characters,
  retains the prior field, clears built output and warns. Core validates entry
  sizes atomically. Staged evidence is validated as a complete exact document,
  with no reconstruction. Export budgets include JSON escaping.
- Catalogue search is a UI filter rather than evidence input. Pagination slices
  in summaries are display limits, not truncation of source documents. CAN trims
  grammar whitespace and omits blank lines; it validates every remaining line
  and rejects the complete oversized input before line parsing.

## Checks and limits

All commands use CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1
npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false
npm_config_fund=false. Existing approved app/REA node_modules were linked locally.

- `node --test tests/recording-workbench.test.ts`: 10/10 passed (focused.txt).
- `npm run typecheck`: passed (typecheck.txt).
- `npm run firmware:build`: passed C checks (firmware.txt), run before full suite.
- `node --test --test-concurrency=2 tests/*.test.ts`: 578/578 passed (full-suite.txt).
- `git diff --check`: passed.
- New Playwright acceptance scenario covers all three formats, rejected-paste
  recovery, repeated Analyse and tab changes. Authored only; NOT EXECUTED.

Host regressions cover all three formats at the exact boundary, rejected suffix,
retained provenance, repeated analysis, blocked persistence, edit/fixture
recovery, pending-save completion and source-level absence of the widget cap.
