# HCI comparison UI focused validation

- First typecheck passed. First focused run preserved two failures: existing exact App prop-order assertion and static NFC positional assertion. Kept active prop first and appended the new choice after all original choices; old assertions retained.
- Expanded second run: 223/223 passed; typecheck passed.
- Final run: `node --test tests/hci*.test.ts tests/analysis*.test.ts tests/nfc-static-memory-review.test.ts tests/ble-differential*.test.ts`: 244/244 passed.
- Full `tsc --noEmit`: passed, empty output.
- `playwright test --list`: 39 scenarios listed. No browser execution.
- No install, network, native/device/provider execution, real capture or real user storage access. Synthetic in-memory fixtures and temporary transpilation only.
- Actual React DOM static TSX tests use narrow RN primitive mocks; not mounted component effects or layout acceptance. Independent review and aggregate integration are separate.
