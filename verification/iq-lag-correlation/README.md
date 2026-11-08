# Offline lag-correlation verification

Feature contract: [Offline I/Q lag correlation](../../docs/OFFLINE_IQ_LAG_CORRELATION.md).

## Local verification

No installs or network operations. Both dependency directories are symlinks to the existing approved app/REA dependencies. Commands run with:

```sh
export CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false
node --test --test-concurrency=2 tests/iq-lag-correlation.test.ts tests/inspect-iq-lag-correlation.test.ts
./node_modules/.bin/tsc --noEmit
python3 tools/build_firmware.py
node --test --test-concurrency=2 tests/*.test.ts
```

Saved logs: `focused-tests.txt`, `typecheck.txt` (empty on success), `firmware-build.txt`, `full-tests.txt`. The independent direct integer oracle is in `tests/iq-lag-correlation.test.ts`; no separate oracle script is required.

Final results: 5/5 focused tests, 567/567 full tests, successful firmware build and clean typecheck. Existing input/FFT/time-frequency/activity modules remain unchanged.

## Independent CLI oracle

After integration, `python3 verification/iq-lag-correlation/independent-python-oracle.py .`
passed 13 synthetic cases and 511 exact lag rows at f8aa135. The script generates
its own temporary ci16_le files and compares the actual CLI to Python integer
arithmetic. Compared samples span every signed int16 value. It separately checks
complex orientation, energies, exact normalization, Cauchy bound, sample geometry,
nominal times and complete-file hashes. The script and original output are retained
here. This is software arithmetic only, not a receiver/periodicity/protocol claim.
