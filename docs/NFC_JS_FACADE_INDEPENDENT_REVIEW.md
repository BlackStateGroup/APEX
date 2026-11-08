# Independent NFC JavaScript fixture review

Reviewed candidate `3d10b7493d17501f00e47130452f3fed6949e487`, based on
`0c38590ff379dd09fdae31b9356634302ffeb150`, in an independent local clone.
Existing locked dependencies were reused read-only. No production files changed.

## Finding and correction

The original candidate passed 95 focused tests and typecheck. A fixture isolation
defect nevertheless existed: create iOS fixture A, then Android fixture B, then
call A's backend status. The newest process-wide resolve hook intercepted A's
lazy SDK import and supplied B's SDK. The resulting status claimed iOS while the
Android fake received isSupported. Sequential original cases did not expose it.

The helper now scopes both React Native and NFC facade bridge interception to
the exact adapter URL, including its unique fixture query. Hooks for unrelated
fixtures fall through. No SDK method or implementation is replaced. This is a
fixture correction, not a production lifecycle fix.

Twenty independent cases cover both creation orders, codegen/legacy routes,
removal of either hook before or after lazy import, distinct singleton/error
class identities, exact platform subscription lists, raw iOS cancellation null,
Android absence of SessionClosed, listener removal, and global delivery to the
current tag listener. The overlap tests fail against the original helper; raw
failure output is retained. The final six-file focused run passes 115/115 and
TypeScript passes. These are focused checks, not the complete application suite.

## Source, loader and side-effect audit

- The helper executes unmodified installed 4.2.0 CommonJS source in its normal
  wrapper after checking each loaded JavaScript file's SHA-256. Unlisted files
  fail the hash assertion; outside-package dependencies are rejected. The sole
  special require is the fake react-native object. The pin test separately
  verifies installed package metadata and the recorded five principal APEX
  sources plus lockfile. This does not pin every transitive application source.
- The manifest's lock integrity is recorded, not independently fetched or checked
  against a registry archive. Baseline and Node version fields are provenance,
  not runtime enforcement. Hashes cover local input identity, not authenticity.
- All observed callbacks originate in the fake native object. No native module,
  network, SDK build, device, radio, or browser is used. VM is an isolation aid,
  not a security sandbox: host console, Error, and timers are intentionally
  supplied. Fixed, locally pinned package bytes are trusted inputs.
- SDK-specific error classes are distinct across fixtures. Because host Error is
  explicitly injected, converted SDK exceptions pass host instanceof Error.
  Tests verify UserCancel identity against the actual originating SDK class and
  reject the other fixture's class. This approximates shared-realm application
  errors; VM intrinsic exceptions (for example TypeError), array prototypes and
  other realm objects can still differ. The fixture does not certify exact Metro
  realm behavior or generic error normalization for every possible exception.
- The explicit default/named export bridge models __esModule interoperability;
  it does not execute Metro, real React Native, native bindings, or codegen.
  Legacy cases exercise a JS branch, not architecture support on RN 0.88.
- dispose deregisters the import hook and deletes its host bridge reference. It
  does not simulate native cleanup or guarantee all VM objects/modules are
  garbage collected. Fake listeners remain in the fixture's private map until
  the fixture becomes unreachable; successful lifecycle tests separately check
  native callback/closure release. Process module caches can retain imports.
- Promises are driven by explicit fake callbacks and setImmediate turns, not
  timing sleeps. Rejected SDK operations are asserted before callback rejection.
  The original cleanup/retry tests remain passing. No native queue ordering,
  real cancellation deadline, or hardware callback reliability is established.

## Accepted result and remaining boundaries

No remaining blocker for this narrowly scoped host fixture after the hook fix.
Actual iOS SessionClosed UserCancel maps to null; actual Android subscribes
StateChanged rather than SessionClosed. Tests directly verify both codegen and
legacy paths. SDK global events carry no generation identity and target the
current installed listener. A synthetic event after listener replacement cannot
prove that native queues can produce that ordering, nor certify acquisition or
release. No production defect or native acceptance is claimed.

The separately denied firmware SDK-delta work was not retried, reassessed, or
routed through this review and remains untouched.

## Evidence

`review-evidence/nfc-js-facade-independent/` contains original-helper failure
output, final focused output, typecheck output, and current artifact hashes.
The original `verification/nfc-js-facade/artifact-sha256.txt` is historical
candidate evidence: its helper hash intentionally describes the pre-review
helper. The independent artifact list supersedes that helper pin for this
review. Installed SDK/APEX input manifest and original tests are unchanged.

Reproduce with Node 24 and the existing installed dependencies:

```
node --test tests/nfc-js-facade-review.test.ts tests/nfc-js-facade.test.ts tests/nfc-lifecycle.test.ts tests/phone-ndef-capture.test.ts tests/nfc-manager-ndef.test.ts tests/phone-ndef-workbench.test.ts
npm run typecheck
sha256sum -c review-evidence/nfc-js-facade-independent/artifact-sha256.txt
```
