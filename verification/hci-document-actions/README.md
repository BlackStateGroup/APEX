# HCI document action-order check

Base: c3bafcaa8a1c28734163a3e37f4eeb9599d4a67b.
Local sibling worktree; existing dependencies reused by symlink. Node v24.22.1.
No installs, network, browser execution, native builds, device operations, real
user data/storage, provider/settings/credentials or publication actions.

Commands (run from repository root):

- Initial focused: `node --test --test-concurrency=2 tests/hci-document*test.ts tests/hci-journal*test.ts tests/hci-comparison*test.ts tests/analysis-navigation.test.ts`: exit 0, 98 tests.
- New assertions initial: `node --test tests/hci-document-static-render.test.ts`: exit 0, 8 tests, with test-tree clone key warnings retained in initial log. Test-only traversal corrected with React.Children.map; final rerun exit 0, 8 tests without warnings.
- Initial full semantic `node node_modules/typescript/bin/tsc --noEmit`: exit 1. New test helper returned ReactNode to a ReactElement-only declaration. Added an actual isValidElement assertion/narrowing, without weakening the check.
- Final focused: `node --test --test-concurrency=2 tests/hci-document*test.ts tests/hci-journal*test.ts tests/hci-comparison*test.ts tests/analysis-navigation.test.ts tests/hci-event-evidence.test.ts tests/hci-evidence-independent.test.ts`: exit 0, 128 tests.
- Final full semantic `node node_modules/typescript/bin/tsc --noEmit`: exit 0 (empty output log).
- `git diff --check`: exit 0.

The eight current static document tests include five new checks. Expanded output
uses the actual exported disclosure projection substituted into the actual TSX
element tree. Collapsed output uses its real initial React state. Reset coverage
checks actual draft keys, controller lease changes, the inactive null branch and
source isolation; it does not run mounted React reconciliation or native widgets.
No evidence here establishes phone scroll distance, keyboard interaction, screen
reader behavior, browser acceptance or actual native accessibility semantics.
The narrow Pressable mock faithfully projects accessibilityState.expanded into
aria-expanded; it is not an accessibility runtime emulator.

Read-only Evidence source, controller, App routing and lockfile remain unchanged.
Exact final source hashes are in source-sha256.txt. Parent owns independent review
and the full aggregate. Browser cases were not executed or listed in this task.
