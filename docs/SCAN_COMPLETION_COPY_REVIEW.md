# Ordinary BLE scan completion copy correction

Base: `4623faea6a851e9799f7a5730e351e22f055df63`. Production changes are
wording only in `src/foreground-ble-workbench.ts` and
`src/ForegroundBleWorkbench.tsx`; no state, lifecycle or native adapter changes.

Stop now says “Ending local collection and requesting SDK scan stop…” rather
than promising scanner release. The reusable error branch says local collection
ended rather than claiming controller/SDK cleanup completed. The visible
explanation states that Stop ends local collection and requests SDK scan stop,
iOS provides no native stop completion acknowledgment, and native radio behavior
remains unverified. This also covers automatic collection endings without
implying that a retained document or idle controls certify native release.

Ordinary discovery, connection handoff, callback fences and offline Inspect are
unchanged. iOS Reset and exclusive-service-data gates remain closed. The
[controlled observation documentation](CONTROLLED_BLE_OBSERVATION.md) and
[phone acceptance checklist](PHONE_ACCEPTANCE_PLAN.md) have explicit superseding
notes; [historical scope correction](PLX_SCAN_SCOPE_CORRECTION.md) and all prior
verification evidence remain byte-for-byte unchanged.

## Exact-source host verification

- **50/50 passing**, one combined run: `tests/foreground-ble-workbench.test.ts`,
  `tests/observation-static-render.test.ts`, `tests/plx-ios-scan-void.test.ts`,
  `tests/plx-facade-scan.test.ts`, `tests/plx-scan-independent.test.ts`.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- Actual TSX is statically rendered with RN primitives mocked; no effects, mounted
  event handling, browser behavior or native layout are exercised.
- Controller assertions check stopping/error copy while preserving retained
  document access. Installed-PLX void-boundary scenarios still run, including
  local listener removal, ordinary replacement, connect dispatch, offline Inspect
  and the Android Promise distinction. Historical asynchronous iOS fixtures remain
  hypothetical alternate-contract checks, as previously corrected.

The executable void-boundary test now reads the explicitly current
[`verification/plx-ios-scan-void-current/inputs.sha256.json`](../verification/plx-ios-scan-void-current/inputs.sha256.json).
It retains every original input path and adds the three directly relevant test
sources. No pin is removed or bypassed. The original
`verification/plx-ios-scan-void/inputs.sha256.json` remains historical evidence for
its original source revision. Current [host log](../verification/plx-ios-scan-void-current/host-tests.log)
and [typecheck log](../verification/plx-ios-scan-void-current/typecheck.log) are
separate from that evidence. Future source changes require a reviewed current
manifest refresh, not alteration of the historical pins.

This is not a full aggregate run. No firmware/native/SDK build, dependency install,
device/browser/radio execution, provider access or remote publication occurred.
Native queue ordering, physical release and phone acceptance remain unverified.
