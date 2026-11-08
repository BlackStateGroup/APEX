# Independent installed-PLX scan review

Reviewed candidate `dfb98d5174b5eee926240f0b0f777d5d7f394b8a` on base
`107cd97da297abc65b26b3952df6920381c227d8`. Result: no blocking fixture defect
found within this synthetic host boundary. No production fix is proposed.

## Independent checks

The candidate's 18 cases passed before additions. Eight additional tests in
`tests/plx-scan-independent.test.ts` use a separately authored, scan-only RN/native
fixture and the existing unchanged loader. They execute the installed PLX ESM and
exact adapter/controller, without copying or implementing the SDK facade. On both
Android and iOS synthetic platform models they establish:

- A synchronous event emitted inside native start reaches the installed SDK listener
  before its raw start Promise acknowledges. Candidate projection is checked exactly.
- A synchronous error during a held start removes the listener, blocks replacement,
  waits for raw settlement, performs the two required cleanup stops, and reports one
  actual SDK `BleError` with its reason preserved.
- Cancellation while readiness is held never issues native scan after readiness
  resolves; a later scan succeeds.
- Saved error and data callbacks from an uncapped old scan cannot publish into or
  terminate a live replacement. A stale stop handle does not issue another native
  stop. The replacement listener still delivers its own candidate.

The uncapped stale-callback case matters because a full 100-callback budget could
mask unwanted publication independently of lifecycle fencing. The separate test
also verifies exact stop counts and terminal notifications rather than inferring
those properties from a test title.

The loader routes environments by the importing case query, propagates that query
through PLX relative imports, and returns installed source bytes unchanged. The
candidate's reverse lazy-import ownership test passed. This demonstrates fixture
module isolation, not multiple native manager support. The synthetic emitter uses
per-event sets and saved callbacks; it does not model RN bridge reference counting,
OS queueing or radio filtering. Tests check installation of the scan listener before
native start and removal before native stop. Neither is a physical release proof.

No runtime implementation, native implementation or firmware/startup source was
reviewed or edited. Runtime and SDK integrity was checked by the existing SHA-256
pins before and after tests. The published JS scan facade and test loader were
reviewed. Historical files, candidate tests, candidate artifacts, loader, dependency
files and installed package bytes remain unchanged. The unrelated current browser-C
input-manifest correction is outside this review.

## Reproduction and evidence

From the repository root, with existing dependencies only:

```
node --test tests/plx-scan-independent.test.ts
node --test tests/plx-facade-scan.test.ts tests/plx-scan-independent.test.ts tests/ble-scan-session.test.ts tests/ble-plx-observation.test.ts tests/ble-plx-service-data-filter.test.ts tests/plx-unissued-acquisition.test.ts
npm run typecheck
```

`verification/plx-scan-independent/` contains the untouched 18/18 before-run,
8/8 first independent run, 61/61 overlapping host regression, passing typecheck,
and new review-input hashes. The 61 includes the 18 and 8; it is not 87 distinct
cases and does not reproduce the candidate's separate 101-case C-inclusive run.
No failed reproduction or fixture correction was needed.

No C build, firmware, SDK build, browser, physical device, radio, USB/NFC,
installation, remote action, provider or credentials/settings operation was used.
Real RN/native ordering and iOS destruction acknowledgment remain unproven.
The excluded ESP initialization/configuration review was not retried or delegated.
