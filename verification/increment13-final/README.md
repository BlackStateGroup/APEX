# Thirteenth combined local checkpoint

Application/core/test revision: 92b450e. Adds bounded memory-only BLE trial
construction and UI staging/build/use, actual observation TSX static initial
rendering, held-session controls after unexpected disconnect, advertised-UUID cleanup
fencing and exact offline I/Q window energy inspection.

Combined direct-local verification uses CI=1, EXPO_OFFLINE=1,
EXPO_NO_TELEMETRY=1, npm_config_offline=true, npm_config_update_notifier=false,
npm_config_audit=false and npm_config_fund=false:

- 548/548 Node tests, zero skipped, concurrency 2; portable C checks pass.
- 22/22 Python archive and 5/5 REA preflight tests (575 combined).
- Full semantic TypeScript; unchanged 541-entry dependency inventory.
- Offline web, iOS and Android JavaScript exports.
- 25 authored Playwright cases listed, zero executed.

Final files use the `-final` suffix. The earlier successful 539-test checkpoint
at 3fc71a9 is preserved in unsuffixed logs; it predates the cleanup and I/Q changes.

Ten authoring-core tests cover atomic edits/removal, exact inner documents,
missing/null/undefined fields, declared source separation, malformed/opaque data,
count and exact escaped-size limits, and mutation isolation. Independent review
passed 29 focused tests and 176 old/new differential parser parity cases, with
identical reports or errors. Incomplete drafts never become valid exports merely
because the shared reader accepts partial rows.

Six authoring UI coordination tests cover validated current-source staging,
consumed revision gates, explicit declarations, invalidation of built output,
unsupported kinds, and single-use handoff without automatic comparison or saving.
Independent UI review passed 34 focused BLE/controller tests and TypeScript.
Source rendering and hidden-tab behavior remain browser/native acceptance gates.
Earlier isolated worker setup failures remain preserved separately rather than
being overwritten by later successful validation.

Four static tests compile and render the actual observation TSX using existing
TypeScript and React DOM server, with only narrow RN/Bluetooth mocks. Initial
platform/consent controls and disclosure text are checked. Effects, events,
native callbacks, layout and accessibility trees are NOT executed. Zero static
render acquisition calls is not a claim about mounted behavior.

Two held-session tests exercise capability loss through actual DeviceSession and
simulator transport logic: a closed object still holds its App slot until explicit
release. The UI no longer disables Disconnect solely because capabilities clear.
Independent review of session/recovery code passed 18 tests and TypeScript; old
callback identity guard was source-reviewed, not device-tested.

Three cleanup regressions reproduce failed SDK Stop through the real scan
controller and enforce discarded sources, blocked Inspect/restart, synchronous
App uncertainty and reset generation isolation. Independent source/mock review
passed 71 focused tests plus TypeScript. A successful controller/SDK reuse result
is not a native teardown acknowledgement or RF-silence claim, particularly on iOS.
The worker’s initial missing-REA-dependencies failure is preserved separately.

Six I/Q activity tests cover exact integer energy, rational thresholds, bounded
ranges, overlap/gaps, source isolation and bounded CLI import. Independent review
reported 305 passing checks from a separately written exact Number integer-prefix
oracle, including all signed int16 values and 100-digit threshold boundaries.
That oracle ran inline; no script or output file was saved. This paragraph records
the review report rather than presenting a reconstructed log as original evidence.

No actual native/radio/browser operations, dependency changes, credentials,
permissions/settings changes, provider connections or remote publication. iOS
broad mode/reset remains gated and its source proposal remains unapplied. Original
lockfile and source registers are unchanged. All physical/native acceptance gates
remain open. Synthetic byte comparisons do not establish identity, causality,
measurement truth, chronology, decryption, RF acquisition or universal access.

Raw tool logs retain their original whitespace. The full staged whitespace check
reported those known log-only lines; the source/docs/structured-data check passes.
