# Receiver excerpt import validation

Base: APEX `d4434c5cf789938447e83e49a5cfcbdf68b59277`. Existing edited file bytes were verified against that GitHub tree before publication. Missing test-only baseline files were materialized from exact matching local blobs or fetched at the immutable main pin; these baseline restorations are not PR changes. Dependencies were reused locally, with no dependency or lockfile change.

- `node --test tests/ir-*.test.ts`: **55 passed, 0 failed**. See `focused-tests.txt`.
- `node --test tests/frozen-controller-transform.test.ts`: **69 passed, 0 failed**. See `metro-transform-tests.txt`. Includes the added controller on web, Android and iOS, development and production, plus successful inspection and stale async fencing using real Expo Metro Babel output.
- `node node_modules/typescript/bin/tsc --noEmit`: exit **0**, empty `typecheck.txt`.
- `git diff --check`: exit **0**.

Full-suite attempts first exposed incomplete local baseline fixtures. Restoring pinned fixtures exposed the required Expo frozen-controller transform registration, which was added with regression tests before release. The transformed async test waits bounded microtasks for the injected hasher; Node execution and Expo async lowering enter nested asynchronous functions at different times.

These checks validate software only. Static React DOM rendering mocks React Native primitives and does not execute phone/browser user interaction. No receiver, physical capture, carrier measurement or compatibility was tested. No upstream runtime was incorporated.

Multiline-array collection scans each input line once and joins once. A 200000-newline valid excerpt and an unterminated counterpart guard against quadratic rescanning while retaining the overall accepted source byte bound.
