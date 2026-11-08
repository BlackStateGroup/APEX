# Independent unissued-acquisition review

## Verdict and exact source

The original candidate 747d71a65ffffb9857d3cef8436b1c304f0a92ab needed two narrow corrections. Both are independently revalidated in final runtime candidate 96cc5edd2d576d17cab2d365ccea77edee2baede, descended from baseline d08c01d70a32d58e69f65dad56e1373392ccef87. This review adds tests/evidence only. Review used a separate local clone and reused existing node_modules symlink; no installs, publishing, native SDK builds, browser execution, physical device access, or firmware/startup work.

Final focused result: **198/198 pass**, zero skipped/cancelled; **typecheck passes**. Command and source digests below. This is focused host verification, not a full aggregate or platform release approval.

## Findings resolved by builder

1. At 747d71a, missing, unknown-valued, partial, inherited, accessor-backed, short-circuit-denied/later-throwing-getter and array permission maps falsely certified normal permission rejection. Independent raw evidence: candidate-747d71a.tap, source snapshot candidate-test-source.txt, hashes candidate-747d71a.sha256. Builder correction 3da02105a4c1666cbdbfdb4d38375d70e3759a57 requires plain Object.prototype result, complete own data descriptors, and canonical granted/denied/never_ask_again values. Original denial/getter/throw behavior remains unchanged; invalid result receives no proof. Independent descriptor/prototype-throwing proxy cases also pass.
2. Malformed proof hook returning a rejected Promise preserved the original rejection and unknown hold but left an unhandled rejection (Node process exit 1). Evidence: rejected-promise-before.txt and promise-candidate.tap (native and foreign-realm Promise failures). Builder correction 96cc5ed uses intrinsic Promise.prototype.then.call solely to observe rejection, without awaiting/adopting it or granting proof. Independent subprocess tests now pass for native/foreign-realm rejected promises, resolved Promise, throwing .then getter, and ordinary thenable. Query remains once and original rejection identity survives.

Evidence honesty: initial installed harness omitted two native fake methods needed by real PLX replacement (isDeviceConnected and servicesForDevice). Initial log has 12 tests, 2 pass/10 fail: seven real malformed-map findings plus three fixture failures in replacement. Initial release assertions themselves passed. permission-fixed.tap and permission-fixed-harness-complete.tap preserve those fixture failures. Missing fake methods were added; replacement tests now execute actual installed PLX connect/discover/MTU/characteristics/cancel and pass. An initial review test typecheck error (untyped rejection parameters) is preserved in typecheck.txt; final typed tests pass. No runtime failure was hidden or counted as passing.

## Independent cases and code review

18 installed-facade cases execute unchanged installed PLX 3.5.1 ESM through the existing per-case loader, against exact application TS. Three normal result cases (denied, never_ask_again, cancellation after granted result) release transport without constructing a manager, then allow a fresh real-facade connection. Nine malformed-result cases remain unknown. Unexpected permission rejection preserves exact identity. Concurrent duplicate token tombstone prevents restoration by the first late continuation. Construction, readiness PoweredOff, and actually issued connection failure stay unknown. Held raw scanner stop times out without receiving permission proof; shutdown stays busy while raw operation is pending, and late settlement does not rehabilitate transport/scanner.

Five subprocess proof-hook cases cover native/foreign-realm rejected Promise, resolved Promise, thenable, and throwing then getter. Existing candidate/regression suites cover receiver/id/original rejection binding; one-shot premature/incorrect consumption; sequential/concurrent duplicate tokens; competing preparation ownership; exact original primitive/object errors; no query before dispatch or after success; scanner poisoning; readiness cancellation/registration failures; listener/connect/manager failures; duplicate identifiers; session/App owner isolation; actual installed PLX cancellation and C data callbacks.

Source inspection confirms WeakMap receipts plus WeakSet tombstones, publication after preparation reservation cleanup, invalidated records never restored, exact Object.is rejection binding, literal true only, and no proof retry/reset. connectionPreparing cleanup belongs only to the invocation which acquired it. Permission witness captures scanner and epoch after successful stop, checks zero raw scan operations at both ends, scanner/manager health, shutdown, observation owner, construction uncertainty, and unknown connection leases. Readiness and all after-manager/lease/listener/identifier paths remain outside witness eligibility. Existing issued-connection cleanup and closed iOS reset gate are unchanged. Initial already-aborted invocation certifies only its own lack of issuance; it neither releases another reservation nor changes global fences.

Old expectations changed only for normal Android permission-result cancellation. Readiness/issued acquisition expectations remain unknown. Historical browser-C and PLX manifests are byte-exact against baseline; executable suites explicitly use a new current-inputs manifest for changed application TS. No old artifact was rewritten by this review.

## Limits

RN permission/foreground/native modules/events are synthetic. PLX published JS executes, but Android/iOS native code, RN bridge semantics, queue ordering, Hermes/Metro, physical radio and hardware remain untested. Existing C fixture runs data callbacks with fake SDK only, not firmware startup. No denied startup/configuration review was attempted.

Proof is a trusted-adapter contract, not hostile-code isolation or native attestation. JS cannot reliably distinguish a transparent/deceptive Proxy from an ordinary result; descriptors/prototype traps which throw are fail-closed, but a malicious proxy may report ordinary descriptors. Intrinsic Promise observation avoids arbitrary .then reads; genuine Promise subclass constructor/species hooks can still run or throw. No total safety guarantee for malicious Promise subclasses/global mutation is claimed. Receipts never prove cleanup of an issued connection, native cancellation completion, or iOS destruction.

## Reproduction

node --test tests/ble-unissued-independent.test.ts tests/ble-unissued-proof-promise-independent.test.ts tests/ble-unissued-acquisition.test.ts tests/ble-unissued-transport.test.ts tests/plx-unissued-acquisition.test.ts tests/native-acquisition-independent.test.ts tests/app-native-acquisition.test.ts tests/app-plx-cancellation.test.ts tests/app-plx-independent.test.ts tests/plx-facade-c.test.ts tests/native-c-roundtrip.test.ts

npm run typecheck

Final output: final-focused.tap and typecheck-final.txt. Exact SHA-256: final.sha256. Installed dependency bytes are verified before/after by tests/plx-facade-host/loader.ts against unchanged inputs.sha256.json. No full npm test (which includes firmware build), native build or browser test is represented by these results.

## Final integration ancestry

Reviewed builder's final docs/evidence-only descendants through 184293d4aa0763e4fa395951f7e6bd9896f7b4b1. Runtime and executable test/pin bytes remain unchanged from 96cc5ed. Added acceptance text clearly marks phone cases NOT RUN and confines receipts to local unissued attempts. Review commit is rebased directly onto that complete builder chain, with no duplicate cherry-picks or conflicts. Approved for local integration within this narrow host-tested scope; physical/native release claims remain excluded.
