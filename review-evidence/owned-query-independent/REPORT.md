# Independent owned-state-query review

## Decision and exact source

Approve the bounded JavaScript ownership correction on runtime commit
`2a97aca20779a1fd1d745fb6ea61d83d7eca59e9`, source SHA-256
`c50d769b3a5c5266e3fd3119b078258c584306cac0fb79a5e1bd90a8b3303f1d`,
with current fixtures/overlays at `c1a20621b886d8c4bb7a2253f049360f465cdeb3`.
Integration remains conditional on the parent full aggregate. This review does
not certify a native build, native query cancellation, radio release, phone
behavior, or iOS destruction acknowledgment. Stable v42 remains the fallback.

Review clone: `apex-owned-query-review`, originally exact stable checkpoint
`63f530d1f6f8f943d4fd2c1016904f3259daf77a`. Production changes are imported frozen
builder commits, not independent edits. Review deliverables are additive here.
The installed SDK and dependency tree are unchanged; the existing dependency
symlink is reused. No package installation, hardware, browser, remote action,
firmware delta review or denied ESP initialization/configuration work occurred.

## Findings corrected before approval

1. The first prototype put pending-query quiescence in assertManagerHealthy,
   which is also used by established connection I/O. Independent source review
   flagged this unnecessary interference. Commit 47a1256 moves the pending fence
   to acquisition/teardown boundaries and queued scan dispatch. The new suite
   proves existing connection writes and cancellation while another query waits.
2. The builder identified a synchronous registration cancellation ordering edge.
   Independent tests reproduced it both through an alternate manager method and
   through the unchanged installed PLX code with a reentrant synthetic emitter:
   abort, then PoweredOff before registration returns incorrectly replaced the
   cancellation with PoweredOff. Raw failures are retained in
   abort-veto-negative.tap and emitter-veto-negative.tap. Commit 2a97aca prevents
   finish from overriding an existing veto. Opposite PoweredOff→abort and
   PoweredOn→abort cases pass with the intended distinct results.

## Independent execution

Run `node --test review-evidence/owned-query-independent/independent.test.ts`.
`final.tap`: **32/32 pass, zero failed, cancelled or skipped**. Node's test runner
reports unexpected unhandled rejections as failures; no suppression/listener is
installed by this suite or production. Typecheck passes (`typecheck.log`). An
initial two-annotation test-only typecheck failure is retained separately.

The final same 32-case harness was also copied to a separate exact stable-v42
clone and run without modifying that source: `stable-full-negative.tap` records
**6 pass, 26 fail**. Baseline source and final harness hashes are in inputs.json.
The initial 18-case development run (2 pass, 16 fail), intermediate candidate
runs, and targeted abort regression failures remain raw historical evidence.
Their test-file versions preceded the final harness; do not treat their counts
as additive or claim they used the final 32-case file.

Coverage includes:

- Single installed-SDK conversion of native error101, exact exposed SDK error
  identity, subscription cleanup, zero readiness receipt, ordinary denial recovery.
- Responsive cancellation and PoweredOff before both late query fulfillment and
  rejection; retained ownership prevents shutdown, connection, ordinary scan and
  exclusive observation until the query drains.
- PoweredOn event waits for query fulfillment/rejection; late rejection cannot
  overwrite that decision, but cancellation and the actual ten-second deadline
  can veto successful preparation. No replacement acquisition after cancellation.
- Resetting/Unknown events invalidate later initial PoweredOn snapshots. First
  observed query callback versus synchronous event ordering is explicitly tested.
- Six synchronous raw query throws, including undefined/null/false/zero/empty
  string, preserve exact values, remove the known subscription and retain separate
  dispatch uncertainty, not a false lost-subscription diagnosis.
- A failed remove remains latched after late query drainage and occurs once.
- Existing owned connection writes/disconnect remain possible; ordinary scan stop
  is responsive; exclusive failed acquisition cannot force destruction of a query.
- Cancelled ordinary scan permission can reset before permission resolves, with
  no manager construction or scan on its later grant. A live connection permission
  request retains the existing busy reservation until it completes.
- Synchronous registration order and successful query-first readiness.
- Two actual extracted App-handler → DeviceSession → BleTransport → installed
  PLX cases: raw state-query rejection and cancellation while the query remains
  held. Run/cancel controls settle, the closed selected transport remains held as
  unknown, shutdown is fenced until drainage, and late rejection never silently
  clears selection or reconnects. This is not a mounted React UI test.

## Boundary and integration review

A generic reservation covering every pending permission prompt is unnecessary.
The implementation reserves readiness after getManager and cancellation checks,
then synchronously checks manager identity and shuttingDown before registration.
Existing connectionPreparing, ordinary scanner and observation leases cover
ordinary acquisition entry. Shutdown sets shuttingDown before yielding and
rechecks readiness before destruction. Cancelled old permission preparations
cannot cross the later signal check. Independent permission tests protect the
narrow boundary; no broad pre-manager blocking is approved here.

The identity-owned pending Set outlives responsive caller failure. Successful
preparation cannot publish while its query remains pending; failure removes the
subscription promptly. Late continuations retire only their owner and cannot
revive the completed preparation or clear either persistent uncertainty latch.
New acquisition and all destructive/reset paths are fenced; existing stop and
connection cancellation remain callable. No private SDK registry is referenced
in production, no global rejection handler exists, and SDK wrapper settlement is
not described as native/physical release. A hung query requires full process
restart; module reimport/HMR is not recovery.

The unchanged installed ESM loader hashes every pinned SDK input before/after.
Current fixture changes add explicit state() to API fakes and adjust event-success
expectations to wait for drainage, rather than disabling error or cleanup checks.
Two formerly reachable stale overlapping preparations are now refused before a
second subscription; the current test asserts that refusal and persistent cleanup
uncertainty. Historical test/evidence records remain unchanged in history.

All keys of the three modified current manifests are preserved: browser-C has
19 paths, iOS-void scan has 16, scan-facade has 9. Each changes only the native
Bluetooth source hash. No consumer or input path is removed. Historical manifests,
SDK pins, package/lock files, production firmware and native projects are unchanged.

The independent current consumer rerun passes **162/162**, zero skipped, recorded
in consumer-tests.tap. An additive top-level tests/ble-owned-query-independent.test.ts
imports this 32-case suite so the aggregate cannot omit it. The full suite count
change 2050→2049 before this addition is precisely the two old impossible stale
second-listener orderings regrouped into one refusal case, not a skipped consumer. Full aggregate and remaining physical /
native gates belong to the integration checkpoint, not this focused report.
