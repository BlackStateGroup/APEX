# Flipper static JSX projection checks

Base: e98b615. Uses the existing approved dependency symlink, without installs.

The actual `FlipperWorkbench.tsx` is emitted by the local TypeScript 7 CLI into a temporary directory and rendered with React DOM server. Only React Native host primitives are replaced with narrow DOM projections. The harness removes emitted files after import (also on compilation/import failure). No production hooks or test-only UI parameters are added. The owning component still owns the same reducer and inactive gate; the extracted view receives controller state and dispatch.

Coverage: initial/inactive static output; nine frames across three pages (4/4/1); thirteen envelope/content metadata rows across two pages (8/5), exact offsets and boundary control disabled properties; caller-declared imported/synthetic provenance; omitted versus explicit-zero status, numeric values, and empty strings; unknown status; both incomplete-tail kinds; JSON-quoted escaped URL/markup/control strings and the fixed action label set. Tests render frozen states produced by the real controller, never synthetic report objects.

Validation commands (all with `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_offline=true npm_config_update_notifier=false npm_config_audit=false npm_config_fund=false`):

- `node --test tests/flipper-static-render.test.ts tests/flipper-workbench.test.ts tests/flipper-offline.test.ts`: 27/27 pass, exit 0 (`final-tests.log.txt`).
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0 (`typecheck.log.txt`, empty successful output).
- `git diff --check`: exit 0.

`initial-test.log.txt` retains the first run's fixture error: mixing unknown envelope content candidates with a known version candidate correctly triggered `ambiguous-content`. The fixture was corrected to put unknown fields inside the version payload; parser/controller behavior did not change.

These checks do not execute events/effects or establish tab retention, browser layout/accessibility/runtime behavior, native/device acceptance, or provider/network behavior. No browser attempts, device/provider/network calls, dependency installs, export or aggregate suite were run in this task.
