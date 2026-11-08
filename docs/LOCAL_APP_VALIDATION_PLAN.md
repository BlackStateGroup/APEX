# Minimal local app validation gate

Historical plan: the dependency-install step was subsequently authorized and
completed in an isolated copy with lifecycle scripts disabled. Current results
and remaining browser/native/device gates are recorded in
[APEX_CONTINUATION.md](../APEX_CONTINUATION.md). The initial-state findings below
describe the earlier checkpoint, not the present dependency state.

Prepared 7 November 2026. This plan has **not** installed dependencies, launched
the app, accepted new permissions, contacted an account or tested a phone.

## Current verified state

- Source base: `e51750ec0b34b280399877d67e1036058874c373`.
- The exact original lockfile is materialized with Git blob
  `05f26d6b14d859856bc292a7382d7979ba4e355c`. Its 541 dependency entries all have
  integrity hashes and resolve to `registry.npmjs.org`. The original licence
  inventory passes `npm run inventory:check` unchanged.
- Node 24.22.1 and npm 11.9.0 are available. Chromium 156.0.8078.79 is already
  installed at `/usr/bin/chromium`; a new browser download is unnecessary.
- App dependencies are absent. Full typechecking stops because
  `expo/tsconfig.base` and local React/Node types cannot be resolved. Focused
  dependency-free checks do not replace this gate.
- The existing source uses Expo/RN versions that still require actual acceptance
  with the pinned BLE/NFC packages; upstream README compatibility claims alone
  do not establish compatibility.

## Proposed least-risk next action

After dependency restoration is authorized, use an isolated checkout/snapshot
with this local continuation applied. Preserve the original working checkpoint.
Restore **only the existing lockfile**, with lifecycle scripts, audit and funding
requests disabled. The only lockfile entry marked with an install script is the
optional macOS `fsevents` dependency; do not enable scripts to resolve an error
without checking its exact cause.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run inventory:check
npm run typecheck
CI=1 EXPO_OFFLINE=1 npm run build
APEX_CHROMIUM_PATH=/usr/bin/chromium npm run test:ui
```

Use the repository's existing local-only Playwright server and a clean temporary
browser profile. No user browser profile, external account, signing credential,
native permission request or hardware connection is needed for this web gate.
Do not fall back to fetching unpinned packages or changing the lockfile if the
restore/build fails. Record the exact stage and error instead.

The browser suite includes the existing workflows plus offline BLE provenance,
exact persistence, malformed input, digest mismatch, repeated actions, edits
during save, navigation during verification and phone-width output. Inspect
actual screenshots and runtime errors after it runs. A web pass is not an
iPhone/Android native build or physical radio test.

## Later, separate physical gate

The existing AXP scanner filters to its custom service and forwards only
ID/name/RSSI. It must not be silently widened while validating this workbench.
A future controlled observation mode needs its own explicitly selected service,
foreground lifetime, permission/error/stop handling and verified field bridge.
Android `neverForLocation` can filter some beacons; an empty callback is not
proof of absent RF. Record exact handset, OS, build, permission state and known
advertiser ground truth. See [the controlled BLE bench](BLE_OFFLINE_EXPERIMENT.md).

Full Android/iOS builds, native radio permission flows and measurements remain
separate tasks requiring their actual toolchains and an owned/authorized device.
