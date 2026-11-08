# Eddystone UID/URL offline verification

Base: `fba619cae6512cdd7bd102ed9e96dd189b26f5af` (tracked snapshot only).
Isolated copy: `apex-eddystone-uid-url`. No pending main UI changes copied.
Verified 2026-11-07 with Node v24.22.1. Reused locked application and REA
node_modules via symlinks; no installations or lockfile changes.

- `npm test`: 215/215 passed, including portable C build and integration.
- `npm run typecheck`: passed.
- `npm run inventory:check`: 541 locked dependency entries verified.
- `python3 -m unittest discover -s tests -p 'test_source_archives.py' -v`: 22/22 passed.
- `node --test tools/reverse-engineering/preflight.test.mjs`: 5/5 passed.
- `python3 tools/build_firmware.py --sanitize`: LeakSanitizer failed because ptrace is unsupported in this environment. This is not a clean full sanitizer pass.
- `ASAN_OPTIONS=detect_leaks=0 python3 tools/build_firmware.py --sanitize`: ASan/UBSan passed with leak detection explicitly disabled.
- `git diff --check`: passed.

No app export/UI/browser/native/radio checks were performed for this pure offline
parser change. No hardware conformance, URL safety or authenticated identity is
claimed. TLM/BTHome implementations and native collector/transport are unchanged.
Pinned official source links and exact acceptance boundaries are in
`docs/EDDYSTONE_IDENTITY_OFFLINE.md`. Full command logs are alongside this file.
