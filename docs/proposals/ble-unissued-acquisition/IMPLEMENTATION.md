# Exact unissued acquisition: narrow candidate

Base: d08c01d70a32d58e69f65dad56e1373392ccef87. Initial production candidate: 747d71a65ffffb9857d3cef8436b1c304f0a92ab (includes preceding native test commit ed6bea9). Final runtime candidate: 96cc5edd2d576d17cab2d365ccea77edee2baede. This is host-source evidence, pending independent review. No physical connection, disconnection, native ABI, OS ordering or radio claim.

## Contract and supported exits

BleTransport creates a fresh frozen identity per dispatched connect, tracks the original raw effect, and queries the optional trusted adapter method once on the exact rejection. Only literal true avoids acquisitionUnknown. Missing, throwing, asynchronous and malformed proofs are unknown; original rejection identity survives. Rejections of malformed native Promise results are observed with the intrinsic Promise method, never awaited or adopted; arbitrary thenables are not inspected. This is not a hostile-object security boundary. Success owns its exact handle and never queries proof.

The actual native adapter records private token identity, exact identifier and original rejection. Tokens have permanent weak tombstones: reusing a token cannot revive a certificate; reuse before consumption invalidates the first record too. A premature or mismatched receiver/id/error query retires its record. A late original invocation cannot replace an invalidated record. This is provenance/aliasing protection within the trusted adapter, not protection against a malicious replacement driver.

Supported witnesses are the explicit initial aborted check, and Android normally resolved permission-result denial or cancellation before getManager. A normal result must have Object.prototype and a canonical own data value (granted, denied or never_ask_again) for every required permission. Malformed maps/accessors keep their original denial/throw behavior but cannot certify. Permission witnesses additionally require successful settled scanner.stop, zero ordinary raw scan operations at prefix and publication selection, unchanged epoch/scanner, no shutdown, no exclusive observer and no unhealthy/unknown manager or connection. Witness publication follows this invocation's reservation cleanup.

Readiness and every after-manager witness are deferred. Unexpected permission rejection, scanner failure/raw uncertainty, busy/health/epoch/duplicate-ID failures, manager construction, readiness registration/removal and every issued connection/listener effect remain unknown. The acquisition flag is set before lease/identifier reservation and listener registration. Native cancellation cannot mint proof. Global manager ownership/health and iOS reset restrictions remain unchanged. App and DeviceSession runtime are unchanged.

## Tests and precise expectation changes

New actual-source tests cover Android API 30/34 denial and cancellation after delayed grant/denial, exact token/id/error/receiver/replay, duplicate tokens, busy reservation, unexpected/primitive permission rejection, readiness and late callbacks, partial listener/constructor/native effects, scanner stop error/unsettled raw stop and duplicate identifiers. Transport tests cover original primitive/frozen rejections, fresh tokens, malformed/throwing optional proof, no query before dispatch or on late success and exact returned-handle cleanup.

The existing native-acquisition ladder now expects release only at its normal Android permission stage. The native C session case and App ladder similarly clear only the permission branch; readiness/issued setup remain held. Installed-PLX App ladder changes only permissions, retaining existing monitor/write returned-handle release cases. New installed-PLX fixture tests cover permission denial and cancelled grant/denial plus unexpected rejection. Permission exits deliberately never instantiate PLX; the wider ladder executes the pinned actual published PLX ESM through synthetic RN/native boundaries and host C data callbacks. None represents a real SDK/native build or device proof.

Historical tests/browser-c-host/inputs.sha256.json and all pre-existing evidence remain byte-exact. Three executable suites now explicitly select new tests/browser-c-host/current-inputs.sha256.json, which preserves historical inputs except the changed transport hash and newly adds native adapter source. Current-source manifest is recorded separately alongside these results. No installed package source or lockfile changed.

## Verification

- Six actual-native desired permission tests fail before implementation with release unknown; raw failure log is retained under review-evidence/ble-unissued-acquisition/.
- New transport contract cases also fail before implementation; raw log is review-evidence/unissued-acquisition/transport-before.tap.
- Final 236 focused tests pass, including both new suites, actual native cancellation, transport release, App cancellation, installed-PLX App/C boundary suites, native C roundtrip and existing ordinary/exclusive scan suites. Exact test names and results are in review-evidence/unissued-acquisition/focused-final.tap.
- TypeScript no-emit check passes with the pre-existing installed dependencies (linked read-only by convention; no install).

No full aggregate npm test (which invokes firmware build), browser, native build/prebuild, hardware, credentials, SDK initialization, settings, providers or remote action was performed. Historical evidence was not regenerated. Independent review is required before integration.

## Independent review corrections

Review of the initial candidate found two issues, reproduced before correction: seven malformed permission maps could produce a witness, and a malformed rejected Promise proof could generate an unhandled rejection. Commit 3da02105 tightens eligibility without changing the original permission rejection; commit 96cc5edd observes only actual native Promise rejection without assimilation or certification. Before/after logs are retained separately. Final independent approval remains the reviewer’s responsibility.
