#!/usr/bin/env bash
# Select only existing runner-owned toolchains. Never invoke rustup, installers,
# setup actions or package managers. Missing tools are a failed prerequisite.
set -euo pipefail
: "${RUNNER_TOOL_CACHE:?GitHub runner tool cache required}"
: "${RUNNER_TEMP:?GitHub runner temporary directory required}"
: "${GITHUB_PATH:?GitHub path output required}"
: "${GITHUB_ENV:?GitHub environment output required}"
: "${HOME:?Runner home required}"
shopt -s nullglob
node_candidates=("$RUNNER_TOOL_CACHE"/node/24.*/x64/bin/node)
rust_candidates=("$HOME"/.rustup/toolchains/*-x86_64-unknown-linux-gnu/bin/rustc)
if ((${#node_candidates[@]} == 0)); then
  printf '%s\n' 'Node 24 is absent from the preinstalled runner tool cache; no installation attempted.' >&2
  exit 1
fi
if ((${#rust_candidates[@]} == 0)); then
  printf '%s\n' 'Rust is absent from the preinstalled runner toolchains; no installation attempted.' >&2
  exit 1
fi
node_binary=$(printf '%s\n' "${node_candidates[@]}" | sort -V | tail -n 1)
rust_binary=$(printf '%s\n' "${rust_candidates[@]}" | sort -V | tail -n 1)
node_bin=${node_binary%/*}
rust_bin=${rust_binary%/*}
[[ -x "$node_binary" && -x "$rust_binary" && -x "$rust_bin/cargo" ]]
# Direct installed binaries avoid rustup proxies and any automatic tool download.
"$node_binary" -e 'if(Number(process.versions.node.split(".")[0])!==24)throw new Error("Preinstalled Node 24 required")'
"$node_binary" --version
"$rust_binary" --version
"$rust_bin/cargo" --version
for tool in g++ ar; do
  if ! command -v "$tool"; then
    printf 'Missing preinstalled %s; no installation attempted.\n' "$tool" >&2
    exit 1
  fi
done
# A fresh Cargo home excludes saved credentials/global config. No dependencies
# are fetched: the crate has none, and every Cargo invocation is locked/offline.
cargo_home=$(mktemp -d "$RUNNER_TEMP/apex-hybrid-cargo-home.XXXXXX")
printf '%s\n' "$node_bin" "$rust_bin" >> "$GITHUB_PATH"
printf 'RUSTC=%s\nCARGO_HOME=%s\nCARGO_NET_OFFLINE=true\nRUSTUP_AUTO_INSTALL=0\n' "$rust_binary" "$cargo_home" >> "$GITHUB_ENV"
