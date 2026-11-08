# Host-input snapshot hardening

2026-11-08 follow-up to the original inspector validation. Original logs remain unchanged in the parent directory. Parent review reproduced two exported-API gaps: provenance accessor validation/output could disagree, and an overridden typed-array byteLength could bypass the pre-copy size check. Neither was a CLI/device exploit.

The fix snapshots one own provenance data descriptor under strict option shape, never calls an option getter, and converts reflection failures into `invalid-provenance`. Intrinsic typed-array getters enforce actual Uint8Array kind, length, offset and buffer. Shared memory, detached storage, proxy-wrapped views and other view types are rejected. Buffer/subarray/subclass inputs remain supported using their actual storage, without calling overridden getters or iterators. This is API robustness, not a hostile-JavaScript sandbox.

Validation environment: `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false`.

- Typecheck passed: `typecheck.log`.
- Focused tests: 14/14 groups passed, including two new host-boundary regression groups: `focused.log`.
- Portable firmware build and C checks passed: `firmware.log`.
- Full Node suite after firmware build: 594/594 passed, zero failures/skips/cancellations: `full-node.log`.

Core SHA-256: `cc0d6fa0300caa8cfe343863975b658ba6a880714edebfe02a49dbe04b91e36e`.
CLI source unchanged, SHA-256: `52e8b91e70849405921aa8abaf6cb1fd6d44823e69c3e546021dd0d112498965`.
