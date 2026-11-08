# REA inspection source and report hardening

Patch base: 6ad617a5da71f50faa0b19bc0df14b92c8f7a976. Final patch SHA-256: b1c9a2f5b791ed8cb2e01f6537832136f3e2c731a0c103f1cb0cf7cfa4d44e81.

Three defects were reproduced before changing code: stderr-only errors were masked; a report directory created during analysis was accepted; and source bytes could temporarily change between REA and GNU operations while the final digest still matched. The fix provides one bounded private snapshot to all analyzers, checks source identity and bytes at both endpoints, reserves output exclusively, and retains useful diagnostics. It does not execute the artifact or claim hostile same-user isolation.

Independent static review accepted the final patch. It additionally prompted preservation of the original basename and successful snapshot cleanup before any report publication or success message. Dual failures preserve the primary error; report-write failures retain partial evidence.

## Recorded checks

- Original defect reproduction: three expected failures, retained in reproduced-before.txt.
- The added bounded-read test initially intercepted the module loader rather than the source descriptor. Initial failure is preserved; the interceptor was corrected to match the source inode.
- An initial full npm test batch was stopped after a reported unnecessary registry connection. Partial output is retained and is not a completed suite.
- Read-only installed npm source showed an asynchronous update notifier and an early return when disabled; offline registry mode uses only-if-cached. This was new evidence for one permitted retry. The original request cause remains unproven.
- The single retry used CI=1, npm_config_update_notifier=false, npm_config_offline=true, npm_config_audit=false and npm_config_fund=false. Existing dependencies only. It passed 294/294 worktree tests, 17/17 focused tests, typecheck and C checks without another reported denial or connection.
- Final combined current checkout: 302/302 Node tests, 22/22 Python archive tests, 5/5 REA preflight tests, portable C and semantic TypeScript passed. The same offline safeguards were retained. These logs are combined-*.txt.

No new installation, dependency change, network test, external target, native build, browser acceptance or physical-device action occurred. Timeout/signal tests use deterministic fault injection, not a wall-clock termination demonstration. Source observations establish endpoint equality only; intervening changes are not excluded. The private snapshot supplies consistent analyzer bytes but is not protection against a hostile same-user process.
