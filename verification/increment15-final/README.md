# Fifteenth combined local checkpoint

Application/core/test revision: a6f988d. Adds whole-edit legacy recording rejection
and a coherent runnable synthetic lab walkthrough, without core/schema/package or
native acquisition expansion.

All validation ran with CI=1, EXPO_OFFLINE=1, EXPO_NO_TELEMETRY=1,
npm_config_offline=true, npm_config_update_notifier=false, npm_config_audit=false
and npm_config_fund=false, using approved existing dependencies only.

- 580/580 Node tests, zero skipped, concurrency two; portable C checks pass.
- 22/22 archive tests and 5/5 REA preflight tests: 607 total.
- Semantic TypeScript and unchanged 541-entry dependency inventory pass.
- Offline web, iOS and Android JavaScript exports pass, not native builds.
- 29 Playwright scenarios authored/listed; zero executed.
- Deterministic lab CLI emits one complete 2,509-byte JSON summary.
- Original lockfile/native bridge digests and source registers remain unchanged.

Five new recording regressions exercise the exact 262144 UTF-16-unit boundary,
valid prefix plus rejected suffix, retained draft/provenance, repeated Analyse,
accepted edit/fixture recovery and an older pending save. The widget cap is removed
so the controller can reject the whole attempted string before parsing/retention.
The widget must transiently deliver that string: OS/widget memory allocation and
mounted behavior are NOT validated by these controller/source tests.

The walkthrough uses exact existing synthetic BLE/NDEF/trial/candidate fixtures and
newly generated digital I/Q. It verifies public interpretation and source-separated
changes, exact rational candidate values, memory-only EvidenceStore/bundle roundtrip,
FFT bins, equal-threshold rejection, and constant-tone lag correlation. Every stage
remains synthetic; its fixed timestamp is not execution/reception time.

Two integration tests invoke the actual CLI with Node filesystem writes denied.
The complete bounded output repeats byte-for-byte; unsupported arguments and
injected late fixture/hash errors emit no partial success. No actual journal,
private evidence export, network, provider or native/device operation is used.

Parent source review checked whole-edit pending-save invalidation and walkthrough
provenance/invariants. Browser/native/device/RF acceptance remains unrun. Earlier
independent reviews and original failed/blocked logs remain retained. Raw tool-log
whitespace is preserved; source/docs/structured-data whitespace checks exclude it.
