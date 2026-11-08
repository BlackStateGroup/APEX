# Fourteenth combined local checkpoint

Application/core/test revision: f8aa135. Adds current-foreground start dispatch,
current-draft legacy recording state, verified selected-record bundle core/CLI,
and exact offline selected-lag I/Q diagnostics.

All validation uses CI=1, EXPO_OFFLINE=1, EXPO_NO_TELEMETRY=1,
npm_config_offline=true, npm_config_update_notifier=false, npm_config_audit=false
and npm_config_fund=false, direct existing local binaries and no new installation.

- 573/573 Node tests, zero skipped, concurrency two; portable C checks pass.
- 22/22 archive tests and 5/5 REA preflight tests: 600 total.
- Semantic TypeScript passed and was directly reconfirmed; inventory 541 unchanged.
- Offline web, iOS and Android JavaScript exports pass, not native builds.
- 28 Playwright scenarios listed; zero browser scenarios executed.
- Original lockfile/native bridge SHA256 and all source registers unchanged.

The earlier integrated 568-test result at 59cfe26 is preserved in -initial logs,
separate from the final 573-test run. Worker recording setup failure is preserved
under recording-save-audit; no failure or assertion was hidden by final validation.
Raw logs retain original whitespace; source/docs/structured-data whitespace checks
exclude those log-only lines.

Independent foreground/recording review passed 39 focused tests, TypeScript and
additional current-draft retry/non-active checks. Start dispatch checks live state;
NFC cancellation remains separate from the original run lock. This is not proof of
native teardown or of already-pending native work stopping at a lifecycle event.

Six bundle tests and separate independent review verify old record digest parity,
exact string/order preservation, strict schema/size/duplicate refusal, asynchronous
input isolation and read-only CLI failures. The independent SHA256 oracle ran inline;
no saved original oracle artifact exists. Bundles are selected records only, not
complete backup, restore, encryption, signatures or acquisition attestation.

Five lag tests and a retained independent Python integer oracle check actual CLI
output across 13 synthetic cases and 511 exact rows. Compared samples span all signed
int16 values; complex orientation, energies, normalization/Cauchy, geometry, nominal
times and complete-file hashes match. Selected-lag correlation is not a physical
periodicity detector: constant tones/DC can correlate everywhere. No acquisition,
transmitter/protocol recognition or calibrated-power claim is added.

Browser execution is still blocked by prior startup/localhost limitations. Native
compilation, mounted React, physical phones/tags/emitters and RF reception are unrun.
iOS broad service-data/reset stays gated; its acknowledgement proposal is unapplied.
No actual private evidence export, device operations, provider/network connections,
new dependencies, credentials/settings changes or remote publication occurred.
