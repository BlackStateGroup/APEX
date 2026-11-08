# Independent readiness settlement review

Approved for local integration: runtime commit
`27effc528f66028684fed383d469f38a1ac28268`.
A fresh full repository aggregate remains the parent's integration gate. This
review is not a native/device acceptance or release/readiness certificate.

## Isolation and method

Created a new independent clone, apex-readiness-independent-review, from the
builder repository; no builder checkout edits. Reused existing node_modules only,
without installation or dependency changes. Reviewed the repository continuation,
software-engineering guidance, original reproduction, actual adapter and pinned
installed PLX 3.5.1 published ESM. Tests use unchanged ESM loading and synthetic
React Native/native boundaries. Explicit alternate-contract tests replace the
SDK method only to exercise defensive ordering and malformed return shapes.

Initial candidate: 873062e8309613b14099a3706f82acc5995a6e44.
Base: 4623faea6a851e9799f7a5730e351e22f055df63.
Original reproduction import: 8988d40.
Current source hashes and verified manifests are in inputs.json.

## Finding, correction, and independent evidence

The initial 55 focused cases passed independently. Running the original
three-mode reproduction with the old base adapter independently confirmed:
event callback escape and pending connect; initial-state unhandled rejection
and pending connect; alternate synchronous callback permitting native connect
after cleanup failure. Original reproduction bytes remain unchanged.

The exact initial 55 tests against the old runtime produced 9 passes / 46 failures.
These failures, including captured async uncaught behavior, are preserved in
independent-before-focused.log; they are intentional before evidence, not
current failures.

Independent adversarial tests found a missing-handle defect: a synchronous
PoweredOn callback followed by null/undefined onStateChange return was accepted
by optional subscription removal. Readiness resolved and issued connect.
initial-adversarial.log preserves the two failures (3 other cases passed).
The builder corrected this in 27effc5 by checking cleanup capability within
the registration boundary; this rejects and latches lost SDK ownership.
No production edits were made by the reviewer.

Final combined consumer run: 157 passes, zero failures/skips/cancellations.
That is 145 builder/consumer cases plus 12 independent cases, not an additional
157 distinct cases beyond the focused suites. Full TypeScript check passed.
Commands:

- node --test tests/plx-readiness-independent.test.ts tests/plx-readiness-settlement.test.ts tests/plx-facade-scan.test.ts tests/plx-scan-independent.test.ts tests/plx-ios-scan-void.test.ts tests/plx-unissued-acquisition.test.ts tests/plx-facade-c.test.ts tests/app-plx-cancellation.test.ts tests/app-plx-independent.test.ts
- node_modules/.bin/tsc --noEmit

Final logs are final-consumers.log and final-typecheck.log (empty successful
typecheck output). No firmware build was run; C-consuming tests reused the
existing consumer fixture.

## Reviewed boundaries

- Terminal outcomes wait until registration completes; synchronous callbacks
  cannot publish success before cleanup is available.
- Explicit error presence preserves thrown undefined/null/false/0/empty string
  and hostile objects without arbitrary conversion. Single causes retain identity;
  multiple causes retain readiness/registration/timer/subscription/abort ordering.
- Cleanup is independently attempted. SDK event callbacks and initial-state
  continuations do not receive cleanup exceptions. Reentrant terminal callbacks
  cannot replace the original outcome or remove twice.
- Genuine SDK registration/removal uncertainty latches manager health and
  readiness cleanup unknown. Missing/malformed handles fail closed.
- Local timer and AbortSignal add/remove faults reject without restart-latching
  when SDK ownership is not uncertain. Independent all-falsy add failures and
  combined add/remove faults also verify no SDK listener was registered.
- Concurrent stale preparation tests prevent connection success after shared
  uncertainty. New acquisition and shutdown/exclusive destruction/reset are
  fenced; existing owned connection cancellation remains usable.
- Ordinary PoweredOff/Unauthorized/Unsupported, cancellation and timeout with
  successful cleanup do not set the terminal latch.
- Readiness errors never produce the unissued permission receipt. Exact
  attempt/id/error and clean-prefix consumers continue to pass.
- Ordinary scanning behavior and closed iOS destruction gate remain unchanged.
  The separately reviewed UI-copy change is not claimed as this review's work.

## Preservation and limitations

Verified original evidence/readiness-cleanup files byte-for-byte against 8988d40.
Verified historical scanner/iOS manifests byte-for-byte against the base.
Current scanner/iOS overlays retain every historical path; all current hashes
match. Browser current and readiness manifests also verify. Consumers still
check every entry, with no skipped/weakened hash checks.

PLX removes its registry entry before underlying synthetic RN removal can
throw; the tests verify that lost-ownership distinction. These exceptions are
synthetic adversarial inputs, not observed phone faults. The SDK's separate
initial state-query rejection behavior is not repaired by this narrow change.
No Metro/Hermes/native execution, physical release, device/radio/USB/NFC,
credentials/settings/provider/remote actions, SDK builds, dependency changes
or denied ESP startup/configuration review occurred.

### Module reload limitation (source-only clarification)

The readiness cleanup latch is module-local, not durable process-wide state.
The source comment's "process lifetime" assumes the adapter module instance
remains loaded. Re-evaluating that module can initialize the latch to false
while an installed PLX singleton or native state survives; no safe recovery is
established by HMR, Fast Refresh, or a module reimport. "Restart the app" here
means a full app/process restart, not Fast Refresh. Deliberate per-case module
isolation in host fixtures is test isolation, not production reload acceptance.
This clarification is source-only; no reload experiment or global/persistent
state change was made, and all prior runtime/test evidence remains unchanged.
