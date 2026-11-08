# Independent native acquisition cancellation review

Reviewed baseline `6ddbb80f928952cf1145fa25b4faba56fe9c59ce` and production candidate `74313163c43df757857f1066349ed12d60e537c0` in a new isolated shared clone. This review changes only tests, documentation and evidence. The main checkout was untouched; existing locked dependencies were reused without installation.

## Result

No blocking defect found in the two-file TypeScript cancellation correction. Baseline desired-behavior failure was independently reproduced and retained. Candidate passes 210 focused tests and TypeScript checking. This is not an aggregate/build/device acceptance result.

Nine new independent tests import the actual native adapter using fake RN/PLX modules, rather than copying its implementation. They cover cancellation while permission, readiness, connect, discovery, MTU or characteristic lookup is pending; failed native cancellation with original aggregate errors and retained unknown ownership; immediate pre-dispatch close; and a dispatched driver ignoring the optional signal whose exact returned handle survives failed cleanup for explicit retry.

The immediate-close test observes zero driver calls. The pending-driver test waits for an explicit entered event before closing and observes no cleanup until its raw promise settles. This independently supports the builder's two existing test ordering changes: reserved-but-not-issued work is different from issued native work. Abort prevents subsequent effects; it does not certify release or cancel already-issued native promises.

Any dispatched driver rejection remains conservatively unknown to BleTransport, even when the adapter itself successfully cleans up or never reaches native connect. No error-string release shortcut was added. Native failed cancellation retains its lease, blocks fresh acquisition, and preserves the setup and cleanup errors. iOS unacknowledged destruction remains closed.

The shared C bridge optional observer receives a byte copy before the browser receiver. Two additional subprocess-only tests verify mutation cannot alter the recorded C bytes, and a throwing observer rejects the pending command and retires the owned fixture process. Existing browser/C tests and browser adapter independent tests remain green. Observer delivery is synchronous: an observer exception is intentionally fatal to that fixture, not silently ignored.

## Evidence and limits

Raw logs in `evidence/native-acquisition-review/` preserve baseline success, the known-gap expected failure, seven independent baseline failures, final nine independent tests, 18 bridge tests, the final 210-test focused run and typecheck. Two immediate/issued-driver tests were added after the seven baseline challenges, so the earlier baseline log deliberately contains only seven tests. `reviewed-inputs.sha256` records exact reviewed TypeScript/test bytes.

Final focused command:

```text
node --test tests/native-acquisition-independent.test.ts tests/native-c-roundtrip.test.ts tests/browser-c-roundtrip.test.ts tests/browser-c-bridge-independent.test.ts tests/ble-transport-release.test.ts tests/ble-session-release.test.ts tests/ble-native-observation.test.ts tests/ble-native-service-data.test.ts tests/ble-review-pending-effects.test.ts tests/ble-review-automatic-context.test.ts tests/web-axp-foundation.test.ts tests/web-axp-independent-review.test.ts
npm run typecheck
```

Host-only fake RN/PLX, permissions, MTU, timing and cleanup acknowledgments do not prove actual Android/iOS behavior. The C data callback input hash `57503eaabc1773bb46272d72bd3c9b04e85964d1666093e02bb672eaf569242c` remains integrity-only. Prior independent firmware review applies only to `4c4a7ac3829f87088c8c9bebbe361be752de200943401986c6cb69f20408dd7c`. The denied SDK initialization/configuration firmware delta was not reviewed, retried or delegated; no firmware startup was invoked, and this review does not close that gate. No SDK/build/prebuild, radio, USB, flashing, dependency, native-source, credential, settings, CI, provider or remote-write actions occurred.
