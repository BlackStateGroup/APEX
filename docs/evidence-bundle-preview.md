# Offline selected-record bundle preview

The Evidence tab includes a separate memory-only pasted-bundle card. It does not access the journal, reconstruct record strings, import/restore records, write files, offer exports/sharing/copy actions, open URLs, or call providers/hardware. Existing Evidence list/verify/reopen behavior is unchanged.

- Explicit Inspect uses the existing `readEvidenceBundle` validator, without schema or digest changes.
- Maximum draft: 2,097,152 UTF-16 code units. Oversized edits are rejected whole, keeping the previous draft but clearing results. Inspect remains blocked after rejection until an accepted replacement edit (including explicit same-draft re-entry) or Clear. Exactly-at-limit drafts remain inspectable.
- Existing core bounds: 1–100 unique-ID records; maximum 16,384 UTF-16 code units per exact record string. Duplicate decoded JSON keys, malformed envelopes and either digest failure reject the entire report.
- Four metadata summaries per page; record timestamps display at most 120 UTF-16 code units with explicit truncation and original-length disclosure. No payload projection or reconstructed documents. Exact record strings remain in the validated in-memory report.
- Whole-bundle digest checks canonical envelope/list order/exact embedded record strings, not outer JSON formatting. Individual record digests retain existing canonical v1 content rules. Neither authenticates author/source/timestamps/ownership/reception, nor proves a complete journal or chronological ordering.
- Published state and nested verified data are immutable frozen snapshots, with runtime-private controller state. Activation leases reject queued controls from older tab activations. Every edit (including rejected oversized edits), clear, new Inspect and tab deactivation invalidates older async success/error. Leaving Evidence clears the report and retains only the draft; returning requires Inspect again. Reload loses the draft. Already-started digest work may continue after deactivation; only result publication is fenced, not the underlying hashing.

## Verification limits

Focused tests cover controller transitions, at/over draft limits, digest/duplicate failures, stale async success and failure, pagination, and the actual TSX static projection with narrow React Native primitive mocks. Static rendering does not execute UI events/effects, measure layout, or establish browser/native acceptance. Full aggregate and export are intentionally not run by this worker.

Browser and native acceptance: **NOT RUN**. Prior browser execution was blocked/denied; no retry was attempted. When an authorized environment is available, manually check:

1. Paste an existing valid mixed-record bundle, Inspect, read both digest caveats, page through four rows at a time. Verify journal list is unchanged.
2. Edit, clear, and paste an oversized replacement after success. Results must disappear and no text may be partially accepted/truncated.
3. Leave Evidence while validation is pending, return, and ensure no previous success/error reappears. Draft remains, requiring Inspect.
4. Rapidly repeat Inspect or edit while pending; only the latest draft's explicit inspection may report. Confirm Clear stays usable during hashing.
5. Inspect malformed JSON, duplicate decoded keys, valid outer digest with invalid inner digest; no partial summaries.
6. Check small-screen wrapping, long timestamps/IDs/digests, input scrolling, accessibility controls and disabled page boundaries on web/iOS/Android. Confirm all strings/URLs are inert and no automatic actions occur.

## Correction verification

Independent review identified mutable state/report aliases and an unbounded legacy timestamp display in the original implementation. Runtime-private state, frozen controller/snapshots/nested report data, blocked inspection after rejected edits, activation leases and bounded timestamp excerpts repair those issues without changing core parsing or digest rules. Both original independent failure evidence and repair-run logs are retained.

The repair's second focused run had one test assertion failure: it hard-coded the padded timestamp's length incorrectly. The assertion now derives the exact original length; the failure log remains unchanged. Final focused verification includes 22 passing tests (including the independent regressions), and typecheck passes. The added Playwright acceptance scenario is executable and discovery lists 31 total cases, but discovery is not acceptance execution. Browser/native remain NOT RUN.
