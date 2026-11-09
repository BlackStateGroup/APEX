#!/usr/bin/env bash
# Optional independent review checks. No installs; not the default CI gate.
set -euo pipefail
review="$(cd "$(dirname "$0")" && pwd)"
bridge="$(cd "$review/.." && pwd)"
for tool in node g++; do
  command -v "$tool" >/dev/null || { printf 'Missing preinstalled %s\n' "$tool" >&2; exit 1; }
done
node -e 'if(Number(process.versions.node.split(".")[0])!==24)throw Error("Node 24 required");console.log("Node "+process.version)'
g++ --version
build="$(mktemp -d "${TMPDIR:-/tmp}/apex-iq-bridge-review.XXXXXX")"
trap 'rm -rf "$build"' EXIT
flags=(-std=c++17 -O1 -g -Wall -Wextra -Wpedantic -Wconversion -Werror -fno-fast-math -ffp-contract=off -fsanitize=address,undefined -fno-omit-frame-pointer -fno-pie -no-pie)
for source in "$bridge/abi.test.cpp" "$review/abi-fuzz.cpp" "$bridge/host.cpp"; do
  output="$(basename "$source" .cpp)"
  g++ "${flags[@]}" -I "$bridge" "$bridge/../src/kernel.cpp" "$bridge/bridge.cpp" "$source" -o "$build/$output"
done
export ASAN_OPTIONS=detect_leaks=0:abort_on_error=1
export UBSAN_OPTIONS=halt_on_error=1:print_stacktrace=1
"$build/abi.test"
"$build/abi-fuzz"
node "$review/probe.mjs" "$build/host"
printf '%s\n' 'PASS independent review checks; LeakSanitizer disabled; no mobile/runtime/performance acceptance'
