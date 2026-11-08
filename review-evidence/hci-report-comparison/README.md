# HCI selected-report comparison local verification

Base: `6beec27`. Source commit: `2598715`. Node v24.22.1. Dependency tree reused
from the existing `apex-ui-validation-20261107/node_modules`; no installation.
Source hashes are in `source-sha256.txt`.

- First core run: 6 passed, zero failures (`first-core.log`).
- First focused new tests: 11 passed, zero failures (`first-focused.log`).
- First typecheck: exit 0, empty log (`first-typecheck.log`).
- Final focused run: 96 passed, zero failures (`final-focused.log`).
- Final `node_modules/.bin/tsc --noEmit`: exit 0, empty log (`final-typecheck.log`).

Final test command:

```
node --test tests/hci-report-comparison*.test.ts tests/hci-offline.test.ts tests/hci-selected-document.test.ts tests/hci-selected-document-independent.test.ts tests/hci-selected-cli.test.ts tests/hci-event-evidence.test.ts tests/hci-evidence-independent.test.ts tests/ble-differential*.test.ts tests/ble-field-hypothesis*.test.ts
```

No first test/typecheck failures occurred. An initial exploratory `cat` of guessed
`AGENTS.md` and document-module filenames failed because they did not exist; actual
implementation modules were then listed/read. No full aggregate, UI, browser,
native build, device, network, provider or real user log validation was run.
All binary test data is manually authored synthetic data. Independent review is
separate and pending at this checkpoint. No tracked pre-existing source changed.
