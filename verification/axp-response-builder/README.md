# AXP response builder evidence

Builder source commit: `91745b35e50a1bced416f53edf59f6b02943dfb2`.

These files are unchanged copies of local builder logs, with `.txt` appended to their names. Both baseline logs record failures of the new regression tests against the original parser; they are not successful runs. The initial typecheck found a test-fixture `string | undefined` typing error. The final focused run passed 60 checks, and the final typecheck passed after the fixture correction. The earlier focused run passed 49 checks before the expanded cases were added. Counts overlap and must not be summed. Independent final evidence is in `../axp-response-independent/`.

This is byte-parser and synthetic session verification, not authentication, native release or physical-device acceptance. Arbitrary rejected objects may execute a Proxy prototype hook during `instanceof`; accepted typed-array own hooks are ignored. No hostile-JavaScript sandbox guarantee is made.

## Copied file integrity

- `axp-response-json-baseline-final.log.txt`: 14769 bytes, SHA-256 `d582d5609843647db045360d569991621d8297c865dbedf5f500fded1e052459`.
- `axp-response-json-baseline.log.txt`: 7315 bytes, SHA-256 `73114444a4dc7f97329bdb8dec61c75d50329284b4d692bb58eb4522ef3f50b1`.
- `axp-response-json-focused-final.log.txt`: 5387 bytes, SHA-256 `7f2d350e41e4f90ac5ef6fbf61ef0e9e79eeaf238bb83a0cda9d673ffb845112`.
- `axp-response-json-focused.log.txt`: 4648 bytes, SHA-256 `57d1a7155f5f9e05d2e8bb84040280b193be839bd18bfa0f1f1da3b226f31350`.
- `axp-response-json-typecheck-final.log.txt`: 139 bytes, SHA-256 `4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1`.
- `axp-response-json-typecheck.log.txt`: 336 bytes, SHA-256 `69b896834bdb6120eef77698a12c29327760ce4b9a1dc441546a407573a9f7d6`.
