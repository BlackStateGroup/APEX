# Owned state-query prototype (isolated, not merged)

Base: `63f530d1f6f8f943d4fd2c1016904f3259daf77a`, stable v42.
Final runtime: `2a97aca` (current test/manifest overlay: `c1a2062`).
Runtime SHA-256: `c50d769b3a5c5266e3fd3119b078258c584306cac0fb79a5e1bd90a8b3303f1d`.

This implements supported `onStateChange(callback, false)` plus immediately
observed `state()`. Neither the SDK nor its installed dependencies were edited.
An ownership record captures the manager, epoch and actual exposed SDK Promise.
Cancellation, deadline and readiness error remove the listener and return promptly,
but outstanding queries remain fenced independently of the caller. Successful
readiness waits for query drainage and remains subject to cancellation/deadline.
Late outcomes are consumed without replacing a selected terminal decision. A live
state event invalidates the later snapshot value, including Resetting/Unknown.
Synchronous query throw preserves its thrown value, removes the available listener,
and latches separate dispatch uncertainty rather than claiming lost subscription.
Existing lost-subscription, deterministic cleanup and falsy-error behavior remain.

## Why the reservation is narrower than the design model

The model proposed reserving all of prepare(), including permissions. That would
regress the ordinary scanner's deliberate ability to cancel a permission wait,
release its controller lease, and reset before permission completion. The adapter
already has synchronous `connectionPreparing`, scanner and exclusive-observation
leases. Their post-await signal checks prevent cancelled permission continuations
from creating/starting anything. Connection preparation and exclusive observation
already prohibit shutdown while their preparation owns the corresponding lease.

The added token starts after manager import, immediately before SDK registration,
and lasts through prepare's final return/failure. Between checking `shuttingDown`,
manager identity and claiming the token there is no await. Shutdown sets its flag
before stopping the scanner or waiting for manager import, and rechecks readiness
quiescence immediately before destruction. If shutdown wins, preparation refuses
registration. If preparation wins, destruction is fenced. Thus manager import does
not require the model's broader permission reservation. Reset and both destruction
paths check the token, outstanding query set and persistent uncertainty latches.
No SDK private promise registry is consulted in production.

New acquisition entry and queued scan dispatch check query quiescence; local
subscription cleanup, existing connection cancellation, scan stop, and established
connection use are not blocked merely because a different query is pending.
Persistent unhealthy/unknown conditions still restrict ordinary use as before.
Unissued receipts retain the existing already-aborted/normal-permission-only scope.
Readiness errors, pending queries and uncertainty do not certify acquisition release.

## Independent findings corrected before final freeze

- `47a1256` moved the query fence out of general manager-health checking, so an
  outstanding readiness query does not block an established connection's writes.
- `2a97aca` preserves cancellation when synchronous registration aborts before
  emitting PoweredOff. Earlier PoweredOff remains an error, and cancellation after
  PoweredOn vetoes successful completion. The reviewer reproduced the defect
  through unchanged installed PLX ESM with reentrant synthetic emitter registration.

## Verification and evidence scope

Current fixture changes are explicit: fake managers now expose a nonterminal
`state()` API; event-success tests drain the query; cancellation reports owned
until drainage; a competing stale preparation is refused before a second listener.
Only explicit current-source manifests were refreshed. Historical evidence/pins
remain untouched, including the assessment and design repositories.

- Existing focused suites: 149/149 passed before the final one-line veto correction.
- Current overlay consumers: 97/97 passed on final runtime, including App/PLX,
  ordinary iOS void scan behavior and existing host C regressions.
- Final typecheck: passed.
- Final offline iOS/Android/web export: passed.
- Full aggregate and independent exact-ESM results are recorded separately below.

Initial failures are retained as diagnostic logs, not acceptance evidence. They
included expected old scheduling assumptions, mock managers missing the now-used
public state API, and stale current-source hashes. The first aggregate also ran
while the reviewer-requested runtime correction was being finalized, so only the
final frozen-source aggregate is an acceptance candidate.

Existing dependencies were reused by symlink, with no install or lockfile change.
Existing `build/apex-firmware` was copied and both copies hash to
`a9d2393adc37fffa3ef8eed26344a20d572930ec207f26de96c07db07ea7cca5`.
No new firmware investigation, ESP startup/configuration review, native build,
browser, device, radio, provider, credential, remote or SDK-build action occurred.
Existing host regressions use synthetic boundaries only.

A hung query continues to require process/app restart; it cannot be reset away.
Exposed SDK settlement retires only this JS ownership fence and never certifies
native release, physical radio behavior or phone acceptance. The model assumes one
module lifetime with no HMR/reimport, not adversarial monkey-patched language globals.

### Frozen prototype aggregate

`CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_offline=true node --test --test-concurrency=2 tests/*.test.ts`
passed **2049/2049**, zero skipped, in 104.1 seconds against frozen runtime `2a97aca`
and test/manifest overlay `c1a2062`. This includes every current source-manifest
consumer. The lower count versus the previous current suite is intentional: two
impossible overlapping-listener schedules became one explicit refusal-before-second-
subscription case under the new contract. Independent new tests are not yet included
in this count. Their combined run will be recorded after review artifact import.

### Combined independent-review aggregate

Independent additive review commit `0cf88ae9cee580f484406e55d5054ab7df173028`
was imported here as `503f07c`. Its unchanged-installed-ESM suite is included by
`tests/ble-owned-query-independent.test.ts`. The same final 32-case harness on
exact stable v42 gives 6 pass/26 fail; candidate gives 32/32. The independent
report approves the exact runtime subject to parent integration checks.

The combined frozen prototype run (`combined-full.log`) passes **2081/2081**, zero
failed/cancelled/skipped, in 109.1 seconds. Combined typecheck also passes. Runtime
hash remains `c50d769b3a5c5266e3fd3119b078258c584306cac0fb79a5e1bd90a8b3303f1d`.
This does not replace the parent's full main aggregate after any approved integration.
No merge into stable main was performed by this worker.
