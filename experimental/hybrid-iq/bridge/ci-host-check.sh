#!/usr/bin/env bash
# Existing tools only. Does not compile a phone binding or install dependencies.
set -euo pipefail
cd "$(dirname "$0")/../../.."
for tool in node g++; do
  command -v "$tool" >/dev/null || { printf 'Missing preinstalled %s\n' "$tool" >&2; exit 1; }
done
node -e 'if(Number(process.versions.node.split(".")[0])!==24)throw Error("Node 24 is required")'
g++ --version
APEX_BRIDGE_SANITIZE=0 node --test experimental/hybrid-iq/bridge/proof.test.mjs
APEX_BRIDGE_SANITIZE=1 node --test experimental/hybrid-iq/bridge/proof.test.mjs
