# Provider response JSON boundary (2026-11-08)

Local audit reproduced last-wins acceptance of duplicate decoded response keys:
`summary`/`summ\u0061ry`, `confidence`/`confid\u0065nce`, and
`observationIds`/`observation\u0049ds`. An overwritten invented evidence reference
was invisible to the subsequent exact-schema validator.

The response validator now uses the existing shared `parseBoundedJson` before
schema validation. Its size limit remains 16,384 UTF-16 code units, inclusive;
the original response type/size error is retained. Maximum valid nesting is four
open containers: response object, hypotheses array, hypothesis object, and
observation IDs array. Duplicate decoded names and deeper containers are rejected
before materializing the response. No valid provider schema changed.

Regressions cover duplicates at both object levels, escaped aliases, identical
values, overwritten invented references, exact depth, deeply invalid data, exact
size, non-string input, inert JSON-looking strings, and valid output parity.
The existing nested invalid protocol case can now fail earlier on depth.

Adjacent inspection found no change needed: observations are validated and copied
into frozen records and a frozen array before invocation; validation uses that
snapshot and captured attribution. The timer rejects before abort notification,
so synchronous abort-handler rejection cannot replace timeout errors, and the
finally block clears the timer on success, synchronous throw, and rejection.
Existing regressions exercise these paths and the strict remote-export guard.
No provider integrations, model calls, transport operations, or connection
behavior were added or changed. All providers used in testing were synthetic.

## Verification

Logs: `verification/provider-json/` (including pre-fix reproduction).
Commands used the existing approved app and REA dependency symlinks, with no
installation, and `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1
npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false
npm_config_fund=false`.

- `node --test tests/bounded-json.test.ts tests/hypotheses.test.ts`: 25 passed.
- `npm run typecheck`: passed.
- `python3 tools/build_firmware.py`: portable firmware build/C checks passed.
- `node --test --test-concurrency=2 tests/*.test.ts`: 583 passed, zero failures/skips.
- `git diff --check`: passed.
