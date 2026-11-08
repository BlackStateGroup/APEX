#!/bin/sh
set -euC
if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "Usage: sh verification/phase-independent/run.sh NEW_OUTPUT_DIRECTORY" >&2
  exit 2
fi
case "$1" in /*) output=$1 ;; *) output=$PWD/$1 ;; esac
# No -p and no reuse: preserve every prior review run, including partial failures.
umask 077
mkdir -- "$output"
cd "$(dirname "$0")/../.."
export CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false
node --test tests/iq-phase-increment.test.ts tests/inspect-iq-phase-increment.test.ts > "$output/supplied-tests.log" 2>&1
python3 verification/phase-independent/oracle.py > "$output/oracle.log" 2>&1
node verification/phase-independent/api-review.ts > "$output/api.log" 2>&1
node node_modules/typescript/bin/tsc --noEmit > "$output/typecheck.log" 2>&1
printf 'Phase review passed; logs: %s\n' "$output"
