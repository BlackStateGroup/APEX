# Independent App / installed PLX cancellation review

Reviewed builder HEAD `e53480171292e4698439b91c7d3dd90e7f6ddc0b` (builder chain `754cc70` + `e534801`), baseline `386cdaf957d49078cf660fd936def0b6ebfa219a`. Work performed in a separate local clone and branch. No production edits or reproduced production defect.

## Verdict and independent challenges

The new App integration is supported for its stated host-only scope. The extracted shared fixture does not weaken the original test assertions, installed-artifact pins, per-owner imports, or bounded child cleanup. The extraction adds awaited synthetic boundary phases, so it changes microtask scheduling even with no held gate; neither the prior nor current host schedule establishes native ordering.

Six new tests in `tests/app-plx-independent.test.ts` run actual extracted App source handlers through unchanged DeviceSession, BleTransport and native TypeScript into installed PLX 3.5.1 published ESM, with only RN/native promises/events faked and existing C data callbacks compiled for the host. Both Android and iOS schedules challenge:

1. Cancellation while monitor readiness is held. Close settles before delayed synthetic SUBSCRIBE; C emits no READY after retirement. A supported stale TICK fences the C command queue. The real SDK ReadEvent listener remains present until its monitor promise resolves, then is removed. Retained error/data callback references and stale cancellation do not publish UI, begin protocol writes or reacquire ownership.
2. Cancellation while the first raw write is pending, followed by deliberate replacement of the App's session, operation, acquisition and listener refs with a live second-owner session. Late write/close settlement and retained old SDK callbacks cannot clear or modify successor identity/lock/listener/UI. The successor completes an actual C ping. This intentionally injected ref substitution is an identity challenge, not a claim that the UI naturally creates this interleaving. Separate C fixtures avoid pretending a retired bridge can reconnect.
3. Actual extracted App unmount cleanup during the first held write. All subsequent setters are suppressed, the lock waits for drain, the session closes once, and no second protocol command is sent. The harness's other cleanup dependencies remain synthetic.

The builder's existing failed native close, unknown ownership, explicit Disconnect retry, stale-handler successor, pending SDK rejection and permission/setup boundary cases were independently rerun unchanged. No SDK code is copied into the test: the unchanged scoped loader reads installed published modules, verifies pins before/after, and the original suite checks all ten loaded modules exactly.

## Results and integrity

- `baseline.log`: 74/74 before independent cases.
- `focused.log`: 6/6 independent cases; 8 fixture traces under `traces/`, all terminating with owned child exit code 0 and no stderr/signal.
- `regression.log`: 80/80 (12 builder App, 6 independent App, 29 existing installed facade, 33 fake-native/C).
- `repeat.log`: five more full 80-test focused runs, all pass.
- `typecheck.log`: npm run typecheck passed. The npm environment warning is retained.
- `verify.py` and `integrity.json`: all 93 entries in the builder source manifest and 21 builder artifacts match; all 13 original traces have clean owned-child exits. Original test bodies from `function frames` onward are byte-identical to baseline. Loader, pins, App/runtime/core and bridge inputs checked explicitly are unchanged. Historical `verification/` artifacts are byte-identical and describe their old candidate, not this extraction.
- `source-hashes.json` hashes the new test plus existing builder source inputs. `artifacts.sha256.json` hashes this review's evidence, including source hashes. These manifests do not recursively hash themselves.

## Preserved initial fixture error

`initial.log` records 4 pass / 2 fail from this review's first run; `initial-source.test.ts.txt` is its exact test source. The new test mistakenly submitted unsupported `MTU 23` to the C bridge as a queue barrier. The bridge correctly rejected that malformed control command with exit 2 (`bridge invariant: 0`). This is not a product bug. The final test instead submits existing supported `TICK` and verifies no notification revival. Final traces are rerun traces, not claimed to preserve the failing traces. The builder's separate initial reconnect-fixture misuse and TypeScript narrowing logs remain byte-unchanged in its evidence folder.

## Scope limits

No mounted React, render/touch test, native Android/iOS execution, ABI validation, real permission UI, actual native timing, hardware/radio/USB/flash, firmware build/startup, dependency installation, remote changes or SDK initialization/configuration review. Native close is synthetic; its completion is not radio release proof. iOS reset/destroy acknowledgement remains closed and unverified. Conservative transport-release-unknown states before a usable transport exists remain unchanged. The separate design-only unissued-acquisition proposal is not implemented or assessed as part of this baseline verdict. Only named focused suites and typecheck ran, not aggregate tests or native builds.
