# NDEF workbench validation

Base: 8588838ae48a5977f01ad3aa3b6b689dad6f57eb. Isolated worktree only.

- `node --test tests/ndef*.test.ts`: 31/31 pass (`focused-tests.txt`).
- `npm test`: 189/189 pass, including firmware host build (`host-tests.txt`).
- `npm run typecheck`: full strict semantic pass (`typecheck.txt`).
- `CI=1 EXPO_OFFLINE=1 npm run build`: iOS, Android and web bundles pass (`offline-export.txt`). This is bundle export, not native compilation/device validation.
- `node --check tests/ui.smoke.spec.mjs`: syntax pass.
- `playwright test --list`: 14 scenarios discovered (`browser-scenarios-list.txt`). No browser launched. Chromium socket EPERM and inaccessible exact-localhost managed browser are pre-existing reported limitations, not retried here.
- `git diff --check`: pass.

No new dependencies or lockfile changes. Local approved dependency directories reused via ignored symlinks. No native NFC or Bluetooth changes, radios, account actions, uploads, remote writes or model calls. Native NFC remains metadata-only. URI outputs remain inert text.
