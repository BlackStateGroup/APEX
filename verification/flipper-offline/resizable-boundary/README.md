# Final resizable-buffer boundary validation

2026-11-08. Follow-up independent review found that a resizable ArrayBuffer shrunk below a view's bounds makes intrinsic view length zero. The inspector now rejects all resizable backing stores via the intrinsic ArrayBuffer resizable getter, including still-in-bounds views. A regression covers both states. Earlier validation directories remain unchanged as historical evidence.

Checks used `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false`.

- Typecheck passed (`typecheck.log`).
- Focused tests: 14/14 passed (`focused.log`).
- Portable firmware build and C checks passed (`firmware.log`).
- Then full Node suite: 594/594 passed, no failures/skips/cancellations (`full-node.log`).
- Independent final parser, cap and host-boundary scripts passed; review found no remaining blocker (`independent-review.log`, `independent-caps.log`, `independent-host.log`).

Final core SHA-256: `8b1b80c9ae649b57ca2647560b4448ad788b8cdc511c3ef7fde64eabc3527629`.
Unchanged CLI SHA-256: `52e8b91e70849405921aa8abaf6cb1fd6d44823e69c3e546021dd0d112498965`.
