# Analysis inspector chooser: independent host/source review

Reviewed production implementation `fd789a1`, with builder validation tip
`a5684ad`, from `c14cbc1`, in the independent `apex-inspector-review` worktree.
No changes were made to the integration worktree or production files.

## Result

No blocking functional regression reproduced within host/source review scope.
Early review found IR/HCI controller status messages still describing only
Analysis-tab exit; the builder corrected these alongside the inspector view copy
before the reviewed commit. BLE authoring and phone NDEF positional descriptions
were also checked against the new separate-inspector layout.

Added 13 independently authored checks in
`tests/analysis-inspector-independent.test.ts`:

- Nine exact IDs, default Recording, invalid values, and all four exact routes.
- New IDs even for equal bytes; duplicate/reconstructed/stale IDs rejected,
  malformed IDs do not consume a subsequent valid source, and exact phone
  platform/receipt/document fields survive source creation.
- App source checks for stable unconditional component positions, exclusive
  active expressions, a single Recording controller, chooser opening independent
  of activation, explicit selection/close/Analysis/scroll commands, and no
  analysis/save/draft action within selection.
- Both Devices BLE source callbacks, exact phone capture handoff, successful
  Stage before navigation, and inline Evidence reopen without Analysis import.
- Source-only incoming effects before inactive returns; no active dependency;
  retained BLE authoring child behind the existing display-none wrapper.
- Deferred old IR/HCI hash success and rejection after an exit and a completed
  newer inspection cannot replace the newer report. Old leases cannot edit;
  declaration/draft and rejected-edit fences survive exit/re-entry.
- BLE and phone NDEF save success/failure after newer edits preserve newer
  drafts and invalidate results; pending saves block duplicate save/interpret;
  stale finish cannot revive results. Reopening the exact saved draft remains
  consumed after success and retryable after failure. Source checks ensure
  snapshot inputs are saved and completion is committed before evidence refresh.

Existing chooser-aware Playwright scenarios were source-reviewed, including
separate serialized/phone NDEF switching, BLE Stage routing, Recording save
races, trial authoring retention, IR/HCI exit behavior, and the new nine-choice
scenario. The top-level tab list remains Console, Devices, Analysis, Evidence,
Research. Native observation activation remains tied only to Devices, with
existing tab-leave cancellation unchanged.

## Commands and raw evidence

All commands used the existing approved node_modules via a sibling symlink.
No install, browser launch, device operation, native build, provider connection,
settings/credentials change, or publication was attempted.

Environment: CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1
npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false
npm_config_fund=false.

- `node --test tests/analysis-inspector-independent.test.ts`: 13/13 pass.
  Raw: `verification/analysis-inspector-independent/host-first.log`.
- Focused run below: 111/111 pass, zero failures/skips.
  Raw: `verification/analysis-inspector-independent/focused.log`.
- `npm run typecheck`: pass.
  Raw: `verification/analysis-inspector-independent/typecheck.log`.
- `npm run test:ui -- --list`: 35 scenarios discovered, not executed.
  Raw: `verification/analysis-inspector-independent/ui-list.log`.
- `git diff --check`: pass before review commit.

Focused command:

```
node --test tests/analysis-inspector-independent.test.ts tests/analysis-navigation.test.ts tests/ble-workbench.test.ts tests/phone-ndef-workbench.test.ts tests/ndef-workbench.test.ts tests/recording-workbench.test.ts tests/ble-trial-workbench.test.ts tests/ble-trial-authoring-workbench.test.ts tests/ble-candidate-workbench.test.ts tests/flipper-workbench.test.ts tests/ir-workbench.test.ts tests/hci-workbench.test.ts
```

## Limits

These are actual controller/reducer/helper checks and source-wiring assertions,
not mounted React event/effect acceptance. No claim is made about real browser
layout, keyboard/focus/accessibility, scrolling, native teardown or device
behavior. Playwright discovery is not a browser pass. No aggregate/full-suite
run was requested or performed here. The later component-only static NFC work
is not included in the nine-inspector scope. Final integration needs its own
checks after combining branches.

## Static disclosure follow-up

The parent's later full aggregate caught an existing IR static-render assertion
missed by the original focused selection: it expected `/Leaving Analysis clears/`
after production correctly changed to inspector-or-Analysis exit. This was a test
expectation regression, not evidence of an IR lifecycle failure. The original
review did not run the static suites and did not claim a full aggregate pass.

Independently reproduced the old assertion failure in
`verification/analysis-inspector-static-followup/before-fix.log` (32 tests,
31 passed, one failed). Reviewed builder commit
`dfcda8148a139f0ebecf37f52065f7480c3dc8e1`, cherry-picked locally as `31b3af0`.
It changes only the exact static disclosure assertion plus builder logs; no
production wording or behavior was reverted. The assertion now matches the full
sentence `Leaving this inspector or Analysis clears inspection results.` with
an escaped literal period, retaining the pending-hash and prohibited-action
checks adjacent to it.

Ran the following under the same offline environment safeguards:

```
node --test tests/ir-static-render.test.ts tests/ir-independent-static.test.ts tests/hci-static-render.test.ts tests/hci-render-boundaries-review.test.ts tests/analysis-navigation.test.ts tests/analysis-inspector-independent.test.ts
npm run typecheck
```

Result: 37/37 tests passed; typecheck passed; `git diff --check` passed. Raw logs:
`verification/analysis-inspector-static-followup/after-fix.log` and
`verification/analysis-inspector-static-followup/typecheck.log`.
Static TSX rendering is covered here, but mounted effects, browser/native actions,
keyboard/focus/scroll and accessibility acceptance remain unrun. Parent owns the
new full aggregate rerun and preserves its original failing output separately.
