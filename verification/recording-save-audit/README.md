# Foreground dispatch and legacy recording review

Recording worker c682b93 passed 553 host tests, portable C and TypeScript after
linking the already-approved REA dependencies. The initial run failed eight REA
tests due to that missing symlink; its original log is retained. No dependency
installation, timeout change or assertion weakening occurred.

Independent review of b6f14fb, 89764ee and c351602 passed 39 focused tests,
TypeScript and extra current-draft retry/non-active dispatch checks. It listed
28 Playwright cases without executing a browser. Logs are retained here.

The foreground helper guards dispatch using current lifecycle state and AppState.
NFC Stop bypasses the start guard and held run lock; ordinary accessory Stop
retains its existing run-lock behavior. Pending native acquisition can still
settle after backgrounding; a dispatch guard is not native teardown proof.

Recording edits clear stale reports, pending saves keep their selected snapshot,
and insert success remains consumed even when later list refresh fails. Existing
NEC/CAN/REA schemas retain derived summaries rather than newly retaining original
raw input. Public controller fields could permit misuse by future direct callers;
current App callers use the transition methods. No reachable review defect found.

No browser/native/phone acceptance or physical reception was performed.
