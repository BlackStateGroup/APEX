# Independent App lifecycle review

Reviewed baseline `20947d88a61607d564a8eaa70a649f0be5195bea` and builder commit `569f679df0abc2f9467ee847532d078d78d79aad`. The isolated review clone applies the latter as `319a3fe`. Independent tests are separately committed in `e6e613a`.

## Outcome

No remaining blocker found in the scoped generic App run/connect lifecycle correction. Native detached invocation is fenced before acquisition and before listener removal. The previous-close continuation checks attachment, mount epoch, operation identity, selected session identity, and confirmed release before constructing a new session. Negotiation success, failure, and retained disconnect observers cannot publish into an invalid mount/session. Unknown prior release retains the original owner. Old finalization cannot unlock a replacement operation.

Review found one additional reentrant-publication race in the draft: browser refresh could synchronously start a successor operation before old finalization set busy false. The final builder commit publishes its busy state before refresh. An independent actual-source test exercises that observer ordering and checks successor busy/lock/operation state.

Browser picker entry and lifecycle ownership code are unchanged. Existing browser application tests exercise same-call-stack chooser invocation, persistent ownership, cancellation fencing and late callbacks. No new foreground, inactive, or background acquisition rule was added. This patch does not promise to guard every unrelated App asynchronous action or observer.

## Verification

- Independent actual-source suite against baseline: 5 tests, 1 pass, 4 fail. Failures cover reentrant busy publication, stale rejected close, stale rejected open, and epoch-invalidated native negotiation/observer publication.
- Final focused command: `node --test tests/app-native-lifecycle-independent.test.ts tests/app-native-acquisition.test.ts tests/web-axp-application.test.ts tests/web-axp-application-independent.test.ts tests/session.test.ts tests/session-controls.test.ts`.
- Result: 75 tests, 75 pass, zero failures/skips/cancellations.
- Full project TypeScript check: `npm run typecheck`, exit zero using already-installed locked dependencies.
- Raw logs and SHA-256 source manifest: `review-evidence/app-native-lifecycle-independent/`.

## Boundaries

These tests execute extracted App function/effect source in Node with explicit bindings and real DeviceSession. The USB-labelled transport is a software-only SimulatorTransport wrapper. They do not mount React, run an actual browser/native module, acquire USB/Bluetooth/radio hardware, or validate firmware/native SDK builds. Epoch-only synthetic tests deliberately change refs directly to challenge continuation guards; they are not a React remount claim. Core/native transport cancellation is a separate change and is not reviewed here. No dependencies, lockfiles, firmware, native platform sources, SDK configuration, CI, accounts, settings, providers or remote state were changed by this review.
